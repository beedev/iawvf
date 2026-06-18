import { ConflictException, NotFoundException } from '@nestjs/common';
import { FieldDataType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegistryService } from './registry.service';

/**
 * DB-backed service tests. Requires a reachable PostgreSQL (see .env
 * DATABASE_URL). Each test runs against a freshly truncated registry.
 */
describe('RegistryService (DB)', () => {
  let prisma: PrismaService;
  let service: RegistryService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    service = new RegistryService(prisma);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Field rows cascade with their entity.
    await prisma.entity.deleteMany();
  });

  describe('createEntity — case-insensitive uniqueness (THE key fix)', () => {
    it('rejects "kit" after "Kit" with a 409 conflict', async () => {
      await service.createEntity({ key: 'Kit', createdBy: 'tester' });

      await expect(
        service.createEntity({ key: 'kit', createdBy: 'tester' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('stores the canonical lower-case key and derives a label', async () => {
      const entity = await service.createEntity({
        key: 'medicalReview',
        createdBy: 'tester',
      });
      expect(entity.key).toBe('medicalreview');
      expect(entity.label).toBe('Medical Review');
    });
  });

  describe('addField', () => {
    it('requires an existing entity (404 otherwise)', async () => {
      await expect(
        service.addField(
          'ghost',
          { name: 'x', dataType: FieldDataType.String },
          'tester',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('adds a dotted field and rejects duplicates', async () => {
      await service.createEntity({ key: 'order', createdBy: 'tester' });
      const field = await service.addField(
        'order',
        { name: 'client.nyStatus', dataType: FieldDataType.String },
        'tester',
      );
      expect(field.name).toBe('client.nyStatus');

      await expect(
        service.addField(
          'order',
          { name: 'client.nyStatus', dataType: FieldDataType.String },
          'tester',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('getSubjectPaths', () => {
    it('returns `entity.field` paths for active fields', async () => {
      await service.createEntity({ key: 'specimen', createdBy: 'tester' });
      await service.addField(
        'specimen',
        { name: 'fixationTime', dataType: FieldDataType.Number },
        'tester',
      );
      await service.addField(
        'specimen',
        { name: 'type', dataType: FieldDataType.String },
        'tester',
      );

      const paths = await service.getSubjectPaths();
      expect(paths).toContain('specimen.fixationTime');
      expect(paths).toContain('specimen.type');
    });
  });
});
