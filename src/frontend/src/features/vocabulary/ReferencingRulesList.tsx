import { makeStyles, tokens, Text } from '@fluentui/react-components';
import { fonts, radius, space } from '../../theme/tokens';
import type { ReferencingRule } from '../../lib/types/api';

const useStyles = makeStyles({
  wrap: { display: 'flex', flexDirection: 'column', gap: space.sm },
  count: { color: tokens.colorNeutralForeground2, fontWeight: 600 },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
    maxHeight: '220px',
    overflowY: 'auto',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: space.sm,
    borderRadius: radius.sm,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  key: { fontFamily: fonts.mono, fontSize: '12px', color: tokens.colorBrandForeground1 },
  name: { fontSize: '13px', color: tokens.colorNeutralForeground1 },
  none: { color: tokens.colorNeutralForeground3 },
});

export interface ReferencingRulesListProps {
  rules: ReferencingRule[];
  /** Shown when there are zero referencing rules. */
  emptyText?: string;
}

/**
 * Lists the active rules referencing a subject ("Used by N rules: …"). Each row shows the rule key
 * (mono) and name; the count is announced as text, never via color alone. Rendered inside the
 * deprecate-confirm and retire-blocked dialogs.
 */
export function ReferencingRulesList({ rules, emptyText }: ReferencingRulesListProps) {
  const styles = useStyles();

  if (rules.length === 0) {
    return (
      <Text size={200} className={styles.none}>
        {emptyText ?? 'No active rules reference this term.'}
      </Text>
    );
  }

  return (
    <div className={styles.wrap}>
      <Text size={200} className={styles.count}>
        Used by {rules.length} rule{rules.length === 1 ? '' : 's'}:
      </Text>
      <ul className={styles.list} aria-label="Referencing rules">
        {rules.map((rule) => (
          <li key={rule.key} className={styles.item}>
            <span className={styles.key}>{rule.key}</span>
            <span className={styles.name}>{rule.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
