import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Field,
  Input,
  Dropdown,
  Option,
  Textarea,
  Text,
  TagGroup,
  InteractionTag,
  InteractionTagPrimary,
  InteractionTagSecondary,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { AddRegular, InfoRegular } from '@fluentui/react-icons';
import { fonts, radius, space } from '../../theme/tokens';
import { api, type ApiError } from '../../lib/api';
import { FIELD_DATA_TYPES, composeFieldPath, isValidFieldName } from '../../lib/vocabulary';
import { buildAddFieldPayload, type AddFieldFormState } from './buildCreatePayload';
import { REGISTRY_QUERY_KEY } from './queryKeys';
import type { FieldDataType, RegistryEntity, RegistryField } from '../../lib/types/api';

const useStyles = makeStyles({
  surface: { maxWidth: '600px' },
  form: { display: 'flex', flexDirection: 'column', gap: space.lg },
  derived: { fontFamily: fonts.mono, color: tokens.colorBrandForeground1, fontWeight: 600 },
  mono: { fontFamily: fonts.mono },
  tagRow: { display: 'flex', flexDirection: 'column', gap: space.sm },
  tagInputRow: { display: 'flex', gap: space.sm, alignItems: 'flex-end' },
  tagInput: { flex: 1 },
  note: {
    display: 'flex',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
    fontSize: '12.5px',
    lineHeight: 1.5,
  },
  noteIcon: { color: tokens.colorBrandForeground1, flexShrink: 0, marginTop: '1px' },
});

const emptyForm = (entityKey: string): AddFieldFormState => ({
  entityKey,
  name: '',
  dataType: 'String',
  allowedValues: [],
  description: '',
});

export interface AddFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All entities, for the SELECT (Active entities are selectable; deprecated ones are excluded). */
  entities: RegistryEntity[];
  /** Pre-selected entity key (e.g. when opened from an entity's "Add field" action). */
  initialEntityKey?: string;
  /** Called with the entity key + created field so the page can announce success. */
  onCreated: (entityKey: string, field: RegistryField) => void;
}

/**
 * Adds a FIELD to an existing entity. The entity is SELECTED from a dropdown — never free-typed — so a
 * field can only ever attach to a real, governed entity (the structural fix for path drift). The author
 * supplies the field name, data type, optional closed value set (tags), and an optional description; the
 * composed `entity.field` path is shown read-only for clarity.
 */
