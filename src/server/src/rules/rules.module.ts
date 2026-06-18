import { Module } from '@nestjs/common';
import { RegistryModule } from '../registry/registry.module';
import { DbReferenceDataLoader } from './db-reference-data.provider';
import { DecisionTraceStore } from './decision-trace.store';
import { RuleEvaluationService } from './rule-evaluation.service';
import { RuleRepository } from './rule.repository';
import { RulesBootstrap } from './rules.bootstrap';
import { RulesCorpusImporter } from './rules-corpus.importer';
import { VocabularyProjectionService } from './vocabulary-projection.service';

/**
 * N3 — Rule persistence + vocabulary projection.
 *
 * Owns the versioned, effective-dated, governed rule store ({@link RuleRepository}),
 * the DB-backed reference provider ({@link DbReferenceDataLoader}), the idempotent
 * corpus importer ({@link RulesCorpusImporter} + {@link RulesBootstrap}), the
 * decision-trace audit store ({@link DecisionTraceStore}), the engine-over-DB wiring
 * ({@link RuleEvaluationService}), and the registry-projected grounding vocabulary
 * ({@link VocabularyProjectionService}).
 *
 * Imports RegistryModule for RegistryService (the vocabulary source of truth).
 * PrismaService is provided globally by PrismaModule.
 */
@Module({
  imports: [RegistryModule],
  providers: [
    RuleRepository,
    DbReferenceDataLoader,
    DecisionTraceStore,
    RulesCorpusImporter,
    RuleEvaluationService,
    VocabularyProjectionService,
    RulesBootstrap,
  ],
  exports: [
    RuleRepository,
    DbReferenceDataLoader,
    DecisionTraceStore,
    RulesCorpusImporter,
    RuleEvaluationService,
    VocabularyProjectionService,
  ],
})
export class RulesModule {}
