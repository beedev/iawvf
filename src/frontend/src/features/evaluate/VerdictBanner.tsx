import { makeStyles, mergeClasses, tokens, Text, shorthands } from '@fluentui/react-components';
import {
  CheckmarkCircleFilled,
  WarningFilled,
  DismissCircleFilled,
} from '@fluentui/react-icons';
import { fonts, radius, space } from '../../theme/tokens';
import { groupLabel, ruleAttribution } from './resultModel';
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
 * color (never color alone, WCAG 1.4.1). Colors use Fluent's SEMANTIC status tokens
 * (`colorStatusSuccess*` / `colorStatusWarning*`) so the background/foreground pairs adapt to
 * light & dark automatically and stay AA in BOTH themes — no hardcoded palette.
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
    backgroundColor: tokens.colorStatusSuccessBackground1,
    ...shorthands.borderColor(tokens.colorStatusSuccessBorder1),
  },
  held: {
    backgroundColor: tokens.colorStatusWarningBackground1,
    ...shorthands.borderColor(tokens.colorStatusWarningBorder1),
  },
  head: { display: 'flex', alignItems: 'center', gap: space.sm },
  icon: { flexShrink: 0, fontSize: '22px', display: 'grid', placeItems: 'center' },
  iconPass: { color: tokens.colorStatusSuccessForeground1 },
  iconHeld: { color: tokens.colorStatusWarningForeground1 },
  headline: {
    fontFamily: fonts.display,
    fontSize: '18px',
    fontWeight: 600,
    lineHeight: 1.25,
  },
  headlinePass: { color: tokens.colorStatusSuccessForeground1 },
  headlineHeld: { color: tokens.colorStatusWarningForeground1 },
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
    color: tokens.colorStatusWarningForeground1,
  },
  itemRuleKey: {
    fontFamily: fonts.mono,
    fontSize: '11px',
    fontWeight: 600,
    paddingInline: '6px',
    paddingBlock: '1px',
    borderRadius: radius.sm,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
  },
  itemRuleName: {
    fontFamily: fonts.body,
    fontSize: '13px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
  },
  itemReason: { color: tokens.colorNeutralForeground2, fontSize: '13px' },
  itemScope: {
    fontFamily: fonts.mono,
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground3,
  },
  sub: { color: tokens.colorNeutralForeground2, paddingInlineStart: '30px' },
  triggered: {
    paddingInlineStart: '30px',
    color: tokens.colorNeutralForeground2,
    fontSize: '12.5px',
  },
  triggeredKey: { fontFamily: fonts.mono, fontWeight: 600 },
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
      className={mergeClasses(styles.banner, passes ? styles.passes : styles.held)}
      role="status"
      aria-live="polite"
      data-testid="verdict-banner"
      data-verdict={summary.verdict}
    >
      <div className={styles.head}>
        <span
          className={mergeClasses(styles.icon, passes ? styles.iconPass : styles.iconHeld)}
          aria-hidden
        >
          {passes ? (
            <CheckmarkCircleFilled />
          ) : summary.businessCount === 1 ? (
            <WarningFilled />
          ) : (
            <DismissCircleFilled />
          )}
        </span>
        <Text
          className={mergeClasses(styles.headline, passes ? styles.headlinePass : styles.headlineHeld)}
        >
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
        <>
          <ul className={styles.list} aria-label="Outcomes raised">
            {summary.headlines.map((h, i) => {
              const rule = ruleAttribution(h);
              return (
                <li key={`${h.type}-${i}`} className={styles.item} data-testid="verdict-headline">
                  {rule.key && (
                    <span className={styles.itemRuleKey} data-testid="verdict-rule-key">
                      {rule.key}
                    </span>
                  )}
                  <span className={styles.itemRuleName} data-testid="verdict-rule-name">
                    {rule.name}
                  </span>
                  <span className={styles.itemGroup}>{groupLabel(h.group)}</span>
                  <span className={styles.itemReason}>{h.reason ?? h.type}</span>
                  {h.scope && <span className={styles.itemScope}>scope: {h.scope}</span>}
                </li>
              );
            })}
          </ul>
          {summary.triggeredRuleKeys.length > 0 && (
            <Text size={200} className={styles.triggered} as="p" data-testid="rules-triggered">
              Rules triggered ({summary.triggeredRuleKeys.length}):{' '}
              {summary.triggeredRuleKeys.map((k, i) => (
                <span key={k}>
                  {i > 0 ? ', ' : ''}
                  <span className={styles.triggeredKey}>{k}</span>
                </span>
              ))}
            </Text>
          )}
        </>
      )}
    </div>
  );
}
