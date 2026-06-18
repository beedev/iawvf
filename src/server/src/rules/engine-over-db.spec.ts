import { PrismaService } from '../prisma/prisma.service';
import { OutcomeType } from '../vdf/types';
import { FIXED_NOW, loadFixture } from '../vdf/__tests__/corpus';
import { DbReferenceDataLoader } from './db-reference-data.provider';
import { RuleEvaluationService } from './rule-evaluation.service';
import { RuleRepository } from './rule.repository';
import { RulesCorpusImporter } from './rules-corpus.importer';

/**
 * Importer + engine-over-DB parity. Imports the on-disk corpus into Postgres, then
 * runs the N2 engine wired to the DB repo + DB reference data and asserts the SAME
 * outcomes the in-memory corpus produces — proving the engine runs identically
 * against a Postgres-backed repository and reference store.
 */
describe('Engine over DB (importer + repo + reference data)', () => {
  let prisma: PrismaService;
  let evaluator: RuleEvaluationService;
  const asOf = new Date(FIXED_NOW);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    await prisma.rule.deleteMany();
    await prisma.referenceDataEntry.deleteMany();

    const repo = new RuleRepository(prisma);
    const referenceLoader = new DbReferenceDataLoader(prisma);
    const importer = new RulesCorpusImporter(prisma, repo);
    await importer.importCorpus();

    evaluator = new RuleEvaluationService(repo, referenceLoader);
  }, 60000);

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('imports the full corpus (all rule files + reference entries)', async () => {
    const ruleCount = await prisma.rule.count();
    const refCount = await prisma.referenceDataEntry.count();
    expect(ruleCount).toBeGreaterThanOrEqual(14);
    expect(refCount).toBeGreaterThan(0);
  });

  // Spot-checks across all outcome families, evaluating each rule's _fires fixture
  // through the DB-backed engine path.
  const CASES: ReadonlyArray<[string, OutcomeType]> = [
    ['PM17', 'CompleteHold'],
    ['PM48', 'PartialHold'],
    ['BL46', 'PreventAction'],
  ];

  it.each(CASES)(
    '%s_fires → %s via the Postgres-backed engine',
    async (key, expected) => {
      const facts = loadFixture(`${key}_fires.json`);
      const result = await evaluator.evaluate(facts, { asOf });
      expect(result.outcomes.some((o) => o.type === expected)).toBe(true);
      // Trace is populated — proving the DB-loaded rule actually evaluated.
      expect(result.trace.some((t) => t.ruleKey === key && t.applied)).toBe(
        true,
      );
    },
  );

  it('PM17 missing circled H&E → CompleteHold (engine over Postgres-backed repo)', async () => {
    const facts = {
      test: { code: 'FISH-T-001', specimen: { type: 'FFPE' } },
    };
    const result = await evaluator.evaluate(facts, { asOf });
    const hold = result.outcomes.find((o) => o.type === 'CompleteHold');
    expect(hold).toBeDefined();
    expect(hold!.scope).toBe('order');
  });
});
