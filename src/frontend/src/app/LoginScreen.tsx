import { useState, type FormEvent } from 'react';
import {
  makeStyles,
  tokens,
  Button,
  Input,
  Label,
  Field,
  Text,
  MessageBar,
  MessageBarBody,
  Spinner,
  shorthands,
} from '@fluentui/react-components';
import { ArrowEnterRegular } from '@fluentui/react-icons';
import { fonts, radius, shadow, space } from '../theme/tokens';
import { useAuth, DEV_USERS } from '../lib/auth';
import { Reveal } from '../components';

const useStyles = makeStyles({
  page: {
    minHeight: '100dvh',
    display: 'grid',
    gridTemplateColumns: '1.05fr 0.95fr',
    backgroundColor: tokens.colorNeutralBackground2,
    '@media (max-width: 880px)': { gridTemplateColumns: '1fr' },
  },
  hero: {
    position: 'relative',
    overflow: 'hidden',
    padding: space.huge,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: space.xl,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    '@media (max-width: 880px)': { display: 'none' },
  },
  heroContent: { position: 'relative', zIndex: 1, maxWidth: '40ch' },
  kicker: {
    fontFamily: fonts.body,
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: tokens.colorBrandForeground1,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: '46px',
    fontWeight: 600,
    lineHeight: 1.05,
    margin: `${space.md} 0`,
    color: tokens.colorNeutralForeground1,
  },
  lede: { color: tokens.colorNeutralForeground2, fontSize: '16px', lineHeight: 1.6 },
  pillars: { display: 'flex', flexDirection: 'column', gap: space.md, marginTop: space.xl },
  pillar: { display: 'flex', gap: space.md, alignItems: 'flex-start' },
  pillarDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: tokens.colorBrandBackground,
    marginTop: '7px',
    flexShrink: 0,
  },
  pillarText: { color: tokens.colorNeutralForeground2 },
  panel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: radius.xl,
    boxShadow: shadow.raised,
    padding: space.xxl,
    display: 'flex',
    flexDirection: 'column',
    gap: space.lg,
  },
  cardTitle: { fontFamily: fonts.display, fontSize: '24px', fontWeight: 600 },
  form: { display: 'flex', flexDirection: 'column', gap: space.lg },
  quick: { display: 'flex', flexDirection: 'column', gap: space.sm },
  quickLabel: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
  },
  quickGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space.sm },
  quickBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '2px',
    padding: space.md,
    borderRadius: radius.md,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.14s ease, background-color 0.14s ease',
    ':hover': {
      ...shorthands.borderColor(tokens.colorBrandStroke1),
      backgroundColor: tokens.colorBrandBackground2,
    },
  },
  quickName: { fontWeight: 600, fontSize: '13px', color: tokens.colorNeutralForeground1 },
  quickRoles: { fontSize: '11px', color: tokens.colorNeutralForeground3 },
  footnote: { color: tokens.colorNeutralForeground4, fontSize: '11.5px', textAlign: 'center' },
});

const PILLARS = [
  'Author validation rules in plain English — no scripting.',
  'Every term grounded in the controlled vocabulary; gaps surfaced, never invented.',
  'Round-trip paraphrase, lint, and dry-run before anything is saved.',
];

export function LoginScreen() {
  const styles = useStyles();
  const { login, isLoading, error } = useAuth();
  const [username, setUsername] = useState('lead');
  const [password, setPassword] = useState('lead-pw');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await login(username.trim(), password).catch(() => {});
  };

  const quickSignIn = async (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    await login(u, p).catch(() => {});
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-hidden="false">
        <div className="iaw-header-atmosphere" />
        <Reveal className={styles.heroContent}>
          <span className={styles.kicker}>IAW · Validation &amp; Decision Framework</span>
          <h1 className={styles.title}>Author rules the way you explain them.</h1>
          <p className={styles.lede}>
            A clinical-grade workspace for lab operations staff to describe validation logic in
            natural language, see exactly how it is interpreted, and govern it with confidence.
          </p>
          <div className={styles.pillars}>
            {PILLARS.map((p) => (
              <div className={styles.pillar} key={p}>
                <span className={styles.pillarDot} aria-hidden />
                <Text className={styles.pillarText}>{p}</Text>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <div className={styles.panel}>
        <Reveal index={1} className={styles.card} as="section">
          <div>
            <Text as="h2" className={styles.cardTitle}>
              Sign in
            </Text>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              Development authentication — choose a role to begin.
            </Text>
          </div>

          {error && (
            <MessageBar intent="error" role="alert">
              <MessageBarBody>{error}</MessageBarBody>
            </MessageBar>
          )}

          <form className={styles.form} onSubmit={submit}>
            <Field label="Username">
              <Input
                value={username}
                onChange={(_, d) => setUsername(d.value)}
                autoComplete="username"
                name="username"
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(_, d) => setPassword(d.value)}
                autoComplete="current-password"
                name="password"
              />
            </Field>
            <Button
              type="submit"
              appearance="primary"
              disabled={isLoading || !username || !password}
              icon={isLoading ? <Spinner size="tiny" /> : <ArrowEnterRegular />}
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className={styles.quick}>
            <Label className={styles.quickLabel}>Quick sign-in</Label>
            <div className={styles.quickGrid}>
              {DEV_USERS.map((u) => (
                <button
                  key={u.username}
                  type="button"
                  className={styles.quickBtn}
                  onClick={() => quickSignIn(u.username, u.password)}
                  disabled={isLoading}
                >
                  <span className={styles.quickName}>{u.label}</span>
                  <span className={styles.quickRoles}>{u.roles.join(' · ')}</span>
                </button>
              ))}
            </div>
          </div>

          <Text className={styles.footnote}>
            Tokens are held in memory only and never persisted or logged.
          </Text>
        </Reveal>
      </div>
    </div>
  );
}
