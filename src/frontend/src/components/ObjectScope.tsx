import { makeStyles, tokens, mergeClasses, shorthands, Text } from '@fluentui/react-components';
import { CubeRegular, DismissRegular } from '@fluentui/react-icons';
import { fonts, radius, space } from '../theme/tokens';

/**
 * A shared chip vocabulary for displaying the OBJECT(S) / PROPERTIES a rule is scoped to — used by
 * BOTH the authoring "Scope" selector (showing the active selection, removable) and the repository
 * rule-detail "Operates on" section (read-only, derived from the structured rule). Keeping one chip
 * component guarantees the two surfaces read identically.
 *
 * Each chip names an object (e.g. "Specimen") and, when scoped to specific properties, lists them
 * after a separator (e.g. "Specimen → age, archiveRetrievalDate"). Color is never the sole signal:
 * a leading cube icon and the text label carry meaning (WCAG 1.4.1).
 */

const useStyles = makeStyles({
  list: { display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    paddingInlineStart: space.md,
    paddingInlineEnd: space.md,
    paddingBlock: '6px',
    borderRadius: radius.pill,
    ...shorthands.border('1px', 'solid', tokens.colorBrandStroke2),
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorNeutralForeground1,
    fontFamily: fonts.body,
    fontSize: '12.5px',
    lineHeight: 1.3,
    maxWidth: '100%',
  },
  icon: { color: tokens.colorBrandForeground1, flexShrink: 0 },
  objectName: { fontWeight: 600, whiteSpace: 'nowrap' },
  sep: { color: tokens.colorNeutralForeground3, flexShrink: 0 },
  props: {
    color: tokens.colorNeutralForeground2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  removeBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    marginInlineStart: '1px',
    padding: 0,
    borderRadius: radius.pill,
    ...shorthands.border('0'),
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground3,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background-color 0.12s ease, color 0.12s ease',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1,
      color: tokens.colorNeutralForeground1,
    },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: tokens.colorBrandStroke1,
      outlineOffset: '1px',
    },
  },
});

/** One scope chip: an object and the (optional) properties it is narrowed to. */
export interface ScopeChipItem {
  /** Object identifier (e.g. `specimen`). Used as a stable key. */
  name: string;
  /** Display label (e.g. `Specimen`). */
  label: string;
  /** Optional property names shown after the object label. Empty → whole object. */
  properties?: string[];
}

export interface ScopeChipsProps {
  items: ScopeChipItem[];
  /**
   * When provided, each chip renders a remove control invoking this with the chip's object name.
   * Omit for a read-only display (e.g. repository detail).
   */
  onRemove?: (name: string) => void;
  /** Accessible label for the chip group container. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Renders a row of object/property scope chips. Reused by the authoring selector (removable) and the
 * repository rule-detail "Operates on" panel (read-only).
 */
export function ScopeChips({ items, onRemove, ariaLabel, className }: ScopeChipsProps) {
  const styles = useStyles();
  if (items.length === 0) return null;

  return (
    <div
      className={mergeClasses(styles.list, className)}
      role="list"
      aria-label={ariaLabel ?? 'Scope'}
    >
      {items.map((item) => {
        const props = item.properties ?? [];
        const propText = props.join(', ');
        return (
          <span key={item.name} className={styles.chip} role="listitem">
            <CubeRegular className={styles.icon} fontSize={15} aria-hidden />
            <span className={styles.objectName}>{item.label}</span>
            {props.length > 0 && (
              <>
                <span className={styles.sep} aria-hidden>
                  →
                </span>
                <span className={styles.props} title={propText}>
                  {propText}
                </span>
              </>
            )}
            {onRemove && (
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => onRemove(item.name)}
                aria-label={`Remove ${item.label}${props.length > 0 ? ` (${propText})` : ''} from scope`}
              >
                <DismissRegular fontSize={12} aria-hidden />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** Convenience wrapper: an "Operates on" labelled cluster used at the top of the rule detail. */
export interface ObjectScopeProps {
  items: ScopeChipItem[];
  /** Optional outcome-scope context (e.g. `order`), shown as a trailing note. */
  outcomeScope?: string;
  emptyText?: string;
}

const useObjectScopeStyles = makeStyles({
  wrap: { display: 'flex', flexDirection: 'column', gap: space.md },
  note: { color: tokens.colorNeutralForeground3 },
});

export function ObjectScope({ items, outcomeScope, emptyText }: ObjectScopeProps) {
  const styles = useObjectScopeStyles();

  if (items.length === 0) {
    return (
      <Text size={200} className={styles.note}>
        {emptyText ?? 'No object scope could be derived from this rule.'}
      </Text>
    );
  }

  return (
    <div className={styles.wrap}>
      <ScopeChips items={items} ariaLabel="Objects and properties this rule operates on" />
      {outcomeScope && (
        <Text size={200} className={styles.note}>
          Outcome scope: <strong>{outcomeScope}</strong>
        </Text>
      )}
    </div>
  );
}
