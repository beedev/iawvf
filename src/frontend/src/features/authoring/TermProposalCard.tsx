import { useState } from 'react';
import {
  makeStyles,
  tokens,
  shorthands,
  Button,
  Dropdown,
  Option,
  Field,
  Input,
  Text,
  Spinner,
  TagGroup,
  InteractionTag,
  InteractionTagPrimary,
  InteractionTagSecondary,
} from '@fluentui/react-components';
import { AddRegular, LockClosedRegular } from '@fluentui/react-icons';
import { fonts, radius, space } from '../../theme/tokens';
import { StatusBadge } from '../../components';
import { FIELD_DATA_TYPES } from '../../lib/vocabulary';
import type { FieldDataType, TermProposal } from '../../lib/types/api';
import { initialTermForm, type TermProposalFormState } from './buildTermPayloads';

const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
  },
  topRow: { display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  path: {
    fontFamily: fonts.mono,
    fontSize: '13px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
  },
  rationale: { color: tokens.colorNeutralForeground3, lineHeight: 1.5 },
  controls: { display: 'flex', gap: space.lg, flexWrap: 'wrap', alignItems: 'flex-end' },
  typeField: { minWidth: '160px' },
  valuesField: { flex: 1, minWidth: '220px' },
  tagRow: { display: 'flex', flexDirection: 'column', gap: space.sm },
  tagInputRow: { display: 'flex', gap: space.sm, alignItems: 'flex-end' },
  tagInput: { flex: 1 },
  mono: { fontFamily: fonts.mono },
  actions: { display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  readonlyNote: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: tokens.colorNeutralForeground3,
    fontSize: '12.5px',
  },
});

export interface TermProposalCardProps {
  proposal: TermProposal;
  /** When true, the Admin add controls are enabled; otherwise the card is read-only with a note. */
  canAdmin: boolean;
  /** True while this specific proposal's add → re-interpret cycle is in flight. */
  isAdding: boolean;
  /** Whether ANY proposal on the panel is currently being added (disables others to avoid races). */
  isBusy: boolean;
  /** Invoked with the (possibly edited) form when the Admin clicks "Add to vocabulary". */
  onAdd: (proposal: TermProposal, form: TermProposalFormState) => void;
}

/**
 * One vocabulary-gap proposal rendered as an editable card: the proposed `entity.field` path (mono), a
 * badge stating whether it creates a new entity or adds a field to an existing one, an editable data-type
 * dropdown and allowed-values tag input (both pre-filled from the proposal), the interpreter's rationale,
 * and a primary "Add to vocabulary" button. For non-admins the controls are read-only and a note explains
 * that an administrator must add the term before re-interpreting.
 *
 * The card owns its OWN form state (seeded once from the proposal) so each row is independently editable.
 */
export function TermProposalCard({
  proposal,
  canAdmin,
  isAdding,
  isBusy,
  onAdd,
}: TermProposalCardProps) {
  const styles = useStyles();
  const [form, setForm] = useState<TermProposalFormState>(() => initialTermForm(proposal));
  const [pendingValue, setPendingValue] = useState('');

  const commitPendingValue = () => {
    const v = pendingValue.trim();
    if (v.length === 0) return;
    setForm((f) =>
      f.allowedValues.includes(v) ? f : { ...f, allowedValues: [...f.allowedValues, v] },
    );
    setPendingValue('');
  };
  const removeValue = (value: string) =>
    setForm((f) => ({ ...f, allowedValues: f.allowedValues.filter((v) => v !== value) }));

  const badge = proposal.entityExists ? (
    <StatusBadge kind="info">new field on {proposal.entity}</StatusBadge>
  ) : (
    <StatusBadge kind="warning">new entity</StatusBadge>
  );

  return (
    <div className={styles.card} data-testid="term-proposal" data-path={proposal.path}>
      <div className={styles.topRow}>
        <span className={styles.path}>{proposal.path}</span>
        {badge}
      </div>

      <Text size={200} className={styles.rationale}>
        {proposal.rationale}
      </Text>

      <div className={styles.controls}>
        <Field label="Data type" className={styles.typeField}>
          <Dropdown
            aria-label={`Data type for ${proposal.path}`}
            value={form.dataType}
            selectedOptions={[form.dataType]}
            disabled={!canAdmin || isBusy}
            onOptionSelect={(_, d) => {
              if (d.optionValue) {
                setForm((f) => ({ ...f, dataType: d.optionValue as FieldDataType }));
              }
            }}
          >
            {FIELD_DATA_TYPES.map((dt) => (
              <Option key={dt} value={dt}>
                {dt}
              </Option>
            ))}
          </Dropdown>
        </Field>

        <Field
          label="Allowed values"
          className={styles.valuesField}
          hint="Optional closed value set (enum). Leave empty to allow any value."
        >
          <div className={styles.tagRow}>
            <div className={styles.tagInputRow}>
              <Input
                className={styles.tagInput}
                value={pendingValue}
                onChange={(_, d) => setPendingValue(d.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitPendingValue();
                  }
                }}
                placeholder="Type a value, press Enter or Add"
                aria-label={`Add an allowed value for ${proposal.path}`}
                disabled={!canAdmin || isBusy}
              />
              <Button
                appearance="secondary"
                icon={<AddRegular />}
                onClick={commitPendingValue}
                disabled={!canAdmin || isBusy || pendingValue.trim().length === 0}
              >
                Add
              </Button>
            </div>
            {form.allowedValues.length > 0 && (
              <TagGroup
                aria-label={`Allowed values for ${proposal.path}`}
                onDismiss={(_, d) => removeValue(d.value)}
              >
                {form.allowedValues.map((v) => (
                  <InteractionTag key={v} value={v}>
                    <InteractionTagPrimary
                      hasSecondaryAction={canAdmin && !isBusy}
                      className={styles.mono}
                    >
                      {v}
                    </InteractionTagPrimary>
                    {canAdmin && !isBusy && (
                      <InteractionTagSecondary aria-label={`Remove ${v}`} />
                    )}
                  </InteractionTag>
                ))}
              </TagGroup>
            )}
          </div>
        </Field>
      </div>

      <div className={styles.actions}>
        {canAdmin ? (
          <Button
            appearance="primary"
            icon={isAdding ? <Spinner size="tiny" /> : <AddRegular />}
            onClick={() => onAdd(proposal, form)}
            disabled={isBusy}
            data-testid="add-to-vocabulary"
          >
            {isAdding ? 'Adding…' : 'Add to vocabulary'}
          </Button>
        ) : (
          <span className={styles.readonlyNote} data-testid="admin-required-note">
            <LockClosedRegular fontSize={15} aria-hidden />
            An administrator must add this term, then re-interpret.
          </span>
        )}
      </div>
    </div>
  );
}
