import { PrismaService } from '../prisma/prisma.service';
import { JsonReferenceDataProvider } from '../vdf/reference-data';
import { readReferenceDataJson } from '../vdf/__tests__/corpus';
import { DbReferenceDataLoader } from './db-reference-data.provider';
import { RuleRepository } from './rule.repository';
import { RulesCorpusImporter } from './rules-corpus.importer';

/**
 * The DB-backed reference provider must resolve keys IDENTICALLY to the on-disk
 * JSON provider for array, nested-object, and literal-dotted-key address forms.
 */
describe('DbReferenceDataProvider parity with JSON provider', () => {
  let prisma: PrismaService;
  let jsonProvider: JsonReferenceDataProvider;
  let dbProvider: { resolve: (k: string) => unknown };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    await prisma.referenceDataEntry.deleteMany();
    const importer = new RulesCorpusImporter(
      prisma,
      new RuleRepository(prisma),
    );
    // Reference-data import is part of the corpus import; rules import is harmless here.
    await importer.importCorpus();

    jsonProvider = JsonReferenceDataProvider.fromJson(readReferenceDataJson());
    dbProvider = await new DbReferenceDataLoader(prisma).load();
  }, 60000);

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const KEYS = [
    'TechnicalFISH', // top-level array
    'PolicyThresholds.fixationWindow', // nested object {min,max}
    'PolicyThresholds.fixationWindow.min', // deep scalar
    'PolicyThresholds.archiveAgeDays', // nested scalar
    'TestCompendium.compatibleSpecimens', // literal dotted key (array)
    'TestCompendium', // top-level array
    'PolicyDefaults.fallbackGender', // nested scalar
    'PatientHistory', // top-level boolean
  ];

  it.each(KEYS)('resolves "%s" identically to the JSON provider', (key) => {
    const fromJson = jsonProvider.resolve(key);
    const fromDb = dbProvider.resolve(key);
    expect(fromDb).toEqual(fromJson);
    expect(fromDb).not.toBeNull();
  });

  it('resolves TechnicalFISH as the expected array', () => {
    expect(dbProvider.resolve('TechnicalFISH')).toEqual([
      'FISH-T-001',
      'FISH-T-002',
    ]);
  });

  it('resolves PolicyThresholds.fixationWindow as {min,max}', () => {
    expect(dbProvider.resolve('PolicyThresholds.fixationWindow')).toEqual({
      min: 6,
      max: 72,
    });
  });
});
