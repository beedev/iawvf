import { FieldDataType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrySeeder } from './registry.seeder';

/**
 * DB-backed seeder tests. Verifies the canonical entities/fields land exactly
 * as derived from the .NET VocabularyCatalog, and that seeding is idempotent.
 */
describe('RegistrySeeder (DB)', () => {
  let prisma: PrismaService;
  let seeder: RegistrySeeder;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    seeder = new RegistrySeeder(prisma);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await prisma.entity.deleteMany();
  });

  it('seeds the canonical entities with expected fields', async () => {
    const created = await seeder.ensureSeeded();
    expect(created).toBe(8);

    const entities = await prisma.entity.findMany({
      include: { fields: true },
    });
    const keys = entities.map((e) => e.key).sort();
    expect(keys).toEqual(
      [
        'document',
        'incident',
        'medicalreview',
        'order',
        'patient',
        'priortimepoint',
        'specimen',
        'test',
      ].sort(),
    );

    const specimen = entities.find((e) => e.key === 'specimen');
    const fixationTime = specimen?.fields.find(
      (f) => f.name === 'fixationTime',
    );
    expect(fixationTime?.dataType).toBe(FieldDataType.Number);

    const patient = entities.find((e) => e.key === 'patient');
    const gender = patient?.fields.find((f) => f.name === 'gender');
    expect(gender?.allowedValues).toEqual(['Male', 'Female', 'Other']);

    const specType = specimen?.fields.find((f) => f.name === 'type');
    expect(specType?.allowedValues).toContain('FFPE');
  });

  it('is idempotent — a second run creates nothing', async () => {
    await seeder.ensureSeeded();
    const created = await seeder.ensureSeeded();
    expect(created).toBe(0);
    expect(await prisma.entity.count()).toBe(8);
  });
});
