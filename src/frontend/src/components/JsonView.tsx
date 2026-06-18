import { useMemo } from 'react';
import { makeStyles, tokens, mergeClasses } from '@fluentui/react-components';
import { fonts, radius, space } from '../theme/tokens';
import { tokenizeJson, type JsonTokenType } from './jsonTokens';

/**
 * A deterministic, syntax-highlighted JSON renderer in JetBrains Mono. Tokenizes a pretty-printed
 * JSON string into typed spans (key / string / number / boolean / null / punctuation) so rule bodies,
 * decision traces, and derived facts read as a structured document — not a wall of text.
 *
 * Accessibility: rendered inside a labelled <pre> with role="region"; purely visual coloring.
 */

const useStyles = makeStyles({
  root: {
    fontFamily: fonts.mono,
    fontSize: '12.5px',
    lineHeight: '1.7',
    margin: 0,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflowX: 'auto',
    whiteSpace: 'pre',
    tabSize: 2,
    color: tokens.colorNeutralForeground1,
  },
  key: { color: tokens.colorBrandForeground1, fontWeight: 500 },
  string: { color: tokens.colorPaletteGreenForeground2 },
  number: { color: tokens.colorPaletteBerryForeground2 },
  boolean: { color: tokens.colorPalettePeachForeground2, fontWeight: 500 },
  null: { color: tokens.colorNeutralForeground3, fontStyle: 'italic' },
  punct: { color: tokens.colorNeutralForeground3 },
  plain: { color: tokens.colorNeutralForeground1 },
});

export interface JsonViewProps {
  /** Either a value to pretty-print, or a pre-formatted string. */
  value: unknown;
  /** Accessible label for the region. */
  label?: string;
  className?: string;
}

export function JsonView({ value, label = 'JSON', className }: JsonViewProps) {
  const styles = useStyles();
  const text = useMemo(
    () => (typeof value === 'string' ? value : JSON.stringify(value, null, 2)),
    [value],
  );
  const tokens = useMemo(() => tokenizeJson(text), [text]);
  const classFor: Record<JsonTokenType, string> = {
    key: styles.key,
    string: styles.string,
    number: styles.number,
    boolean: styles.boolean,
    null: styles.null,
    punct: styles.punct,
    plain: styles.plain,
  };

  return (
    <pre
      className={mergeClasses(styles.root, className)}
      role="region"
      aria-label={label}
      tabIndex={0}
      data-testid="json-view"
    >
      {tokens.map((t, i) => (
        <span key={i} className={classFor[t.type]} data-token={t.type}>
          {t.value}
        </span>
      ))}
    </pre>
  );
}
