import { PrismaService } from '../prisma/prisma.service';
import { deserializeRule } from '../vdf/serializer';
import { RuleDefinition } from '../vdf/types';
import { readRuleJson } from '../vdf/__tests__/corpus';
import { RuleRepository } from './rule.repository';

/**
 * DB-backed repository tests. Requires a reachable PostgreSQL (see .env DATABASE_URL).
 * Proves the versioning / effective-dating / governance contract and injection safety.
 */
describe('RuleRepository (DB)', () => {
  let prisma: PrismaService;
  let repo: RuleRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    repo = new RuleRepository(prisma);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Versions cascade with their rule.
    await prisma.rule.deleteMany();
  });

  const PM48 = (): RuleDefinition => deserializeRule(readRuleJson('PM48'));

  it('saves a rule → Rule identity + RuleVersion v1', async () => {
    await repo.saveAsync(PM48(), { authoredBy: 'tester' });

    const rule = await prisma.rule.findUnique({
      where: { ruleKey: 'PM48' },
      include: { versions: true },
    });
    expect(rule).not.toBeNull();
    expect(rule!.versions).toHaveLength(1);
    expect(rule!.versions[0].version).toBe(1);
    expect(rule!.versions[0].isActive).toBe(true);
    expect(rule!.versions[0].authoredBy).toBe('tester');
  });

  it('getByKey round-trips equal to the saved definition', async () => {
    const original = PM48();
    await repo.saveAsync(original, { authoredBy: 'tester' });

    const fetched = await repo.getByKey('PM48');
    expect(fetched).not.toBeNull();
    expect(fetched!.key).toBe(original.key);
    expect(fetched!.phase).toBe(original.phase);
    expect(fetched!.priority).toBe(original.priority);
    expect(fetched!.onFailure).toEqual(original.onFailure);
    expect(fetched!.appliesWhen).toEqual(original.appliesWhen);
    expect(fetched!.assert).toEqual(original.assert);
  });

  it('saving an update appends v2, supersedes v1, and getActiveRules returns v2', async () => {
    await repo.saveAsync(PM48(), { authoredBy: 'tester' });

    const updated = PM48();
    updated.priority = 99;
    await repo.saveAsync(updated, { authoredBy: 'tester' });

    const rule = await prisma.rule.findUnique({
      where: { ruleKey: 'PM48' },
      include: { versions: { orderBy: { version: 'asc' } } },
    });
    expect(rule!.versions).toHaveLength(2);
    expect(rule!.versions[0].version).toBe(1);
    expect(rule!.versions[0].isActive).toBe(false);
    expect(rule!.versions[1].version).toBe(2);
    expect(rule!.versions[1].isActive).toBe(true);

    const active = await repo.getActiveRulesAsync(new Date());
    const pm48 = active.find((r) => r.key === 'PM48');
    expect(pm48).toBeDefined();
    expect(pm48!.version).toBe(2);
    expect(pm48!.priority).toBe(99);
  });

  it('future-effective version is excluded for asOf=now but included for asOf=future', async () => {
    await repo.saveAsync(PM48(), { authoredBy: 'tester' }); // v1, effective now

    const future = PM48();
    future.priority = 7;
    future.effectiveDate = '2099-01-01T00:00:00+00:00';
    await repo.saveAsync(future, { authoredBy: 'tester' });

    // The prior active (v1) remains live; the future v2 is not yet effective.
    const ruleRow = await prisma.rule.findUnique({
      where: { ruleKey: 'PM48' },
      include: { versions: { orderBy: { version: 'asc' } } },
    });
    expect(ruleRow!.versions[0].isActive).toBe(true); // v1 still live
    expect(ruleRow!.versions[1].isActive).toBe(false); // future v2 dormant

    const nowActive = await repo.getActiveRulesAsync(new Date());
    expect(nowActive.find((r) => r.key === 'PM48')!.version).toBe(1);

    const futureActive = await repo.getActiveRulesAsync(
      new Date('2099-06-01T00:00:00+00:00'),
    );
    const pm48Future = futureActive.find((r) => r.key === 'PM48');
    expect(pm48Future!.version).toBe(2);
    expect(pm48Future!.priority).toBe(7);
  });

  it('governance: approve sets approvedBy/At on the active version', async () => {
    await repo.saveAsync(PM48(), { authoredBy: 'tester' });
    await repo.approve('PM48', 'approver-1');

    const active = await prisma.ruleVersion.findFirst({
      where: { isActive: true, rule: { ruleKey: 'PM48' } },
    });
    expect(active!.approvedBy).toBe('approver-1');
    expect(active!.approvedAt).toBeInstanceOf(Date);
  });

  it('is SQL-injection-safe: a ruleSet containing a quote does not break', async () => {
    const evil = PM48();
    evil.ruleSet = "robert'; DROP TABLE rule; --";
    await repo.saveAsync(evil, { authoredBy: 'tester' });

    // The table still exists and the rule round-trips with the literal ruleSet.
    const fetched = await repo.getByKey('PM48');
    expect(fetched!.ruleSet).toBe("robert'; DROP TABLE rule; --");

    const active = await repo.getActiveRulesAsync(
      new Date(),
      "robert'; DROP TABLE rule; --",
    );
    expect(active.find((r) => r.key === 'PM48')).toBeDefined();

    // Proof the table was not dropped.
    await expect(prisma.rule.count()).resolves.toBeGreaterThan(0);
  });
});
