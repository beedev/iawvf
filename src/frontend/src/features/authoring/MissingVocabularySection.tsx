import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  makeStyles,
  tokens,
  shorthands,
  Button,
  Text,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from '@fluentui/react-components';
import { AddRegular, LockClosedRegular, ArrowTrendingRegular } from '@fluentui/react-icons';
import { fonts, radius, space } from '../../theme/tokens';
import { api, ApiError } from '../../lib/api';
import type { ProposalEvaluation, TermProposal } from '../../lib/types/api';
import {
  buildAddFieldPayload,
  buildCreateEntityPayload,
  initialTermForm,
  type TermProposalFormState,
} from './buildTermPayloads';
import { TermProposalCard } from './TermProposalCard';

const useStyles = makeStyles({
  section: { display: 'flex', flexDirection: 'column', gap: space.md },
  heading: { display: 'flex', flexDirection: 'column', gap: space.xs },
  eyebrow: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground4,
  },
  /** Calm, improvement-toned banner for the evaluation delta — brand accent, never an error red. */
  delta: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: tokens.colorBrandBackground2,
    ...shorthands.border('1px', 'solid', tokens.colorBrandStroke2),
    color: tokens.colorNeutralForeground1,
    lineHeight: 1.5,
  },
  deltaIcon: { color: tokens.colorBrandForeground1, flexShrink: 0, marginTop: '2px' },
  deltaText: { display: 'flex', flexDirection: 'column', gap: space.xxs },
  pct: { fontFamily: fonts.mono, fontWeight: 700, color: tokens.colorBrandForeground1 },
  cards: { display: 'flex', flexDirection: 'column', gap: space.md },
  actions: { display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  progress: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    color: tokens.colorNeutralForeground3,
    fontSize: '13px',
  },
  readonlyNote: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: tokens.colorNeutralForeground3,
    fontSize: '12.5px',
  },
});

export interface MissingVocabularySectionProps {
  proposals: TermProposal[];
  /**
   * The evaluation delta the backend paired with the proposals — what adding them is projected to do to
   * grounding confidence and candidate completeness. Used purely for the calm, evidence-based header.
   */
  proposalEvaluation?: ProposalEvaluation | null;
  /** Whether the signed-in principal may administer the vocabulary (Admin). Gates the Add controls. */
  canAdmin: boolean;
  /**
   * Re-runs interpretation ONCE with the original natural-language + scope after the selected terms have
   * been added in a single batch. Provided by the page (which owns the interpret mutation/state). The
   * section never loops: a single explicit click adds the batch and re-interprets exactly once.
   */
  onReinterpret: () => void;
}

/** Per-proposal batch state: whether it's included, plus its (possibly edited) registry form. */
interface ProposalEntry {
  selected: boolean;
  form: TermProposalFormState;
}

/** Stable identity for a proposal across renders — its target path is unique within a result. */
const proposalKey = (p: TermProposal) => p.path;

/** A batch identity: changes exactly when the proposal SET changes (a fresh post-re-interpret batch). */
const batchIdOf = (proposals: TermProposal[]) => proposals.map(proposalKey).join('|');

/** Seeds every proposal as selected with its interpreter-inferred form. */
const seedState = (proposals: TermProposal[]): Map<string, ProposalEntry> =>
  new Map(proposals.map((p) => [proposalKey(p), { selected: true, form: initialTermForm(p) }]));

/** Rounds a 0..1 confidence to a whole-number percentage for the delta header. */
const pct = (confidence: number) => `${Math.round(confidence * 100)}%`;

/**
 * The OPTIONAL "improve grounding" section. The backend returns ONLY proposals that demonstrably improve
 * the result (empty otherwise — in which case this renders nothing and the candidate stands on its own),
 * paired with a {@link ProposalEvaluation} delta. This component:
 *
 *   1. Frames the suggestion as a calm improvement — "Adding these terms would raise grounding from X% to
 *      Y%" — never as a blocking error.
 *   2. Renders each proposal as a SELECTABLE card (default ALL selected) and offers ONE primary button,
 *      "Add {N} selected & re-interpret".
 *   3. On click, adds EVERY selected term in a single sequential batch (new field on an existing entity,
 *      or new entity then field), then re-interprets EXACTLY ONCE with the original NL + scope. No
 *      per-add re-interpret, no automatic cascade — if the fresh result still has proposals they appear
 *      as a new batch requiring another explicit click.
 *
 * A 409 (term already exists) is treated as success. A 403 surfaces a friendly "administrator access
 * required" message. Non-admins see the suggestion read-only with a single "an administrator must add
 * these terms" note.
 */
