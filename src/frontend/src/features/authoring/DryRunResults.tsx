import {
  makeStyles,
  tokens,
  Table,
  TableHeader,
  TableHeaderCell,
  TableRow,
  TableBody,
  TableCell,
  Text,
} from '@fluentui/react-components';
import { fonts, space } from '../../theme/tokens';
import { StatusBadge } from '../../components';
import type { DryRunResponse } from '../../lib/types/api';

const useStyles = makeStyles({
  summary: { display: 'flex', alignItems: 'center', gap: space.md, marginBottom: space.md },
  count: { fontFamily: fonts.mono, fontWeight: 500 },
  fixture: { fontFamily: fonts.mono, fontSize: '12.5px' },
  reason: { color: tokens.colorNeutralForeground3 },
  produced: { fontFamily: fonts.mono, fontSize: '12.5px', color: tokens.colorBrandForeground1 },
  muted: { color: tokens.colorNeutralForeground4 },
});

export function DryRunResults({ result }: { result: DryRunResponse }) {
  const styles = useStyles();
  const applied = result.hits.filter((h) => h.applied).length;

  return (
    <div data-testid="dry-run-results">
      <div className={styles.summary} aria-live="polite">
        <StatusBadge kind={applied > 0 ? 'info' : 'neutral'}>
          {applied} / {result.evaluated} applied
        </StatusBadge>
        <Text size={200} className={styles.muted}>
          Evaluated against the repository fixtures corpus (no side effects).
        </Text>
      </div>
      <Table aria-label="Dry-run results per fixture" size="small">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Fixture</TableHeaderCell>
            <TableHeaderCell style={{ width: 96 }}>Applied</TableHeaderCell>
            <TableHeaderCell>Produced outcome</TableHeaderCell>
            <TableHeaderCell>Reason</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.hits.map((hit) => (
            <TableRow key={hit.fixtureName}>
              <TableCell className={styles.fixture}>{hit.fixtureName}</TableCell>
              <TableCell>
                {hit.applied ? (
                  <StatusBadge kind="success">Yes</StatusBadge>
                ) : (
                  <StatusBadge kind="neutral">No</StatusBadge>
                )}
              </TableCell>
              <TableCell className={hit.produced ? styles.produced : styles.muted}>
                {hit.produced ?? '—'}
              </TableCell>
              <TableCell className={styles.reason}>{hit.reason ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
