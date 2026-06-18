import type { ReactNode } from 'react';
import { makeStyles, tokens, Text } from '@fluentui/react-components';
import { fonts, space } from '../theme/tokens';
import { Reveal } from './Reveal';

/**
 * The feature page header: a Fraunces title with an eyebrow and lede, set over the subtle
 * gradient-mesh atmosphere. Establishes the editorial, clinical tone at the top of each route.
 */

const useStyles = makeStyles({
  root: {
    position: 'relative',
    overflow: 'hidden',
    paddingInline: space.xxl,
    paddingBlock: space.xxl,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  content: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.xl,
    flexWrap: 'wrap',
  },
  text: { display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '64ch' },
  eyebrow: {
    fontFamily: fonts.body,
    fontSize: '11.5px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: tokens.colorBrandForeground1,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: '30px',
    fontWeight: 600,
    lineHeight: 1.1,
    color: tokens.colorNeutralForeground1,
    margin: 0,
  },
  lede: { color: tokens.colorNeutralForeground2, fontSize: '15px', lineHeight: 1.55 },
  actions: { display: 'flex', alignItems: 'center', gap: space.sm },
});

export interface PageHeaderProps {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, lede, actions }: PageHeaderProps) {
  const styles = useStyles();
  return (
    <header className={styles.root}>
      <div className="iaw-header-atmosphere" />
      <Reveal className={styles.content}>
        <div className={styles.text}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1 className={styles.title}>{title}</h1>
          {lede && (
            <Text as="p" className={styles.lede}>
              {lede}
            </Text>
          )}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </Reveal>
    </header>
  );
}
