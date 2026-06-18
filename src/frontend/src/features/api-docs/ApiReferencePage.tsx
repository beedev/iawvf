import { useQuery } from '@tanstack/react-query';
import {
  makeStyles,
  tokens,
  Button,
  Link,
  Text,
  Skeleton,
  SkeletonItem,
} from '@fluentui/react-components';
import { OpenRegular, BracesRegular } from '@fluentui/react-icons';
import { fonts, radius, space } from '../../theme/tokens';
import { PageHeader, Panel, ErrorState } from '../../components';
import { Reveal } from '../../components/Reveal';
import { API_BASE_URL } from '../../lib/api';
import { buildApiReference, type ApiReference, type OpenApiDocument } from './openapi';
import { EndpointAccordion } from './EndpointAccordion';

/**
 * The in-app API Reference. It is generated LIVE from the server's OpenAPI document
 * (`GET /swagger-json`, public + CORS-enabled) so it can never drift from the running service. The
 * raw spec is fetched with TanStack Query (no auth header — the endpoint is open), reshaped by the
 * pure {@link buildApiReference} transform into tag-grouped endpoints, and rendered as scannable,
 * collapsible rows. A prominent link hands off to the interactive Swagger explorer for live calls.
 */

const SWAGGER_URL = `${API_BASE_URL}/swagger`;
const SPEC_URL = `${API_BASE_URL}/swagger-json`;

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.xl,
    paddingInline: space.xxl,
    paddingBlock: space.xxl,
    maxWidth: '1080px',
  },
  groupMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
  },
  count: {
    fontSize: '11px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground3,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: radius.pill,
    paddingInline: '9px',
    paddingBlock: '2px',
  },
  rawLink: {
    fontFamily: fonts.mono,
    fontSize: '12.5px',
  },
  intro: { display: 'flex', flexDirection: 'column', gap: space.sm },
  introMeta: { color: tokens.colorNeutralForeground3, fontSize: '13px' },
  skeletonRow: { display: 'flex', flexDirection: 'column', gap: space.md },
  skItem: { height: '44px', borderRadius: radius.md },
});

function ReferenceSkeleton() {
  const styles = useStyles();
  return (
    <Skeleton aria-label="Loading API reference">
      <div className={styles.skeletonRow}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonItem key={i} className={styles.skItem} />
        ))}
      </div>
    </Skeleton>
  );
}

async function fetchSpec(signal?: AbortSignal): Promise<ApiReference> {
  const response = await fetch(SPEC_URL, { headers: { Accept: 'application/json' }, signal });
  if (!response.ok) {
    throw new Error(`The OpenAPI spec request failed (${response.status}).`);
  }
  const doc = (await response.json()) as OpenApiDocument;
  return buildApiReference(doc);
}

export function ApiReferencePage() {
  const styles = useStyles();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['openapi-spec', SPEC_URL],
    queryFn: ({ signal }) => fetchSpec(signal),
    staleTime: 5 * 60_000,
  });

  return (
    <>
      <PageHeader
        eyebrow="Developer reference"
        title="API Reference"
        lede={
          <>
            The entire Validation &amp; Decision Framework is available over REST. This reference is
            generated live from the server&rsquo;s OpenAPI specification, so it always matches the
            running service.
          </>
        }
        actions={
          <>
            <Button
              as="a"
              appearance="primary"
              icon={<OpenRegular />}
              href={SWAGGER_URL}
              target="_blank"
              rel="noreferrer"
            >
              Open interactive explorer (Swagger)
            </Button>
            <Button
              as="a"
              appearance="outline"
              icon={<BracesRegular />}
              href={SPEC_URL}
              target="_blank"
              rel="noreferrer"
            >
              Raw spec (JSON)
            </Button>
          </>
        }
      />

      <div className={styles.page}>
        <Panel
          as="section"
          eyebrow="How to read this"
          title="Live from the OpenAPI specification"
        >
          <div className={styles.intro}>
            <Text className={styles.introMeta}>
              Endpoints are grouped by their API tag. Each row shows the HTTP method, the path, an
              authentication indicator, and a short summary; expand a row for parameters, the request
              body schema, and the primary success response. For live calls with a bearer token, use
              the{' '}
              <Link href={SWAGGER_URL} target="_blank" rel="noreferrer">
                interactive Swagger explorer
              </Link>
              . The machine-readable spec lives at{' '}
              <Link className={styles.rawLink} href={SPEC_URL} target="_blank" rel="noreferrer">
                {SPEC_URL}
              </Link>
              .
            </Text>
            {data && (
              <Text className={styles.introMeta}>
                {data.title}
                {data.version ? ` · v${data.version}` : ''} · {data.endpointCount} endpoints across{' '}
                {data.groups.length} groups.
              </Text>
            )}
          </div>
        </Panel>

        {isLoading && (
          <Panel as="section" title="Endpoints">
            <ReferenceSkeleton />
          </Panel>
        )}

        {isError && (
          <ErrorState
            title="Could not load the API reference"
            message={
              error instanceof Error
                ? `${error.message} Start the API at :4000 (it must be reachable from this origin) and try again.`
                : 'Start the API at :4000 and try again.'
            }
            onRetry={() => void refetch()}
          />
        )}

        {data &&
          data.groups.map((group, index) => (
            <Reveal key={group.id} index={index} as="section">
              <Panel
                as="article"
                eyebrow="Endpoint group"
                title={
                  <span className={styles.groupMeta} data-testid={`api-group-${group.id}`}>
                    {group.title}
                    <span className={styles.count}>
                      {group.endpoints.length}{' '}
                      {group.endpoints.length === 1 ? 'endpoint' : 'endpoints'}
                    </span>
                  </span>
                }
                flush
              >
                <div style={{ padding: `0 ${space.lg}` }}>
                  <EndpointAccordion endpoints={group.endpoints} />
                </div>
              </Panel>
            </Reveal>
          ))}
      </div>
    </>
  );
}
