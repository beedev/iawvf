import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  makeStyles,
  tokens,
  Button,
  Textarea,
  Text,
  Tab,
  TabList,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Tooltip,
  shorthands,
} from '@fluentui/react-components';
import {
  SparkleRegular,
  TextGrammarWandRegular,
  CheckmarkStarburstRegular,
  PlayRegular,
  SaveRegular,
  DocumentEditRegular,
  LightbulbRegular,
} from '@fluentui/react-icons';
import { fonts, radius, space } from '../../theme/tokens';
import {
  Panel,
  ConfidenceMeter,
  JsonView,
  LintFindings,
  StatusBadge,
  EmptyState,
  PageHeader,
  Reveal,
} from '../../components';
import { api, type ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { prettyJson, tryParseJson } from '../../lib/utils/json';
import type { DryRunResponse, InterpretResponse, LintReport, RuleJson } from '../../lib/types/api';
import { EXAMPLE_PROMPTS } from './examples';
import { DryRunResults } from './DryRunResults';
import { SaveRuleDialog } from './SaveRuleDialog';
import { ScopeSelector } from './ScopeSelector';
import {
  type ScopeSelection,
  EMPTY_SCOPE,
  isUnscoped,
  buildInterpretScope,
  buildSaveRuleJson,
} from './scope';
import { ScopeChips } from '../../components';

const INTERPRETER_VERSION = 'llm-v1';

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
    gridTemplateColumns: 'minmax(360px, 0.95fr) minmax(420px, 1.15fr)',
    gap: space.xl,
    alignItems: 'start',
    '@media (max-width: 1100px)': { gridTemplateColumns: '1fr' },
  },
  rightCol: { display: 'flex', flexDirection: 'column', gap: space.xl, minWidth: 0 },
  textarea: { width: '100%' },
  textareaInner: { fontFamily: fonts.body, fontSize: '15px', lineHeight: 1.55, minHeight: '150px' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: space.sm },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    paddingInline: space.md,
    paddingBlock: '7px',
    borderRadius: radius.pill,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground2,
    fontSize: '12.5px',
    cursor: 'pointer',
    textAlign: 'left',
    maxWidth: '100%',
    transition: 'border-color 0.14s ease, background-color 0.14s ease',
    ':hover': {
      ...shorthands.borderColor(tokens.colorBrandStroke1),
      backgroundColor: tokens.colorBrandBackground2,
    },
  },
  chipIcon: { color: tokens.colorBrandForeground1, flexShrink: 0 },
  chipLabel: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  inputActions: { display: 'flex', gap: space.sm, alignItems: 'center' },
  flowLabel: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground4,
  },
  gapList: { display: 'flex', flexWrap: 'wrap', gap: space.sm },
  paraphrase: {
    fontFamily: fonts.display,
    fontSize: '17px',
    lineHeight: 1.5,
    fontStyle: 'italic',
    color: tokens.colorNeutralForeground1,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: tokens.colorNeutralBackground2,
    borderInlineStartWidth: '3px',
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: tokens.colorBrandStroke1,
  },
  jsonEditor: {
    width: '100%',
    fontFamily: fonts.mono,
    fontSize: '12.5px',
    lineHeight: 1.7,
    minHeight: '320px',
  },
  toolbar: { display: 'flex', flexWrap: 'wrap', gap: space.sm },
  parseError: {
    color: tokens.colorPaletteRedForeground1,
    fontFamily: fonts.mono,
    fontSize: '12px',
  },
  scopedTo: { display: 'flex', flexDirection: 'column', gap: space.sm },
});

type RuleTab = 'view' | 'edit';

