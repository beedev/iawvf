/**
 * IAW design tokens beyond Fluent's palette: a meticulous spacing scale, font families, layered
 * shadows, hairline borders, and semantic status colors for lint severities & outcome groups.
 *
 * These are plain constants (not CSS variables) consumed by `makeStyles`. Status colors are provided
 * per color-scheme so contrast stays AA in both light and dark.
 */

/** Font stacks. Self-hosted via @fontsource (imported in `fonts.ts`), with safe fallbacks. */
export const fonts = {
  /** Characterful optical serif for display / headings / brand. */
  display: `'Fraunces', 'Iowan Old Style', Georgia, 'Times New Roman', serif`,
  /** Clinical-grade readable sans for body & UI (used by the US Web Design System). */
  body: `'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
  /** Structured monospace for rule JSON, traces, and code. */
  mono: `'JetBrains Mono', ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace`,
} as const;

/** A deliberate 4px-based spacing scale. Use named steps, never magic numbers. */
export const space = {
  xxs: '2px',
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
  xxxl: '48px',
  huge: '64px',
} as const;

/** Corner radii. */
export const radius = {
  sm: '6px',
  md: '10px',
  lg: '14px',
  xl: '20px',
  pill: '999px',
} as const;

/** Layered, restrained shadows — depth without drama. */
export const shadow = {
  hairline: '0 0 0 1px rgba(15, 35, 40, 0.06)',
  card: '0 1px 2px rgba(8, 38, 44, 0.06), 0 6px 16px -8px rgba(8, 38, 44, 0.18)',
  raised: '0 2px 4px rgba(8, 38, 44, 0.08), 0 14px 32px -12px rgba(8, 38, 44, 0.28)',
  focus: '0 0 0 3px rgba(14, 124, 134, 0.35)',
} as const;

/** Status palette for lint severities & outcome groups (AA against the matching surface). */
export interface StatusPalette {
  errorFg: string;
  errorBg: string;
  errorBorder: string;
  warningFg: string;
  warningBg: string;
  warningBorder: string;
  successFg: string;
  successBg: string;
  successBorder: string;
  infoFg: string;
  infoBg: string;
  infoBorder: string;
  neutralFg: string;
  neutralBg: string;
  neutralBorder: string;
}

export const statusLight: StatusPalette = {
  errorFg: '#9F1239',
  errorBg: '#FCE9EE',
  errorBorder: '#F4B8C7',
  warningFg: '#92500A',
  warningBg: '#FBEFDD',
  warningBorder: '#F0CE9A',
  successFg: '#0A6E54',
  successBg: '#E2F4EE',
  successBorder: '#A9DCCB',
  infoFg: '#0B5563',
  infoBg: '#E4F2F3',
  infoBorder: '#A0D6D9',
  neutralFg: '#41525A',
  neutralBg: '#EEF2F3',
  neutralBorder: '#D2DCDF',
};

export const statusDark: StatusPalette = {
  errorFg: '#FCA5BC',
  errorBg: '#3A1420',
  errorBorder: '#7A2C44',
  warningFg: '#F4C886',
  warningBg: '#33240F',
  warningBorder: '#6E5223',
  successFg: '#7FD9BF',
  successBg: '#0E2A23',
  successBorder: '#235A4A',
  infoFg: '#8FD4DA',
  infoBg: '#0C2A30',
  infoBorder: '#235860',
  neutralFg: '#AEBEC4',
  neutralBg: '#1C272B',
  neutralBorder: '#33444A',
};

/**
 * Outcome groups → a stable accent color, so the Evaluate playground reads at a glance.
 *
 * Keys mirror the API's `OutcomeGroup` enum string values (Validation / Workflow / Entity / Control /
 * Derivation / None). The legacy effect-name keys (Hold / Route / Flag / Derive / Annotate) are
 * retained for backward compatibility with any older consumer; both resolve to the same accents.
 *
 * Accent intent: Validation (held/flagged) = amber, Control (blocked) = red, Workflow (routed) =
 * teal/info, Entity (records created) = brand, Derivation (computed) = green, None = neutral. All
 * foreground/background pairs are AA against the card surface.
 */
export const outcomeGroupColors: Record<string, { fg: string; bg: string; border: string }> = {
  // API OutcomeGroup enum keys.
  Validation: { fg: '#92500A', bg: '#FBEFDD', border: '#F0CE9A' },
  Workflow: { fg: '#0B5563', bg: '#E4F2F3', border: '#A0D6D9' },
  Entity: { fg: '#0B5563', bg: '#E4F2F3', border: '#A0D6D9' },
  Control: { fg: '#9F1239', bg: '#FCE9EE', border: '#F4B8C7' },
  Derivation: { fg: '#0A6E54', bg: '#E2F4EE', border: '#A9DCCB' },
  None: { fg: '#41525A', bg: '#EEF2F3', border: '#D2DCDF' },
  // Legacy effect-name keys (kept for compatibility).
  Hold: { fg: '#92500A', bg: '#FBEFDD', border: '#F0CE9A' },
  Route: { fg: '#0B5563', bg: '#E4F2F3', border: '#A0D6D9' },
  Flag: { fg: '#9F1239', bg: '#FCE9EE', border: '#F4B8C7' },
  Derive: { fg: '#0A6E54', bg: '#E2F4EE', border: '#A9DCCB' },
  Annotate: { fg: '#41525A', bg: '#EEF2F3', border: '#D2DCDF' },
};

/** Motion timings honoring an editorial, calm cadence. */
export const motion = {
  fast: 0.18,
  base: 0.32,
  slow: 0.5,
  stagger: 0.07,
  ease: [0.22, 0.61, 0.36, 1] as [number, number, number, number],
} as const;