export function AddFieldDialog({
  open,
  onOpenChange,
  entities,
  initialEntityKey,
  onCreated,
}: AddFieldDialogProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();

  const selectableEntities = entities.filter((e) => e.status === 'Active');
  const defaultKey = initialEntityKey ?? selectableEntities[0]?.key ?? '';
  const [form, setForm] = useState<AddFieldFormState>(emptyForm(defaultKey));
  const [pendingValue, setPendingValue] = useState('');

  const addMutation = useMutation<RegistryField, ApiError>({
    mutationFn: () => api.addField(form.entityKey, buildAddFieldPayload(form)),
    onSuccess: (field) => {
      queryClient.invalidateQueries({ queryKey: REGISTRY_QUERY_KEY });
      onCreated(form.entityKey, field);
      onOpenChange(false);
    },
  });

  // Reset on open, seeding the entity from the caller (or the first Active entity).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(emptyForm(initialEntityKey ?? selectableEntities[0]?.key ?? ''));
      setPendingValue('');
      addMutation.reset();
    }
  }

  const selectedEntity = entities.find((e) => e.key === form.entityKey) ?? null;
  const trimmedName = form.name.trim();
  const nameTouched = form.name.length > 0;
  const nameValid = isValidFieldName(trimmedName);
  const entityChosen = form.entityKey.length > 0;
  const composedPath = composeFieldPath(form.entityKey, trimmedName);

  const close = () => {
    if (!addMutation.isPending) onOpenChange(false);
  };
  const canSubmit = entityChosen && nameValid && !addMutation.isPending;
  const submit = () => {
    if (canSubmit) addMutation.mutate();
  };

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

  const error = addMutation.error;
  const isConflict = error?.status === 409;
  const isMissingEntity = error?.status === 404;

  const nameValidationMessage =
    nameTouched && !nameValid
      ? 'Use dotted identifier segments like "fixationTime" or "client.nyStatus", with an optional trailing [].'
      : undefined;

  return (
    <Dialog open={open} onOpenChange={(_, d) => (d.open ? onOpenChange(true) : close())}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Add a field</DialogTitle>
          <DialogContent>
            <div className={styles.form}>
              <Field label="Entity" required hint="Select the entity this field belongs to.">
                <Dropdown
                  aria-label="Entity"
                  value={selectedEntity ? selectedEntity.label : ''}
                  selectedOptions={form.entityKey ? [form.entityKey] : []}
                  placeholder={
                    selectableEntities.length === 0
                      ? 'No active entities — add an entity first'
                      : 'Select an entity'
                  }
                  disabled={selectableEntities.length === 0}
                  onOptionSelect={(_, d) => {
                    if (d.optionValue) setForm((f) => ({ ...f, entityKey: d.optionValue as string }));
                  }}
                >
                  {selectableEntities.map((e) => (
                    <Option key={e.key} value={e.key} text={e.label}>
                      {e.label} <span className={styles.mono}>({e.key})</span>
                    </Option>
                  ))}
                </Dropdown>
              </Field>

              <Field
                label="Field name"
                required
                validationState={nameValidationMessage ? 'error' : 'none'}
                validationMessage={nameValidationMessage}
                hint='Relative to the entity, e.g. "fixationTime" or "client.nyStatus".'
              >
                <Input
                  className={styles.mono}
                  value={form.name}
                  onChange={(_, d) => setForm((f) => ({ ...f, name: d.value }))}
                  placeholder="fixationTime"
                  aria-label="Field name"
                />
              </Field>

              <Field label="Path">
                <Text className={styles.derived} aria-live="polite">
                  {composedPath || '—'}
                </Text>
              </Field>

              <Field label="Data type" required>
                <Dropdown
                  aria-label="Data type"
                  value={form.dataType}
                  selectedOptions={[form.dataType]}
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
                hint="Optional. A closed set of permitted values (enum). Leave empty to allow any value."
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
                      aria-label="Add an allowed value"
                    />
                    <Button
                      appearance="secondary"
                      icon={<AddRegular />}
                      onClick={commitPendingValue}
                      disabled={pendingValue.trim().length === 0}
                    >
                      Add
                    </Button>
                  </div>
                  {form.allowedValues.length > 0 && (
                    <TagGroup
                      aria-label="Allowed values"
                      onDismiss={(_, d) => removeValue(d.value)}
                    >
                      {form.allowedValues.map((v) => (
                        <InteractionTag key={v} value={v}>
                          <InteractionTagPrimary
                            hasSecondaryAction
                            className={styles.mono}
                          >
                            {v}
                          </InteractionTagPrimary>
                          <InteractionTagSecondary aria-label={`Remove ${v}`} />
                        </InteractionTag>
                      ))}
                    </TagGroup>
                  )}
                </div>
              </Field>

              <Field label="Description" hint="Optional. Helps authors understand the field.">
                <Textarea
                  value={form.description}
                  onChange={(_, d) => setForm((f) => ({ ...f, description: d.value }))}
                  resize="vertical"
                />
              </Field>

              <div className={styles.note}>
                <InfoRegular className={styles.noteIcon} fontSize={16} aria-hidden />
                <span>
                  Adding a field makes it available to author against — the system must also be
                  configured to supply this fact at evaluation time (<code>IFactProvider</code>).
                </span>
              </div>

              {error && (
                <MessageBar intent="error" role="alert">
                  <MessageBarBody>
                    <MessageBarTitle>
                      {isConflict
                        ? 'That field already exists'
                        : isMissingEntity
                          ? 'That entity no longer exists'
                          : 'Could not add the field'}
                    </MessageBarTitle>
                    {isConflict
                      ? `A field '${trimmedName}' already exists on '${form.entityKey}'.`
                      : error.message}
                  </MessageBarBody>
                </MessageBar>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={close} disabled={addMutation.isPending}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              data-testid="add-field-submit"
              icon={addMutation.isPending ? <Spinner size="tiny" /> : <AddRegular />}
              onClick={submit}
              disabled={!canSubmit}
            >
              {addMutation.isPending ? 'Adding…' : 'Add field'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
