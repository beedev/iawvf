import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JsonObject, JsonValue } from '../vdf/types';
import {
  JsonReferenceDataProvider,
  ReferenceDataProvider,
} from '../vdf/reference-data';

/**
 * A {@link ReferenceDataProvider} backed by the `reference_data` table.
 *
 * The engine resolves references synchronously, so this provider loads the keyed
 * store from the DB once (via {@link DbReferenceDataLoader.load}) and reconstitutes
 * the SAME nested JSON document the on-disk `reference-data.json` provider would see.
 * It then delegates key resolution to {@link JsonReferenceDataProvider}, guaranteeing
 * byte-for-byte identical dotted/nested/array resolution semantics.
 *
 * Storage shape (mirrors the .NET importer):
 *  - A nested object source (e.g. "PolicyThresholds") fans out into one row per
 *    nested key: (source="PolicyThresholds", key="fixationWindow", value={min,max}).
 *  - A scalar/array source (e.g. "TechnicalFISH", or the literal dotted key
 *    "TestCompendium.compatibleSpecimens") is stored as a single row with key="".
 *
 * Reconstitution inverts that: rows with key="" become top-level keys; rows with a
 * non-empty key are nested under their source object. Because the on-disk provider
 * tries the literal (dotted) key first then walks nested objects, the reconstituted
 * document resolves identically for all three address forms.
 */
export class DbReferenceDataProvider implements ReferenceDataProvider {
  private readonly delegate: JsonReferenceDataProvider;

  constructor(root: JsonObject) {
    this.delegate = new JsonReferenceDataProvider(root);
  }

  resolve(key: string): JsonValue | null {
    return this.delegate.resolve(key);
  }

  tryResolve(key: string): { found: boolean; value: JsonValue | null } {
    return this.delegate.tryResolve(key);
  }

  referenceKeys(): string[] {
    return this.delegate.referenceKeys();
  }
}

/** Loads the reference-data document from Postgres into a DB-backed provider. */
@Injectable()
export class DbReferenceDataLoader {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads every `reference_data` row and reconstitutes the nested JSON document,
   * returning a provider with the engine's exact resolution semantics.
   */
  async load(): Promise<DbReferenceDataProvider> {
    const entries = await this.prisma.referenceDataEntry.findMany();
    const root: JsonObject = {};

    for (const entry of entries) {
      const value = entry.valueJson as JsonValue;
      if (entry.key === '') {
        // Top-level scalar/array source, OR a literal dotted key stored whole.
        root[entry.source] = value;
      } else {
        // Nested key under the source object.
        const existing = root[entry.source];
        const bucket: JsonObject =
          existing !== undefined &&
          existing !== null &&
          typeof existing === 'object' &&
          !Array.isArray(existing)
            ? existing
            : {};
        bucket[entry.key] = value;
        root[entry.source] = bucket;
      }
    }

    return new DbReferenceDataProvider(root);
  }
}
