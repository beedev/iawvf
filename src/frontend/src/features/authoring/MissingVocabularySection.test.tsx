import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, render, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { iawLightTheme } from '../../theme';
import { MissingVocabularySection } from './MissingVocabularySection';
import { api, ApiError } from '../../lib/api';
import type { RegistryEntity, RegistryField, TermProposal } from '../../lib/types/api';

const EXISTING_ENTITY_PROPOSAL: TermProposal = {
  phrase: 'fixation time',
  entity: 'specimen',
  field: 'fixationTime',
  path: 'specimen.fixationTime',
  dataType: 'Number',
  entityExists: true,
  rationale: 'The phrase implies a numeric duration on the specimen.',
};

const NEW_ENTITY_PROPOSAL: TermProposal = {
  entity: 'courier',
  field: 'carrier',
  path: 'courier.carrier',
  dataType: 'String',
  allowedValues: ['FedEx', 'UPS'],
  entityExists: false,
  rationale: 'No "courier" entity exists yet; the phrase names a shipping carrier.',
};

const CREATED_FIELD: RegistryField = {
  id: 'f9',
  entityId: 'e1',
  name: 'fixationTime',
  dataType: 'Number',
  required: false,
  allowedValues: [],
  description: null,
  status: 'Active',
};

const CREATED_ENTITY: RegistryEntity = {
  id: 'e9',
  key: 'courier',
  label: 'Courier',
  description: null,
  status: 'Active',
  createdBy: 'admin',
  fields: [],
};

function renderSection(props: {
  proposals: TermProposal[];
  canAdmin: boolean;
  onReinterpret?: () => void;
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onReinterpret = props.onReinterpret ?? vi.fn();
  const utils = render(
    <FluentProvider theme={iawLightTheme}>
      <QueryClientProvider client={client}>
        <MissingVocabularySection
          proposals={props.proposals}
          canAdmin={props.canAdmin}
          onReinterpret={onReinterpret}
        />
      </QueryClientProvider>
    </FluentProvider>,
  );
  return { ...utils, onReinterpret };
}

describe('MissingVocabularySection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an existing-entity proposal with path, "new field" badge, type dropdown, and an Add button (admin)', () => {
    renderSection({ proposals: [EXISTING_ENTITY_PROPOSAL], canAdmin: true });

    const card = screen.getByTestId('term-proposal');
    expect(within(card).getByText('specimen.fixationTime')).toBeInTheDocument();
    expect(within(card).getByText('new field on specimen')).toBeInTheDocument();

    // Data-type dropdown defaults to the proposal's type.
    const typeDropdown = within(card).getByLabelText('Data type for specimen.fixationTime');
    expect(typeDropdown).toHaveTextContent('Number');

    // Admin sees the Add button (and no "admin must add" note).
    expect(within(card).getByTestId('add-to-vocabulary')).toBeInTheDocument();
    expect(within(card).queryByTestId('admin-required-note')).not.toBeInTheDocument();
  });

  it('labels a new-entity proposal with the "new entity" badge', () => {
    renderSection({ proposals: [NEW_ENTITY_PROPOSAL], canAdmin: true });
    const card = screen.getByTestId('term-proposal');
    expect(within(card).getByText('new entity')).toBeInTheDocument();
  });

  it('Add (existing entity) → POSTs the field to that entity and triggers re-interpret', async () => {
    const addField = vi.spyOn(api, 'addField').mockResolvedValue(CREATED_FIELD);
    const createEntity = vi.spyOn(api, 'createEntity');

    const user = userEvent.setup();
    const { onReinterpret } = renderSection({
      proposals: [EXISTING_ENTITY_PROPOSAL],
      canAdmin: true,
    });

    await user.click(screen.getByTestId('add-to-vocabulary'));

    await waitFor(() =>
      expect(addField).toHaveBeenCalledWith('specimen', {
        name: 'fixationTime',
        dataType: 'Number',
      }),
    );
    // Existing entity → never create an entity.
    expect(createEntity).not.toHaveBeenCalled();
    // Auto re-interpret with the original natural language is delegated to the page callback.
    await waitFor(() => expect(onReinterpret).toHaveBeenCalledTimes(1));
  });

  it('Add (new entity) → POSTs the entity first, then the field, then re-interprets', async () => {
    const createEntity = vi.spyOn(api, 'createEntity').mockResolvedValue(CREATED_ENTITY);
    const addField = vi.spyOn(api, 'addField').mockResolvedValue({
      ...CREATED_FIELD,
      name: 'carrier',
      dataType: 'String',
      allowedValues: ['FedEx', 'UPS'],
    });

    const user = userEvent.setup();
    const { onReinterpret } = renderSection({ proposals: [NEW_ENTITY_PROPOSAL], canAdmin: true });

    await user.click(screen.getByTestId('add-to-vocabulary'));

    await waitFor(() => expect(createEntity).toHaveBeenCalledWith({ key: 'courier' }));
    expect(addField).toHaveBeenCalledWith('courier', {
      name: 'carrier',
      dataType: 'String',
      allowedValues: ['FedEx', 'UPS'],
    });
    await waitFor(() => expect(onReinterpret).toHaveBeenCalledTimes(1));
  });

  it('treats a 409 (term already exists) as success and still re-interprets', async () => {
    vi.spyOn(api, 'addField').mockRejectedValue(
      new ApiError("A field 'fixationTime' already exists.", 409),
    );

    const user = userEvent.setup();
    const { onReinterpret } = renderSection({
      proposals: [EXISTING_ENTITY_PROPOSAL],
      canAdmin: true,
    });

    await user.click(screen.getByTestId('add-to-vocabulary'));
    await waitFor(() => expect(onReinterpret).toHaveBeenCalledTimes(1));
  });

  it('surfaces a friendly message on 403 and does NOT re-interpret', async () => {
    vi.spyOn(api, 'addField').mockRejectedValue(new ApiError('Forbidden', 403));

    const user = userEvent.setup();
    const { onReinterpret } = renderSection({
      proposals: [EXISTING_ENTITY_PROPOSAL],
      canAdmin: true,
    });

    await user.click(screen.getByTestId('add-to-vocabulary'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/administrator access is required/i);
    expect(onReinterpret).not.toHaveBeenCalled();
  });

  it('hides the Add button and shows the admin-required note for non-admins', () => {
    renderSection({ proposals: [EXISTING_ENTITY_PROPOSAL], canAdmin: false });
    const card = screen.getByTestId('term-proposal');

    expect(within(card).queryByTestId('add-to-vocabulary')).not.toBeInTheDocument();
    expect(within(card).getByTestId('admin-required-note')).toHaveTextContent(
      /an administrator must add this term, then re-interpret/i,
    );
  });

  it('renders nothing when there are no proposals (grounded result)', () => {
    renderSection({ proposals: [], canAdmin: true });
    expect(screen.queryByTestId('missing-vocabulary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('term-proposal')).not.toBeInTheDocument();
  });
});
