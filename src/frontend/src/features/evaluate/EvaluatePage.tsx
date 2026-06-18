import { useMemo, useState } from 'react';
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
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
} from '@fluentui/react-components';
import { PlayRegular, BeakerRegular, CodeRegular, LightbulbRegular } from '@fluentui/react-icons';
import { fonts, radius, space } from '../../theme/tokens';
import { Panel, PageHeader, JsonView, EmptyState, Reveal, StatusBadge } from '../../components';
import { api, ApiError } from '../../lib/api';
import { tryParseJson } from '../../lib/utils/json';
import type { EvaluateResponse, TriggerType } from '../../lib/types/api';
import { OutcomesPanel } from './OutcomesPanel';
import { DecisionTracePanel } from './DecisionTracePanel';
import { ValidationBanner } from './ValidationBanner';
import { VerdictBanner } from './VerdictBanner';
import { ScenarioPicker } from './ScenarioPicker';
import { computeVerdict } from './resultModel';
import { SCENARIOS, type Scenario } from './scenarios';

/** The default starter facts: a well-formed FFPE order that proceeds (the first library scenario). */
const DEFAULT_SCENARIO = SCENARIOS[0];
const SAMPLE_FACTS = JSON.stringify(DEFAULT_SCENARIO.factsJson, null, 2);

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
    minHeight: '340px',
  },
  actions: { display: 'flex', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' },
  parseError: {
    color: tokens.colorPaletteRedForeground1,
    fontFamily: fonts.mono,
    fontSize: '12px',
  },
  hint: { color: tokens.colorNeutralForeground3 },
  factsAfter: { fontSize: '12.5px' },
  scenarioCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  scenarioHead: { display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  scenarioName: { fontFamily: fonts.display, fontSize: '15px', fontWeight: 600 },
  scenarioDesc: { color: tokens.colorNeutralForeground2, fontSize: '12.5px' },
  resultStack: { display: 'flex', flexDirection: 'column', gap: space.lg },
  traceLegend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.md,
    color: tokens.colorNeutralForeground3,
    fontSize: '12px',
    marginBottom: space.sm,
  },
  accordionSurface: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
});

