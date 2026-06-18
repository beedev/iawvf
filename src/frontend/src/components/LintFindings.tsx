import { motion } from 'framer-motion';
import { makeStyles, tokens, Text } from '@fluentui/react-components';
import { CheckmarkCircleFilled, ErrorCircleFilled, WarningFilled } from '@fluentui/react-icons';
import { fonts, radius, space } from '../theme/tokens';
import { StatusBadge } from './StatusBadge';
import { useReducedMotion } from '../lib/hooks/useReducedMotion';
import type { LintFinding, LintReport } from '../lib/types/api';

/**
 * Renders a {@link LintReport} as a severity-coded, staggered list of findings. Errors are surfaced
 * first; each finding shows its severity badge, machine code, message, and logical path. When the
 * report is clean, a calm success state is shown instead.
 */

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: space.sm },
  summary: { display: 'flex', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  item: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  itemError: {
    borderInlineStartWidth: '3px',
    borderInlineStartColor: tokens.colorPaletteRedBorderActive,
  },
  itemWarning: {
    borderInlineStartWidth: '3px',
    borderInlineStartColor: tokens.colorPaletteDarkOrangeBorderActive,
  },
  icon: { fontSize: '18px', marginTop: '1px' },
  iconError: { color: tokens.colorPaletteRedForeground1 },
  iconWarning: { color: tokens.colorPaletteDarkOrangeForeground1 },
  body: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 },
  topRow: { display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  code: {
    fontFamily: fonts.mono,
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground3,
  },
  message: { color: tokens.colorNeutralForeground1, fontWeight: 500 },
  path: {
    fontFamily: fonts.mono,
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground3,
    wordBreak: 'break-all',
  },
  clean: {
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    border: `1px solid ${tokens.colorPaletteGreenBorder1}`,
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
  },
});

const severityRank = (s: LintFinding['severity']) => (s === 'Error' ? 0 : 1);

export interface LintFindingsProps {
  report: LintReport;
}

export function LintFindings({ report }: LintFindingsProps) {
  const styles = useStyles();
  const reduced = useReducedMotion();
  const findings = [...report.findings].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity),
  );
  const errors = findings.filter((f) => f.severity === 'Error').length;
  const warnings = findings.length - errors;

  if (findings.length === 0) {
    return (
      <div className={styles.clean} role="status" data-testid="lint-clean">
        <CheckmarkCircleFilled fontSize={22} aria-hidden />
        <Text weight="semibold">No lint findings. This rule passes validation.</Text>
      </div>
    );
  }

  return (
    <div className={styles.root} data-testid="lint-findings">
      <div className={styles.summary} aria-live="polite">
        {errors > 0 && (
          <StatusBadge kind="error">
            {errors} error{errors === 1 ? '' : 's'}
          </StatusBadge>
        )}
        {warnings > 0 && (
          <StatusBadge kind="warning">
            {warnings} warning{warnings === 1 ? '' : 's'}
          </StatusBadge>
        )}
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {report.isValid ? 'Saveable (warnings only).' : 'Has errors — resolve before saving.'}
        </Text>
      </div>
      <ul className={styles.list}>
        {findings.map((f, i) => {
          const isError = f.severity === 'Error';
          return (
            <motion.li
              key={`${f.code}-${f.path}-${i}`}
              className={`${styles.item} ${isError ? styles.itemError : styles.itemWarning}`}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.28, delay: i * 0.05 }}
            >
              {isError ? (
                <ErrorCircleFilled className={`${styles.icon} ${styles.iconError}`} aria-hidden />
              ) : (
                <WarningFilled className={`${styles.icon} ${styles.iconWarning}`} aria-hidden />
              )}
              <div className={styles.body}>
                <div className={styles.topRow}>
                  <StatusBadge kind={isError ? 'error' : 'warning'}>{f.severity}</StatusBadge>
                  <span className={styles.code}>{f.code}</span>
                </div>
                <span className={styles.message}>{f.message}</span>
                <span className={styles.path}>
                  <span style={{ opacity: 0.7 }}>path:</span> {f.path}
                </span>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
