import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, render, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { iawLightTheme } from '../../theme';
import { MissingVocabularySection } from './MissingVocabularySection';
import { api, ApiError } from '../../lib/api';
import type {
  ProposalEvaluation,
  RegistryEntity,
  RegistryField,
  TermProposal,
} from '../../lib/types/api';

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

const IMPROVING_EVALUATION: ProposalEvaluation = {
  improves: true,
  baselineConfidence: 0.2,
  projectedConfidence: 0.75,
  groundsCandidate: true,
  baselineHadCandidate: false,
  unmappedBefore: 2,
  unmappedAfter: 0,
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
  proposalEvaluation?: ProposalEvaluation | null;
  onReinterpret?: () => void;
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onReinterpret = props.onReinterpret ?? vi.fn();
  const utils = render(
    <FluentProvider theme={iawLightTheme}>
      <QueryClientProvider client={client}>
        <MissingVocabularySection
          proposals={props.proposals}
          proposalEvaluation={props.proposalEvaluation ?? null}
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

  it('renders each proposal as a selectable card with path, badge, and type dropdown (admin)', () => {
    renderSection({
      proposals: [EXISTING_ENTITY_PROPOSAL, NEW_ENTITY_PROPOSAL],
      canAdmin: true,
    });

    const cards = screen.getAllByTestId('term-proposal');
    expect(cards).toHaveLength(2);

    const existing = cards[0];
    expect(within(existing).getByText('specimen.fixationTime')).toBeInTheDocument();
    expect(within(existing).getByText('new field on specimen')).toBeInTheDocument();
    expect(within(existing).getByLabelText('Data type for specimen.fixationTime')).toHaveTextContent(
      'Number',
    );
    // Every proposal is selected by default.
    expect(within(existing).getByTestId('select-proposal')).toBeChecked();

    expect(within(cards[1]).getByText('new entity')).toBeInTheDocument();
  });

  it('batch add: 2 selected → builds 2 correct payloads and triggers exactly ONE re-interpret', async () => {
    const createEntity = vi.spyOn(api, 'createEntity').mockResolvedValue(CREATED_ENTITY);
    const addField = vi.spyOn(api, 'addField').mockResolvedValue(CREATED_FIELD);

    const user = userEvent.setup();
    const { onReinterpret } = renderSection({
      proposals: [EXISTING_ENTITY_PROPOSAL, NEW_ENTITY_PROPOSAL],
      canAdmin: true,
      proposalEvaluation: IMPROVING_EVALUATION,
    });

    // Both default-selected → button reflects the count.
    expect(screen.getByTestId('add-batch')).toHaveTextContent('Add 2 selected & re-interpret');

    await user.click(screen.getByTestId('add-batch'));

    // Existing entity → field only (no createEntity for it).
    await waitFor(() =>
      expect(addField).toHaveBeenCalledWith('specimen', {
        name: 'fixationTime',
        dataType: 'Number',
      }),
    );
    // New entity → createEntity first, then its field.
    expect(createEntity).toHaveBeenCalledTimes(1);
    expect(createEntity).toHaveBeenCalledWith({ key: 'courier' });
    expect(addField).toHaveBeenCalledWith('courier', {
      name: 'carrier',
      dataType: 'String',
      allowedValues: ['FedEx', 'UPS'],
    });
    expect(addField).toHaveBeenCalledTimes(2);

    // Exactly ONE re-interpret for the whole batch — NOT one per added term.
    await waitFor(() => expect(onReinterpret).toHaveBeenCalledTimes(1));
  });

  it('only adds SELECTED proposals: deselecting one excludes it from the batch and the re-interpret', async () => {
    const createEntity = vi.spyOn(api, 'createEntity').mockResolvedValue(CREATED_ENTITY);
    const addField = vi.spyOn(api, 'addField').mockResolvedValue(CREATED_FIELD);

    const user = userEvent.setup();
    const { onReinterpret } = renderSection({
      proposals: [EXISTING_ENTITY_PROPOSAL, NEW_ENTITY_PROPOSAL],
      canAdmin: true,
    });

    // Deselect the new-entity proposal (second card).
    const secondCard = screen.getAllByTestId('term-proposal')[1];
    await user.click(within(secondCard).getByTestId('select-proposal'));

    expect(screen.getByTestId('add-batch')).toHaveTextContent('Add 1 selected & re-interpret');

    await user.click(screen.getByTestId('add-batch'));

    await waitFor(() => expect(addField).toHaveBeenCalledTimes(1));
    expect(addField).toHaveBeenCalledWith('specimen', { name: 'fixationTime', dataType: 'Number' });
    // The deselected new-entity proposal was never created or added.
    expect(createEntity).not.toHaveBeenCalled();
    await waitFor(() => expect(onReinterpret).toHaveBeenCalledTimes(1));
  });

  it('delta render: shows baseline→projected percentages and the "complete rule" note', () => {
    renderSection({
      proposals: [EXISTING_ENTITY_PROPOSAL],
      canAdmin: true,
      proposalEvaluation: IMPROVING_EVALUATION,
    });

    const delta = screen.getByTestId('proposal-delta');
    expect(within(delta).getByTestId('delta-baseline')).toHaveTextContent('20%');
    expect(within(delta).getByTestId('delta-projected')).toHaveTextContent('75%');
    expect(within(delta).getByTestId('delta-complete-rule')).toHaveTextContent(
      /produce a complete rule/i,
    );
  });

  it('delta render: omits the "complete rule" note when the baseline already had a candidate', () => {
    renderSection({
      proposals: [EXISTING_ENTITY_PROPOSAL],
      canAdmin: true,
      proposalEvaluation: { ...IMPROVING_EVALUATION, baselineHadCandidate: true },
    });

    const delta = screen.getByTestId('proposal-delta');
    expect(within(delta).getByTestId('delta-baseline')).toHaveTextContent('20%');
    expect(within(delta).queryByTestId('delta-complete-rule')).not.toBeInTheDocument();
  });

  it('does NOT re-interpret per individual add — a single batch click yields one re-interpret', async () => {
    vi.spyOn(api, 'createEntity').mockResolvedValue(CREATED_ENTITY);
    const addField = vi.spyOn(api, 'addField').mockResolvedValue(CREATED_FIELD);

    const user = userEvent.setup();
    const { onReinterpret } = renderSection({
      proposals: [EXISTING_ENTITY_PROPOSAL, NEW_ENTITY_PROPOSAL],
      canAdmin: true,
    });

    await user.click(screen.getByTestId('add-batch'));

    await waitFor(() => expect(addField).toHaveBeenCalledTimes(2));
    // Two terms added, but re-interpret fired exactly once (no per-add loop).
    expect(onReinterpret).toHaveBeenCalledTimes(1);
  });

  it('treats a 409 (term already exists) as success and still re-interprets once', async () => {
    vi.spyOn(api, 'addField').mockRejectedValue(
      new ApiError("A field 'fixationTime' already exists.", 409),
    );

    const user = userEvent.setup();
    const { onReinterpret } = renderSection({
      proposals: [EXISTING_ENTITY_PROPOSAL],
      canAdmin: true,
    });

    await user.click(screen.getByTestId('add-batch'));
    await waitFor(() => expect(onReinterpret).toHaveBeenCalledTimes(1));
  });

  it('surfaces a friendly message on 403 and does NOT re-interpret', async () => {
    vi.spyOn(api, 'addField').mockRejectedValue(new ApiError('Forbidden', 403));

    const user = userEvent.setup();
    const { onReinterpret } = renderSection({
      proposals: [EXISTING_ENTITY_PROPOSAL],
      canAdmin: true,
    });

    await user.click(screen.getByTestId('add-batch'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/administrator access is required/i);
    expect(onReinterpret).not.toHaveBeenCalled();
  });

  it('non-admin → read-only: no select checkbox, no add button, shows the admin-required note', () => {
    renderSection({ proposals: [EXISTING_ENTITY_PROPOSAL], canAdmin: false });

    expect(screen.queryByTestId('add-batch')).not.toBeInTheDocument();
    expect(screen.queryByTestId('select-proposal')).not.toBeInTheDocument();
    expect(screen.getByTestId('admin-required-note')).toHaveTextContent(
      /an administrator must add these terms/i,
    );
  });

  it('renders nothing when there are no proposals (the candidate stands on its own)', () => {
    renderSection({ proposals: [], canAdmin: true, proposalEvaluation: null });
    expect(screen.queryByTestId('missing-vocabulary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('term-proposal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('proposal-delta')).not.toBeInTheDocument();
  });
});
