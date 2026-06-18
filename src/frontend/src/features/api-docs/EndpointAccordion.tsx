import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  makeStyles,
  tokens,
  Text,
} from '@fluentui/react-components';
import { LockClosedRegular } from '@fluentui/react-icons';
import { fonts, radius, space } from '../../theme/tokens';
import { JsonView } from '../../components/JsonView';
import { MethodBadge } from './MethodBadge';
import { SchemaTable } from './SchemaTable';
import type { ApiEndpoint } from './openapi';

/**
 * One collapsible row per endpoint. The (always-visible) header carries the method badge, the mono
 * path, an auth-lock indicator, and the summary so the list is scannable when collapsed. Expanding
 * reveals the description, path/query parameters, the request body schema, and the primary success
 * response shape + example.
 */

const useStyles = makeStyles({
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
    width: '100%',
    minWidth: 0,
    flexWrap: 'wrap',
  },
  path: {
    fontFamily: fonts.mono,
    fontSize: '13.5px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
    wordBreak: 'break-all',
  },
  lock: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground3,
  },
  publicTag: {
    fontSize: '11px',
    fontWeight: 600,
    color: tokens.colorStatusSuccessForeground1,
  },
  summary: {
    color: tokens.colorNeutralForeground3,
    fontSize: '12.5px',
    fontWeight: 400,
    flexBasis: '100%',
  },
  panel: { display: 'flex', flexDirection: 'column', gap: space.lg, paddingBlock: space.sm },
  section: { display: 'flex', flexDirection: 'column', gap: space.sm },
  sectionLabel: {
    fontSize: '10.5px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground4,
  },
  description: { color: tokens.colorNeutralForeground2, fontSize: '13.5px', lineHeight: 1.55 },
  typePill: {
    alignSelf: 'flex-start',
    fontFamily: fonts.mono,
    fontSize: '12px',
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorBrandBackground2,
    borderRadius: radius.sm,
    paddingInline: '8px',
    paddingBlock: '2px',
  },
});

export interface EndpointAccordionProps {
  endpoints: ApiEndpoint[];
}

export function EndpointAccordion({ endpoints }: EndpointAccordionProps) {
  const styles = useStyles();

  return (
    <Accordion collapsible multiple>
      {endpoints.map((endpoint) => (
        <AccordionItem
          key={endpoint.id}
          value={endpoint.id}
          data-testid={`endpoint-${endpoint.method}-${endpoint.path}`}
        >
          <AccordionHeader>
            <span className={styles.header}>
              <MethodBadge method={endpoint.method} />
              <span className={styles.path}>{endpoint.path}</span>
              {endpoint.requiresAuth ? (
                <span className={styles.lock}>
                  <LockClosedRegular aria-hidden fontSize={14} />
                  Bearer
                </span>
              ) : (
                <span className={styles.publicTag}>Public</span>
              )}
              {endpoint.summary && <span className={styles.summary}>{endpoint.summary}</span>}
            </span>
          </AccordionHeader>
          <AccordionPanel>
            <div className={styles.panel}>
              {endpoint.description && endpoint.description !== endpoint.summary && (
                <Text as="p" className={styles.description}>
                  {endpoint.description}
                </Text>
              )}

              {endpoint.parameters.length > 0 && (
                <div className={styles.section}>
                  <span className={styles.sectionLabel}>Parameters</span>
                  <SchemaTable
                    caption={`Parameters for ${endpoint.method} ${endpoint.path}`}
                    fields={endpoint.parameters.map((p) => ({
                      name: `${p.name} (${p.in})`,
                      type: p.schema ? (p.schema.type ?? 'string') : 'string',
                      required: Boolean(p.required),
                      description: p.description,
                    }))}
                  />
                </div>
              )}

              {endpoint.requestBody && (
                <div className={styles.section}>
                  <span className={styles.sectionLabel}>
                    Request body · {endpoint.requestBody.typeLabel}
                  </span>
                  <SchemaTable
                    caption={`Request body for ${endpoint.method} ${endpoint.path}`}
                    fields={endpoint.requestBody.fields}
                  />
                  {endpoint.requestBody.example !== undefined && (
                    <JsonView
                      value={endpoint.requestBody.example}
                      label={`Example request body for ${endpoint.method} ${endpoint.path}`}
                    />
                  )}
                </div>
              )}

              {endpoint.successResponse && (
                <div className={styles.section}>
                  <span className={styles.sectionLabel}>
                    Response · {endpoint.successResponse.status}
                    {endpoint.successResponse.schema
                      ? ` · ${endpoint.successResponse.schema.typeLabel}`
                      : ''}
                  </span>
                  {endpoint.successResponse.description && (
                    <Text as="p" className={styles.description}>
                      {endpoint.successResponse.description}
                    </Text>
                  )}
                  {endpoint.successResponse.schema &&
                    endpoint.successResponse.schema.fields.length > 0 && (
                      <SchemaTable
                        caption={`Success response for ${endpoint.method} ${endpoint.path}`}
                        fields={endpoint.successResponse.schema.fields}
                      />
                    )}
                  {endpoint.successResponse.schema?.example !== undefined && (
                    <JsonView
                      value={endpoint.successResponse.schema.example}
                      label={`Example response for ${endpoint.method} ${endpoint.path}`}
                    />
                  )}
                </div>
              )}

              {!endpoint.requestBody &&
                !endpoint.successResponse &&
                endpoint.parameters.length === 0 && (
                  <Text as="p" className={styles.description}>
                    No request body or parameters — call this endpoint directly.
                  </Text>
                )}
            </div>
          </AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
