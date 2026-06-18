import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  makeStyles,
  tokens,
  Button,
  Text,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Divider,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  CheckmarkStarburstRegular,
  TextGrammarWandRegular,
  ToggleLeftRegular,
  ToggleRightRegular,
  CubeRegular,
} from '@fluentui/react-icons';
import { fonts, radius, space } from '../../theme/tokens';
import {
  Panel,
  PageHeader,
  JsonView,
  StatusBadge,
  LoadingState,
  ErrorState,
  Reveal,
  ObjectScope,
} from '../../components';
import { api, type ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { RuleJson } from '../../lib/types/api';
import { extractRuleScope } from '../../lib/ruleScope';

const useStyles = makeStyles({
  body: {
    padding: space.xxl,
    display: 'flex',
    flexDirection: 'column',
    gap: space.xl,
    maxWidth: '1400px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(300px, 0.8fr)',
    gap: space.xl,
    alignItems: 'start',
    '@media (max-width: 1000px)': { gridTemplateColumns: '1fr' },
  },
  leftCol: { display: 'flex', flexDirection: 'column', gap: space.xl, minWidth: 0 },
  side: { display: 'flex', flexDirection: 'column', gap: space.xl },
  metaRow: { display: 'flex', justifyContent: 'space-between', gap: space.md, paddingBlock: '6px' },
  metaLabel: { color: tokens.colorNeutralForeground3, fontSize: '12.5px' },
  metaValue: { fontWeight: 600, textAlign: 'right' },
  mono: { fontFamily: fonts.mono, fontSize: '12.5px' },
  paraphrase: {
    fontFamily: fonts.display,
    fontSize: '16px',
    lineHeight: 1.5,
    fontStyle: 'italic',
    color: tokens.colorNeutralForeground1,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: tokens.colorNeutralBackground2,
    borderInlineStartWidth: '3px',
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: tokens.colorBrandStroke1,
  },
  nl: {
    fontFamily: fonts.body,
    color: tokens.colorNeutralForeground2,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: tokens.colorNeutralBackground3,
    fontSize: '13.5px',
    lineHeight: 1.5,
  },
  govActions: { display: 'flex', flexDirection: 'column', gap: space.sm },
});

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  const styles = useStyles();
  return (
    <div className={styles.metaRow}>
      <Text className={styles.metaLabel}>{label}</Text>
      <Text className={styles.metaValue}>{value}</Text>
    </div>
  );
}

