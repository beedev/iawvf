import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { iawLightTheme } from '../../theme';
import { ScopeSelector } from './ScopeSelector';
import { type ScopeSelection, EMPTY_SCOPE, buildInterpretScope } from './scope';
import { api } from '../../lib/api';
import type { VocabularyResponse } from '../../lib/types/api';

// A compact, representative vocabulary mirroring the backend contract.
const VOCAB: VocabularyResponse = {
  objects: [
    {
      name: 'specimen',
      label: 'Specimen',
      properties: [
        { path: 'specimen.fixationTime', name: 'fixationTime', dataType: 'Number' },
        { path: 'specimen.age', name: 'age', dataType: 'Number' },
      ],
    },
    {
      name: 'order',
      label: 'Order',
      properties: [{ path: 'order.client.nyStatus', name: 'client.nyStatus', dataType: 'String' }],
    },
  ],
  operators: ['Equals', 'GreaterThan'],
  outcomes: ['Hold', 'Route'],
};

/** Harness that owns scope state so we can assert the payload the parent would build. */
function Harness({ onScope }: { onScope: (s: ScopeSelection) => void }) {
  const [scope, setScope] = useState<ScopeSelection>(EMPTY_SCOPE);
  return (
    <ScopeSelector
      selection={scope}
      onChange={(next) => {
        setScope(next);
        onScope(next);
      }}
    />
  );
}

function renderSelector(onScope: (s: ScopeSelection) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <FluentProvider theme={iawLightTheme}>
      <QueryClientProvider client={client}>
        <Harness onScope={onScope} />
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('ScopeSelector', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getVocabulary').mockResolvedValue(VOCAB);
  });

  it('renders objects from the vocabulary as selectable toggles', async () => {
    renderSelector(() => {});
    expect(await screen.findByRole('button', { name: /specimen/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^order$/i })).toBeInTheDocument();
  });

  it('reveals an object’s properties only after it is selected', async () => {
    const user = userEvent.setup();
    renderSelector(() => {});

    const specimenToggle = await screen.findByRole('button', { name: /specimen/i });
    // Properties hidden initially.
    expect(screen.queryByRole('checkbox', { name: /fixationTime/i })).not.toBeInTheDocument();

    await user.click(specimenToggle);

    expect(specimenToggle).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('checkbox', { name: /fixationTime/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /age/i })).toBeInTheDocument();
  });

  it('builds an objects-only interpret payload when only objects are selected', async () => {
    const user = userEvent.setup();
    let latest: ScopeSelection = EMPTY_SCOPE;
    renderSelector((s) => {
      latest = s;
    });

    await user.click(await screen.findByRole('button', { name: /specimen/i }));

    expect(latest).toEqual({ objects: ['specimen'], properties: [] });
    expect(buildInterpretScope(latest)).toEqual({ objects: ['specimen'] });
  });

  it('builds a properties payload (full paths) when a property is narrowed', async () => {
    const user = userEvent.setup();
    let latest: ScopeSelection = EMPTY_SCOPE;
    renderSelector((s) => {
      latest = s;
    });

    await user.click(await screen.findByRole('button', { name: /specimen/i }));
    await user.click(await screen.findByRole('checkbox', { name: /fixationTime/i }));

    expect(latest.properties).toContain('specimen.fixationTime');
    expect(buildInterpretScope(latest)).toEqual({ properties: ['specimen.fixationTime'] });
  });

  it('sends no scope (full vocabulary) when nothing is selected', () => {
    expect(buildInterpretScope(EMPTY_SCOPE)).toEqual({});
  });

  it('shows the active selection as a removable chip', async () => {
    const user = userEvent.setup();
    renderSelector(() => {});

    await user.click(await screen.findByRole('button', { name: /specimen/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /remove specimen/i })).toBeInTheDocument(),
    );
  });
});
