import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { LintFindings } from './LintFindings';
import { renderWithTheme } from '../test/renderWithTheme';
import type { LintReport } from '../lib/types/api';

describe('LintFindings', () => {
  it('renders a calm success state when the report is clean', () => {
    const report: LintReport = { isValid: true, findings: [] };
    renderWithTheme(<LintFindings report={report} />);

    expect(screen.getByTestId('lint-clean')).toBeInTheDocument();
    expect(screen.getByText(/passes validation/i)).toBeInTheDocument();
  });

  it('orders errors before warnings and labels each severity', () => {
    const report: LintReport = {
      isValid: false,
      findings: [
        { severity: 'Warning', code: 'W100', message: 'Deprecated operator', path: '$.assert' },
        {
          severity: 'Error',
          code: 'E200',
          message: 'Unknown subject path',
          path: '$.appliesWhen[0].subject',
        },
      ],
    };
    renderWithTheme(<LintFindings report={report} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);

    // Error must be surfaced first regardless of input order.
    expect(within(items[0]).getByText('E200')).toBeInTheDocument();
    expect(within(items[1]).getByText('W100')).toBeInTheDocument();

    // Severity badges and machine codes are both rendered (color + text, not color alone).
    expect(screen.getByText('Unknown subject path')).toBeInTheDocument();
    expect(screen.getByText('Deprecated operator')).toBeInTheDocument();
    expect(screen.getByText(/\$\.appliesWhen\[0\]\.subject/)).toBeInTheDocument();
  });

  it('summarizes the error and warning counts', () => {
    const report: LintReport = {
      isValid: false,
      findings: [
        { severity: 'Error', code: 'E1', message: 'a', path: '$' },
        { severity: 'Error', code: 'E2', message: 'b', path: '$' },
        { severity: 'Warning', code: 'W1', message: 'c', path: '$' },
      ],
    };
    renderWithTheme(<LintFindings report={report} />);

    expect(screen.getByText('2 errors')).toBeInTheDocument();
    expect(screen.getByText('1 warning')).toBeInTheDocument();
    expect(screen.getByText(/resolve before saving/i)).toBeInTheDocument();
  });
});
