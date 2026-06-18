import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { ArchiveRegular } from '@fluentui/react-icons';
import { fonts, space } from '../../theme/tokens';
import { api, type ApiError } from '../../lib/api';
import { ReferencingRulesList } from './ReferencingRulesList';
import { VOCABULARY_QUERY_KEY } from './queryKeys';
import type { VocabularyImpact, VocabularySubject } from '../../lib/types/api';

const useStyles = makeStyles({
  surface: { maxWidth: '520px' },
  body: { display: 'flex', flexDirection: 'column', gap: space.lg },
  path: { fontFamily: fonts.mono, color: tokens.colorBrandForeground1, fontWeight: 600 },
  explain: { color: tokens.colorNeutralForeground2, lineHeight: 1.55 },
});

export interface DeprecateDialogProps {
  /** The subject to deprecate, or null when closed. */
  subject: VocabularySubject | null;
  onOpenChange: (open: boolean) => void;
  /** Announce the result to the page (for the toast + aria-live). */
  onDeprecated: (path: string, impact: VocabularyImpact) => void;
}

/**
 * The deprecate-confirm flow. On open it runs impact analysis (the rules still referencing the term),
 * explains that deprecated terms STAY resolvable so live rules keep working but are hidden from new
 * authoring, and only deprecates on explicit confirmation.
 */
export function DeprecateDialog({ subject, onOpenChange, onDeprecated }: DeprecateDialogProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const open = subject !== null;
  const path = subject?.path ?? '';

  const impactQuery = useQuery<VocabularyImpact, ApiError>({
    queryKey: ['vocabulary', 'impact', path],
    queryFn: ({ signal }) => api.getVocabularyImpact(path, signal),
    enabled: open,
  });

  const deprecateMutation = useMutation<VocabularyImpact, ApiError>({
    mutationFn: () => api.deprecateVocabularySubject(path),
    onSuccess: (impact) => {
      queryClient.invalidateQueries({ queryKey: VOCABULARY_QUERY_KEY });
      onDeprecated(path, impact);
      onOpenChange(false);
    },
  });

  const close = () => {
    if (!deprecateMutation.isPending) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => (d.open ? onOpenChange(true) : close())}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Deprecate this term?</DialogTitle>
          <DialogContent>
            <div className={styles.body}>
              <Text>
                Deprecate <span className={styles.path}>{path}</span>?
              </Text>
              <Text className={styles.explain}>
                Deprecated terms stay resolvable, so any live rule that already references this term
                keeps evaluating. It is simply hidden from new authoring.
              </Text>

              {impactQuery.isLoading && (
                <Spinner size="tiny" label="Checking which rules use this term…" labelPosition="after" />
              )}

              {impactQuery.isError && (
                <MessageBar intent="warning" role="alert">
                  <MessageBarBody>
                    <MessageBarTitle>Could not check impact</MessageBarTitle>
                    {impactQuery.error.message}
                  </MessageBarBody>
                </MessageBar>
              )}

              {impactQuery.data && (
                <ReferencingRulesList rules={impactQuery.data.referencingRules} />
              )}

              {deprecateMutation.isError && (
                <MessageBar intent="error" role="alert">
                  <MessageBarBody>
                    <MessageBarTitle>Could not deprecate</MessageBarTitle>
                    {deprecateMutation.error.message}
                  </MessageBarBody>
                </MessageBar>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={close} disabled={deprecateMutation.isPending}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              icon={deprecateMutation.isPending ? <Spinner size="tiny" /> : <ArchiveRegular />}
              onClick={() => deprecateMutation.mutate()}
              disabled={deprecateMutation.isPending}
            >
              {deprecateMutation.isPending ? 'Deprecating…' : 'Deprecate term'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
