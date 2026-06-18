import { useState } from 'react';
import { makeStyles, tokens, Text, Button, shorthands } from '@fluentui/react-components';
import { ChevronRightRegular, ChevronDownRegular } from '@fluentui/react-icons';
import { fonts, radius, space, outcomeGroupColors } from '../../theme/tokens';
import type { Outcome } from '../../lib/types/api';
import { groupOutcomesForDetail, partitionNoAction, ruleAttribution } from './resultModel';

/**
 * The OUTCOME DETAIL region beneath the top-line verdict. Renders the business + derivation outcomes
 * under FRIENDLY group headings ("Holds & alerts", "Routing", "Records created", "Blocked actions",
 * "Derived values"), each color-coded and glossed with a one-line hint.
 *
 * The no-action outcomes (Continue / Suppressed — the old confusing "NONE · 2 / Continue" group) are
 * NEVER shown by default: they sit behind a small "Show N rules that took no action" toggle so they
 * no longer lead or clutter the result. Color is always reinforced with the heading text and the
 * card's reason (never color alone, WCAG 1.4.1).
 */

const useStyles = makeStyles({
  groups: { display: 'flex', flexDirection: 'column', gap: space.xl },
  group: { display: 'flex', flexDirection: 'column', gap: space.sm },
  groupHead: { display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  groupName: {
    fontFamily: fonts.body,
    fontSize: '11.5px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    paddingInline: '10px',
    paddingBlock: '3px',
    borderRadius: radius.pill,
    ...shorthands.border('1px', 'solid'),
  },
  groupHint: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  card: {
    padding: space.lg,
    borderRadius: radius.md,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderInlineStartWidth: '3px',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
  },
  type: { fontFamily: fonts.display, fontSize: '15px', fontWeight: 600 },
  scope: { fontFamily: fonts.mono, fontSize: '12px', color: tokens.colorNeutralForeground3 },
  // The originating-rule attribution row: a subtle monospace key tag + the prominent rule name.
  rule: {
    display: 'flex',
    alignItems: 'baseline',
    gap: space.sm,
    flexWrap: 'wrap',
    marginTop: '2px',
    marginBottom: '2px',
  },
  ruleKeyTag: {
    fontFamily: fonts.mono,
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.02em',
    paddingInline: '6px',
    paddingBlock: '1px',
    borderRadius: radius.sm,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
  },
  ruleName: {
    fontFamily: fonts.body,
    fontSize: '13px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
  },
  reason: { color: tokens.colorNeutralForeground1, marginTop: '4px' },
  params: { marginTop: space.sm, display: 'flex', flexWrap: 'wrap', gap: space.sm },
  param: {
    fontFamily: fonts.mono,
    fontSize: '11.5px',
    paddingInline: '8px',
    paddingBlock: '2px',
    borderRadius: radius.sm,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
  },
  noActionWrap: {
    marginTop: space.md,
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    paddingTop: space.md,
  },
  toggle: { color: tokens.colorNeutralForeground2 },
  noActionList: {
    listStyle: 'none',
    margin: 0,
    marginTop: space.sm,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
  },
  noActionItem: {
    display: 'flex',
    alignItems: 'baseline',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.sm,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  noActionKey: {
    fontFamily: fonts.mono,
    fontSize: '11px',
    fontWeight: 600,
    paddingInline: '6px',
    paddingBlock: '1px',
    borderRadius: radius.sm,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
  },
  noActionName: { fontSize: '12.5px', fontWeight: 600, color: tokens.colorNeutralForeground1 },
  noActionType: { fontFamily: fonts.mono, fontSize: '12px', color: tokens.colorNeutralForeground2 },
  noActionReason: { fontSize: '12px', color: tokens.colorNeutralForeground3 },
});

function groupColor(group: string) {
  return outcomeGroupColors[group] ?? outcomeGroupColors.None;
}

export function OutcomesPanel({ outcomes }: { outcomes: Outcome[] }) {
  const styles = useStyles();
  const [showNoAction, setShowNoAction] = useState(false);

  const detailGroups = groupOutcomesForDetail(outcomes);
  const noAction = partitionNoAction(outcomes);

  return (
    <div data-testid="outcomes-panel">
      {detailGroups.length > 0 && (
        <div className={styles.groups}>
          {detailGroups.map(({ group, label, hint, items }) => {
            const c = groupColor(group);
            return (
              <div className={styles.group} key={group}>
                <div className={styles.groupHead}>
                  <span
                    className={styles.groupName}
                    style={{ color: c.fg, backgroundColor: c.bg, borderColor: c.border }}
                  >
                    {label} · {items.length}
                  </span>
                  <Text className={styles.groupHint}>{hint}</Text>
                </div>
                {items.map((o, i) => {
                  const rule = ruleAttribution(o);
                  return (
                  <div
                    key={`${o.type}-${i}`}
                    className={styles.card}
                    style={{ borderInlineStartColor: c.border }}
                    data-testid="outcome-card"
                  >
                    <div className={styles.cardHead}>
                      <span className={styles.type} style={{ color: c.fg }}>
                        {o.type}
                      </span>
                      {o.scope && <span className={styles.scope}>scope: {o.scope}</span>}
                    </div>
                    <div className={styles.rule}>
                      {rule.key && (
                        <span className={styles.ruleKeyTag} data-testid="outcome-rule-key">
                          {rule.key}
                        </span>
                      )}
                      <span className={styles.ruleName} data-testid="outcome-rule-name">
                        {rule.name}
                      </span>
                    </div>
                    {o.reason && <Text className={styles.reason}>{o.reason}</Text>}
                    {Object.keys(o.parameters).length > 0 && (
                      <div className={styles.params}>
                        {Object.entries(o.parameters).map(([k, v]) => (
                          <span key={k} className={styles.param}>
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {noAction.length > 0 && (
        <div className={styles.noActionWrap}>
          <Button
            appearance="subtle"
            size="small"
            className={styles.toggle}
            icon={showNoAction ? <ChevronDownRegular /> : <ChevronRightRegular />}
            onClick={() => setShowNoAction((v) => !v)}
            aria-expanded={showNoAction}
            aria-controls="no-action-list"
            data-testid="no-action-toggle"
          >
            {showNoAction ? 'Hide' : 'Show'} {noAction.length} rule
            {noAction.length === 1 ? '' : 's'} that took no action
          </Button>
          {showNoAction && (
            <ul id="no-action-list" className={styles.noActionList} data-testid="no-action-list">
              {noAction.map((o, i) => {
                const rule = ruleAttribution(o);
                return (
                  <li key={`${o.type}-${i}`} className={styles.noActionItem}>
                    {rule.key && (
                      <span className={styles.noActionKey} data-testid="no-action-rule-key">
                        {rule.key}
                      </span>
                    )}
                    <span className={styles.noActionName} data-testid="no-action-rule-name">
                      {rule.name}
                    </span>
                    <span className={styles.noActionType} aria-hidden>
                      →
                    </span>
                    <span className={styles.noActionType}>{o.type}</span>
                    {o.reason && <span className={styles.noActionReason}>{o.reason}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
