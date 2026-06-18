import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { RulesCorpusImporter } from './rules-corpus.importer';

/**
 * Idempotent startup hook that imports the on-disk corpus iff the Rule table is
 * empty (mirrors RegistrySeeder). Doing nothing when rules already exist keeps
 * repeated boots safe and lets operator-authored versions persist.
 */
@Injectable()
export class RulesBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(RulesBootstrap.name);

  constructor(private readonly importer: RulesCorpusImporter) {}

  async onApplicationBootstrap(): Promise<void> {
    const result = await this.importer.ensureImported();
    if (result.rulesImported > 0) {
      this.logger.log(
        `Bootstrap imported ${result.rulesImported} rules and ${result.referenceEntriesImported} reference entries.`,
      );
    }
  }
}
