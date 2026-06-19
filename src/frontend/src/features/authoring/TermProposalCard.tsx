import { useState } from 'react';
import {
  makeStyles,
  tokens,
  shorthands,
  Button,
  Checkbox,
  Dropdown,
  Option,
  Field,
  Input,
  Text,
  TagGroup,
  InteractionTag,
  InteractionTagPrimary,
  InteractionTagSecondary,
} from '@fluentui/react-components';
import { AddRegular } from '@fluentui/react-icons';
import { fonts, radius, space } from '../../theme/tokens';
import { StatusBadge } from '../../components';
import { FIELD_DATA_TYPES } from '../../lib/vocabulary';
import type { FieldDataType, TermProposal } from '../../lib/types/api';
import type { TermProposalFormState } from './buildTermPayloads';

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
  /** Selected rows read slightly forward; deselected ones recede (calm, not alarming). */
  cardSelected: {
    ...shorthands.borderColor(tokens.colorBrandStroke2),
    backgroundColor: tokens.colorNeutralBackground1,
  },
  cardDeselected: { opacity: 0.62 },
  topRow: { display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  selectBox: { flexShrink: 0 },
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
});

export interface TermProposalCardProps {
  proposal: TermProposal;
  /** Whether this proposal is selected for the batch add. Controlled by the section. */
  selected: boolean;
  /** The (possibly edited) form state for this proposal. Controlled by the section. */
  form: TermProposalFormState;
  /** When true, the Admin selection + edit controls are enabled; otherwise the card is read-only. */
  canAdmin: boolean;
  /** Disables interaction while a batch add → re-interpret is in flight. */
  isBusy: boolean;
  /** Toggle this proposal's inclusion in the batch. */
  onToggleSelected: (proposal: TermProposal, selected: boolean) => void;
  /** Apply an edit to this proposal's form (data type / allowed values). */
  onFormChange: (proposal: TermProposal, form: TermProposalFormState) => void;
}

/**
 * One vocabulary-gap proposal rendered as an editable, SELECTABLE row in a batch. A leading checkbox
 * includes/excludes the proposal from the single batch add; the proposed `entity.field` path (mono) and
 * a badge state whether it creates a new entity or adds a field; an editable data-type dropdown and
 * allowed-values tag input (pre-filled from the proposal) apply when this proposal is added.
 *
 * This card is PRESENTATIONAL: it owns no add/network logic and never triggers a re-interpret. Selection
 * and form state are LIFTED to {@link MissingVocabularySection} so all selected proposals add in one
 * batch followed by exactly one re-interpret — the fix for the old per-add re-interpret loop. For
 * non-admins the controls are read-only (the section renders the "an administrator must add" note once).
 */
export function TermProposalCard({
  proposal,
  selected,
  form,
  canAdmin,
  isBusy,
  onToggleSelected,
  onFormChange,
}: TermProposalCardProps) {
  const styles = useStyles();
  const [pendingValue, setPendingValue] = useState('');

  const disabled = !canAdmin || isBusy;
  const cardClass = `${styles.card} ${
    canAdmin ? (selected ? styles.cardSelected : styles.cardDeselected) : ''
  }`.trim();

  const commitPendingValue = () => {
    const v = pendingValue.trim();
    if (v.length === 0) return;
    if (!form.allowedValues.includes(v)) {
      onFormChange(proposal, { ...form, allowedValues: [...form.allowedValues, v] });
    }
    setPendingValue('');
  };
  const removeValue = (value: string) =>
    onFormChange(proposal, {
      ...form,
      allowedValues: form.allowedValues.filter((v) => v !== value),
    });

  const badge = proposal.entityExists ? (
    <StatusBadge kind="info">new field on {proposal.entity}</StatusBadge>
  ) : (
    <StatusBadge kind="warning">new entity</StatusBadge>
  );

  return (
    <div className={cardClass} data-testid="term-proposal" data-path={proposal.path}>
      <div className={styles.topRow}>
        {canAdmin && (
          <Checkbox
            className={styles.selectBox}
            checked={selected}
            disabled={isBusy}
            onChange={(_, d) => onToggleSelected(proposal, d.checked === true)}
            aria-label={`Include ${proposal.path} in the batch`}
            data-testid="select-proposal"
          />
        )}
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
            disabled={disabled}
            onOptionSelect={(_, d) => {
              if (d.optionValue) {
                onFormChange(proposal, { ...form, dataType: d.optionValue as FieldDataType });
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
                disabled={disabled}
              />
              <Button
                appearance="secondary"
                icon={<AddRegular />}
                onClick={commitPendingValue}
                disabled={disabled || pendingValue.trim().length === 0}
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
                      hasSecondaryAction={!disabled}
                      className={styles.mono}
                    >
                      {v}
                    </InteractionTagPrimary>
                    {!disabled && <InteractionTagSecondary aria-label={`Remove ${v}`} />}
                  </InteractionTag>
                ))}
              </TagGroup>
            )}
          </div>
        </Field>
      </div>
    </div>
  );
}
