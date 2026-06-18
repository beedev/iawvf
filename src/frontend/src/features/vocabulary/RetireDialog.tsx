import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Text,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { DeleteRegular } from '@fluentui/react-icons';
import { fonts, space } from '../../theme/tokens';
import { api, type ApiError } from '../../lib/api';
import { ReferencingRulesList } from './ReferencingRulesList';
import { VOCABULARY_QUERY_KEY } from './queryKeys';
import type { VocabularySubject } from '../../lib/types/api';

const useStyles = makeStyles({
  surface: { maxWidth: '520px' },
  body: { display: 'flex', flexDirection: 'column', gap: space.lg },
  path: { fontFamily: fonts.mono, color: tokens.colorPaletteRedForeground1, fontWeight: 600 },
  explain: { color: tokens.colorNeutralForeground2, lineHeight: 1.55 },
  retireBtn: {
    backgroundColor: tokens.colorPaletteRedBackground3,
    color: tokens.colorNeutralForegroundOnBrand,
    ':hover': { backgroundColor: tokens.colorPaletteRedForeground1 },
    ':hover:active': { backgroundColor: tokens.colorPaletteRedForeground1 },
  },
});

export interface RetireDialogProps {
  /** The deprecated subject to retire, or null when closed. */
  subject: VocabularySubject | null;
  onOpenChange: (open: boolean) => void;
  /** Announce a successful retirement to the page. */
  onRetired: (path: string) => void;
}

/**
 * The retire (delete) flow for a DEPRECATED, unreferenced subject. Physically removes the row. If the
 * server returns 409 (still referenced, or not yet deprecated), the blocking referencing rules are
 * surfaced and the action stays blocked — no destructive call succeeds against a live term.
 */
export function RetireDialog({ subject, onOpenChange, onRetired }: RetireDialogProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const open = subject !== null;
  const path = subject?.path ?? '';

  const retireMutation = useMutation<void, ApiError>({
    mutationFn: () => api.retireVocabularySubject(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VOCABULARY_QUERY_KEY });
      onRetired(path);
      onOpenChange(false);
    },
  });

  const close = () => {
    if (!retireMutation.isPending) onOpenChange(false);
  };

  const error = retireMutation.error;
  const blockingRules = error?.status === 409 ? error.referencingRules : [];
  const isBlocked = error?.status === 409;

  return (
    <Dialog open={open} onOpenChange={(_, d) => (d.open ? onOpenChange(true) : close())}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Retire this term?</DialogTitle>
          <DialogContent>
            <div className={styles.body}>
              <Text>
                Permanently retire <span className={styles.path}>{path}</span>? This removes the term
                from the catalog and cannot be undone.
              </Text>
              <Text className={styles.explain}>
                Retiring is only allowed for a deprecated term that no active rule references.
              </Text>

              {isBlocked && (
                <MessageBar intent="error" role="alert">
                  <MessageBarBody>
                    <MessageBarTitle>Cannot retire — still in use</MessageBarTitle>
                    {error?.message}
                  </MessageBarBody>
                </MessageBar>
              )}

              {blockingRules.length > 0 && <ReferencingRulesList rules={blockingRules} />}

              {error && !isBlocked && (
                <MessageBar intent="error" role="alert">
                  <MessageBarBody>
                    <MessageBarTitle>Could not retire</MessageBarTitle>
                    {error.message}
                  </MessageBarBody>
                </MessageBar>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={close} disabled={retireMutation.isPending}>
              {isBlocked ? 'Close' : 'Cancel'}
            </Button>
            {!isBlocked && (
              <Button
                appearance="primary"
                className={styles.retireBtn}
                icon={retireMutation.isPending ? <Spinner size="tiny" /> : <DeleteRegular />}
                onClick={() => retireMutation.mutate()}
                disabled={retireMutation.isPending}
              >
                {retireMutation.isPending ? 'Retiring…' : 'Retire term'}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
