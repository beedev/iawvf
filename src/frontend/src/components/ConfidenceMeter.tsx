import { motion } from 'framer-motion';
import { makeStyles, tokens, Text } from '@fluentui/react-components';
import { fonts, radius, space } from '../theme/tokens';
import { useReducedMotion } from '../lib/hooks/useReducedMotion';

/**
 * An accessible, animated confidence meter (0..1). The fill eases to its value on mount; with
 * reduced-motion the bar simply renders at value. Exposes an ARIA meter role with text alternative.
 */

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: space.sm },
  header: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' },
  value: {
    fontFamily: fonts.mono,
    fontSize: '20px',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
  },
  track: {
    position: 'relative',
    height: '10px',
    borderRadius: radius.pill,
    backgroundColor: tokens.colorNeutralBackground4,
    overflow: 'hidden',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  fill: {
    position: 'absolute',
    insetBlockStart: 0,
    insetInlineStart: 0,
    height: '100%',
    borderRadius: radius.pill,
  },
  caption: { color: tokens.colorNeutralForeground3 },
});

function bandFor(confidence: number): { label: string; color: string } {
  if (confidence >= 0.8)
    return { label: 'High confidence', color: tokens.colorPaletteGreenBackground3 };
  if (confidence >= 0.5)
    return { label: 'Moderate confidence', color: tokens.colorPaletteMarigoldBackground3 };
  return { label: 'Low confidence — review carefully', color: tokens.colorPaletteRedBackground3 };
}

export interface ConfidenceMeterProps {
  confidence: number;
  className?: string;
}

export function ConfidenceMeter({ confidence, className }: ConfidenceMeterProps) {
  const styles = useStyles();
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, confidence));
  const pct = Math.round(clamped * 100);
  const band = bandFor(clamped);

  return (
    <div
      className={`${styles.root} ${className ?? ''}`}
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Interpreter confidence: ${pct} percent, ${band.label}`}
      data-testid="confidence-meter"
    >
      <div className={styles.header}>
        <Text className={styles.caption} size={200}>
          Interpreter confidence
        </Text>
        <span className={styles.value} aria-hidden>
          {pct}
          <span style={{ fontSize: '13px', opacity: 0.6 }}>%</span>
        </span>
      </div>
      <div className={styles.track}>
        <motion.div
          className={styles.fill}
          style={{ backgroundColor: band.color }}
          initial={reduced ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={reduced ? { duration: 0 } : { duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
        />
      </div>
      <Text className={styles.caption} size={200}>
        {band.label}
      </Text>
    </div>
  );
}
