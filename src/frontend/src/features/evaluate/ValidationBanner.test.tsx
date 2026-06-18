import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { ValidationBanner } from './ValidationBanner';
import { humanizeValidationError } from './validationMessages';
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

  it('surfaces a count banner with each humanized path + reassurance when errors exist', () => {
    const block: ValidationBlock = {
      valid: false,
      errors: [
        { entity: 'specimen', path: 'specimen.fixationTime', message: 'must be number' },
        {
          entity: 'patient',
          path: 'patient.gender',
          message: 'must be equal to one of the allowed values',
        },
      ],
    };
    renderWithTheme(<ValidationBanner validation={block} />);

    const banner = screen.getByTestId('validation-banner');
    expect(banner).toHaveTextContent("2 facts don't match the registry. The rules still ran.");
    expect(banner).toHaveTextContent('specimen.fixationTime');
    expect(banner).toHaveTextContent('specimen.fixationTime should be a number (Number).');
    expect(banner).toHaveTextContent('patient.gender');
  });

  it('uses the singular "fact" / "doesn\'t" for a single error', () => {
    const block: ValidationBlock = {
      valid: false,
      errors: [{ entity: 'document', path: 'document.circledHE', message: 'must be string' }],
    };
    renderWithTheme(<ValidationBanner validation={block} />);
    const banner = screen.getByTestId('validation-banner');
    expect(banner).toHaveTextContent("1 fact doesn't match the registry. The rules still ran.");
    expect(banner).toHaveTextContent('document.circledHE should be text (String).');
  });
});

describe('humanizeValidationError', () => {
  it('maps type-mismatch messages to plain-language sentences naming the expected type', () => {
    expect(
      humanizeValidationError({ entity: 'd', path: 'document.circledHE', message: 'must be string' }),
    ).toBe('document.circledHE should be text (String).');
    expect(
      humanizeValidationError({ entity: 's', path: 'specimen.age', message: 'must be number' }),
    ).toBe('specimen.age should be a number (Number).');
    expect(
      humanizeValidationError({ entity: 't', path: 'test.capGoverned', message: 'must be boolean' }),
    ).toBe('test.capGoverned should be true/false (Boolean).');
  });

  it('maps allowed-value violations to a plain sentence', () => {
    expect(
      humanizeValidationError({
        entity: 'p',
        path: 'patient.gender',
        message: 'must be equal to one of the allowed values',
      }),
    ).toBe('patient.gender is not one of the values the registry allows.');
  });

  it('falls back to the raw message for anything unrecognized', () => {
    expect(
      humanizeValidationError({ entity: 'x', path: 'foo.bar', message: 'something odd' }),
    ).toBe('foo.bar: something odd');
  });
});
