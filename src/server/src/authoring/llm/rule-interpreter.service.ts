/**
 * The high-level interpreter facade the authoring surface (N6) calls.
 *
 * It assembles the live {@link GroundingVocabulary} (optionally narrowed to a scoped
 * subject subset), attempts the default {@link IRuleInterpreter} (the live OpenAI
 * interpreter), and — when the live path is unavailable (disabled / no key / network
 * error) — transparently falls back to the deterministic offline
 * {@link StubRuleInterpreter}. It NEVER leaks secrets: a live failure degrades to the
 * stub rather than surfacing a 500 with provider detail.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';

import { LlmGroundingService } from './llm-grounding.service';
import {
  EvaluatedInterpretationResult,
  GroundingVocabulary,
  IRuleInterpreter,
  InterpretationResult,
  ProposalEvaluation,
  RULE_INTERPRETER,
  TermProposal,
} from './interpreter';
import { StubRuleInterpreter } from './stub-rule-interpreter';

import { GroundedSubject } from '../../rules/vocabulary-projection.service';

@Injectable()
export class RuleInterpreterService {
  private readonly logger = new Logger(RuleInterpreterService.name);

  constructor(
    private readonly grounding: LlmGroundingService,
    @Inject(RULE_INTERPRETER)
    private readonly primary: IRuleInterpreter,
    private readonly stub: StubRuleInterpreter,
  ) {}

  /**
   * Interprets one natural-language rule against the FULL live registry grounding.
   * Uses the primary (live) interpreter; on any failure, falls back to the offline
   * stub so the caller always receives a structured result.
   */
  async interpret(naturalLanguage: string): Promise<InterpretationResult> {
    const vocabulary = await this.grounding.build();
    return this.run(naturalLanguage, vocabulary);
  }

  /**
   * Interprets one natural-language rule grounded only on {@link scopedSubjects} (a
   * registry-projected subset chosen by the author's scope picker). The operator,
   * outcome, and reference vocabularies remain the full engine set — only the subject
   * surface is narrowed.
   */
  async interpretScoped(
    naturalLanguage: string,
    scopedSubjects: readonly GroundedSubject[],
  ): Promise<InterpretationResult> {
    const vocabulary = await this.grounding.buildScoped(scopedSubjects);
    return this.run(naturalLanguage, vocabulary);
  }

  /**
   * Interprets one natural-language rule grounded on {@link scopedSubjects}, then —
   * when the interpretation surfaces missing-vocabulary {@link TermProposal}s — runs a
   * single SANDBOX re-interpretation to decide whether those proposals DEMONSTRABLY
   * improve the result. Proposals are only kept (and surfaced to the UI) when adding
   * them grounds a candidate the base vocabulary could not (or grounds it better);
   * otherwise they are dropped and the base candidate stands. This replaces the old
   * "show every proposal, re-interpret on each add" loop with at most ONE extra call.
   *
   * Steps:
   *  a. BASE — interpret against the current (scoped) grounding.
   *  b. DEDUP — drop proposals that are already a known subject, or that duplicate an
   *     existing field on the entity (cheap, deterministic; no extra call).
   *  c. If no proposals remain → return base as-is (no sandbox call, evaluation=null).
   *  d. SANDBOX — interpret the SAME sentence against grounding + proposed terms (ONE call).
   *  e. EVALUATE — compare base vs. sandbox; compute {@link ProposalEvaluation}.
   *  f. Keep proposals iff `improves`; always attach the evaluation.
   */
  async interpretWithEvaluation(
    naturalLanguage: string,
    scopedSubjects: readonly GroundedSubject[],
  ): Promise<EvaluatedInterpretationResult> {
    const vocabulary = await this.grounding.buildScoped(scopedSubjects);

    // (a) BASE interpretation against the current vocabulary.
    const base = await this.run(naturalLanguage, vocabulary);

    // (b) DEDUP obviously-redundant proposals (no extra LLM call).
    const proposals = dedupeProposals(base.termProposals, vocabulary);

    // (c) Nothing worth evaluating — return the base result unchanged, no sandbox call.
    if (proposals.length === 0) {
      return { ...base, termProposals: [], proposalEvaluation: null };
    }

    // (d) SANDBOX — ONE extra interpretation against the augmented vocabulary. This is
    // a plain interpret (no nested evaluation), so it can never recurse into another
    // sandbox call.
    const augmented = this.grounding.augment(vocabulary, proposals);
    const sandbox = await this.run(naturalLanguage, augmented);

    // (e) EVALUATE base vs. sandbox.
    const evaluation = evaluateProposals(base, sandbox);

    // (f) Keep the (deduped) proposals only when they demonstrably help.
    return {
      ...base,
      termProposals: evaluation.improves ? proposals : [],
      proposalEvaluation: evaluation,
    };
  }

  private async run(
    naturalLanguage: string,
    vocabulary: GroundingVocabulary,
  ): Promise<InterpretationResult> {
    try {
      return await this.primary.interpret(naturalLanguage, vocabulary);
    } catch (error) {
      // Log the reason (never the key — the interpreter sanitises its messages) and
      // degrade gracefully to the offline stub.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Live interpreter unavailable; falling back to offline stub. Reason: ${message}`,
      );
      return this.stub.interpret(naturalLanguage, vocabulary);
    }
  }
}

