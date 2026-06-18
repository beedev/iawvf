import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { FluentProvider } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { iawLightTheme } from '../../theme';
import { ApiReferencePage } from './ApiReferencePage';
import type { OpenApiDocument } from './openapi';

/** A trimmed live-shaped spec: a public auth group + a secured evaluate group with a $ref body. */
const SPEC: OpenApiDocument = {
  openapi: '3.0.0',
  info: { title: 'IAW Validation & Decision Framework — API', version: '0.1.0' },
  components: {
    schemas: {
      LoginDto: {
        type: 'object',
        required: ['username'],
        properties: { username: { type: 'string', example: 'author' } },
      },
      EvaluateRequestDto: {
        type: 'object',
        required: ['factsJson'],
        properties: { factsJson: { type: 'object', additionalProperties: true } },
      },
    },
  },
  paths: {
    '/api/auth/login': {
      post: {
        tags: ['auth'],
        summary: 'Authenticate and obtain a JWT bearer token.',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginDto' } } },
        },
        responses: { '200': { description: '' } },
      },
    },
    '/api/evaluate': {
      post: {
        tags: ['evaluate'],
        summary: 'Evaluate facts against the active rule set.',
        security: [{ bearer: [] }],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/EvaluateRequestDto' } },
          },
        },
        responses: { '200': { description: 'Outcomes.' } },
      },
    },
  },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <FluentProvider theme={iawLightTheme}>
      <QueryClientProvider client={client}>
        <ApiReferencePage />
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('ApiReferencePage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => SPEC,
      } as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches the live spec and renders endpoint groups with counts', async () => {
    renderPage();

    const authGroup = await screen.findByTestId('api-group-auth');
    const evaluateGroup = await screen.findByTestId('api-group-evaluate');

    expect(authGroup).toHaveTextContent('Auth');
    expect(evaluateGroup).toHaveTextContent('Evaluate');
    // Each group has one endpoint → a "1 endpoint" count chip.
    expect(within(authGroup).getByText(/1 endpoint/i)).toBeInTheDocument();
  });

  it('renders a color-coded method badge per endpoint (method text, not color alone)', async () => {
    renderPage();
    await screen.findByTestId('api-group-auth');

    const badges = await screen.findAllByTestId('method-badge');
    const methods = badges.map((b) => b.textContent);
    expect(methods).toContain('POST');
    // Badges carry a data-method attribute that the theme keys color off of.
    expect(badges.every((b) => b.getAttribute('data-method'))).toBe(true);
  });

  it('renders the "Open interactive explorer" link pointing at the API /swagger', async () => {
    renderPage();
    await screen.findByTestId('api-group-auth');

    const link = screen.getByRole('link', { name: /open interactive explorer/i });
    expect(link).toHaveAttribute('href', expect.stringMatching(/\/swagger$/));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('surfaces a graceful error when the spec is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response),
    );
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load the api reference/i);
    expect(alert).toHaveTextContent(/:4000/);
  });
});
