import { createLightTheme, createDarkTheme, type Theme } from '@fluentui/react-components';
import { iawBrand } from './brand';
import { fonts } from './tokens';

/**
 * Builds the IAW light & dark Fluent v9 themes from the clinical-teal brand ramp, then layers our
 * editorial typography (Fraunces / Public Sans / JetBrains Mono) and a touch of slate warmth onto
 * the neutral surfaces so the app never reads as stock Fluent.
 */

const baseLight = createLightTheme(iawBrand);
const baseDark = createDarkTheme(iawBrand);

/** Apply our font families across Fluent's typography tokens. */
function withTypography(theme: Theme): Theme {
  return {
    ...theme,
    // Body / UI → Public Sans.
    fontFamilyBase: fonts.body,
    // Numeric → keep the readable sans.
    fontFamilyNumeric: fonts.body,
    // Code / JSON → JetBrains Mono.
    fontFamilyMonospace: fonts.mono,
  };
}

/**
 * Nudge the light neutrals toward a calm slate (cooler, slightly desaturated) instead of Fluent's
 * pure greys. Subtle — it gives the canvas a clinical, paper-like quietness.
 */
function withSlateLight(theme: Theme): Theme {
  return {
    ...theme,
    colorNeutralBackground1: '#FCFDFD',
    colorNeutralBackground2: '#F4F7F7',
    colorNeutralBackground3: '#ECF1F1',
    colorNeutralBackground1Hover: '#F4F7F7',
    colorNeutralBackground1Pressed: '#ECF1F1',
    colorNeutralStroke1: '#DAE2E3',
    colorNeutralStroke2: '#E6ECEC',
    colorNeutralStroke3: '#EEF2F2',
  };
}

function withSlateDark(theme: Theme): Theme {
  return {
    ...theme,
    colorNeutralBackground1: '#0E1719',
    colorNeutralBackground2: '#121E21',
    colorNeutralBackground3: '#162629',
    colorNeutralStroke1: '#27393D',
    colorNeutralStroke2: '#1F2E31',
    colorNeutralStroke3: '#1A2629',
  };
}

export const iawLightTheme: Theme = withTypography(withSlateLight(baseLight));
export const iawDarkTheme: Theme = withTypography(withSlateDark(baseDark));

export type ThemeMode = 'light' | 'dark';

export function themeForMode(mode: ThemeMode): Theme {
  return mode === 'dark' ? iawDarkTheme : iawLightTheme;
}
