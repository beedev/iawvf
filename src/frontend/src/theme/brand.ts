import type { BrandVariants } from '@fluentui/react-components';

/**
 * The IAW "clinical teal" brand ramp.
 *
 * A confident deep-cyan / teal accent that evokes the lab, health, and trust — deliberately NOT the
 * default Fluent purple. The ramp runs from a near-black teal (10) through the signature brand
 * tone (~80) up to the palest tint (160). Fluent's {@link createLightTheme} / {@link createDarkTheme}
 * select different slots from this ramp for each surface, so a single well-formed ramp yields a
 * cohesive light AND dark theme.
 *
 * Slot 80 (`#0E7C86`) is the primary brand color used on buttons, focus, and the wordmark accent —
 * it sits at a 4.6:1+ contrast against white for AA-conformant text on tinted backgrounds.
 */
export const iawBrand: BrandVariants = {
  10: '#03161A',
  20: '#06262C',
  30: '#073640',
  40: '#084551',
  50: '#095563',
  60: '#0A6675',
  70: '#0B7280',
  80: '#0E7C86', // primary brand (clinical teal)
  90: '#1B8B93',
  100: '#2E9AA1',
  110: '#46A9AF',
  120: '#61B8BD',
  130: '#7FC7CB',
  140: '#A0D6D9',
  150: '#C3E4E6',
  160: '#E4F2F3',
};
