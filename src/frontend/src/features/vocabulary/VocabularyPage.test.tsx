import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, render, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { FluentProvider } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { iawLightTheme } from '../../theme';
import { VocabularyPage } from './VocabularyPage';
import { api, ApiError } from '../../lib/api';
import type { RegistryEntity } from '../../lib/types/api';

// Two entities: one Active with a deprecated field, one with no fields — exercises grouping + status.
const ENTITIES: RegistryEntity[] = [
  {
    id: 'e1',
    key: 'specimen',
    label: 'Specimen',
    description: null,
    status: 'Active',
    createdBy: 'admin',
    fields: [
      {
        id: 'f1',
        entityId: 'e1',
        name: 'fixationTime',
        dataType: 'Number',
        required: false,
        allowedValues: [],
        description: null,
        status: 'Active',
      },
      {
        id: 'f2',
        entityId: 'e1',
        name: 'legacyType',
        dataType: 'String',
        required: false,
        allowedValues: [],
        description: null,
        status: 'Deprecated',
      },
    ],
  },
  {
    id: 'e2',
    key: 'order',
    label: 'Order',
    description: null,
    status: 'Active',
    createdBy: 'admin',
    fields: [
      {
        id: 'f3',
        entityId: 'e2',
        name: 'client.nyStatus',
        dataType: 'String',
        required: false,
        allowedValues: ['Standard', 'Priority'],
        description: null,
        status: 'Active',
      },
    ],
  },
];

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

describe('VocabularyPage (entity registry)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'listEntities').mockResolvedValue(ENTITIES);
  });

  it('groups fields under their entity (by entity, not free-text)', async () => {
    renderPage();

    const specimenGroup = await screen.findByTestId('entity-group-specimen');
    const orderGroup = await screen.findByTestId('entity-group-order');

    // Specimen's fields live under the Specimen group, shown as composed entity.field paths.
    expect(within(specimenGroup).getByText('specimen.fixationTime')).toBeInTheDocument();
    expect(within(specimenGroup).getByText('specimen.legacyType')).toBeInTheDocument();
    expect(within(specimenGroup).queryByText('order.client.nyStatus')).not.toBeInTheDocument();

    expect(within(orderGroup).getByText('order.client.nyStatus')).toBeInTheDocument();
  });

  it('renders each field data type and a status badge (text, not color alone)', async () => {
    renderPage();
    const specimenGroup = await screen.findByTestId('entity-group-specimen');

    expect(within(specimenGroup).getByText('Number')).toBeInTheDocument();

    const badges = screen.getAllByTestId('status-badge');
    const labels = badges.map((b) => b.textContent);
    // Two Active entities + two Active fields = 4 Active badges; one Deprecated field = 1.
    expect(labels.filter((l) => l === 'Active')).toHaveLength(4);
    expect(labels.filter((l) => l === 'Deprecated')).toHaveLength(1);
  });

  it('offers Deprecate for active fields and Retire for deprecated fields', async () => {
    renderPage();
    await screen.findByTestId('entity-group-specimen');

    // Deprecate buttons exist for active entities + active fields; Retire for the deprecated field.
    expect(screen.getAllByRole('button', { name: /deprecate/i }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('button', { name: /^retire$/i })).toHaveLength(1);
  });

  it('shows a field allowed-value set when present', async () => {
    renderPage();
    const orderGroup = await screen.findByTestId('entity-group-order');
    expect(within(orderGroup).getByText('Standard · Priority')).toBeInTheDocument();
  });

  it('Add entity → posts the typed payload (key only when label/description blank)', async () => {
    const created: RegistryEntity = {
      id: 'e9',
      key: 'kit',
      label: 'Kit',
      description: null,
      status: 'Active',
      createdBy: 'admin',
      fields: [],
    };
    const createSpy = vi.spyOn(api, 'createEntity').mockResolvedValue(created);

    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('entity-group-specimen');

    await user.click(screen.getByRole('button', { name: /add entity/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Entity key'), 'kit');
    await user.click(within(dialog).getByRole('button', { name: /add entity/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith({ key: 'kit' }));
  });

  it('Add entity → surfaces a 409 case-insensitive duplicate clearly', async () => {
    vi.spyOn(api, 'createEntity').mockRejectedValue(
      new ApiError("An entity with key 'kit' already exists.", 409),
    );

    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('entity-group-specimen');

    await user.click(screen.getByRole('button', { name: /add entity/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Entity key'), 'Kit');
    await user.click(within(dialog).getByRole('button', { name: /add entity/i }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/already exists/i);
    expect(alert).toHaveTextContent(/kit/); // names the conflicting (canonical) key
  });

  it('Add field → posts (name + dataType + allowedValues) with the entity from the dropdown selection', async () => {
    const addSpy = vi.spyOn(api, 'addField').mockResolvedValue({
      id: 'f9',
      entityId: 'e2',
      name: 'priorityCode',
      dataType: 'String',
      required: false,
      allowedValues: ['A', 'B'],
      description: null,
      status: 'Active',
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('entity-group-specimen');

    // Open the global Add field (the first Add-field button is the page-header action) so the entity
    // must be chosen from the dropdown rather than pre-selected.
    await user.click(screen.getAllByRole('button', { name: /^add field$/i })[0]);
    const dialog = await screen.findByRole('dialog');

    // Select the entity from the dropdown (not free-typed).
    await user.click(within(dialog).getByLabelText('Entity'));
    await user.click(await screen.findByRole('option', { name: /Order/ }));

    await user.type(within(dialog).getByLabelText('Field name'), 'priorityCode');

    // Add two allowed values via the tag input.
    const valueInput = within(dialog).getByLabelText('Add an allowed value');
    await user.type(valueInput, 'A{Enter}');
    await user.type(valueInput, 'B{Enter}');

    await user.click(within(dialog).getByTestId('add-field-submit'));

    await waitFor(() =>
      expect(addSpy).toHaveBeenCalledWith('order', {
        name: 'priorityCode',
        dataType: 'String',
        allowedValues: ['A', 'B'],
      }),
    );
  });
});
