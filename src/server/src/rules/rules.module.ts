import { Module } from '@nestjs/common';
import { RegistryModule } from '../registry/registry.module';
import { EvaluationController } from '../vdf/api/evaluation.controller';
import { DbReferenceDataLoader } from './db-reference-data.provider';
import { DecisionTraceStore } from './decision-trace.store';
import { RuleEvaluationService } from './rule-evaluation.service';
import { RuleRepository } from './rule.repository';
import { RulesBootstrap } from './rules.bootstrap';
import { RulesCorpusImporter } from './rules-corpus.importer';
import { VocabularyProjectionService } from './vocabulary-projection.service';

/**
 * N3 — Rule persistence + vocabulary projection (+ N6 evaluate surface).
 *
 * Owns the versioned, effective-dated, governed rule store ({@link RuleRepository}),
 * the DB-backed reference provider ({@link DbReferenceDataLoader}), the idempotent
 * corpus importer ({@link RulesCorpusImporter} + {@link RulesBootstrap}), the
 * decision-trace audit store ({@link DecisionTraceStore}), the engine-over-DB wiring
 * ({@link RuleEvaluationService}), and the registry-projected grounding vocabulary
 * ({@link VocabularyProjectionService}).
 *
 * Hosts the N6 {@link EvaluationController} (`/api/evaluate`): it consumes the
 * FactValidationService (RegistryModule), the engine-over-DB evaluator, and the
 * decision-trace store. The governed rules controller lives in AuthoringModule
 * (it also needs the registry-grounded linter).
 *
 * Imports RegistryModule for RegistryService + FactValidationService.
 * PrismaService is provided globally by PrismaModule.
 */
@Module({
  imports: [RegistryModule],
  controllers: [EvaluationController],
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
