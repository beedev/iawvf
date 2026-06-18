import { type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  mergeClasses,
  Button,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItemRadio,
  MenuDivider,
  MenuGroup,
  MenuGroupHeader,
  Tooltip,
  Avatar,
  Text,
} from '@fluentui/react-components';
import {
  WeatherMoonRegular,
  WeatherSunnyRegular,
  EditRegular,
  EditFilled,
  LibraryRegular,
  LibraryFilled,
  PlayCircleRegular,
  PlayCircleFilled,
  BookRegular,
  BookFilled,
  SignOutRegular,
  PersonRegular,
} from '@fluentui/react-icons';
import { fonts, radius, space } from '../theme/tokens';
import { useThemeMode } from './ThemeModeContext';
import { useAuth } from '../lib/auth';
import { DEV_USERS } from '../lib/auth';
import { canAdminVocabulary } from '../lib/vocabulary';

const RAIL_WIDTH = '232px';

const useStyles = makeStyles({
  shell: {
    display: 'grid',
    gridTemplateColumns: `${RAIL_WIDTH} 1fr`,
    gridTemplateRows: '60px 1fr',
    gridTemplateAreas: `'brand topbar' 'rail main'`,
    minHeight: '100dvh',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  brand: {
    gridArea: 'brand',
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
    paddingInline: space.xl,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  mark: {
    width: '30px',
    height: '30px',
    borderRadius: radius.sm,
    background: `linear-gradient(135deg, ${tokens.colorBrandBackground} 0%, ${tokens.colorBrandBackgroundPressed} 100%)`,
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    boxShadow: '0 1px 3px rgba(8,38,44,0.3)',
  },
  markGlyph: { color: '#fff', fontFamily: fonts.display, fontWeight: 700, fontSize: '15px' },
  wordmark: { display: 'flex', flexDirection: 'column', lineHeight: 1 },
  wordmarkTop: {
    fontFamily: fonts.display,
    fontSize: '17px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
    letterSpacing: '0.01em',
  },
  wordmarkSub: {
    fontFamily: fonts.body,
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
    marginTop: '2px',
  },
  topbar: {
    gridArea: 'topbar',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.md,
    paddingInline: space.xl,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  envChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    paddingInline: '10px',
    paddingBlock: '4px',
    borderRadius: radius.pill,
    border: `1px solid ${tokens.colorPaletteGreenBorder1}`,
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
    fontSize: '11.5px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    marginRight: 'auto',
    marginLeft: 0,
  },
  envDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: tokens.colorPaletteGreenForeground1,
  },
  rail: {
    gridArea: 'rail',
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
    padding: space.md,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  railHeader: {
    fontSize: '10.5px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground4,
    paddingInline: space.md,
    paddingBlock: space.sm,
    marginTop: space.xs,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
    paddingInline: space.md,
    paddingBlock: '10px',
    borderRadius: radius.md,
    color: tokens.colorNeutralForeground2,
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
    position: 'relative',
    transition: 'background-color 0.14s ease, color 0.14s ease',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground2,
      color: tokens.colorNeutralForeground1,
    },
  },
  navItemActive: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontWeight: 600,
    ':hover': {
      backgroundColor: tokens.colorBrandBackground2,
      color: tokens.colorBrandForeground1,
    },
    '::before': {
      content: '""',
      position: 'absolute',
      insetInlineStart: '-13px',
      insetBlockStart: '9px',
      insetBlockEnd: '9px',
      width: '3px',
      borderRadius: radius.pill,
      backgroundColor: tokens.colorBrandBackground,
    },
  },
  navIcon: { fontSize: '20px', flexShrink: 0 },
  navMeta: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  navMetaHint: { fontSize: '11px', fontWeight: 400, color: tokens.colorNeutralForeground3 },
  railFooter: {
    marginTop: 'auto',
    padding: space.sm,
    color: tokens.colorNeutralForeground4,
    fontSize: '11px',
  },
  main: { gridArea: 'main', overflow: 'auto', minWidth: 0 },
  roleButton: { fontWeight: 600 },
  userBlock: { display: 'flex', alignItems: 'center', gap: space.sm },
});

