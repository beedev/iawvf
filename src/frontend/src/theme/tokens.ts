/**
 * IAW design tokens beyond Fluent's palette: a meticulous spacing scale, font families, layered
 * shadows, hairline borders, and semantic status colors for lint severities & outcome groups.
 *
 * Spacing/radius/shadow/motion are plain constants consumed by `makeStyles`. Color accents, by
 * contrast, are sourced from Fluent's SEMANTIC status tokens (CSS variables that the active
 * `FluentProvider` theme resolves), so every foreground/background pair adapts to light & dark
 * automatically and stays AA in BOTH themes — no per-scheme palette to keep in sync.
 */

import { tokens } from '@fluentui/react-components';

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

/**
 * A theme-aware accent triple (foreground / background / border). The values are Fluent semantic
 * token references (CSS variables), so they resolve against the active light/dark theme and remain
 * AA in both. Safe to use in `makeStyles` rules and in inline `style={}` alike.
 */
export interface StatusAccent {
  fg: string;
  bg: string;
  border: string;
}

/**
 * Outcome groups → a stable, theme-aware accent, so the Evaluate playground reads at a glance.
 *
 * Keys mirror the API's `OutcomeGroup` enum string values (Validation / Workflow / Entity / Control /
 * Derivation / None). The legacy effect-name keys (Hold / Route / Flag / Derive / Annotate) are
 * retained for backward compatibility with any older consumer; both resolve to the same accents.
 *
 * Accent intent: Validation (held/flagged) = warning, Control (blocked) = danger, Workflow (routed) =
 * brand/info, Entity (records created) = brand, Derivation (computed) = success, None = neutral. Each
 * pair is drawn from Fluent's semantic status tokens, so it is AA against the card surface in both
 * light and dark — no hardcoded hex, no per-scheme palette.
 */
export const outcomeGroupColors: Record<string, StatusAccent> = {
  // API OutcomeGroup enum keys.
  Validation: {
    fg: tokens.colorStatusWarningForeground1,
    bg: tokens.colorStatusWarningBackground1,
    border: tokens.colorStatusWarningBorder1,
  },
  Workflow: {
    fg: tokens.colorBrandForeground1,
    bg: tokens.colorBrandBackground2,
    border: tokens.colorBrandStroke2,
  },
  Entity: {
    fg: tokens.colorBrandForeground1,
    bg: tokens.colorBrandBackground2,
    border: tokens.colorBrandStroke2,
  },
  Control: {
    fg: tokens.colorStatusDangerForeground1,
    bg: tokens.colorStatusDangerBackground1,
    border: tokens.colorStatusDangerBorder1,
  },
  Derivation: {
    fg: tokens.colorStatusSuccessForeground1,
    bg: tokens.colorStatusSuccessBackground1,
    border: tokens.colorStatusSuccessBorder1,
  },
  None: {
    fg: tokens.colorNeutralForeground2,
    bg: tokens.colorNeutralBackground3,
    border: tokens.colorNeutralStroke2,
  },
  // Legacy effect-name keys (kept for compatibility).
  Hold: {
    fg: tokens.colorStatusWarningForeground1,
    bg: tokens.colorStatusWarningBackground1,
    border: tokens.colorStatusWarningBorder1,
  },
  Route: {
    fg: tokens.colorBrandForeground1,
    bg: tokens.colorBrandBackground2,
    border: tokens.colorBrandStroke2,
  },
  Flag: {
    fg: tokens.colorStatusDangerForeground1,
    bg: tokens.colorStatusDangerBackground1,
    border: tokens.colorStatusDangerBorder1,
  },
  Derive: {
    fg: tokens.colorStatusSuccessForeground1,
    bg: tokens.colorStatusSuccessBackground1,
    border: tokens.colorStatusSuccessBorder1,
  },
  Annotate: {
    fg: tokens.colorNeutralForeground2,
    bg: tokens.colorNeutralBackground3,
    border: tokens.colorNeutralStroke2,
  },
};

/** Motion timings honoring an editorial, calm cadence. */
export const motion = {
  fast: 0.18,
  base: 0.32,
  slow: 0.5,
  stagger: 0.07,
  ease: [0.22, 0.61, 0.36, 1] as [number, number, number, number],
} as const;
