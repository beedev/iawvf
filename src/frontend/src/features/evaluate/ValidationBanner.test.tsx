import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { ValidationBanner } from './ValidationBanner';
import type { ValidationBlock } from '../../lib/types/api';

describe('ValidationBanner (non-blocking registry validation surface)', () => {
  it('renders nothing when the validation block is absent', () => {
    renderWithTheme(<ValidationBanner validation={undefined} />);
    expect(screen.queryByTestId('validation-banner')).not.toBeInTheDocument();
  });

  it('renders nothing when the facts validated cleanly', () => {
    const valid: ValidationBlock = { valid: true, errors: [] };
    renderWithTheme(<ValidationBanner validation={valid} />);
    expect(screen.queryByTestId('validation-banner')).not.toBeInTheDocument();
  });

  it('renders nothing when valid is false but there are no errors (defensive)', () => {
    const odd: ValidationBlock = { valid: false, errors: [] };
    renderWithTheme(<ValidationBanner validation={odd} />);
    expect(screen.queryByTestId('validation-banner')).not.toBeInTheDocument();
  });

  it('surfaces a count banner with each offending path + message when errors exist', () => {
    const block: ValidationBlock = {
      valid: false,
      errors: [
        { entity: 'specimen', path: 'specimen.fixationTime', message: 'must be number' },
        { entity: 'patient', path: 'patient.gender', message: 'must be equal to one of the allowed values' },
      ],
    };
    renderWithTheme(<ValidationBanner validation={block} />);

    const banner = screen.getByTestId('validation-banner');
    expect(banner).toHaveTextContent('2 facts did not match the registry schema');
    expect(banner).toHaveTextContent('specimen.fixationTime');
    expect(banner).toHaveTextContent('must be number');
    expect(banner).toHaveTextContent('patient.gender');
  });

  it('uses the singular "fact" for a single error', () => {
    const block: ValidationBlock = {
      valid: false,
      errors: [{ entity: 'specimen', path: 'specimen.fixationTime', message: 'must be number' }],
    };
    renderWithTheme(<ValidationBanner validation={block} />);
    expect(screen.getByTestId('validation-banner')).toHaveTextContent(
      '1 fact did not match the registry schema',
    );
  });
});
