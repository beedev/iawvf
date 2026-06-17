/**
 * IAW Design System — Token Re-exports
 *
 * Re-exports Fluent UI v9 design tokens so all IAW components import
 * from a single source. This indirection lets us override or extend
 * tokens centrally without touching every consumer.
 *
 * Usage:
 *   import { tokens } from '../theme/tokens';
 *   const style = { color: tokens.colorNeutralForeground1 };
 */
export {
  tokens,
  typographyStyles,
} from '@fluentui/react-components';

/** IAW semantic spacing scale (multiples of the 4-px base grid). */
export const spacing = {
  /** 4 px */
  xs: '4px',
  /** 8 px */
  sm: '8px',
  /** 12 px */
  md: '12px',
  /** 16 px */
  lg: '16px',
  /** 24 px */
  xl: '24px',
  /** 32 px */
  xxl: '32px',
  /** 48 px */
  xxxl: '48px',
} as const;

/** Nav rail width (collapsed state — icons only). */
export const NAV_RAIL_WIDTH = '240px';
/** Top header height. */
export const HEADER_HEIGHT = '48px';
