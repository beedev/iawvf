import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { OutcomesPanel } from './OutcomesPanel';
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

describe('OutcomesPanel', () => {
  it('renders business outcomes under their FRIENDLY group heading', () => {
    renderWithTheme(
      <OutcomesPanel
        outcomes={[outcome('Validation', 'CompleteHold', { scope: 'order', reason: 'Held' })]}
      />,
    );
    expect(screen.getByText(/Holds & alerts · 1/)).toBeInTheDocument();
    expect(screen.getByText('CompleteHold')).toBeInTheDocument();
  });

  it('attributes each outcome to its originating rule: prominent ruleName + subtle ruleKey tag', () => {
    renderWithTheme(
      <OutcomesPanel
        outcomes={[
          outcome('Validation', 'CompleteHold', {
            scope: 'order',
            reason: 'Circled H&E not present for Technical FISH on FFPE',
            ruleKey: 'PM17',
            ruleName: 'Circled H&E required for Technical FISH on FFPE',
          }),
        ]}
      />,
    );
    expect(screen.getByTestId('outcome-rule-key')).toHaveTextContent('PM17');
    expect(screen.getByTestId('outcome-rule-name')).toHaveTextContent(
      'Circled H&E required for Technical FISH on FFPE',
    );
  });

  it('falls back to the rule key as the name when ruleName is absent', () => {
    renderWithTheme(
      <OutcomesPanel
        outcomes={[
          outcome('Workflow', 'RouteToReview', { reason: 'Routed', ruleKey: 'R09', ruleName: null }),
        ]}
      />,
    );
    expect(screen.getByTestId('outcome-rule-name')).toHaveTextContent('R09');
  });

  it('hides no-action (Continue/Suppressed) outcomes behind a collapsed toggle, and names each rule (not bare "Continue")', () => {
    renderWithTheme(
      <OutcomesPanel
        outcomes={[
          outcome('Validation', 'CompleteHold', { scope: 'order', reason: 'Held' }),
          outcome('None', 'Continue', { ruleKey: 'PM02', ruleName: 'Gender plausibility check' }),
          outcome('None', 'Suppressed', {
            reason: 'Default gender applied',
            ruleKey: 'PM05',
            ruleName: 'Default patient gender',
          }),
        ]}
      />,
    );

    // The toggle is present and announces the count...
    const toggle = screen.getByTestId('no-action-toggle');
    expect(toggle).toHaveTextContent('Show 2 rules that took no action');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // ...and the no-action list is NOT rendered until expanded.
    expect(screen.queryByTestId('no-action-list')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('no-action-list')).toBeInTheDocument();
    expect(screen.getByText('Default gender applied')).toBeInTheDocument();

    // Each no-action row names its rule textually (key + name), never just the bare outcome type.
    const keys = screen.getAllByTestId('no-action-rule-key').map((el) => el.textContent);
    const names = screen.getAllByTestId('no-action-rule-name').map((el) => el.textContent);
    expect(keys).toEqual(['PM02', 'PM05']);
    expect(names).toEqual(['Gender plausibility check', 'Default patient gender']);
  });

  it('does not render the no-action toggle when there are no no-action outcomes', () => {
    renderWithTheme(
      <OutcomesPanel outcomes={[outcome('Workflow', 'RouteToReview', { reason: 'Routed' })]} />,
    );
    expect(screen.queryByTestId('no-action-toggle')).not.toBeInTheDocument();
    expect(screen.getByText(/Routing · 1/)).toBeInTheDocument();
  });

  it('renders derived values under their own friendly heading', () => {
    renderWithTheme(
      <OutcomesPanel
        outcomes={[
          outcome('Derivation', 'SetValue', {
            reason: 'Pediatric priority derived',
            parameters: { Target: 'test.priority', Value: 'Pediatric' },
          }),
        ]}
      />,
    );
    expect(screen.getByText(/Derived values · 1/)).toBeInTheDocument();
    expect(screen.getByText('Target: test.priority')).toBeInTheDocument();
  });
});
