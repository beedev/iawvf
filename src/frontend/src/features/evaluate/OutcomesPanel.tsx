import { makeStyles, tokens, Text, shorthands } from '@fluentui/react-components';
import { fonts, radius, space, outcomeGroupColors } from '../../theme/tokens';
import { EmptyState } from '../../components';
import { CheckmarkCircleRegular } from '@fluentui/react-icons';
import type { Outcome } from '../../lib/types/api';

/** Renders produced outcomes grouped by their semantic group, each group color-coded. */

const useStyles = makeStyles({
  groups: { display: 'flex', flexDirection: 'column', gap: space.lg },
  group: { display: 'flex', flexDirection: 'column', gap: space.sm },
  groupHead: { display: 'flex', alignItems: 'center', gap: space.sm },
  groupName: {
    fontFamily: fonts.body,
    fontSize: '11.5px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    paddingInline: '10px',
    paddingBlock: '3px',
    borderRadius: radius.pill,
    ...shorthands.border('1px', 'solid'),
  },
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
  type: { fontFamily: fonts.display, fontSize: '16px', fontWeight: 600 },
  scope: { fontFamily: fonts.mono, fontSize: '12px', color: tokens.colorNeutralForeground3 },
  reason: { color: tokens.colorNeutralForeground2, marginTop: '4px' },
  params: {
    marginTop: space.sm,
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  param: {
    fontFamily: fonts.mono,
    fontSize: '11.5px',
    paddingInline: '8px',
    paddingBlock: '2px',
    borderRadius: radius.sm,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
  },
});

function groupColor(group: string) {
  return outcomeGroupColors[group] ?? outcomeGroupColors.None;
}

export function OutcomesPanel({ outcomes }: { outcomes: Outcome[] }) {
  const styles = useStyles();

  if (outcomes.length === 0) {
    return (
      <EmptyState
        icon={<CheckmarkCircleRegular />}
        title="No outcomes produced"
        description="The active rules ran but none produced a hold, route, flag, or annotation for these facts."
      />
    );
  }

  const byGroup = new Map<string, Outcome[]>();
  for (const o of outcomes) {
    const list = byGroup.get(o.group) ?? [];
    list.push(o);
    byGroup.set(o.group, list);
  }

  return (
    <div className={styles.groups} data-testid="outcomes-panel">
      {[...byGroup.entries()].map(([group, items]) => {
        const c = groupColor(group);
        return (
          <div className={styles.group} key={group}>
            <div className={styles.groupHead}>
              <span
                className={styles.groupName}
                style={{ color: c.fg, backgroundColor: c.bg, borderColor: c.border }}
              >
                {group} · {items.length}
              </span>
            </div>
            {items.map((o, i) => (
              <div
                key={`${o.type}-${i}`}
                className={styles.card}
                style={{ borderInlineStartColor: c.border }}
              >
                <div className={styles.cardHead}>
                  <span className={styles.type} style={{ color: c.fg }}>
                    {o.type}
                  </span>
                  {o.scope && <span className={styles.scope}>scope: {o.scope}</span>}
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
            ))}
          </div>
        );
      })}
    </div>
  );
}
