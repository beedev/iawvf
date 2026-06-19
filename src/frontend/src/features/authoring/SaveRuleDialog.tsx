import { useEffect, useState } from 'react';
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
  Text,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { SaveRegular, CheckmarkCircleFilled } from '@fluentui/react-icons';
import { fonts, space } from '../../theme/tokens';
import { api, type ApiError } from '../../lib/api';
import { LintFindings } from '../../components';
import type { RuleJson, RuleMutationResponse } from '../../lib/types/api';

const useStyles = makeStyles({
  surface: { maxWidth: '560px' },
  form: { display: 'flex', flexDirection: 'column', gap: space.lg },
  key: { fontFamily: fonts.mono, color: tokens.colorBrandForeground1 },
  success: {
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
    color: tokens.colorPaletteGreenForeground1,
  },
});

export interface SaveRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleJson: RuleJson;
  authorNl: string | null;
  interpreterVersion: string;
}

/** Returns today's date as `YYYY-MM-DD` for the effective-date default. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SaveRuleDialog({
  open,
  onOpenChange,
  ruleJson,
  authorNl,
  interpreterVersion,
}: SaveRuleDialogProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();

  const [ruleKey, setRuleKey] = useState(
    (ruleJson['key'] as string | undefined) ?? '',
  );
  const [ruleSet, setRuleSet] = useState(
    (ruleJson['ruleSet'] as string | undefined) ?? '',
  );
  const [effectiveDate, setEffectiveDate] = useState(todayIso());

  // The dialog stays mounted between opens, so re-seed the editable fields from the CURRENT
  // candidate each time it opens — otherwise the key/ruleSet would reflect a stale rule.
  useEffect(() => {
    if (open) {
      setRuleKey((ruleJson['key'] as string | undefined) ?? '');
      setRuleSet((ruleJson['ruleSet'] as string | undefined) ?? '');
      setEffectiveDate(todayIso());
    }
  }, [open, ruleJson]);

  // The key is the rule's identity, PROVIDED BY THE AUTHOR — a short code consistent with
  // the corpus (BL8, PM17, BM99). Letters, digits, and underscores; no spaces.
  const trimmedKey = ruleKey.trim();
  const keyValid = /^[A-Za-z0-9_]+$/.test(trimmedKey);

  const saveMutation = useMutation<RuleMutationResponse, ApiError>({
    mutationFn: () => {
      // Patch the rule body with the author-provided key + governance fields before saving.
      const patched: RuleJson = {
        ...ruleJson,
        key: trimmedKey,
        ...(ruleSet.trim() ? { ruleSet: ruleSet.trim() } : {}),
        effectiveDate: new Date(`${effectiveDate}T00:00:00Z`).toISOString(),
      };
      return api.createRule({ ruleJson: patched, authorNl, interpreterVersion });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
  });

  const close = () => {
    if (!saveMutation.isPending) {
      saveMutation.reset();
      onOpenChange(false);
    }
  };

  const error = saveMutation.error;
  const lintRejection = error?.isLintRejection ? error.lintReport : null;

  return (
    <Dialog open={open} onOpenChange={(_, d) => (d.open ? onOpenChange(true) : close())}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Save rule to repository</DialogTitle>
          <DialogContent>
            {saveMutation.isSuccess ? (
              <div className={styles.success} role="status">
                <CheckmarkCircleFilled fontSize={24} aria-hidden />
                <Text weight="semibold">{saveMutation.data?.message}</Text>
              </div>
            ) : (
              <div className={styles.form}>
                <Text>
                  The rule is linted server-side; a save is rejected if any error-severity
                  findings remain.
                </Text>

                <Field
                  label="Rule key"
                  required
                  hint="The rule's identity — a short code you choose, e.g. BM99 (like BL8, PM17). Letters, digits, underscore; no spaces."
                  validationState={
                    trimmedKey === '' ? 'none' : keyValid ? 'success' : 'error'
                  }
                  validationMessage={
                    trimmedKey !== '' && !keyValid
                      ? 'Use letters, digits, and underscores only (no spaces).'
                      : undefined
                  }
                >
                  <Input
                    className={styles.key}
                    value={ruleKey}
                    onChange={(_, d) => setRuleKey(d.value)}
                    placeholder="e.g. BM99"
                  />
                </Field>

                <Field label="Rule set" hint="Logical grouping for this rule (optional).">
                  <Input
                    value={ruleSet}
                    onChange={(_, d) => setRuleSet(d.value)}
                    placeholder="e.g. Accessioning"
                  />
                </Field>

                <Field label="Effective date" hint="The inclusive date this version takes effect.">
                  <Input
                    type="date"
                    value={effectiveDate}
                    onChange={(_, d) => setEffectiveDate(d.value)}
                  />
                </Field>

                {lintRejection && (
                  <MessageBar intent="error" role="alert">
                    <MessageBarBody>
                      <MessageBarTitle>Save rejected by validation gate</MessageBarTitle>
                      Resolve the errors below, then re-lint and try again.
                    </MessageBarBody>
                  </MessageBar>
                )}
                {lintRejection && <LintFindings report={lintRejection} />}

                {error && !lintRejection && (
                  <MessageBar intent="error" role="alert">
                    <MessageBarBody>
                      <MessageBarTitle>Could not save</MessageBarTitle>
                      {error.message}
                    </MessageBarBody>
                  </MessageBar>
                )}
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={close} disabled={saveMutation.isPending}>
              {saveMutation.isSuccess ? 'Close' : 'Cancel'}
            </Button>
            {!saveMutation.isSuccess && (
              <Button
                appearance="primary"
                icon={saveMutation.isPending ? <Spinner size="tiny" /> : <SaveRegular />}
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !effectiveDate || !keyValid}
              >
                {saveMutation.isPending ? 'Saving…' : 'Save rule'}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
