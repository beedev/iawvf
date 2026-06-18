import { FieldDataType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegistryService } from '../registry/registry.service';
import { VocabularyProjectionService } from './vocabulary-projection.service';

/**
 * The grounding vocabulary is PROJECTED FROM the entity registry — the registry is
 * the single source of truth (objects = entities, properties = fields). These tests
 * prove the projection equals the registry's own subject-path set and tracks live
 * field additions.
 */
describe('VocabularyProjectionService (registry-sourced)', () => {
  let prisma: PrismaService;
  let registry: RegistryService;
  let projection: VocabularyProjectionService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    registry = new RegistryService(prisma);
    projection = new VocabularyProjectionService(registry, prisma);
  });

  afterAll(async () => {
    // Leave the registry empty so the next app boot's RegistrySeeder re-seeds the
    // canonical entities (the registry e2e relies on that self-seeding). A leftover
    // partial registry would suppress the idempotent seeder.
    await prisma.entity.deleteMany();
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await prisma.entity.deleteMany();
  });

  it('projects subject paths identical to the registry grounding set', async () => {
    await registry.createEntity({ key: 'specimen', createdBy: 'tester' });
    await registry.addField(
      'specimen',
      { name: 'age', dataType: FieldDataType.Number },
      'tester',
    );
    await registry.addField(
      'specimen',
      { name: 'archiveRetrievalDate', dataType: FieldDataType.Date },
      'tester',
    );

    const registryPaths = await registry.getSubjectPaths();
    const vocab = await projection.project();

    expect(vocab.paths).toEqual(registryPaths);
    expect(await projection.projectPaths()).toEqual(registryPaths);

    // Types ride along, sourced from the registry field data types.
    const ageSubject = vocab.subjects.find((s) => s.path === 'specimen.age');
    expect(ageSubject?.dataType).toBe(FieldDataType.Number);
  });

  it('adding a field via the registry makes its path appear in the projection', async () => {
    await registry.createEntity({ key: 'specimen', createdBy: 'tester' });

    const before = await projection.projectPaths();
    expect(before).not.toContain('specimen.fixationTime');

    await registry.addField(
      'specimen',
      { name: 'fixationTime', dataType: FieldDataType.Number },
      'tester',
    );

    const after = await projection.projectPaths();
    expect(after).toContain('specimen.fixationTime');

    const vocab = await projection.project();
    expect(vocab.subjects.map((s) => s.path)).toContain(
      'specimen.fixationTime',
    );
  });
});