/**
 * Drops obviously-redundant {@link TermProposal}s against the current grounding —
 * deterministically and without any extra LLM call. A proposal is redundant when:
 *  - its `path` is already a known registry subject in {@link vocabulary}, OR
 *  - the proposal's entity already has a field whose path equals the proposal path, OR
 *  - the proposal duplicates an existing field on that entity by case-insensitive name.
 * This removes proposals like "order.performingLab" when `order.performingLab` (or a
 * differently-cased equivalent) already exists, so the sandbox never wastes a call on
 * a term that adds nothing.
 */
function dedupeProposals(
  proposals: readonly TermProposal[],
  vocabulary: GroundingVocabulary,
): TermProposal[] {
  if (proposals.length === 0) {
    return [];
  }

  // Index the live subjects by canonical (lower-cased) path, and collect the set of
  // existing field names per entity (lower-cased) for case-insensitive name matching.
  const knownPaths = new Set(
    vocabulary.subjects.map((s) => canonicalPath(s.path)),
  );
  const fieldsByEntity = new Map<string, Set<string>>();
  for (const subject of vocabulary.subjects) {
    const dot = subject.path.indexOf('.');
    if (dot < 0) {
      continue;
    }
    const entity = subject.path.slice(0, dot).toLowerCase();
    const field = subject.path.slice(dot + 1).toLowerCase();
    const bucket = fieldsByEntity.get(entity);
    if (bucket === undefined) {
      fieldsByEntity.set(entity, new Set([field]));
    } else {
      bucket.add(field);
    }
  }

  const seen = new Set<string>();
  const kept: TermProposal[] = [];
  for (const proposal of proposals) {
    const path = canonicalPath(proposal.path);

    // Already a known subject → redundant.
    if (knownPaths.has(path)) {
      continue;
    }
    // The entity already declares a field with this name (case-insensitive) → redundant.
    const existingFields = fieldsByEntity.get(proposal.entity.toLowerCase());
    if (existingFields?.has(proposal.field.toLowerCase())) {
      continue;
    }
    // Dedupe identical proposals within this batch.
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);
    kept.push(proposal);
  }
  return kept;
}

/** Lower-cases a subject path's entity + field for case-insensitive comparison. */
function canonicalPath(path: string): string {
  return path.toLowerCase();
}

/**
 * Computes the {@link ProposalEvaluation} from the BASE and SANDBOX interpretations.
 * The proposals demonstrably IMPROVE the result when the sandbox grounds a candidate
 * AND at least one of:
 *  - the base had no candidate (the proposals unblocked grounding), OR
 *  - sandbox confidence rose meaningfully (> base + 0.01), OR
 *  - the sandbox left fewer phrases unmapped.
 */
function evaluateProposals(
  base: InterpretationResult,
  sandbox: InterpretationResult,
): ProposalEvaluation {
  const baselineHadCandidate = base.candidate !== null;
  const groundsCandidate = sandbox.candidate !== null;
  const unmappedBefore = base.unmappedPhrases.length;
  const unmappedAfter = sandbox.unmappedPhrases.length;

  const improves =
    groundsCandidate &&
    (!baselineHadCandidate ||
      sandbox.confidence > base.confidence + 0.01 ||
      unmappedAfter < unmappedBefore);

  return {
    baselineConfidence: base.confidence,
    projectedConfidence: sandbox.confidence,
    groundsCandidate,
    baselineHadCandidate,
    unmappedBefore,
    unmappedAfter,
    improves,
  };
}
