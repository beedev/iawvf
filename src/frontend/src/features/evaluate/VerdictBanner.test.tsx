import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { VerdictBanner } from './VerdictBanner';
import { computeVerdict } from './resultModel';
import type { Outcome } from '../../lib/types/api';

function outcome(group: string, type: string, extra: Partial<Outcome> = {}): Outcome {
  return {
    type,
    group,
    scope: extra.scope ?? null,
    reason: extra.reason ?? null,
    severity: null,
    parameters: extra.parameters ?? {},
    ruleKey: extra.ruleKey ?? null,
    ruleName: extra.ruleName ?? null,
  };
}

describe('VerdictBanner (rule attribution)', () => {
  it('names the originating rule (key + name) on each held headline', () => {
    const summary = computeVerdict([
      outcome('Validation', 'CompleteHold', {
        scope: 'order',
        reason: 'Circled H&E not present for Technical FISH on FFPE',
        ruleKey: 'PM17',
        ruleName: 'Circled H&E required for Technical FISH on FFPE',
      }),
    ]);
    renderWithTheme(<VerdictBanner summary={summary} />);

    expect(screen.getByTestId('verdict-banner')).toHaveAttribute('data-verdict', 'held');
    expect(screen.getByTestId('verdict-rule-key')).toHaveTextContent('PM17');
    expect(screen.getByTestId('verdict-rule-name')).toHaveTextContent(
      'Circled H&E required for Technical FISH on FFPE',
    );
  });

  it('shows a "Rules triggered (N)" summary listing the distinct producing rule keys', () => {
    const summary = computeVerdict([
      outcome('Validation', 'CompleteHold', { ruleKey: 'PM17', ruleName: 'Hold rule' }),
      outcome('Workflow', 'RouteToReview', { ruleKey: 'R09', ruleName: 'Route rule' }),
    ]);
    renderWithTheme(<VerdictBanner summary={summary} />);

    const triggered = screen.getByTestId('rules-triggered');
    expect(triggered).toHaveTextContent('Rules triggered (2):');
    expect(triggered).toHaveTextContent('PM17');
    expect(triggered).toHaveTextContent('R09');
  });

  it('omits the triggered summary when the order passes', () => {
    const summary = computeVerdict([outcome('None', 'Continue', { ruleKey: 'PM02' })]);
    renderWithTheme(<VerdictBanner summary={summary} />);
    expect(screen.queryByTestId('rules-triggered')).not.toBeInTheDocument();
  });
});
