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
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { ArchiveRegular, DeleteRegular } from '@fluentui/react-icons';
import { fonts, space } from '../../theme/tokens';
import { api, type ApiError } from '../../lib/api';
import { REGISTRY_QUERY_KEY } from './queryKeys';

/** What the action targets: an entity (by key) or a field (entity key + field name). */
export type RegistryActionTarget =
  | { kind: 'entity'; entityKey: string; label: string }
  | { kind: 'field'; entityKey: string; name: string };

export type RegistryAction = 'deprecate' | 'retire';

const useStyles = makeStyles({
  surface: { maxWidth: '520px' },
  body: { display: 'flex', flexDirection: 'column', gap: space.lg },
  path: { fontFamily: fonts.mono, fontWeight: 600 },
  pathDeprecate: { color: tokens.colorBrandForeground1 },
  pathRetire: { color: tokens.colorPaletteRedForeground1 },
  explain: { color: tokens.colorNeutralForeground2, lineHeight: 1.55 },
  retireBtn: {
    backgroundColor: tokens.colorPaletteRedBackground3,
    color: tokens.colorNeutralForegroundOnBrand,
    ':hover': { backgroundColor: tokens.colorPaletteRedForeground1 },
    ':hover:active': { backgroundColor: tokens.colorPaletteRedForeground1 },
  },
});

export interface RegistryActionDialogProps {
  /** The target to act on, or null when the dialog is closed. */
  target: RegistryActionTarget | null;
  action: RegistryAction;
  onOpenChange: (open: boolean) => void;
  /** Announce a successful action to the page (label + action). */
  onDone: (label: string, action: RegistryAction) => void;
}

/** A human-readable identifier for the target (entity key, or `entity.field`). */
function targetLabel(target: RegistryActionTarget): string {
  return target.kind === 'entity' ? target.entityKey : `${target.entityKey}.${target.name}`;
}

/**
 * The deprecate / retire confirmation flow for an entity or a field, against the registry endpoints.
 *
 * Deprecation keeps the artifact RESOLVABLE (live rules keep evaluating) but hides it from new
 * authoring. Retirement is a hard delete, gated server-side: only a Deprecated, unreferenced artifact
 * can be retired. If the server blocks it (422 not-deprecated, or 409 still-referenced) the dialog
 * surfaces the reason and the destructive action stays blocked — no call succeeds against a live term.
 */
export function RegistryActionDialog({
  target,
  action,
  onOpenChange,
  onDone,
}: RegistryActionDialogProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const open = target !== null;
  const isRetire = action === 'retire';

  const mutation = useMutation<unknown, ApiError>({
    mutationFn: () => {
      if (!target) return Promise.resolve();
      if (action === 'deprecate') {
        return target.kind === 'entity'
          ? api.deprecateEntity(target.entityKey)
          : api.deprecateField(target.entityKey, target.name);
      }
      return target.kind === 'entity'
        ? api.retireEntity(target.entityKey)
        : api.retireField(target.entityKey, target.name);
    },
    onSuccess: () => {
      if (!target) return;
      queryClient.invalidateQueries({ queryKey: REGISTRY_QUERY_KEY });
      onDone(targetLabel(target), action);
      onOpenChange(false);
    },
  });

  const close = () => {
    if (!mutation.isPending) onOpenChange(false);
  };

  const error = mutation.error;
  // A blocked retire (not deprecated yet, or still referenced) keeps the action disabled.
  const isBlocked = isRetire && (error?.status === 409 || error?.status === 422);

  const label = target ? targetLabel(target) : '';
  const kindNoun = target?.kind ?? 'term';

  const title = isRetire ? `Retire this ${kindNoun}?` : `Deprecate this ${kindNoun}?`;

  return (
    <Dialog open={open} onOpenChange={(_, d) => (d.open ? onOpenChange(true) : close())}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            <div className={styles.body}>
              <Text>
                {isRetire ? 'Permanently retire' : 'Deprecate'}{' '}
                <span
                  className={mergeClasses(styles.path, isRetire ? styles.pathRetire : styles.pathDeprecate)}
                >
                  {label}
                </span>
                {isRetire ? '? This cannot be undone.' : '?'}
              </Text>
              <Text className={styles.explain}>
                {isRetire
                  ? `Retiring is only allowed for a deprecated ${kindNoun} that no active rule references.`
                  : `Deprecated ${kindNoun}s stay resolvable, so any live rule that already references this keeps evaluating. It is simply hidden from new authoring.`}
              </Text>

              {error && (
                <MessageBar intent="error" role="alert">
                  <MessageBarBody>
                    <MessageBarTitle>
                      {isBlocked
                        ? `Cannot retire this ${kindNoun}`
                        : `Could not ${action} this ${kindNoun}`}
                    </MessageBarTitle>
                    {error.message}
                  </MessageBarBody>
                </MessageBar>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={close} disabled={mutation.isPending}>
              {isBlocked ? 'Close' : 'Cancel'}
            </Button>
            {!isBlocked && (
              <Button
                appearance="primary"
                className={isRetire ? styles.retireBtn : undefined}
                icon={
                  mutation.isPending ? (
                    <Spinner size="tiny" />
                  ) : isRetire ? (
                    <DeleteRegular />
                  ) : (
                    <ArchiveRegular />
                  )
                }
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
              >
                {mutation.isPending
                  ? isRetire
                    ? 'Retiring…'
                    : 'Deprecating…'
                  : isRetire
                    ? `Retire ${kindNoun}`
                    : `Deprecate ${kindNoun}`}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
