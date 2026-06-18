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
import { PlayRegular, BeakerRegular, CodeRegular } from '@fluentui/react-icons';
import { fonts, radius, space } from '../../theme/tokens';
import { Panel, PageHeader, JsonView, EmptyState, Reveal } from '../../components';
import { api, ApiError } from '../../lib/api';
import { tryParseJson } from '../../lib/utils/json';
import type { EvaluateResponse } from '../../lib/types/api';
import { OutcomesPanel } from './OutcomesPanel';
import { DecisionTracePanel } from './DecisionTracePanel';
import { ValidationBanner } from './ValidationBanner';

const SAMPLE_FACTS = `{
  "test": { "code": "FISH-T-001", "specimen": { "type": "FFPE" }, "orderedTest": "FISH-T-001" },
  "document": { "circledHE": null },
  "specimen": { "type": "FFPE", "age": 5, "fixationTime": 52 },
  "patient": { "age": 45, "gender": "Male" },
  "order": {
    "client": { "nyStatus": "Standard" },
    "performingLab": "Lab-NY-1",
    "specimens": [{ "type": "FFPE" }]
  }
}`;

const useStyles = makeStyles({
  body: {
    padding: space.xxl,
    display: 'flex',
    flexDirection: 'column',
    gap: space.xl,
    maxWidth: '1500px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(360px, 0.85fr) minmax(420px, 1.15fr)',
    gap: space.xl,
    alignItems: 'start',
    '@media (max-width: 1100px)': { gridTemplateColumns: '1fr' },
  },
  rightCol: { display: 'flex', flexDirection: 'column', gap: space.xl, minWidth: 0 },
  editor: {
    width: '100%',
    fontFamily: fonts.mono,
    fontSize: '12.5px',
    lineHeight: 1.7,
    minHeight: '360px',
  },
  actions: { display: 'flex', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' },
  parseError: {
    color: tokens.colorPaletteRedForeground1,
    fontFamily: fonts.mono,
    fontSize: '12px',
  },
  hint: { color: tokens.colorNeutralForeground3 },
  factsAfter: {
    fontSize: '12.5px',
  },
  summary: { display: 'flex', gap: space.md, flexWrap: 'wrap', marginBottom: space.sm },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    paddingInline: space.lg,
    paddingBlock: space.md,
    borderRadius: radius.md,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    minWidth: '110px',
  },
  statNum: {
    fontFamily: fonts.mono,
    fontSize: '24px',
    fontWeight: 500,
    color: tokens.colorBrandForeground1,
  },
  statLabel: {
    fontSize: '11px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
  },
});

export function EvaluatePage() {
  const styles = useStyles();
  const [factsText, setFactsText] = useState(SAMPLE_FACTS);
  const [result, setResult] = useState<EvaluateResponse | null>(null);

  const parsed = tryParseJson<Record<string, unknown>>(factsText);
  const invalid = !parsed.ok;

  const evaluateMutation = useMutation<EvaluateResponse, ApiError>({
    mutationFn: () => {
      if (!parsed.ok) throw new ApiError('Facts JSON is invalid.', 400);
      return api.evaluate({ factsJson: parsed.value });
    },
    onSuccess: (res) => setResult(res),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Evaluate Playground"
        title="Run facts through the active rules."
        lede="Paste a facts document and evaluate it against the active, approved rule set. See the produced outcomes grouped by intent, and a readable decision trace explaining every rule's verdict."
      />

      <div className={styles.body}>
        <div className={styles.grid}>
          {/* Facts input */}
          <Reveal index={0}>
            <Panel
              eyebrow="Input"
              title="Facts document"
              description="A JSON object describing the order, test, specimen, patient, and document."
              actions={
                <Button
                  appearance="subtle"
                  icon={<BeakerRegular />}
                  onClick={() => {
                    setFactsText(SAMPLE_FACTS);
                    setResult(null);
                    evaluateMutation.reset();
                  }}
                >
                  Reset sample
                </Button>
              }
            >
              <Textarea
                textarea={{ className: styles.editor }}
                value={factsText}
                onChange={(_, d) => setFactsText(d.value)}
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
                  appearance="primary"
                  icon={evaluateMutation.isPending ? <Spinner size="tiny" /> : <PlayRegular />}
                  onClick={() => evaluateMutation.mutate()}
                  disabled={invalid || evaluateMutation.isPending}
                >
                  {evaluateMutation.isPending ? 'Evaluating…' : 'Evaluate'}
                </Button>
                <Text size={200} className={styles.hint}>
                  Evaluated as an OrderEvent against all active rules.
                </Text>
              </div>

              {evaluateMutation.isError && (
                <MessageBar intent="error" role="alert">
                  <MessageBarBody>
                    <MessageBarTitle>Evaluation failed</MessageBarTitle>
                    {evaluateMutation.error.message}
                  </MessageBarBody>
                </MessageBar>
              )}
            </Panel>
          </Reveal>

          {/* Results */}
          <div className={styles.rightCol}>
            <Reveal index={1}>
              <Panel eyebrow="Result" title="Outcomes">
                {!result && (
                  <EmptyState
                    icon={<PlayRegular />}
                    title="No evaluation yet"
                    description="Provide facts and select Evaluate to see the produced outcomes here, grouped by intent."
                  />
                )}
                {result && (
                  <>
                    <ValidationBanner validation={result.validation} />
                    <div className={styles.summary}>
                      <div className={styles.stat}>
                        <span className={styles.statNum}>{result.outcomes.length}</span>
                        <span className={styles.statLabel}>Outcomes</span>
                      </div>
                      <div className={styles.stat}>
                        <span className={styles.statNum}>{result.trace.length}</span>
                        <span className={styles.statLabel}>Rules traced</span>
                      </div>
                      <div className={styles.stat}>
                        <span className={styles.statNum}>
                          {result.trace.filter((t) => t.applied).length}
                        </span>
                        <span className={styles.statLabel}>Applied</span>
                      </div>
                    </div>
                    <OutcomesPanel outcomes={result.outcomes} />
                  </>
                )}
              </Panel>
            </Reveal>

            {result && result.trace.length > 0 && (
              <Reveal index={2}>
                <Panel
                  eyebrow="Explanation"
                  title="Decision trace"
                  description="Per-rule reasoning: what applied, why, and what it produced."
                >
                  <DecisionTracePanel trace={result.trace} />
                </Panel>
              </Reveal>
            )}

            {result?.factsAfter && (
              <Reveal index={2}>
                <Panel
                  eyebrow="Derived"
                  title="Facts after run"
                  description="The facts document including any values stamped by Derive-phase rules."
                  actions={
                    <CodeRegular aria-hidden style={{ color: tokens.colorNeutralForeground3 }} />
                  }
                >
                  <JsonView
                    value={result.factsAfter}
                    label="Post-run facts (JSON)"
                    className={styles.factsAfter}
                  />
                </Panel>
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
