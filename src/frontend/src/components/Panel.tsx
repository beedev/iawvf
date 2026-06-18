import { forwardRef, type ReactNode } from 'react';
import { makeStyles, tokens, mergeClasses, Text } from '@fluentui/react-components';
import { fonts, radius, shadow, space } from '../theme/tokens';

/**
 * The app's signature surface: a card with a 1px hairline border, a subtle layered shadow, and an
 * optional header (Fraunces eyebrow + title, optional actions). Used to compose the deliberate
 * authoring / evaluation columns.
 */

const useStyles = makeStyles({
  root: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.lg,
    paddingInline: space.xl,
    paddingBlock: space.lg,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  headerText: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  eyebrow: {
    fontFamily: fonts.body,
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    color: tokens.colorBrandForeground1,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: '19px',
    fontWeight: 600,
    lineHeight: '1.2',
    color: tokens.colorNeutralForeground1,
  },
  description: { color: tokens.colorNeutralForeground3, marginTop: '2px' },
  actions: { display: 'flex', alignItems: 'center', gap: space.sm, flexShrink: 0 },
  body: { padding: space.xl, display: 'flex', flexDirection: 'column', gap: space.lg, flexGrow: 1 },
  bodyFlush: { padding: 0 },
});

export interface PanelProps {
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Remove body padding (e.g. for a flush table). */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  as?: 'section' | 'div' | 'article';
}

export const Panel = forwardRef<HTMLElement, PanelProps>(function Panel(
  {
    eyebrow,
    title,
    description,
    actions,
    children,
    flush,
    className,
    bodyClassName,
    as = 'section',
  },
  ref,
) {
  const styles = useStyles();
  const Tag = as;
  const hasHeader = eyebrow || title || actions || description;

  return (
    // @ts-expect-error — polymorphic tag with forwarded ref is safe for our element set.
    <Tag ref={ref} className={mergeClasses(styles.root, className)}>
      {hasHeader && (
        <div className={styles.header}>
          <div className={styles.headerText}>
            {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
            {title && <span className={styles.title}>{title}</span>}
            {description && (
              <Text size={200} className={styles.description}>
                {description}
              </Text>
            )}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      <div className={mergeClasses(styles.body, flush && styles.bodyFlush, bodyClassName)}>
        {children}
      </div>
    </Tag>
  );
});
