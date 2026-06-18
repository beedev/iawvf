import type { ReactNode } from 'react';
import { makeStyles, tokens, Spinner, Text, Button } from '@fluentui/react-components';
import { fonts, radius, space } from '../theme/tokens';

/**
 * Deliberately designed empty / loading / error states — calm, centered, and informative, never an
 * afterthought. Used across features for consistent feedback.
 */

const useStyles = makeStyles({
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: space.md,
    paddingBlock: space.xxxl,
    paddingInline: space.xl,
  },
  iconCircle: {
    display: 'grid',
    placeItems: 'center',
    width: '52px',
    height: '52px',
    borderRadius: radius.pill,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorBrandForeground1,
    fontSize: '24px',
    marginBottom: space.xs,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: '17px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
  },
  desc: { color: tokens.colorNeutralForeground3, maxWidth: '46ch' },
  errorWrap: {
    border: `1px solid ${tokens.colorPaletteRedBorder1}`,
    backgroundColor: tokens.colorPaletteRedBackground1,
    borderRadius: radius.md,
    color: tokens.colorPaletteRedForeground1,
  },
});

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const styles = useStyles();
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <Spinner size="medium" label={label} labelPosition="below" />
    </div>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const styles = useStyles();
  return (
    <div className={styles.wrap}>
      {icon && (
        <div className={styles.iconCircle} aria-hidden>
          {icon}
        </div>
      )}
      <Text as="h3" className={styles.title}>
        {title}
      </Text>
      {description && (
        <Text as="p" size={300} className={styles.desc}>
          {description}
        </Text>
      )}
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  const styles = useStyles();
  return (
    <div className={`${styles.wrap} ${styles.errorWrap}`} role="alert">
      <Text as="h3" className={styles.title} style={{ color: 'inherit' }}>
        {title}
      </Text>
      <Text as="p" size={300} style={{ color: 'inherit', maxWidth: '50ch' }}>
        {message}
      </Text>
      {onRetry && (
        <Button appearance="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
