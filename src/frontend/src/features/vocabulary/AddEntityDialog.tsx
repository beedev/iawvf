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
  Textarea,
  Text,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { AddRegular } from '@fluentui/react-icons';
import { fonts, space } from '../../theme/tokens';
import { api, type ApiError } from '../../lib/api';
import { humanizeLabel, isValidEntityKey } from '../../lib/vocabulary';
import { buildCreateEntityPayload, type AddEntityFormState } from './buildCreatePayload';
import { REGISTRY_QUERY_KEY } from './queryKeys';
import type { RegistryEntity } from '../../lib/types/api';

const useStyles = makeStyles({
  surface: { maxWidth: '520px' },
  form: { display: 'flex', flexDirection: 'column', gap: space.lg },
  derived: { fontFamily: fonts.mono, color: tokens.colorBrandForeground1, fontWeight: 600 },
  mono: { fontFamily: fonts.mono },
});

const EMPTY_FORM: AddEntityFormState = { key: '', label: '', description: '' };

export interface AddEntityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the created entity so the page can announce success. */
  onCreated: (entity: RegistryEntity) => void;
}

/**
 * Deliberate ENTITY creation. An entity is a top-level fact object (e.g. `specimen`); its key is a
 * single identifier segment, validated client-side to mirror the server. A 409 (case-insensitive
 * duplicate) is surfaced inline and explicitly names the existing key — the fix that makes "Kit"
 * after "kit" a clear, recoverable conflict instead of a silent duplicate.
 */
export function AddEntityDialog({ open, onOpenChange, onCreated }: AddEntityDialogProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AddEntityFormState>(EMPTY_FORM);

  const createMutation = useMutation<RegistryEntity, ApiError>({
    mutationFn: () => api.createEntity(buildCreateEntityPayload(form)),
    onSuccess: (entity) => {
      queryClient.invalidateQueries({ queryKey: REGISTRY_QUERY_KEY });
      onCreated(entity);
      onOpenChange(false);
    },
  });

  // Reset the form to pristine on the open transition (no setState-in-effect cascade).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(EMPTY_FORM);
      createMutation.reset();
    }
  }

  const trimmedKey = form.key.trim();
  const keyTouched = form.key.length > 0;
  const keyValid = isValidEntityKey(trimmedKey);
  const previewLabel = form.label.trim() || (trimmedKey ? humanizeLabel(trimmedKey) : '');

  const close = () => {
    if (!createMutation.isPending) onOpenChange(false);
  };
  const submit = () => {
    if (keyValid && !createMutation.isPending) createMutation.mutate();
  };

  const error = createMutation.error;
  const isConflict = error?.status === 409;

  const keyValidationMessage =
    keyTouched && !keyValid
      ? 'Use a single identifier like "kit" or "specimen" — a letter followed by letters/digits, no dots.'
      : undefined;

  return (
    <Dialog open={open} onOpenChange={(_, d) => (d.open ? onOpenChange(true) : close())}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Add an entity</DialogTitle>
          <DialogContent>
            <div className={styles.form}>
              <Field
                label="Entity key"
                required
                validationState={keyValidationMessage ? 'error' : 'none'}
                validationMessage={keyValidationMessage}
                hint='A single identifier, e.g. "specimen" or "kit". Stored lower-case; uniqueness is case-insensitive.'
              >
                <Input
                  className={styles.mono}
                  value={form.key}
                  onChange={(_, d) => setForm((f) => ({ ...f, key: d.value }))}
                  placeholder="kit"
                  aria-label="Entity key"
                  autoFocus
                />
              </Field>

              <Field label="Label" hint="Optional. Derived from the key when omitted.">
                <Input
                  value={form.label}
                  onChange={(_, d) => setForm((f) => ({ ...f, label: d.value }))}
                  placeholder={previewLabel || 'e.g. Kit'}
                />
              </Field>

              <Field label="Preview label">
                <Text className={styles.derived} aria-live="polite">
                  {previewLabel || '—'}
                </Text>
              </Field>

              <Field label="Description" hint="Optional. Helps authors understand the entity.">
                <Textarea
                  value={form.description}
                  onChange={(_, d) => setForm((f) => ({ ...f, description: d.value }))}
                  resize="vertical"
                />
              </Field>

              {error && (
                <MessageBar intent="error" role="alert">
                  <MessageBarBody>
                    <MessageBarTitle>
                      {isConflict ? 'That entity already exists' : 'Could not add the entity'}
                    </MessageBarTitle>
                    {isConflict
                      ? `An entity '${trimmedKey.toLowerCase()}' already exists (keys are case-insensitive).`
                      : error.message}
                  </MessageBarBody>
                </MessageBar>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={close} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              icon={createMutation.isPending ? <Spinner size="tiny" /> : <AddRegular />}
              onClick={submit}
              disabled={createMutation.isPending || !keyValid}
            >
              {createMutation.isPending ? 'Adding…' : 'Add entity'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
