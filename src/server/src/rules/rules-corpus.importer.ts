import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { deserializeRule } from '../vdf/serializer';
import { JsonObject, JsonValue } from '../vdf/types';
import { RuleRepository } from './rule.repository';

const SYSTEM_ACTOR = 'system';

/** The number of rules and reference-data entries imported. */
export interface ImportResult {
  rulesImported: number;
  referenceEntriesImported: number;
}

/**
 * Idempotent importer for the on-disk corpus.
 *
 * Loads every `rules/*.json` (excluding `reference-data.json`) into Rule+RuleVersion
 * via {@link RuleRepository.saveAsync} (so v1 is created with full versioning
 * semantics), and flattens `reference-data.json` into `reference_data` rows mirroring
 * the .NET RulesCorpusImporter:
 *  - nested object source → one row per nested key (key=nestedKey),
 *  - scalar/array source (incl. literal dotted keys) → one row with key="".
 *
 * Reference data is upserted by (source, key) so repeated imports are safe. Rules are
 * imported only when the Rule table is empty ({@link ensureImported}), or
 * unconditionally via {@link importCorpus} (each call appends a new version).
 */
@Injectable()
export class RulesCorpusImporter {
  private readonly logger = new Logger(RulesCorpusImporter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleRepo: RuleRepository,
  ) {}

  /** Imports the corpus iff no rules exist yet. Returns counts (zeros when skipped). */
  async ensureImported(rulesDir?: string): Promise<ImportResult> {
    const existing = await this.prisma.rule.count();
    if (existing > 0) {
      this.logger.log(
        `Corpus already imported (${existing} rules) — skipping.`,
      );
      return { rulesImported: 0, referenceEntriesImported: 0 };
    }
    return this.importCorpus(rulesDir);
  }

  /**
   * Imports all rule files and the reference-data file from {@link rulesDir}
   * (defaults to the repo-root `rules/` located by walking up from this file).
   */
  async importCorpus(rulesDir?: string): Promise<ImportResult> {
    const dir = rulesDir ?? findRulesDir();
    const rulesImported = await this.importRules(dir);
    const referenceEntriesImported = await this.importReferenceData(
      path.join(dir, 'reference-data.json'),
    );
    this.logger.log(
      `Imported ${rulesImported} rules and ${referenceEntriesImported} reference entries.`,
    );
    return { rulesImported, referenceEntriesImported };
  }

  private async importRules(dir: string): Promise<number> {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'reference-data.json')
      .sort();

    let count = 0;
    for (const file of files) {
      const json = fs.readFileSync(path.join(dir, file), 'utf8');
      const trimmed = json.trimStart();
      if (trimmed.startsWith('[')) {
        const arr = JSON.parse(json) as unknown[];
        for (const node of arr) {
          const rule = deserializeRule(JSON.stringify(node));
          await this.ruleRepo.saveAsync(rule, { authoredBy: SYSTEM_ACTOR });
          count += 1;
        }
      } else {
        const rule = deserializeRule(json);
        await this.ruleRepo.saveAsync(rule, { authoredBy: SYSTEM_ACTOR });
        count += 1;
      }
    }
    return count;
  }

  private async importReferenceData(refPath: string): Promise<number> {
    if (!fs.existsSync(refPath)) {
      return 0;
    }
    const parsed = JSON.parse(fs.readFileSync(refPath, 'utf8')) as JsonObject;

    let count = 0;
    for (const [topKey, topValue] of Object.entries(parsed)) {
      if (topValue === null || topValue === undefined) {
        continue;
      }
      if (
        typeof topValue === 'object' &&
        !Array.isArray(topValue) &&
        // A literal dotted top-level key (e.g. "TestCompendium.compatibleSpecimens")
        // is stored whole; only PLAIN nested objects fan out. Literal dotted keys are
        // arrays/objects keyed by a dotted name and are handled by the else branch.
        !topKey.includes('.')
      ) {
        for (const [nestedKey, nestedValue] of Object.entries(topValue)) {
          await this.upsert(topKey, nestedKey, nestedValue ?? null);
          count += 1;
        }
      } else {
        await this.upsert(topKey, '', topValue);
        count += 1;
      }
    }
    return count;
  }

  private async upsert(
    source: string,
    key: string,
    value: JsonValue,
  ): Promise<void> {
    const valueJson = (
      value === undefined ? null : value
    ) as Prisma.InputJsonValue;
    await this.prisma.referenceDataEntry.upsert({
      where: { source_key: { source, key } },
      create: { source, key, valueJson },
      update: { valueJson },
    });
  }
}

/**
 * Walks up from this file to find the repo-root corpus `rules/` directory — the one
 * containing `reference-data.json`. The marker disambiguates it from the server's own
 * `src/rules/` source module, which would otherwise shadow the walk-up.
 */
function findRulesDir(): string {
  let dir: string | undefined = __dirname;
  while (dir !== undefined) {
    const candidate = path.join(dir, 'rules');
    if (
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isDirectory() &&
      fs.existsSync(path.join(candidate, 'reference-data.json'))
    ) {
      return candidate;
    }
    const parent = path.dirname(dir);
    dir = parent === dir ? undefined : parent;
  }
  throw new Error(
    `Could not locate corpus 'rules' directory from ${__dirname}.`,
  );
}