export function EvaluatePage() {
  const styles = useStyles();
  const [factsText, setFactsText] = useState(SAMPLE_FACTS);
  const [result, setResult] = useState<EvaluateResponse | null>(null);
  const [trigger, setTrigger] = useState<TriggerType | null>(null);
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(DEFAULT_SCENARIO);

  const parsed = tryParseJson<Record<string, unknown>>(factsText);
  const invalid = !parsed.ok;

  const verdict = useMemo(
    () => (result ? computeVerdict(result.outcomes) : null),
    [result],
  );

  const evaluateMutation = useMutation<EvaluateResponse, ApiError>({
    mutationFn: () => {
      if (!parsed.ok) throw new ApiError('Facts JSON is invalid.', 400);
      return api.evaluate({ factsJson: parsed.value, triggerType: trigger });
    },
    onSuccess: (res) => setResult(res),
  });

  function loadScenario(s: Scenario) {
    setFactsText(JSON.stringify(s.factsJson, null, 2));
    setTrigger(s.triggerType ?? null);
    setActiveScenario(s);
    setResult(null);
    evaluateMutation.reset();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Evaluate Playground"
        title="Run facts through the active rules."
        lede="Load a curated example or paste your own facts, then evaluate against the active, approved rule set. The result leads with a plain-language verdict; the per-rule reasoning is one click away."
      />

      <div className={styles.body}>
        <div className={styles.grid}>
          {/* Facts input */}
          <Reveal index={0}>
            <Panel
              eyebrow="Input"
              title="Facts document"
              description="A JSON object describing the order, test, specimen, patient, and document."
              actions={<ScenarioPicker onSelect={loadScenario} />}
            >
              {activeScenario && (
                <div className={styles.scenarioCard} data-testid="scenario-info">
                  <div className={styles.scenarioHead}>
                    <LightbulbRegular aria-hidden style={{ color: tokens.colorBrandForeground1 }} />
                    <span className={styles.scenarioName}>{activeScenario.name}</span>
                    <StatusBadge
                      kind={
                        activeScenario.category === 'passes'
                          ? 'success'
                          : activeScenario.category === 'derives'
                            ? 'info'
                            : 'warning'
                      }
                    >
                      {activeScenario.expected}
                    </StatusBadge>
                  </div>
                  <Text className={styles.scenarioDesc} as="p">
                    {activeScenario.description}
                  </Text>
                </div>
              )}

              <Textarea
                textarea={{ className: styles.editor }}
                value={factsText}
                onChange={(_, d) => {
                  setFactsText(d.value);
                  setActiveScenario(null);
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
                  appearance="primary"
                  icon={evaluateMutation.isPending ? <Spinner size="tiny" /> : <PlayRegular />}
                  onClick={() => evaluateMutation.mutate()}
                  disabled={invalid || evaluateMutation.isPending}
                >
                  {evaluateMutation.isPending ? 'Running…' : 'Run'}
                </Button>
                <Button
                  appearance="subtle"
                  icon={<BeakerRegular />}
                  onClick={() => loadScenario(DEFAULT_SCENARIO)}
                >
                  Reset
                </Button>
                <Text size={200} className={styles.hint}>
                  Evaluated as {trigger ?? 'an OrderEvent'} against all active rules.
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
              <Panel eyebrow="Result" title="Verdict">
                {!result && (
                  <EmptyState
                    icon={<PlayRegular />}
                    title="No evaluation yet"
                    description="Load an example or paste facts, then select Run to see the verdict — whether the order passes, or which holds and alerts were raised."
                  />
                )}
                {result && verdict && (
                  <div className={styles.resultStack}>
                    <VerdictBanner summary={verdict} />
                    <ValidationBanner validation={result.validation} />
                    <OutcomesPanel outcomes={result.outcomes} />
                  </div>
                )}
              </Panel>
            </Reveal>

            {result && result.trace.length > 0 && (
              <Reveal index={2}>
                <Panel
                  eyebrow="Explainability"
                  title="Why? — per-rule reasoning"
                  description="Every rule's verdict for these facts: whether it applied, whether its assertion passed, and what it produced."
                >
                  <div className={styles.traceLegend} aria-hidden>
                    <span>Applied / Not applied — did the rule’s conditions match these facts?</span>
                    <span>Assert passed / failed — did the rule’s requirement hold?</span>
                  </div>
                  <div className={styles.accordionSurface}>
                    <Accordion collapsible data-testid="trace-collapsible">
                      <AccordionItem value="trace">
                        <AccordionHeader>
                          Show the decision trace ({result.trace.length} rule
                          {result.trace.length === 1 ? '' : 's'})
                        </AccordionHeader>
                        <AccordionPanel>
                          <DecisionTracePanel trace={result.trace} />
                        </AccordionPanel>
                      </AccordionItem>
                    </Accordion>
                  </div>
                </Panel>
              </Reveal>
            )}

            {result?.factsAfter && (
              <Reveal index={2}>
                <Panel
                  eyebrow="Derived"
                  title="Facts after run"
                  description="The facts document including any values stamped by Derive-phase rules (e.g. a defaulted body site or pediatric priority)."
                  actions={
                    <CodeRegular aria-hidden style={{ color: tokens.colorNeutralForeground3 }} />
                  }
                >
                  <Accordion collapsible>
                    <AccordionItem value="facts-after">
                      <AccordionHeader>Show post-run facts</AccordionHeader>
                      <AccordionPanel>
                        <JsonView
                          value={result.factsAfter}
                          label="Post-run facts (JSON)"
                          className={styles.factsAfter}
                        />
                      </AccordionPanel>
                    </AccordionItem>
                  </Accordion>
                </Panel>
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
