import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  makeStyles,
  mergeClasses,
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
  BookRegular,
  ArchiveRegular,
  DeleteRegular,
  TextBulletListSquareRegular,
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
import { REGISTRY_QUERY_KEY } from './queryKeys';
import { AddEntityDialog } from './AddEntityDialog';
import { AddFieldDialog } from './AddFieldDialog';
import {
  RegistryActionDialog,
  type RegistryAction,
  type RegistryActionTarget,
} from './RegistryActionDialog';
import { ValidateFactsPanel } from './ValidateFactsPanel';
import type { RegistryEntity, RegistryField } from '../../lib/types/api';

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
  entityMeta: { display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  rows: { display: 'flex', flexDirection: 'column' },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(200px, 1.6fr) auto minmax(140px, 1fr) auto auto',
    alignItems: 'center',
    gap: space.lg,
    paddingInline: space.xl,
    paddingBlock: space.md,
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  rowDeprecated: { backgroundColor: tokens.colorNeutralBackground2 },
  nameCell: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  fieldPath: {
    fontFamily: fonts.mono,
    fontSize: '12.5px',
    color: tokens.colorNeutralForeground1,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  fieldPathMuted: { color: tokens.colorNeutralForeground3 },
  desc: { fontSize: '12px', color: tokens.colorNeutralForeground3 },
  allowed: { fontSize: '11.5px', color: tokens.colorNeutralForeground3, fontFamily: fonts.mono },
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
  emptyFields: {
    paddingInline: space.xl,
    paddingBlock: space.lg,
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    color: tokens.colorNeutralForeground3,
    fontSize: '13px',
  },
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

  const [addEntityOpen, setAddEntityOpen] = useState(false);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [addFieldEntity, setAddFieldEntity] = useState<string | undefined>(undefined);
  const [actionTarget, setActionTarget] = useState<RegistryActionTarget | null>(null);
  const [action, setAction] = useState<RegistryAction>('deprecate');

  const registryQuery = useQuery({
    queryKey: REGISTRY_QUERY_KEY,
    queryFn: ({ signal }) => api.listEntities(signal),
  });

  const notify = (toast: ToastState) =>
    dispatchToast(
      <Toast>
        <ToastTitle>{toast.title}</ToastTitle>
        {toast.body && <ToastBody>{toast.body}</ToastBody>}
      </Toast>,
      { intent: toast.intent },
    );

  const onEntityCreated = (entity: RegistryEntity) =>
    notify({
      intent: 'success',
      title: 'Entity added',
      body: `'${entity.key}' is now available. Add fields to make its facts authorable.`,
    });

  const onFieldCreated = (entityKey: string, field: RegistryField) =>
    notify({
      intent: 'success',
      title: 'Field added',
      body: `${entityKey}.${field.name} is now available to author against.`,
    });

  const onActionDone = (label: string, done: RegistryAction) =>
    notify({
      intent: 'success',
      title: done === 'retire' ? 'Retired' : 'Deprecated',
      body:
        done === 'retire'
          ? `${label} was removed from the registry.`
          : `${label} is hidden from new authoring; live rules still resolve it.`,
    });

  const openAddField = (entityKey?: string) => {
    setAddFieldEntity(entityKey);
    setAddFieldOpen(true);
  };
  const openAction = (target: RegistryActionTarget, which: RegistryAction) => {
    setActionTarget(target);
    setAction(which);
  };

  const entities = registryQuery.data ?? [];
  const totalFields = entities.reduce((sum, e) => sum + e.fields.length, 0);
  const hasActiveEntity = entities.some((e) => e.status === 'Active');

  return (
    <div>
      <PageHeader
        eyebrow="Entity registry"
        title="The typed terms authoring is grounded on."
        lede="The controlled vocabulary is a registry of entities (fact objects) and their fields (typed properties). Create entities deliberately, then add fields by selecting an entity — never by typing a free path. Deprecate terms that should no longer be authored against, and retire those that are fully unused."
        actions={
          <>
            <Button
              appearance="subtle"
              icon={<TextBulletListSquareRegular />}
              onClick={() => openAddField()}
              disabled={!hasActiveEntity}
            >
              Add field
            </Button>
            <Button appearance="primary" icon={<AddRegular />} onClick={() => setAddEntityOpen(true)}>
              Add entity
            </Button>
          </>
        }
      />

      <div className={styles.body}>
        {registryQuery.isLoading && <LoadingState label="Loading the entity registry…" />}

        {registryQuery.isError && (
          <ErrorState
            title="Could not load the registry"
            message={(registryQuery.error as ApiError)?.message ?? 'Unexpected error.'}
            onRetry={() => registryQuery.refetch()}
          />
        )}

        {registryQuery.data && entities.length === 0 && (
          <EmptyState
            icon={<BookRegular />}
            title="No entities yet"
            description="Add the first entity to start grounding rules in a typed registry."
            action={
              <Button appearance="primary" icon={<AddRegular />} onClick={() => setAddEntityOpen(true)}>
                Add entity
              </Button>
            }
          />
        )}

        {registryQuery.data && entities.length > 0 && (
          <Reveal className={styles.groups}>
            {entities.map((entity) => {
              const entityDeprecated = entity.status === 'Deprecated';
              return (
                <Panel
                  key={entity.key}
                  eyebrow="Entity"
                  title={entity.label}
                  description={
                    <span className={styles.entityMeta}>
                      <span className={styles.count}>
                        <code>{entity.key}</code> · {entity.fields.length} field
                        {entity.fields.length === 1 ? '' : 's'}
                      </span>
                      {entityDeprecated ? (
                        <StatusBadge kind="neutral">Deprecated</StatusBadge>
                      ) : (
                        <StatusBadge kind="success">Active</StatusBadge>
                      )}
                    </span>
                  }
                  actions={
                    <>
                      {!entityDeprecated && (
                        <Button
                          size="small"
                          appearance="subtle"
                          icon={<AddRegular />}
                          onClick={() => openAddField(entity.key)}
                        >
                          Add field
                        </Button>
                      )}
                      {!entityDeprecated && (
                        <Button
                          size="small"
                          appearance="subtle"
                          icon={<ArchiveRegular />}
                          onClick={() =>
                            openAction(
                              { kind: 'entity', entityKey: entity.key, label: entity.label },
                              'deprecate',
                            )
                          }
                        >
                          Deprecate
                        </Button>
                      )}
                      {entityDeprecated && (
                        <Button
                          size="small"
                          appearance="subtle"
                          icon={<DeleteRegular />}
                          onClick={() =>
                            openAction(
                              { kind: 'entity', entityKey: entity.key, label: entity.label },
                              'retire',
                            )
                          }
                        >
                          Retire
                        </Button>
                      )}
                    </>
                  }
                  flush
                >
                  {entity.fields.length === 0 ? (
                    <div className={styles.emptyFields}>
                      No fields yet. Add a field to make this entity&rsquo;s facts authorable.
                    </div>
                  ) : (
                    <div
                      className={styles.rows}
                      role="table"
                      aria-label={`${entity.label} fields`}
                      data-testid={`entity-group-${entity.key}`}
                    >
                      {entity.fields.map((field) => {
                        const deprecated = field.status === 'Deprecated';
                        const path = `${entity.key}.${field.name}`;
                        return (
                          <div
                            key={field.name}
                            role="row"
                            className={mergeClasses(styles.row, deprecated && styles.rowDeprecated)}
                          >
                            <div className={styles.nameCell} role="cell">
                              <span
                                className={mergeClasses(styles.fieldPath, deprecated && styles.fieldPathMuted)}
                                title={path}
                              >
                                {path}
                              </span>
                              {field.description && (
                                <span className={styles.desc}>{field.description}</span>
                              )}
                              {field.allowedValues.length > 0 && (
                                <span className={styles.allowed}>
                                  {field.allowedValues.join(' · ')}
                                </span>
                              )}
                            </div>
                            <span className={styles.typeChip} role="cell">
                              {field.dataType}
                            </span>
                            <span role="cell">
                              {deprecated ? (
                                <StatusBadge kind="neutral">Deprecated</StatusBadge>
                              ) : (
                                <StatusBadge kind="success">Active</StatusBadge>
                              )}
                            </span>
                            <span role="cell" className={styles.count}>
                              {field.required ? 'Required' : 'Optional'}
                            </span>
                            <span className={styles.actions} role="cell">
                              {!deprecated && (
                                <Button
                                  size="small"
                                  appearance="subtle"
                                  icon={<ArchiveRegular />}
                                  onClick={() =>
                                    openAction(
                                      { kind: 'field', entityKey: entity.key, name: field.name },
                                      'deprecate',
                                    )
                                  }
                                >
                                  Deprecate
                                </Button>
                              )}
                              {deprecated && (
                                <Button
                                  size="small"
                                  appearance="subtle"
                                  icon={<DeleteRegular />}
                                  onClick={() =>
                                    openAction(
                                      { kind: 'field', entityKey: entity.key, name: field.name },
                                      'retire',
                                    )
                                  }
                                >
                                  Retire
                                </Button>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Panel>
              );
            })}
          </Reveal>
        )}

        {registryQuery.data && entities.length > 0 && (
          <span className={styles.count}>
            {totalFields} field{totalFields === 1 ? '' : 's'} across {entities.length} entit
            {entities.length === 1 ? 'y' : 'ies'}.
          </span>
        )}

        {registryQuery.data && (
          <Reveal index={1}>
            <ValidateFactsPanel />
          </Reveal>
        )}
      </div>

      <AddEntityDialog
        open={addEntityOpen}
        onOpenChange={setAddEntityOpen}
        onCreated={onEntityCreated}
      />
      <AddFieldDialog
        open={addFieldOpen}
        onOpenChange={setAddFieldOpen}
        entities={entities}
        initialEntityKey={addFieldEntity}
        onCreated={onFieldCreated}
      />
      <RegistryActionDialog
        target={actionTarget}
        action={action}
        onOpenChange={(open) => !open && setActionTarget(null)}
        onDone={onActionDone}
      />

      <Toaster toasterId={toasterId} aria-live="polite" />
    </div>
  );
}
