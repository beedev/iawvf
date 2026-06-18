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
import {
  SUBJECT_DATA_TYPES,
  deriveObjectName,
  isValidSubjectPath,
} from '../../lib/vocabulary';
import { buildCreatePayload, type AddPropertyFormState } from './buildCreatePayload';
import { VOCABULARY_QUERY_KEY } from './queryKeys';
import type { SubjectDataType, VocabularySubject } from '../../lib/types/api';

const useStyles = makeStyles({
  surface: { maxWidth: '560px' },
  form: { display: 'flex', flexDirection: 'column', gap: space.lg },
  derived: {
    fontFamily: fonts.mono,
    color: tokens.colorBrandForeground1,
    fontWeight: 600,
  },
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
  mono: { fontFamily: fonts.mono },
});

const EMPTY_FORM: AddPropertyFormState = {
  path: '',
  dataType: 'String',
  label: '',
  description: '',
};

export interface AddPropertyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the created subject's path so the page can announce success. */
  onCreated: (subject: VocabularySubject) => void;
}

/**
 * The Add-property panel. Validates the dotted path client-side (mirroring the backend), shows the
 * derived object name read-only, and POSTs a minimal payload. A 409 surfaces an "already exists"
 * message inline; any other failure shows its server title. On success the list is invalidated.
 */
export function AddPropertyDialog({ open, onOpenChange, onCreated }: AddPropertyDialogProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AddPropertyFormState>(EMPTY_FORM);

  const createMutation = useMutation<VocabularySubject, ApiError>({
    mutationFn: () => api.createVocabularySubject(buildCreatePayload(form)),
    onSuccess: (subject) => {
      queryClient.invalidateQueries({ queryKey: VOCABULARY_QUERY_KEY });
      onCreated(subject);
      onOpenChange(false);
    },
  });

  // Reset the form to a pristine state each time the dialog opens, by adjusting state during render on
  // the open transition (React's recommended alternative to a setState-in-effect; no cascading renders).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(EMPTY_FORM);
      createMutation.reset();
    }
  }

  const trimmedPath = form.path.trim();
  const pathTouched = form.path.length > 0;
  const pathValid = isValidSubjectPath(trimmedPath);
  const objectName = deriveObjectName(trimmedPath);

  const close = () => {
    if (!createMutation.isPending) onOpenChange(false);
  };

  const submit = () => {
    if (pathValid && !createMutation.isPending) createMutation.mutate();
  };

  const error = createMutation.error;
  const isConflict = error?.status === 409;

  const pathValidationMessage =
    pathTouched && !pathValid
      ? 'Use dotted segments like "client.program" — letters/digits per segment, optional trailing [].'
      : undefined;

  return (
    <Dialog open={open} onOpenChange={(_, d) => (d.open ? onOpenChange(true) : close())}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Add a vocabulary term</DialogTitle>
          <DialogContent>
            <div className={styles.form}>
              <Field
                label="Path"
                required
                validationState={pathValidationMessage ? 'error' : 'none'}
                validationMessage={pathValidationMessage}
                hint='The dotted fact path, e.g. "client.program" or "order.client.program".'
              >
                <Input
                  className={styles.mono}
                  value={form.path}
                  onChange={(_, d) => setForm((f) => ({ ...f, path: d.value }))}
                  placeholder="order.client.program"
                  aria-label="Subject path"
                  autoFocus
                />
              </Field>

              <Field label="Object" hint="Derived from the first segment of the path.">
                <Text className={styles.derived} aria-live="polite">
                  {objectName || '—'}
                </Text>
              </Field>

              <Field label="Data type" required>
                <Dropdown
                  aria-label="Data type"
                  value={form.dataType}
                  selectedOptions={[form.dataType]}
                  onOptionSelect={(_, d) => {
                    if (d.optionValue) {
                      setForm((f) => ({ ...f, dataType: d.optionValue as SubjectDataType }));
                    }
                  }}
                >
                  {SUBJECT_DATA_TYPES.map((dt) => (
                    <Option key={dt} value={dt}>
                      {dt}
                    </Option>
                  ))}
                </Dropdown>
              </Field>

              <Field label="Label" hint="Optional. Derived from the object name when omitted.">
                <Input
                  value={form.label}
                  onChange={(_, d) => setForm((f) => ({ ...f, label: d.value }))}
                  placeholder="e.g. Client program"
                />
              </Field>

              <Field label="Description" hint="Optional. Helps authors understand the term.">
                <Textarea
                  value={form.description}
                  onChange={(_, d) => setForm((f) => ({ ...f, description: d.value }))}
                  resize="vertical"
                />
              </Field>

              <div className={styles.note}>
                <InfoRegular className={styles.noteIcon} fontSize={16} aria-hidden />
                <span>
                  Adding a term makes it available to author against — the system must also be
                  configured to supply this fact at evaluation time (<code>IFactProvider</code>).
                </span>
              </div>

              {error && (
                <MessageBar intent="error" role="alert">
                  <MessageBarBody>
                    <MessageBarTitle>
                      {isConflict ? 'That term already exists' : 'Could not add the term'}
                    </MessageBarTitle>
                    {isConflict
                      ? `A subject with the path "${trimmedPath}" is already defined.`
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
              disabled={createMutation.isPending || !pathValid}
            >
              {createMutation.isPending ? 'Adding…' : 'Add term'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
