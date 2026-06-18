import { makeStyles, tokens, Text, shorthands } from '@fluentui/react-components';
import {
  CheckmarkCircleFilled,
  WarningFilled,
  DismissCircleFilled,
} from '@fluentui/react-icons';
import { fonts, radius, space, statusLight } from '../../theme/tokens';
import { groupLabel } from './resultModel';
import type { VerdictSummary } from './resultModel';

/**
 * The TOP-LINE VERDICT — the first thing a user sees after running an evaluation. It answers the only
 * question that matters at a glance: did the order pass, or was something raised?
 *
 *  • No business outcomes  → green "Passes — order proceeds (no holds or alerts)".
 *  • One or more           → amber/red "N hold(s)/alert(s) raised", each headline condensed to its
 *                            friendly group, scope, and reason.
 *
 * Accessibility: the whole region is `role="status"` + `aria-live="polite"` so assistive tech
 * announces the verdict without stealing focus; the pass/fail state is conveyed by icon + text +
 * color (never color alone, WCAG 1.4.1); contrast pairs are the AA `statusLight` tokens.
 */

const useStyles = makeStyles({
  banner: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.md,
    ...shorthands.border('1px', 'solid', 'transparent'),
  },
  passes: {
    backgroundColor: statusLight.successBg,
    ...shorthands.borderColor(statusLight.successBorder),
  },
  held: {
    backgroundColor: statusLight.warningBg,
    ...shorthands.borderColor(statusLight.warningBorder),
  },
  head: { display: 'flex', alignItems: 'center', gap: space.sm },
  icon: { flexShrink: 0, fontSize: '22px', display: 'grid', placeItems: 'center' },
  iconPass: { color: statusLight.successFg },
  iconHeld: { color: statusLight.warningFg },
  headline: {
    fontFamily: fonts.display,
    fontSize: '18px',
    fontWeight: 600,
    lineHeight: 1.25,
  },
  headlinePass: { color: statusLight.successFg },
  headlineHeld: { color: statusLight.warningFg },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
  },
  item: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: space.sm,
    paddingInlineStart: '30px',
  },
  itemGroup: {
    fontFamily: fonts.body,
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: statusLight.warningFg,
  },
  itemReason: { color: tokens.colorNeutralForeground1, fontSize: '13.5px' },
  itemScope: {
    fontFamily: fonts.mono,
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground3,
  },
  sub: { color: tokens.colorNeutralForeground2, paddingInlineStart: '30px' },
});

/** Pluralize "hold/alert" depending on count, kept neutral for routes/records/blocks too. */
function headlineText(count: number): string {
  return `${count} hold${count === 1 ? '' : 's'} / alert${count === 1 ? '' : 's'} raised`;
}

export function VerdictBanner({ summary }: { summary: VerdictSummary }) {
  const styles = useStyles();
  const passes = summary.verdict === 'passes';

  return (
    <div
      className={`${styles.banner} ${passes ? styles.passes : styles.held}`}
      role="status"
      aria-live="polite"
      data-testid="verdict-banner"
      data-verdict={summary.verdict}
    >
      <div className={styles.head}>
        <span className={`${styles.icon} ${passes ? styles.iconPass : styles.iconHeld}`} aria-hidden>
          {passes ? (
            <CheckmarkCircleFilled />
          ) : summary.businessCount === 1 ? (
            <WarningFilled />
          ) : (
            <DismissCircleFilled />
          )}
        </span>
        <Text className={`${styles.headline} ${passes ? styles.headlinePass : styles.headlineHeld}`}>
          {passes ? 'Passes — order proceeds (no holds or alerts)' : headlineText(summary.businessCount)}
        </Text>
      </div>

      {passes ? (
        summary.derivationCount > 0 ? (
          <Text size={200} className={styles.sub} as="p">
            {summary.derivationCount} value{summary.derivationCount === 1 ? '' : 's'} derived — see
            “Records created / Derived values” and Facts after run below.
          </Text>
        ) : null
      ) : (
        <ul className={styles.list} aria-label="Outcomes raised">
          {summary.headlines.map((h, i) => (
            <li key={`${h.type}-${i}`} className={styles.item}>
              <span className={styles.itemGroup}>{groupLabel(h.group)}</span>
              <span className={styles.itemReason}>{h.reason ?? h.type}</span>
              {h.scope && <span className={styles.itemScope}>scope: {h.scope}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
