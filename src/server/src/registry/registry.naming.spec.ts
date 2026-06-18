import { canonicalizeKey, humanizeLabel } from './registry.naming';

describe('registry naming helpers', () => {
  describe('canonicalizeKey', () => {
    it('lower-cases and trims so case variants collide', () => {
      expect(canonicalizeKey('Kit')).toBe('kit');
      expect(canonicalizeKey('KIT')).toBe('kit');
      expect(canonicalizeKey('  kit  ')).toBe('kit');
      expect(canonicalizeKey('Kit')).toBe(canonicalizeKey('kit'));
    });
  });

  describe('humanizeLabel', () => {
    it('splits camelCase into Title Case words', () => {
      expect(humanizeLabel('medicalReview')).toBe('Medical Review');
      expect(humanizeLabel('priorTimepoint')).toBe('Prior Timepoint');
      expect(humanizeLabel('order')).toBe('Order');
    });

    it('handles acronym runs', () => {
      expect(humanizeLabel('circledHE')).toBe('Circled HE');
    });
  });
});
