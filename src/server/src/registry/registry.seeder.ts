import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma, RegistryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { humanizeLabel } from './registry.naming';
import { CANONICAL_ENTITIES } from './registry.seed-data';

const SYSTEM_ACTOR = 'system';

/**
 * Idempotent seeder for the canonical entity registry.
 *
 * On application bootstrap, if the Entity table is empty, it seeds the canonical
 * entities and fields derived from the .NET VocabularyCatalog (see
 * registry.seed-data.ts). All artifacts are created Active, createdBy="system".
 * Doing nothing when entities already exist keeps repeated boots safe and lets
 * operator-authored changes persist.
 */
@Injectable()
export class RegistrySeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(RegistrySeeder.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureSeeded();
  }

  /**
   * Seeds the canonical registry iff it is empty. Returns the number of
   * entities created (0 when already seeded). Safe to call repeatedly.
   */
  async ensureSeeded(): Promise<number> {
    const existing = await this.prisma.entity.count();
    if (existing > 0) {
      this.logger.log(
        `Registry already seeded (${existing} entities) — skipping.`,
      );
      return 0;
    }

    let created = 0;
    for (const seed of CANONICAL_ENTITIES) {
      try {
        await this.prisma.entity.create({
          data: {
            key: seed.key.toLowerCase(),
            label: humanizeLabel(seed.key),
            description: seed.description ?? null,
            status: RegistryStatus.Active,
            createdBy: SYSTEM_ACTOR,
            fields: {
              create: seed.fields.map((field) => ({
                name: field.name,
                dataType: field.dataType,
                required: field.required ?? false,
                allowedValues: field.allowedValues ?? [],
                description: field.description ?? null,
                status: RegistryStatus.Active,
              })),
            },
          },
        });
        created += 1;
      } catch (error) {
        // Concurrent bootstrap (e.g. parallel test workers sharing one DB): another
        // instance won the race and already created this entity. The unique key makes
        // that safe to treat as "already seeded" — skip rather than fail bootstrap.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          this.logger.warn(
            `Entity '${seed.key}' already created concurrently — skipping.`,
          );
          continue;
        }
        throw error;
      }
    }

    this.logger.log(`Seeded ${created} canonical entities into the registry.`);
    return created;
  }
}