export function AuthoringPage() {
  const styles = useStyles();
  const { hasRole } = useAuth();
  const canAuthor = hasRole('Author');

  const [nl, setNl] = useState('');
  const [scope, setScope] = useState<ScopeSelection>(EMPTY_SCOPE);
  const [interpretedScope, setInterpretedScope] = useState<ScopeSelection>(EMPTY_SCOPE);
  const [interpretation, setInterpretation] = useState<InterpretResponse | null>(null);
  const [ruleJson, setRuleJson] = useState<RuleJson | null>(null);
  const [editorText, setEditorText] = useState('');
  const [tab, setTab] = useState<RuleTab>('view');
  const [paraphrase, setParaphrase] = useState<string | null>(null);
  const [lintReport, setLintReport] = useState<LintReport | null>(null);
  const [dryRun, setDryRun] = useState<DryRunResponse | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);

  const adoptCandidate = (candidate: RuleJson | null) => {
    setRuleJson(candidate);
    setEditorText(candidate ? prettyJson(candidate) : '');
    setParaphrase(null);
    setLintReport(null);
    setDryRun(null);
  };

  const interpretMutation = useMutation({
    mutationFn: (text: string) =>
      api.interpret({ naturalLanguage: text, ...buildInterpretScope(scope) }),
    onSuccess: (res) => {
      setInterpretation(res);
      setInterpretedScope(scope);
      adoptCandidate(res.candidate);
      setTab('view');
    },
  });

  const paraphraseMutation = useMutation({
    mutationFn: (rule: RuleJson) => api.paraphrase(rule),
    onSuccess: (res) => setParaphrase(res.paraphrase),
  });

  const lintMutation = useMutation({
    mutationFn: (rule: RuleJson) => api.lint(rule),
    onSuccess: (res) => setLintReport(res),
  });

  const dryRunMutation = useMutation({
    mutationFn: (rule: RuleJson) => api.dryRun(rule),
    onSuccess: (res) => setDryRun(res),
  });

  /** When in edit mode, parse the editor before any rule action; surface parse errors inline. */
  const parsed = tab === 'edit' ? tryParseJson<RuleJson>(editorText) : null;
  const effectiveRule: RuleJson | null =
    tab === 'edit' ? (parsed?.ok ? parsed.value : null) : ruleJson;
  const editorInvalid = tab === 'edit' && parsed !== null && !parsed.ok;

  const commitEdit = (): RuleJson | null => {
    if (tab === 'edit' && parsed?.ok) {
      setRuleJson(parsed.value);
      return parsed.value;
    }
    return effectiveRule;
  };

  const runParaphrase = () => {
    const rule = commitEdit();
    if (rule) paraphraseMutation.mutate(rule);
  };
  const runLint = () => {
    const rule = commitEdit();
    if (rule) lintMutation.mutate(rule);
  };
  const runDryRun = () => {
    const rule = commitEdit();
    if (rule) dryRunMutation.mutate(rule);
  };

  const interpretError = interpretMutation.error as ApiError | null;
  const hasRule = effectiveRule !== null;

  // Summary chips of the scope that was actually sent with the last interpret, shown near the result.
  const interpretedChips = (() => {
    if (isUnscoped(interpretedScope)) return [];
    if (interpretedScope.objects.length > 0) {
      return interpretedScope.objects.map((name) => {
        const props = interpretedScope.properties
          .filter((path) => path.startsWith(`${name}.`))
          .map((path) => path.slice(name.length + 1));
        return { name, label: name.charAt(0).toUpperCase() + name.slice(1), properties: props };
      });
    }
    // Properties without an explicit object selection: group by first segment.
    const byObject = new Map<string, string[]>();
    for (const path of interpretedScope.properties) {
      const dot = path.indexOf('.');
      const name = dot === -1 ? path : path.slice(0, dot);
      const prop = dot === -1 ? '' : path.slice(dot + 1);
      const list = byObject.get(name) ?? [];
      if (prop) list.push(prop);
      byObject.set(name, list);
    }
    return [...byObject.entries()].map(([name, properties]) => ({
      name,
      label: name.charAt(0).toUpperCase() + name.slice(1),
      properties,
    }));
  })();

  return (
    <div>
      <PageHeader
        eyebrow="Authoring Workspace"
        title="Describe a rule. See exactly how it is read."
        lede="Write the validation rule in plain English, interpret it into the controlled vocabulary, then paraphrase, lint, and dry-run before saving. Unmapped terms are surfaced — never invented."
      />

      <div className={styles.body}>
        <div className={styles.grid}>
          {/* ── Column 1: natural-language input ── */}
          <Reveal index={0}>
            <Panel
              eyebrow="Step 1 · Input"
              title="Natural language"
              description="Describe the rule as you would explain it to a colleague."
            >
              <ScopeSelector selection={scope} onChange={setScope} />

              <Textarea
                className={styles.textarea}
                textarea={{ className: styles.textareaInner }}
                value={nl}
                onChange={(_, d) => setNl(d.value)}
                placeholder="Describe the rule in plain English… e.g. Hold the order if Technical FISH on FFPE has no circled H&E."
                aria-label="Natural-language rule description"
                resize="vertical"
              />

              <div>
                <Text className={styles.flowLabel} as="p" style={{ marginBottom: space.sm }}>
                  Try an example
                </Text>
                <div className={styles.chips}>
                  {EXAMPLE_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={styles.chip}
                      onClick={() => setNl(p)}
                      title={p}
                    >
                      <LightbulbRegular className={styles.chipIcon} fontSize={15} aria-hidden />
                      <span className={styles.chipLabel}>{p}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.inputActions}>
                <Button
                  appearance="primary"
                  icon={interpretMutation.isPending ? <Spinner size="tiny" /> : <SparkleRegular />}
                  disabled={!nl.trim() || interpretMutation.isPending || !canAuthor}
                  onClick={() => interpretMutation.mutate(nl.trim())}
                >
                  {interpretMutation.isPending ? 'Interpreting…' : 'Interpret'}
                </Button>
                {!canAuthor && (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    Sign in as an Author to interpret.
                  </Text>
                )}
              </div>

              {interpretError && (
                <MessageBar
                  intent={interpretError.status === 503 ? 'warning' : 'error'}
                  role="alert"
                >
                  <MessageBarBody>
                    <MessageBarTitle>
                      {interpretError.status === 503
                        ? 'Interpreter unavailable'
                        : interpretError.status === 400
                          ? 'Unrecognized scope'
                          : 'Interpretation failed'}
                    </MessageBarTitle>
                    {interpretError.status === 400
                      ? 'One or more selected objects or properties is not in the controlled vocabulary. Adjust the scope and try again.'
                      : interpretError.message}
                  </MessageBarBody>
                </MessageBar>
              )}
            </Panel>
          </Reveal>

          {/* ── Column 2: interpretation + validation ── */}
          <div className={styles.rightCol}>
            <Reveal index={1}>
              <Panel
                eyebrow="Step 2 · Interpretation"
                title="Structured rule"
                description="The candidate compiled from your description, with grounding confidence."
                actions={
                  hasRule && (
                    <TabList
                      selectedValue={tab}
                      onTabSelect={(_, d) => {
                        if (d.value === 'edit' && ruleJson) setEditorText(prettyJson(ruleJson));
                        setTab(d.value as RuleTab);
                      }}
                      size="small"
                    >
                      <Tab value="view" icon={<CheckmarkStarburstRegular />}>
                        View
                      </Tab>
                      <Tab value="edit" icon={<DocumentEditRegular />}>
                        Edit
                      </Tab>
                    </TabList>
                  )
                }
              >
                {!interpretation && (
                  <EmptyState
                    icon={<SparkleRegular />}
                    title="Awaiting interpretation"
                    description="Write a rule on the left and select Interpret. The structured candidate and a confidence reading will appear here."
                  />
                )}

                {interpretation && (
                  <>
                    <ConfidenceMeter confidence={interpretation.confidence} />

                    {interpretedChips.length > 0 && (
                      <div className={styles.scopedTo}>
                        <Text className={styles.flowLabel} as="p">
                          Scoped to
                        </Text>
                        <ScopeChips
                          items={interpretedChips}
                          ariaLabel="Scope used for this interpretation"
                        />
                      </div>
                    )}

                    {(interpretation.unmappedPhrases.length > 0 ||
                      interpretation.gaps.length > 0) && (
                      <MessageBar intent="warning" role="status">
                        <MessageBarBody>
                          <MessageBarTitle>Needs your attention</MessageBarTitle>
                          {interpretation.unmappedPhrases.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                              <Text size={200} block weight="semibold">
                                Unmapped phrases (not grounded in the vocabulary):
                              </Text>
                              <div className={styles.gapList} style={{ marginTop: 6 }}>
                                {interpretation.unmappedPhrases.map((p) => (
                                  <StatusBadge key={p} kind="warning">
                                    {p}
                                  </StatusBadge>
                                ))}
                              </div>
                            </div>
                          )}
                          {interpretation.gaps.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <Text size={200} block weight="semibold">
                                Gaps requiring clarification:
                              </Text>
                              <div className={styles.gapList} style={{ marginTop: 6 }}>
                                {interpretation.gaps.map((g) => (
                                  <StatusBadge key={g} kind="info">
                                    {g}
                                  </StatusBadge>
                                ))}
                              </div>
                            </div>
                          )}
                        </MessageBarBody>
                      </MessageBar>
                    )}

                    {hasRule ? (
                      tab === 'view' ? (
                        <JsonView value={ruleJson} label="Interpreted structured rule (JSON)" />
                      ) : (
                        <div>
                          <Textarea
                            className={styles.textarea}
                            textarea={{ className: styles.jsonEditor }}
                            value={editorText}
                            onChange={(_, d) => setEditorText(d.value)}
                            aria-label="Edit the structured rule JSON"
                            aria-invalid={editorInvalid}
                            resize="vertical"
                            spellCheck={false}
                          />
                          {editorInvalid && parsed && !parsed.ok && (
                            <Text className={styles.parseError} as="p" role="alert">
                              JSON parse error: {parsed.error}
                            </Text>
                          )}
                        </div>
                      )
                    ) : (
                      <MessageBar intent="error">
                        <MessageBarBody>
                          The interpreter produced no candidate rule. Try rephrasing with grounded
                          terms.
                        </MessageBarBody>
                      </MessageBar>
                    )}

                    {hasRule && (
                      <div className={styles.toolbar}>
                        <Tooltip
                          content="Plain-English back-translation of the structured rule"
                          relationship="description"
                        >
                          <Button
                            icon={
                              paraphraseMutation.isPending ? (
                                <Spinner size="tiny" />
                              ) : (
                                <TextGrammarWandRegular />
                              )
                            }
                            onClick={runParaphrase}
                            disabled={editorInvalid || paraphraseMutation.isPending}
                          >
                            Paraphrase
                          </Button>
                        </Tooltip>
                        <Button
                          icon={
                            lintMutation.isPending ? (
                              <Spinner size="tiny" />
                            ) : (
                              <CheckmarkStarburstRegular />
                            )
                          }
                          onClick={runLint}
                          disabled={editorInvalid || lintMutation.isPending}
                        >
                          Lint
                        </Button>
                        <Button
                          icon={
                            dryRunMutation.isPending ? <Spinner size="tiny" /> : <PlayRegular />
                          }
                          onClick={runDryRun}
                          disabled={editorInvalid || dryRunMutation.isPending}
                        >
                          Dry-run
                        </Button>
                        <Button
                          appearance="primary"
                          icon={<SaveRegular />}
                          onClick={() => {
                            commitEdit();
                            setSaveOpen(true);
                          }}
                          disabled={editorInvalid || !canAuthor}
                        >
                          Save…
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </Panel>
            </Reveal>

            {/* Paraphrase — the trust round-trip */}
            {(paraphrase || paraphraseMutation.isPending) && (
              <Reveal index={2}>
                <Panel
                  eyebrow="Trust round-trip"
                  title="Paraphrase"
                  description="How the system reads your rule back to you."
                >
                  {paraphraseMutation.isPending ? (
                    <Spinner size="small" label="Paraphrasing…" />
                  ) : (
                    <p className={styles.paraphrase}>{paraphrase}</p>
                  )}
                </Panel>
              </Reveal>
            )}

            {/* Lint */}
            {(lintReport || lintMutation.isPending) && (
              <Reveal index={2}>
                <Panel eyebrow="Step 3 · Validation" title="Lint report">
                  {lintMutation.isPending ? (
                    <Spinner size="small" label="Linting…" />
                  ) : (
                    lintReport && <LintFindings report={lintReport} />
                  )}
                </Panel>
              </Reveal>
            )}

            {/* Dry-run */}
            {(dryRun || dryRunMutation.isPending) && (
              <Reveal index={2}>
                <Panel eyebrow="Preview" title="Dry-run over fixtures">
                  {dryRunMutation.isPending ? (
                    <Spinner size="small" label="Running fixtures…" />
                  ) : (
                    dryRun && <DryRunResults result={dryRun} />
                  )}
                </Panel>
              </Reveal>
            )}
          </div>
        </div>
      </div>

      {ruleJson && (
        <SaveRuleDialog
          open={saveOpen}
          /* The Scope selector is the source of truth for a rule's scope: merge the current
             selection onto the rule body before saving (respecting any hand-typed `scope`). */
          ruleJson={buildSaveRuleJson(ruleJson, scope)}
          onOpenChange={setSaveOpen}
          authorNl={nl.trim() || null}
          interpreterVersion={INTERPRETER_VERSION}
        />
      )}
    </div>
  );
}
