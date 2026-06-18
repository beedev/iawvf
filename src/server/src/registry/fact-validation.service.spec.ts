import { FieldDataType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FactValidationService } from './fact-validation.service';
import { RegistrySeeder } from './registry.seeder';
import { RegistryService } from './registry.service';

/**
 * DB-backed Ajv validation tests against the seeded canonical registry.
 */
describe('FactValidationService (DB)', () => {
  let prisma: PrismaService;
  let registry: RegistryService;
  let validator: FactValidationService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    registry = new RegistryService(prisma);
    validator = new FactValidationService(registry);
    validator.onModuleInit();

    await prisma.entity.deleteMany();
    await new RegistrySeeder(prisma).ensureSeeded();
    // Make one field required to exercise the "missing required" path.
    await registry.addField(
      'specimen',
      {
        name: 'collectedFlag',
        dataType: FieldDataType.Boolean,
        required: true,
      },
      'tester',
    );
  });

  afterAll(async () => {
    await prisma.entity.deleteMany();
    await prisma.onModuleDestroy();
  });

  it('passes a valid specimen + patient fact', async () => {
    const result = await validator.validateFacts({
      specimen: { type: 'FFPE', fixationTime: 12, collectedFlag: true },
      patient: { gender: 'Male', age: 40 },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports a type mismatch (fixationTime as a string)', async () => {
    const result = await validator.validateFacts({
      specimen: { type: 'FFPE', fixationTime: 'twelve', collectedFlag: true },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'specimen.fixationTime')).toBe(
      true,
    );
  });

  it('reports a bad enum value (specimen.type "Saliva")', async () => {
    const result = await validator.validateFacts({
      specimen: { type: 'Saliva', collectedFlag: true },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'specimen.type')).toBe(true);
  });

  it('reports a missing required field', async () => {
    const result = await validator.validateFacts({
      specimen: { type: 'FFPE' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'specimen.collectedFlag')).toBe(
      true,
    );
  });

  it('is lenient — extra unknown fields are allowed', async () => {
    const result = await validator.validateFacts({
      specimen: { type: 'FFPE', collectedFlag: true, somethingExtra: 'ok' },
    });
    expect(result.valid).toBe(true);
  });

  it('ignores unknown top-level entity keys', async () => {
    const result = await validator.validateFacts({
      unknownThing: { whatever: 1 },
    });
    expect(result.valid).toBe(true);
  });
});