interface NavItem {
  to: string;
  label: string;
  hint: string;
  icon: ReactNode;
  iconActive: ReactNode;
  /** When true, the item is only shown to users with the Admin role. */
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/authoring',
    label: 'Authoring',
    hint: 'Describe & interpret rules',
    icon: <EditRegular />,
    iconActive: <EditFilled />,
  },
  {
    to: '/rules',
    label: 'Repository',
    hint: 'Browse & govern rules',
    icon: <LibraryRegular />,
    iconActive: <LibraryFilled />,
  },
  {
    to: '/evaluate',
    label: 'Evaluate',
    hint: 'Run facts through rules',
    icon: <PlayCircleRegular />,
    iconActive: <PlayCircleFilled />,
  },
  {
    to: '/vocabulary',
    label: 'Vocabulary',
    hint: 'Manage controlled terms',
    icon: <BookRegular />,
    iconActive: <BookFilled />,
    adminOnly: true,
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const { mode, toggle } = useThemeMode();
  const { session, logout, login } = useAuth();
  const location = useLocation();

  const isAdmin = canAdminVocabulary(session?.roles);
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  const onSwitchUser = async (username: string) => {
    const user = DEV_USERS.find((u) => u.username === username);
    if (user) await login(user.username, user.password).catch(() => {});
  };

  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      {/* Brand cell */}
      <div className={styles.brand}>
        <div className={styles.mark} aria-hidden>
          <span className={styles.markGlyph}>iaw</span>
        </div>
        <div className={styles.wordmark}>
          <span className={styles.wordmarkTop}>Decision Framework</span>
          <span className={styles.wordmarkSub}>IAW · Validation</span>
        </div>
      </div>

      {/* Top bar */}
      <header className={styles.topbar} aria-label="Application toolbar">
        <span className={styles.envChip} title="Connected environment">
          <span className={styles.envDot} aria-hidden />
          Local · Dev
        </span>

        <Tooltip
          content={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          relationship="label"
        >
          <Button
            appearance="subtle"
            icon={mode === 'dark' ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
            onClick={toggle}
            aria-label={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          />
        </Tooltip>

        <Menu checkedValues={{ user: session ? [session.username] : [] }}>
          <MenuTrigger disableButtonEnhancement>
            <Button appearance="subtle" className={styles.roleButton}>
              <span className={styles.userBlock}>
                <Avatar
                  size={24}
                  name={session?.username ?? 'user'}
                  color="colorful"
                  icon={<PersonRegular />}
                />
                <Text weight="semibold">{session?.username ?? 'Sign in'}</Text>
              </span>
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuGroup>
                <MenuGroupHeader>Signed in as</MenuGroupHeader>
                <div style={{ padding: '4px 12px 8px', maxWidth: 240 }}>
                  <Text size={200} block weight="semibold">
                    {session?.username}
                  </Text>
                  <Text size={200} block style={{ color: tokens.colorNeutralForeground3 }}>
                    Roles: {session?.roles.join(', ') || '—'}
                  </Text>
                </div>
              </MenuGroup>
              <MenuDivider />
              <MenuGroup>
                <MenuGroupHeader>Switch dev user (role)</MenuGroupHeader>
                {DEV_USERS.map((u) => (
                  <MenuItemRadio
                    key={u.username}
                    name="user"
                    value={u.username}
                    onClick={() => onSwitchUser(u.username)}
                  >
                    {u.label} — {u.roles.join(' · ')}
                  </MenuItemRadio>
                ))}
              </MenuGroup>
              <MenuDivider />
              <MenuList>
                <Button
                  appearance="subtle"
                  icon={<SignOutRegular />}
                  onClick={logout}
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                >
                  Sign out
                </Button>
              </MenuList>
            </MenuList>
          </MenuPopover>
        </Menu>
      </header>

      {/* Nav rail */}
      <nav className={styles.rail} aria-label="Primary">
        <div className={styles.railHeader}>Workspace</div>
        {visibleNavItems.map((item) => {
          const active = location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                mergeClasses(styles.navItem, (isActive || active) && styles.navItemActive)
              }
              aria-current={active ? 'page' : undefined}
            >
              <span className={styles.navIcon} aria-hidden>
                {active ? item.iconActive : item.icon}
              </span>
              <span className={styles.navMeta}>
                <span>{item.label}</span>
                <span className={styles.navMetaHint}>{item.hint}</span>
              </span>
            </NavLink>
          );
        })}
        <div className={styles.railFooter}>
          No silent invention — every term is grounded in the controlled vocabulary.
        </div>
      </nav>

      {/* Main */}
      <main id="main-content" className={styles.main} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
