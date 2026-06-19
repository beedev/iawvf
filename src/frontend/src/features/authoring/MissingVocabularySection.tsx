import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  makeStyles,
  tokens,
  Text,
  Toaster,
  Toast,
  ToastTitle,
  ToastBody,
  useId,
  useToastController,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
} from '@fluentui/react-components';
import { space } from '../../theme/tokens';
import { api, ApiError } from '../../lib/api';
import type { TermProposal } from '../../lib/types/api';
import {
  buildAddFieldPayload,
  buildCreateEntityPayload,
  type TermProposalFormState,
} from './buildTermPayloads';
import { TermProposalCard } from './TermProposalCard';

const useStyles = makeStyles({
  section: { display: 'flex', flexDirection: 'column', gap: space.md },
  heading: { display: 'flex', flexDirection: 'column', gap: '2px' },
  cards: { display: 'flex', flexDirection: 'column', gap: space.md },
  reinterpreting: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    color: tokens.colorNeutralForeground3,
    fontSize: '13px',
  },
});

export interface MissingVocabularySectionProps {
  proposals: TermProposal[];
  /** Whether the signed-in principal may administer the vocabulary (Admin). Gates the Add controls. */
  canAdmin: boolean;
  /**
   * Re-runs interpretation with the SAME natural-language + scope after a term is added, so the
   * now-grounded candidate appears. Provided by the page (which owns the interpret mutation/state).
   */
  onReinterpret: () => void;
}

/** Stable identity for a proposal across renders — its target path is unique within a result. */
const proposalKey = (p: TermProposal) => p.path;

/**
 * The actionable "Missing vocabulary — add to continue" section. For each {@link TermProposal} it renders
 * an editable {@link TermProposalCard}. When an Admin adds a term, this component:
 *   1. POSTs the registry change — a new field on an existing entity, or (when the entity is new) the
 *      entity first, then its field;
 *   2. invalidates the vocabulary + registry caches and shows a success toast;
 *   3. triggers a re-interpret of the original natural language so the grounded candidate appears.
 *
 * A 409 (the term already exists) is treated as success and still re-interprets. A 403 surfaces a
 * friendly "administrator access required" message. Non-admins see the cards read-only.
 */
export function MissingVocabularySection({
  proposals,
  canAdmin,
  onReinterpret,
}: MissingVocabularySectionProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const toasterId = useId('missing-vocabulary-toaster');
  const { dispatchToast } = useToastController(toasterId);

  /** The path of the proposal currently being added (for a per-card spinner), or null. */
  const [addingPath, setAddingPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const notifySuccess = (proposal: TermProposal) =>
    dispatchToast(
      <Toast>
        <ToastTitle>Term added</ToastTitle>
        <ToastBody>{proposal.path} is now available — re-interpreting…</ToastBody>
      </Toast>,
      { intent: 'success' },
    );

  const addMutation = useMutation<void, ApiError, { proposal: TermProposal; form: TermProposalFormState }>({
    mutationFn: async ({ proposal, form }) => {
      try {
        // New entity → create it first, then its field. Existing entity → just add the field.
        if (!proposal.entityExists) {
          await api.createEntity(buildCreateEntityPayload(proposal));
        }
        await api.addField(proposal.entity, buildAddFieldPayload(proposal, form));
      } catch (err) {
        // 409 — the entity or field already exists. The term is present either way, so treat it as a
        // success: fall through to invalidate + re-interpret so the grounded candidate appears.
        if (err instanceof ApiError && err.status === 409) return;
        throw err;
      }
    },
    onMutate: ({ proposal }) => {
      setErrorMessage(null);
      setAddingPath(proposalKey(proposal));
    },
    onSuccess: (_data, { proposal }) => {
      void queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      void queryClient.invalidateQueries({ queryKey: ['registry', 'entities'] });
      notifySuccess(proposal);
      onReinterpret();
    },
    onError: (err) => {
      setErrorMessage(
        err.status === 403
          ? 'Administrator access is required to add vocabulary. Ask an admin to add this term, then re-interpret.'
          : (err.message ?? 'Could not add the term. Please try again.'),
      );
    },
    onSettled: () => setAddingPath(null),
  });

  const handleAdd = (proposal: TermProposal, form: TermProposalFormState) =>
    addMutation.mutate({ proposal, form });

  if (proposals.length === 0) return null;

  return (
    <section className={styles.section} aria-label="Missing vocabulary" data-testid="missing-vocabulary">
      <div className={styles.heading}>
        <Text weight="semibold">Missing vocabulary — add to continue</Text>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          The interpreter proposed these registry terms to ground the rule. {canAdmin
            ? 'Review the type and any allowed values, then add a term to re-interpret automatically.'
            : 'An administrator must add them before the rule can be grounded.'}
        </Text>
      </div>

      {errorMessage && (
        <MessageBar intent="error" role="alert">
          <MessageBarBody>
            <MessageBarTitle>Could not add the term</MessageBarTitle>
            {errorMessage}
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.cards}>
        {proposals.map((proposal) => (
          <TermProposalCard
            key={proposalKey(proposal)}
            proposal={proposal}
            canAdmin={canAdmin}
            isAdding={addingPath === proposalKey(proposal)}
            isBusy={addMutation.isPending}
            onAdd={handleAdd}
          />
        ))}
      </div>

      {addMutation.isPending && (
        <span className={styles.reinterpreting} role="status" data-testid="reinterpreting">
          <Spinner size="tiny" />
          Re-interpreting with the updated vocabulary…
        </span>
      )}

      <Toaster toasterId={toasterId} aria-live="polite" />
    </section>
  );
}
