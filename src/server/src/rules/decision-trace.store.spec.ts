import { PrismaService } from '../prisma/prisma.service';
import { FIXED_NOW, loadFixture } from '../vdf/__tests__/corpus';
import { DbReferenceDataLoader } from './db-reference-data.provider';
import { DecisionTraceStore } from './decision-trace.store';
import { RuleEvaluationService } from './rule-evaluation.service';
import { RuleRepository } from './rule.repository';
import { RulesCorpusImporter } from './rules-corpus.importer';

/**
 * The decision-trace store persists an evaluation's traces to the append-only
 * `decision_trace` table under a correlation id.
 */
describe('DecisionTraceStore (DB)', () => {
  let prisma: PrismaService;
  let evaluator: RuleEvaluationService;
  let store: DecisionTraceStore;
  const asOf = new Date(FIXED_NOW);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    await prisma.rule.deleteMany();
    await prisma.referenceDataEntry.deleteMany();
    const repo = new RuleRepository(prisma);
    await new RulesCorpusImporter(prisma, repo).importCorpus();

    evaluator = new RuleEvaluationService(
      repo,
      new DbReferenceDataLoader(prisma),
    );
    store = new DecisionTraceStore(prisma);
  }, 60000);

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('persists every trace from a result under a correlation id', async () => {
    const facts = loadFixture('PM17_fires.json');
    const result = await evaluator.evaluate(facts, { asOf });
    const correlationId = `test-${Date.now()}`;

    const written = await store.saveResult(result, correlationId);
    expect(written).toBe(result.trace.length);

    const persisted = await prisma.decisionTrace.findMany({
      where: { correlationId },
    });
    expect(persisted.length).toBe(result.trace.length);

    // The PM17 trace recorded a produced CompleteHold outcome.
    const pm17 = persisted.find((t) => t.ruleKey === 'PM17');
    expect(pm17).toBeDefined();
    expect(pm17!.applied).toBe(true);
    expect(pm17!.producedOutcomeJson).toMatchObject({ type: 'CompleteHold' });
  });
});
