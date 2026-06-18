import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, render, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { FluentProvider } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { iawLightTheme } from '../../theme';
import { VocabularyPage } from './VocabularyPage';
import { api } from '../../lib/api';
import type { VocabularyAdminList } from '../../lib/types/api';

// A compact admin listing: two objects, one with a deprecated property, to exercise grouping + status.
const ADMIN_LIST: VocabularyAdminList = {
  objects: [
    {
      name: 'order',
      label: 'Order',
      properties: [
        {
          path: 'order.client.program',
          objectName: 'order',
          label: 'Client program',
          dataType: 'String',
          status: 'Active',
          createdBy: 'admin',
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          path: 'order.legacyCode',
          objectName: 'order',
          label: 'Legacy code',
          dataType: 'String',
          status: 'Deprecated',
          createdBy: 'admin',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    },
    {
      name: 'specimen',
      label: 'Specimen',
      properties: [
        {
          path: 'specimen.fixationTime',
          objectName: 'specimen',
          label: 'Fixation time',
          dataType: 'Number',
          status: 'Active',
          createdBy: 'admin',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <FluentProvider theme={iawLightTheme}>
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <VocabularyPage />
        </BrowserRouter>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('VocabularyPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getVocabularyAdmin').mockResolvedValue(ADMIN_LIST);
  });

  it('groups properties under their object', async () => {
    renderPage();

    // Each object renders its own grouping container.
    const orderGroup = await screen.findByTestId('object-group-order');
    const specimenGroup = await screen.findByTestId('object-group-specimen');

    // Order's properties live under the Order group, not the Specimen group.
    expect(within(orderGroup).getByText('order.client.program')).toBeInTheDocument();
    expect(within(orderGroup).getByText('order.legacyCode')).toBeInTheDocument();
    expect(within(orderGroup).queryByText('specimen.fixationTime')).not.toBeInTheDocument();

    expect(within(specimenGroup).getByText('specimen.fixationTime')).toBeInTheDocument();
  });

  it('shows a status badge for each property (Active / Deprecated, text not color alone)', async () => {
    renderPage();
    await screen.findByTestId('object-group-order');

    const badges = screen.getAllByTestId('status-badge');
    const labels = badges.map((b) => b.textContent);

    // Two active terms + one deprecated term.
    expect(labels.filter((l) => l === 'Active')).toHaveLength(2);
    expect(labels.filter((l) => l === 'Deprecated')).toHaveLength(1);

    // The deprecated badge carries an explicit text label, satisfying WCAG 1.4.1.
    const deprecated = badges.find((b) => b.textContent === 'Deprecated');
    expect(deprecated).toBeDefined();
  });

  it('offers Deprecate for active terms and Retire for deprecated terms', async () => {
    renderPage();
    await screen.findByTestId('object-group-order');

    // Two active terms → two Deprecate buttons; one deprecated term → one Retire button.
    expect(screen.getAllByRole('button', { name: /deprecate/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^retire$/i })).toHaveLength(1);
  });

  it('renders the data type for each property', async () => {
    renderPage();
    const specimenGroup = await screen.findByTestId('object-group-specimen');
    expect(within(specimenGroup).getByText('Number')).toBeInTheDocument();
  });
});