export function MissingVocabularySection({
  proposals,
  proposalEvaluation,
  canAdmin,
  onReinterpret,
}: MissingVocabularySectionProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();

  // Per-proposal selection + editable form, keyed by path. Reset (during render, the React-idiomatic
  // way) whenever a FRESH batch arrives after a re-interpret — so a new batch starts ALL selected with
  // interpreter-seeded forms and carries no stale state from the previous one. No per-add loop here.
  const batchId = batchIdOf(proposals);
  const [trackedBatchId, setTrackedBatchId] = useState(batchId);
  const [state, setState] = useState<Map<string, ProposalEntry>>(() => seedState(proposals));
  if (trackedBatchId !== batchId) {
    setTrackedBatchId(batchId);
    setState(seedState(proposals));
  }

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** Combined progress label across the batch + re-interpret, or null when idle. */
  const [progress, setProgress] = useState<string | null>(null);

  const toggleSelected = (proposal: TermProposal, selected: boolean) =>
    setState((prev) => {
      const next = new Map(prev);
      const entry = next.get(proposalKey(proposal));
      if (entry) next.set(proposalKey(proposal), { ...entry, selected });
      return next;
    });

  const changeForm = (proposal: TermProposal, form: TermProposalFormState) =>
    setState((prev) => {
      const next = new Map(prev);
      const entry = next.get(proposalKey(proposal));
      if (entry) next.set(proposalKey(proposal), { ...entry, form });
      return next;
    });

  const selectedProposals = proposals.filter((p) => state.get(proposalKey(p))?.selected);
  const selectedCount = selectedProposals.length;

  /**
   * Adds ONE proposal to the registry: a new entity (when needed) then its field, or just the field on
   * an existing entity. A 409 means the term is already present — treated as success so the batch
   * continues and the single re-interpret still reflects it.
   */
  const addOne = async (proposal: TermProposal, form: TermProposalFormState) => {
    try {
      if (!proposal.entityExists) {
        await api.createEntity(buildCreateEntityPayload(proposal));
      }
      await api.addField(proposal.entity, buildAddFieldPayload(proposal, form));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) return;
      throw err;
    }
  };

  const batchMutation = useMutation<void, ApiError, TermProposal[]>({
    mutationFn: async (toAdd) => {
      // Add the whole batch sequentially, then re-interpret exactly once.
      for (let i = 0; i < toAdd.length; i++) {
        setProgress(`Adding ${i + 1} of ${toAdd.length} term${toAdd.length === 1 ? '' : 's'}…`);
        const entry = state.get(proposalKey(toAdd[i]));
        await addOne(toAdd[i], entry?.form ?? initialTermForm(toAdd[i]));
      }
      setProgress('Re-interpreting…');
    },
    onMutate: () => setErrorMessage(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      void queryClient.invalidateQueries({ queryKey: ['registry', 'entities'] });
      // ONE re-interpret with the original NL + scope. No auto-loop: a still-incomplete result shows a
      // fresh batch that requires another explicit click.
      onReinterpret();
    },
    onError: (err) => {
      setErrorMessage(
        err.status === 403
          ? 'Administrator access is required to add vocabulary. Ask an admin to add these terms, then re-interpret.'
          : (err.message ?? 'Could not add the terms. Please try again.'),
      );
    },
    onSettled: () => setProgress(null),
  });

  const handleAddBatch = () => {
    if (selectedCount === 0) return;
    batchMutation.mutate(selectedProposals);
  };

  // Empty → the backend found nothing that helps. Render NOTHING; the candidate stands on its own.
  if (proposals.length === 0) return null;

  const evaluation = proposalEvaluation ?? null;
  const showsCompleteRule =
    evaluation?.improves === true &&
    evaluation.groundsCandidate &&
    !evaluation.baselineHadCandidate;

  return (
    <section
      className={styles.section}
      aria-label="Optionally improve grounding"
      data-testid="missing-vocabulary"
    >
      <div className={styles.heading}>
        <Text className={styles.eyebrow} as="p">
          Optional · improve grounding
        </Text>
        {evaluation?.improves ? (
          <div className={styles.delta} role="status" data-testid="proposal-delta">
            <ArrowTrendingRegular className={styles.deltaIcon} fontSize={18} aria-hidden />
            <span className={styles.deltaText}>
              <Text>
                Adding these terms would raise grounding from{' '}
                <span className={styles.pct} data-testid="delta-baseline">
                  {pct(evaluation.baselineConfidence)}
                </span>{' '}
                to{' '}
                <span className={styles.pct} data-testid="delta-projected">
                  {pct(evaluation.projectedConfidence)}
                </span>
                {showsCompleteRule && (
                  <span data-testid="delta-complete-rule">, and produce a complete rule</span>
                )}
                .
              </Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                This is optional — the result above is already usable.
              </Text>
            </span>
          </div>
        ) : (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Optionally improve grounding by adding these registry terms. The result above is already
            usable.
          </Text>
        )}
      </div>

      {errorMessage && (
        <MessageBar intent="error" role="alert">
          <MessageBarBody>
            <MessageBarTitle>Could not add the terms</MessageBarTitle>
            {errorMessage}
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.cards}>
        {proposals.map((proposal) => {
          const entry = state.get(proposalKey(proposal));
          return (
            <TermProposalCard
              key={proposalKey(proposal)}
              proposal={proposal}
              selected={entry?.selected ?? false}
              form={entry?.form ?? initialTermForm(proposal)}
              canAdmin={canAdmin}
              isBusy={batchMutation.isPending}
              onToggleSelected={toggleSelected}
              onFormChange={changeForm}
            />
          );
        })}
      </div>

      {canAdmin ? (
        <div className={styles.actions}>
          <Button
            appearance="primary"
            icon={batchMutation.isPending ? <Spinner size="tiny" /> : <AddRegular />}
            onClick={handleAddBatch}
            disabled={batchMutation.isPending || selectedCount === 0}
            data-testid="add-batch"
          >
            {batchMutation.isPending ? 'Working…' : `Add ${selectedCount} selected & re-interpret`}
          </Button>
          {batchMutation.isPending && progress && (
            <span className={styles.progress} role="status" data-testid="batch-progress">
              <Spinner size="tiny" />
              {progress}
            </span>
          )}
        </div>
      ) : (
        <span className={styles.readonlyNote} data-testid="admin-required-note">
          <LockClosedRegular fontSize={15} aria-hidden />
          An administrator must add these terms before they can ground the rule.
        </span>
      )}
    </section>
  );
}
