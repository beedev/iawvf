import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  makeStyles,
  tokens,
  Button,
  Textarea,
  Text,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from '@fluentui/react-components';
import { CheckmarkCircleRegular, BeakerRegular } from '@fluentui/react-icons';
import { fonts, radius, space } from '../../theme/tokens';
import { Panel } from '../../components';
import { api, ApiError } from '../../lib/api';
import { tryParseJson } from '../../lib/utils/json';
import type { FactValidationResult } from '../../lib/types/api';

const SAMPLE_FACTS = `{
  "specimen": { "type": "FFPE", "fixationTime": 12 },
  "patient": { "gender": "Male", "age": 40 }
}`;

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: space.md },
  editor: { width: '100%', fontFamily: fonts.mono, fontSize: '12.5px', lineHeight: 1.6, minHeight: '140px' },
  actions: { display: 'flex', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' },
  parseError: { color: tokens.colorPaletteRedForeground1, fontFamily: fonts.mono, fontSize: '12px' },
  list: {
    listStyle: 'none',
    margin: 0,
    marginTop: space.sm,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
    maxHeight: '200px',
    overflowY: 'auto',
  },
  item: { display: 'flex', flexDirection: 'column', gap: '1px', padding: space.sm, borderRadius: radius.sm, backgroundColor: tokens.colorNeutralBackground3 },
  path: { fontFamily: fonts.mono, fontSize: '12px', color: tokens.colorPaletteDarkOrangeForeground1 },
  message: { fontSize: '12.5px', color: tokens.colorNeutralForeground2 },
  hint: { color: tokens.colorNeutralForeground3 },
});

/**
 * A small "Validate facts" panel that POSTs a fact document to the registry validator and renders the
 * findings — a live demonstration that the registry is a TYPED schema, not free text. Validation is
 * lenient (only known entities are checked; extra fields are tolerated), so a clean result confirms the
 * facts match the modeled entities/fields.
 */
export function ValidateFactsPanel() {
  const styles = useStyles();
  const [factsText, setFactsText] = useState(SAMPLE_FACTS);
  const [result, setResult] = useState<FactValidationResult | null>(null);

  const parsed = tryParseJson<Record<string, unknown>>(factsText);
  const invalid = !parsed.ok;

  const validateMutation = useMutation<FactValidationResult, ApiError>({
    mutationFn: () => {
      if (!parsed.ok) throw new ApiError('Facts JSON is invalid.', 400);
      return api.validateFacts({ facts: parsed.value });
    },
    onSuccess: (res) => setResult(res),
  });

  return (
    <Panel
      eyebrow="Try it"
      title="Validate facts against the registry"
      description="Paste a fact document to see how it validates against the typed entity schemas."
    >
      <div className={styles.body}>
        <Textarea
          textarea={{ className: styles.editor }}
          value={factsText}
          onChange={(_, d) => {
            setFactsText(d.value);
            setResult(null);
          }}
          aria-label="Facts JSON document"
          aria-invalid={invalid}
          resize="vertical"
          spellCheck={false}
        />
        {invalid && (
          <Text className={styles.parseError} as="p" role="alert">
            JSON parse error: {parsed.error}
          </Text>
        )}
        <div className={styles.actions}>
          <Button
            appearance="secondary"
            icon={validateMutation.isPending ? <Spinner size="tiny" /> : <BeakerRegular />}
            onClick={() => validateMutation.mutate()}
            disabled={invalid || validateMutation.isPending}
          >
            {validateMutation.isPending ? 'Validating…' : 'Validate'}
          </Button>
          <Text size={200} className={styles.hint}>
            Lenient: only known entities are checked; unmodelled keys are ignored.
          </Text>
        </div>

        {validateMutation.isError && (
          <MessageBar intent="error" role="alert">
            <MessageBarBody>
              <MessageBarTitle>Validation request failed</MessageBarTitle>
              {validateMutation.error.message}
            </MessageBarBody>
          </MessageBar>
        )}

        {result && result.valid && (
          <MessageBar intent="success" role="status" icon={<CheckmarkCircleRegular />}>
            <MessageBarBody>
              <MessageBarTitle>These facts match the registry</MessageBarTitle>
              No type, enum, or required-field violations were found.
            </MessageBarBody>
          </MessageBar>
        )}

        {result && !result.valid && (
          <MessageBar intent="warning" role="status">
            <MessageBarBody>
              <MessageBarTitle>
                {result.errors.length} fact{result.errors.length === 1 ? '' : 's'} did not match the
                registry schema
              </MessageBarTitle>
              <ul className={styles.list} aria-label="Validation findings">
                {result.errors.map((err, i) => (
                  <li key={`${err.path}-${i}`} className={styles.item}>
                    <span className={styles.path}>{err.path}</span>
                    <span className={styles.message}>{err.message}</span>
                  </li>
                ))}
              </ul>
            </MessageBarBody>
          </MessageBar>
        )}
      </div>
    </Panel>
  );
}
