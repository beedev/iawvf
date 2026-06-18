import { makeStyles, tokens, mergeClasses, shorthands } from '@fluentui/react-components';
import { fonts, radius } from '../theme/tokens';

/**
 * A compact, semantic status pill (error / warning / success / info / neutral). Color is reinforced
 * with a leading dot and the text label, never color-alone — supporting WCAG 1.4.1.
 *
 * Griffel forbids the `border*` shorthands as bare props, so border edges are set via the
 * `shorthands.border()` / `shorthands.borderColor()` helpers.
 */

export type StatusKind = 'error' | 'warning' | 'success' | 'info' | 'neutral';

const useStyles = makeStyles({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    paddingInline: '10px',
    paddingBlock: '3px',
    borderRadius: radius.pill,
    fontFamily: fonts.body,
    fontSize: '11.5px',
    fontWeight: 600,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    ...shorthands.border('1px', 'solid', 'transparent'),
    whiteSpace: 'nowrap',
  },
  dot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  error: {
    color: tokens.colorPaletteRedForeground1,
    backgroundColor: tokens.colorPaletteRedBackground1,
    ...shorthands.borderColor(tokens.colorPaletteRedBorder1),
  },
  warning: {
    color: tokens.colorPaletteDarkOrangeForeground1,
    backgroundColor: tokens.colorPaletteDarkOrangeBackground1,
    ...shorthands.borderColor(tokens.colorPaletteDarkOrangeBorder1),
  },
  success: {
    color: tokens.colorPaletteGreenForeground1,
    backgroundColor: tokens.colorPaletteGreenBackground1,
    ...shorthands.borderColor(tokens.colorPaletteGreenBorder1),
  },
  info: {
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorBrandBackground2,
    ...shorthands.borderColor(tokens.colorBrandStroke2),
  },
  neutral: {
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.borderColor(tokens.colorNeutralStroke2),
  },
});

const dotColor: Record<StatusKind, string> = {
  error: tokens.colorPaletteRedForeground1,
  warning: tokens.colorPaletteDarkOrangeForeground1,
  success: tokens.colorPaletteGreenForeground1,
  info: tokens.colorBrandForeground1,
  neutral: tokens.colorNeutralForeground3,
};

export interface StatusBadgeProps {
  kind: StatusKind;
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ kind, children, className }: StatusBadgeProps) {
  const styles = useStyles();
  return (
    <span
      className={mergeClasses(styles.base, styles[kind], className)}
      data-testid="status-badge"
      data-kind={kind}
    >
      <span className={styles.dot} style={{ backgroundColor: dotColor[kind] }} aria-hidden />
      {children}
    </span>
  );
}