export function RuleDetailPage() {
  const styles = useStyles();
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasRole, session } = useAuth();
  const [paraphrase, setParaphrase] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['rules', key],
    queryFn: ({ signal }) => api.getRule(key, signal),
    enabled: key.length > 0,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['rules'] });
  };

  const paraphraseMutation = useMutation({
    mutationFn: (rule: RuleJson) => api.paraphrase(rule),
    onSuccess: (res) => setParaphrase(res.paraphrase),
  });
  const approveMutation = useMutation({
    mutationFn: () => api.approveRule(key, { approver: session?.username ?? 'reviewer' }),
    onSuccess: invalidate,
  });
  const promoteMutation = useMutation({
    mutationFn: () => api.promoteRule(key),
    onSuccess: invalidate,
  });
  const disableMutation = useMutation({
    mutationFn: () => api.disableRule(key),
    onSuccess: invalidate,
  });

  if (detailQuery.isLoading) {
    return (
      <div>
        <PageHeader eyebrow="Rule Repository" title="Loading rule…" />
        <LoadingState />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div>
        <PageHeader eyebrow="Rule Repository" title="Rule" />
        <div className={styles.body}>
          <ErrorState
            title="Could not load this rule"
            message={(detailQuery.error as ApiError)?.message ?? 'The rule may not exist.'}
            onRetry={() => detailQuery.refetch()}
          />
        </div>
      </div>
    );
  }

  const detail = detailQuery.data;
  const s = detail.summary;
  const isApproved = detail.approvedBy !== null;
  const ruleScope = extractRuleScope(detail.ruleJson);
  const govMutating =
    approveMutation.isPending || promoteMutation.isPending || disableMutation.isPending;
  const govError = (approveMutation.error ??
    promoteMutation.error ??
    disableMutation.error) as ApiError | null;

  return (
    <div>
      <PageHeader
        eyebrow={`Rule · ${s.key}`}
        title={s.name}
        lede={s.description ?? undefined}
        actions={
          <Button
            appearance="subtle"
            icon={<ArrowLeftRegular />}
            onClick={() => navigate('/rules')}
          >
            Back to repository
          </Button>
        }
      />

      <div className={styles.body}>
        <div className={styles.grid}>
          {/* Left: derived object scope → then structured rule + paraphrase */}
          <div className={styles.leftCol}>
            <Reveal>
              <Panel
                eyebrow="Scope"
                title="Operates on"
                description="The object(s) and properties this rule reads, derived from its definition."
                actions={<CubeRegular fontSize={20} aria-hidden />}
              >
                <ObjectScope items={ruleScope.objects} outcomeScope={ruleScope.outcomeScope} />
              </Panel>
            </Reveal>

            <Reveal index={1}>
              <Panel
                eyebrow="Definition"
                title="Structured rule"
                actions={
                  <Button
                    icon={
                      paraphraseMutation.isPending ? (
                        <Spinner size="tiny" />
                      ) : (
                        <TextGrammarWandRegular />
                      )
                    }
                    onClick={() => detail.ruleJson && paraphraseMutation.mutate(detail.ruleJson)}
                    disabled={!detail.ruleJson || paraphraseMutation.isPending}
                  >
                    Paraphrase
                  </Button>
                }
              >
                {paraphrase && <p className={styles.paraphrase}>{paraphrase}</p>}
                {detail.ruleJson ? (
                  <JsonView value={detail.ruleJson} label={`Rule ${s.key} definition (JSON)`} />
                ) : (
                  <Text>No rule body available.</Text>
                )}
              </Panel>
            </Reveal>
          </div>

          {/* Right: governance + provenance */}
          <div className={styles.side}>
            <Reveal index={2}>
              <Panel eyebrow="Status" title="Governance">
                <div>
                  <MetaRow
                    label="Approval"
                    value={
                      isApproved ? (
                        <StatusBadge kind="success">Approved</StatusBadge>
                      ) : (
                        <StatusBadge kind="warning">Pending</StatusBadge>
                      )
                    }
                  />
                  <MetaRow
                    label="State"
                    value={
                      s.enabled ? (
                        <StatusBadge kind="success">Enabled</StatusBadge>
                      ) : (
                        <StatusBadge kind="neutral">Disabled</StatusBadge>
                      )
                    }
                  />
                  <MetaRow
                    label="Version"
                    value={<span className={styles.mono}>v{s.version}</span>}
                  />
                  <MetaRow label="Phase" value={s.phase} />
                  <MetaRow
                    label="Priority"
                    value={<span className={styles.mono}>{s.priority}</span>}
                  />
                  <MetaRow label="Rule set" value={s.ruleSet ?? '—'} />
                  <MetaRow
                    label="Effective"
                    value={
                      <span className={styles.mono}>
                        {new Date(s.effectiveDate).toLocaleDateString()}
                      </span>
                    }
                  />
                  {isApproved && (
                    <MetaRow
                      label="Approved by"
                      value={<span className={styles.mono}>{detail.approvedBy}</span>}
                    />
                  )}
                </div>

                <Divider />

                {govError && (
                  <MessageBar intent="error" role="alert">
                    <MessageBarBody>
                      <MessageBarTitle>Action failed</MessageBarTitle>
                      {govError.message}
                    </MessageBarBody>
                  </MessageBar>
                )}

                <div className={styles.govActions}>
                  {hasRole('Reviewer') && (
                    <Button
                      appearance="primary"
                      icon={<CheckmarkStarburstRegular />}
                      onClick={() => approveMutation.mutate()}
                      disabled={govMutating || isApproved}
                    >
                      {isApproved ? 'Already approved' : 'Approve active version'}
                    </Button>
                  )}
                  {hasRole('Admin') && (
                    <>
                      <Button
                        icon={<ToggleRightRegular />}
                        onClick={() => promoteMutation.mutate()}
                        disabled={govMutating || s.enabled}
                      >
                        Promote (enable)
                      </Button>
                      <Button
                        icon={<ToggleLeftRegular />}
                        onClick={() => disableMutation.mutate()}
                        disabled={govMutating || !s.enabled}
                      >
                        Disable
                      </Button>
                    </>
                  )}
                  {!hasRole('Reviewer') && !hasRole('Admin') && (
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      Your role has read-only access to governance actions.
                    </Text>
                  )}
                </div>
              </Panel>
            </Reveal>

            <Reveal index={3}>
              <Panel eyebrow="Provenance" title="Authoring trail">
                <div>
                  <MetaRow label="Authored by" value={detail.authoredBy ?? '—'} />
                  <MetaRow
                    label="Interpreter"
                    value={<span className={styles.mono}>{detail.interpreterVersion ?? '—'}</span>}
                  />
                </div>
                {detail.authorNl ? (
                  <div>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }} block>
                      Original natural-language source
                    </Text>
                    <p className={styles.nl} style={{ marginTop: space.sm }}>
                      “{detail.authorNl}”
                    </p>
                  </div>
                ) : (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    No natural-language provenance recorded for this version.
                  </Text>
                )}
              </Panel>
            </Reveal>
          </div>
        </div>
      </div>
    </div>
  );
}
