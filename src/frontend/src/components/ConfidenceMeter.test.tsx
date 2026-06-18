import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { ConfidenceMeter } from './ConfidenceMeter';
import { renderWithTheme } from '../test/renderWithTheme';

describe('ConfidenceMeter', () => {
  it('exposes an accessible meter with the value as a percentage', () => {
    renderWithTheme(<ConfidenceMeter confidence={0.82} />);
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '82');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
    expect(meter).toHaveAccessibleName(/82 percent/i);
  });

  it('bands high / moderate / low confidence with a text label', () => {
    const { rerender } = renderWithTheme(<ConfidenceMeter confidence={0.9} />);
    expect(screen.getByText(/high confidence/i)).toBeInTheDocument();

    rerender(<ConfidenceMeter confidence={0.6} />);
    expect(screen.getByText(/moderate confidence/i)).toBeInTheDocument();

    rerender(<ConfidenceMeter confidence={0.2} />);
    expect(screen.getByText(/low confidence/i)).toBeInTheDocument();
  });

  it('clamps out-of-range values into 0..100', () => {
    const { rerender } = renderWithTheme(<ConfidenceMeter confidence={1.5} />);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '100');

    rerender(<ConfidenceMeter confidence={-0.4} />);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
  });
});
