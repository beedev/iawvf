import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Input,
  Table,
  TableHeader,
  TableHeaderCell,
  TableRow,
  TableBody,
  TableCell,
  Button,
} from '@fluentui/react-components';
import {
  SearchRegular,
  LibraryRegular,
  ChevronRightRegular,
  ArrowClockwiseRegular,
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
import type { RuleSummary } from '../../lib/types/api';

const useStyles = makeStyles({
  body: {
    padding: space.xxl,
    display: 'flex',
    flexDirection: 'column',
    gap: space.xl,
    maxWidth: '1400px',
  },
  toolbar: { display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  search: { minWidth: '280px', flexGrow: 1, maxWidth: '420px' },
  key: { fontFamily: fonts.mono, fontWeight: 500, color: tokens.colorBrandForeground1 },
  name: { fontWeight: 600 },
  desc: { color: tokens.colorNeutralForeground3, fontSize: '12.5px' },
  ruleSet: { fontFamily: fonts.mono, fontSize: '12px', color: tokens.colorNeutralForeground3 },
  phase: {
    display: 'inline-block',
    paddingInline: '8px',
    paddingBlock: '2px',
    borderRadius: radius.sm,
    backgroundColor: tokens.colorNeutralBackground3,
    fontSize: '11.5px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground2,
  },
  version: { fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' },
  row: { cursor: 'pointer' },
  nameCell: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  count: { color: tokens.colorNeutralForeground3 },
});

export function RulesPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const rulesQuery = useQuery({
    queryKey: ['rules'],
    queryFn: ({ signal }) => api.listRules(undefined, signal),
  });

  const filtered = useMemo(() => {
    const list = rulesQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      [r.key, r.name, r.ruleSet ?? '', r.phase, r.description ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rulesQuery.data, search]);

  const open = (key: string) => navigate(`/rules/${encodeURIComponent(key)}`);

  return (
    <div>
      <PageHeader
        eyebrow="Rule Repository"
        title="Govern the active rule set."
        lede="Browse stored rules, inspect their structured definition and provenance, and approve, promote, or disable them according to your role."
        actions={
          <Button
            appearance="subtle"
            icon={<ArrowClockwiseRegular />}
            onClick={() => rulesQuery.refetch()}
            disabled={rulesQuery.isFetching}
          >
            Refresh
          </Button>
        }
      />

      <div className={styles.body}>
        <Reveal>
          <Panel
            eyebrow="Stored rules"
            title="Repository"
            description={
              rulesQuery.data ? (
                <span className={styles.count}>
                  {filtered.length} of {rulesQuery.data.length} rule
                  {rulesQuery.data.length === 1 ? '' : 's'}
                </span>
              ) : undefined
            }
            actions={
              <Input
                className={styles.search}
                contentBefore={<SearchRegular />}
                value={search}
                onChange={(_, d) => setSearch(d.value)}
                placeholder="Search key, name, rule set, phase…"
                aria-label="Search rules"
              />
            }
            flush
          >
            {rulesQuery.isLoading && <LoadingState label="Loading rules…" />}

            {rulesQuery.isError && (
              <ErrorState
                title="Could not load rules"
                message={(rulesQuery.error as ApiError)?.message ?? 'Unexpected error.'}
                onRetry={() => rulesQuery.refetch()}
              />
            )}

            {rulesQuery.data && filtered.length === 0 && (
              <EmptyState
                icon={<LibraryRegular />}
                title={search ? 'No matching rules' : 'No rules yet'}
                description={
                  search
                    ? 'Try a different search term.'
                    : 'Author and save a rule from the Authoring workspace to populate the repository.'
                }
              />
            )}

            {rulesQuery.data && filtered.length > 0 && (
              <Table aria-label="Stored rules" data-testid="rules-table">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell style={{ width: 110 }}>Key</TableHeaderCell>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell style={{ width: 140 }}>Rule set</TableHeaderCell>
                    <TableHeaderCell style={{ width: 110 }}>Phase</TableHeaderCell>
                    <TableHeaderCell style={{ width: 80 }}>Version</TableHeaderCell>
                    <TableHeaderCell style={{ width: 120 }}>Status</TableHeaderCell>
                    <TableHeaderCell style={{ width: 44 }} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((rule: RuleSummary) => (
                    <TableRow
                      key={rule.key}
                      className={styles.row}
                      tabIndex={0}
                      onClick={() => open(rule.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          open(rule.key);
                        }
                      }}
                      aria-label={`Open rule ${rule.key}, ${rule.name}`}
                    >
                      <TableCell className={styles.key}>{rule.key}</TableCell>
                      <TableCell>
                        <div className={styles.nameCell}>
                          <span className={styles.name}>{rule.name}</span>
                          {rule.description && (
                            <span className={styles.desc}>{rule.description}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={styles.ruleSet}>{rule.ruleSet ?? '—'}</TableCell>
                      <TableCell>
                        <span className={styles.phase}>{rule.phase}</span>
                      </TableCell>
                      <TableCell className={styles.version}>v{rule.version}</TableCell>
                      <TableCell>
                        {rule.enabled ? (
                          <StatusBadge kind="success">Enabled</StatusBadge>
                        ) : (
                          <StatusBadge kind="neutral">Disabled</StatusBadge>
                        )}
                      </TableCell>
                      <TableCell>
                        <ChevronRightRegular
                          aria-hidden
                          style={{ color: tokens.colorNeutralForeground3 }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
        </Reveal>
      </div>
    </div>
  );
}
