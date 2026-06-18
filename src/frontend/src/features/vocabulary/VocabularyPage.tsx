import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  makeStyles,
  tokens,
  Button,
  Toaster,
  useToastController,
  useId,
  Toast,
  ToastTitle,
  ToastBody,
} from '@fluentui/react-components';
import {
  AddRegular,
  ArrowClockwiseRegular,
  BookRegular,
  ArchiveRegular,
  DeleteRegular,
} from '@fluentui/react-icons';
import { fonts, radius, space } from '../../theme/tokens';
import {
  Panel,
  PageHeader,
  StatusBadge,
  LoadingState,
  ErrorState,
  EmptyState,
  Reveal,
} from '../../components';
import { api, type ApiError } from '../../lib/api';
import { VOCABULARY_QUERY_KEY } from './queryKeys';
import { AddPropertyDialog } from './AddPropertyDialog';
import { DeprecateDialog } from './DeprecateDialog';
import { RetireDialog } from './RetireDialog';
import type {
  VocabularyImpact,
  VocabularyObjectGroup,
  VocabularySubject,
} from '../../lib/types/api';

const useStyles = makeStyles({
  body: {
    padding: space.xxl,
    display: 'flex',
    flexDirection: 'column',
    gap: space.xl,
    maxWidth: '1200px',
  },
  groups: { display: 'flex', flexDirection: 'column', gap: space.xl },
  count: { color: tokens.colorNeutralForeground3 },
  rows: { display: 'flex', flexDirection: 'column' },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(160px, 1.2fr) minmax(180px, 2fr) auto auto auto',
    alignItems: 'center',
    gap: space.lg,
    paddingInline: space.xl,
    paddingBlock: space.md,
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  rowDeprecated: { backgroundColor: tokens.colorNeutralBackground2 },
  nameCell: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  name: { fontWeight: 600, color: tokens.colorNeutralForeground1 },
  nameMuted: { color: tokens.colorNeutralForeground3 },
  desc: { fontSize: '12px', color: tokens.colorNeutralForeground3 },
  path: {
    fontFamily: fonts.mono,
    fontSize: '12.5px',
    color: tokens.colorNeutralForeground2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  typeChip: {
    justifySelf: 'start',
    display: 'inline-block',
    paddingInline: '8px',
    paddingBlock: '2px',
    borderRadius: radius.sm,
    backgroundColor: tokens.colorNeutralBackground3,
    fontSize: '11.5px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground2,
    fontFamily: fonts.mono,
  },
  actions: { display: 'flex', gap: space.xs, justifyContent: 'flex-end' },
});

interface ToastState {
  intent: 'success' | 'error';
  title: string;
  body?: string;
}

export function VocabularyPage() {
  const styles = useStyles();
  const toasterId = useId('vocabulary-toaster');
  const { dispatchToast } = useToastController(toasterId);

  const [addOpen, setAddOpen] = useState(false);
  const [deprecateSubject, setDeprecateSubject] = useState<VocabularySubject | null>(null);
  const [retireSubject, setRetireSubject] = useState<VocabularySubject | null>(null);

  const vocabQuery = useQuery({
    queryKey: VOCABULARY_QUERY_KEY,
    queryFn: ({ signal }) => api.getVocabularyAdmin(signal),
  });

  const notify = (toast: ToastState) =>
    dispatchToast(
      <Toast>
        <ToastTitle>{toast.title}</ToastTitle>
        {toast.body && <ToastBody>{toast.body}</ToastBody>}
      </Toast>,
      { intent: toast.intent },
    );

  const refreshMutation = useMutation<void, ApiError>({
    mutationFn: () => api.refreshVocabularyCatalog(),
    onSuccess: () => {
      vocabQuery.refetch();
      notify({ intent: 'success', title: 'Catalog refreshed', body: 'The live catalog cache was rebuilt.' });
    },
    onError: (err) => notify({ intent: 'error', title: 'Refresh failed', body: err.message }),
  });

  const onCreated = (subject: VocabularySubject) =>
    notify({
      intent: 'success',
      title: 'Term added',
      body: `${subject.path} is now available to author against.`,
    });

  const onDeprecated = (path: string, impact: VocabularyImpact) =>
    notify({
      intent: 'success',
      title: 'Term deprecated',
      body:
        impact.referencingRules.length > 0
          ? `${path} is hidden from new authoring; ${impact.referencingRules.length} live rule(s) still resolve it.`
          : `${path} is hidden from new authoring.`,
    });

  const onRetired = (path: string) =>
    notify({ intent: 'success', title: 'Term retired', body: `${path} was removed from the catalog.` });

  const groups = vocabQuery.data?.objects ?? [];
  const totalProps = groups.reduce((sum, g) => sum + g.properties.length, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Vocabulary"
        title="The controlled terms authoring is grounded on."
        lede="Manage the governed objects and properties that rules can reference. Add new terms, deprecate ones that should no longer be authored against, and retire those that are fully unused."
        actions={
          <>
            <Button
              appearance="subtle"
              icon={<ArrowClockwiseRegular />}
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              {refreshMutation.isPending ? 'Refreshing…' : 'Refresh catalog'}
            </Button>
            <Button appearance="primary" icon={<AddRegular />} onClick={() => setAddOpen(true)}>
              Add property
            </Button>
          </>
        }
      />

      <div className={styles.body}>
        {vocabQuery.isLoading && <LoadingState label="Loading vocabulary…" />}

        {vocabQuery.isError && (
          <ErrorState
            title="Could not load the vocabulary"
            message={(vocabQuery.error as ApiError)?.message ?? 'Unexpected error.'}
            onRetry={() => vocabQuery.refetch()}
          />
        )}

        {vocabQuery.data && groups.length === 0 && (
          <EmptyState
            icon={<BookRegular />}
            title="No vocabulary terms yet"
            description="Add the first property to start grounding rules in a controlled vocabulary."
            action={
              <Button appearance="primary" icon={<AddRegular />} onClick={() => setAddOpen(true)}>
                Add property
              </Button>
            }
          />
        )}

        {vocabQuery.data && groups.length > 0 && (
          <Reveal className={styles.groups}>
            {groups.map((group: VocabularyObjectGroup) => (
              <Panel
                key={group.name}
                eyebrow="Object"
                title={group.label}
                description={
                  <span className={styles.count}>
                    {group.properties.length} propert
                    {group.properties.length === 1 ? 'y' : 'ies'}
                  </span>
                }
                flush
              >
                <div
                  className={styles.rows}
                  role="table"
                  aria-label={`${group.label} properties`}
                  data-testid={`object-group-${group.name}`}
                >
                  {group.properties.map((prop) => {
                    const deprecated = prop.status === 'Deprecated';
                    return (
                      <div
                        key={prop.path}
                        role="row"
                        className={`${styles.row} ${deprecated ? styles.rowDeprecated : ''}`}
                      >
                        <div className={styles.nameCell} role="cell">
                          <span
                            className={`${styles.name} ${deprecated ? styles.nameMuted : ''}`}
                          >
                            {prop.label}
                          </span>
                          {prop.description && (
                            <span className={styles.desc}>{prop.description}</span>
                          )}
                        </div>
                        <span className={styles.path} role="cell" title={prop.path}>
                          {prop.path}
                        </span>
                        <span className={styles.typeChip} role="cell">
                          {prop.dataType}
                        </span>
                        <span role="cell">
                          {deprecated ? (
                            <StatusBadge kind="neutral">Deprecated</StatusBadge>
                          ) : (
                            <StatusBadge kind="success">Active</StatusBadge>
                          )}
                        </span>
                        <span className={styles.actions} role="cell">
                          {!deprecated && (
                            <Button
                              size="small"
                              appearance="subtle"
                              icon={<ArchiveRegular />}
                              onClick={() => setDeprecateSubject(prop)}
                            >
                              Deprecate
                            </Button>
                          )}
                          {deprecated && (
                            <Button
                              size="small"
                              appearance="subtle"
                              icon={<DeleteRegular />}
                              onClick={() => setRetireSubject(prop)}
                            >
                              Retire
                            </Button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            ))}
          </Reveal>
        )}

        {vocabQuery.data && groups.length > 0 && (
          <span className={styles.count}>
            {totalProps} term{totalProps === 1 ? '' : 's'} across {groups.length} object
            {groups.length === 1 ? '' : 's'}.
          </span>
        )}
      </div>

      <AddPropertyDialog open={addOpen} onOpenChange={setAddOpen} onCreated={onCreated} />
      <DeprecateDialog
        subject={deprecateSubject}
        onOpenChange={(open) => !open && setDeprecateSubject(null)}
        onDeprecated={onDeprecated}
      />
      <RetireDialog
        subject={retireSubject}
        onOpenChange={(open) => !open && setRetireSubject(null)}
        onRetired={onRetired}
      />

      <Toaster toasterId={toasterId} aria-live="polite" />
    </div>
  );
}
