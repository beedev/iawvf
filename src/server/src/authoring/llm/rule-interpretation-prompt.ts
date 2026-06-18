/**
 * Builds the grounding system prompt and the user prompt for the OpenAI rule
 * interpreter.
 *
 * A faithful port of {@link ../../../../backend/IAW.Vdf.Authoring.Llm/Prompting/RuleInterpretationPrompt.cs}.
 * The system prompt enumerates the LIVE registry-projected {@link GroundingVocabulary}
 * — the legal subjects (with data types + allowedValues), operators, reference keys,
 * and outcome types — and constrains the model to produce a rule that uses ONLY those
 * terms. Per the "grounding, not guessing" principle, the model must surface a gap
 * rather than invent a term the vocabulary lacks. Deterministic for a given
 * vocabulary (terms are emitted in a stable, sorted order).
 */

import { GroundingVocabulary } from './interpreter';

/** Builds the system prompt that grounds the model in the supplied vocabulary. */
export function buildSystemPrompt(vocabulary: GroundingVocabulary): string {
  const lines: string[] = [];

  lines.push(
    'You are the rule-interpretation front-end of a regulated clinical accessioning validation engine.',
  );
  lines.push(
    'You translate a single plain-English rule into ONE structured rule expressed strictly in a CLOSED controlled vocabulary.',
  );
  lines.push('');
  lines.push('ABSOLUTE RULES (no exceptions):');
  lines.push(
    '1. GROUNDING, NOT GUESSING. Use ONLY the subjects, operators, reference keys, and outcome types listed below.',
  );
  lines.push(
    '2. NO SILENT INVENTION. If the sentence needs a concept the vocabulary does not contain (a subject, operator, reference, or outcome that is NOT in the lists), you MUST NOT fabricate it. Instead, set "candidateJson" to null, lower the confidence, and add a precise entry to "gaps" naming the missing concept (e.g. "No subject models \'cold-ischemia time\'.").',
  );
  lines.push(
    '3. Any phrase you could not map to a vocabulary term goes in "unmappedPhrases".',
  );
  lines.push(
    '4. Prefer asking (a gap) over assuming. When in doubt, do not produce a candidate.',
  );
  lines.push('');
  lines.push(
    'LEGAL SUBJECTS (fact paths and their data types) — use these exact paths:',
  );
  for (const subject of [...vocabulary.subjects].sort((a, b) =>
    a.path.localeCompare(b.path),
  )) {
    const allowed =
      subject.allowedValues.length > 0
        ? ` (allowed: ${[...subject.allowedValues].sort((a, b) => a.localeCompare(b)).join(', ')})`
        : '';
    lines.push(`  - ${subject.path} : ${subject.dataType}${allowed}`);
  }
  lines.push('');
  lines.push('LEGAL OPERATORS (OperatorKind) — use these exact names:');
  for (const op of [...vocabulary.operators].sort((a, b) =>
    a.localeCompare(b),
  )) {
    lines.push(`  - ${op}`);
  }
  lines.push('');
  lines.push(
    'LEGAL REFERENCE KEYS (for reference-backed comparands) — use these exact keys:',
  );
  for (const reference of [...vocabulary.references].sort((a, b) =>
    a.localeCompare(b),
  )) {
    lines.push(`  - ${reference}`);
  }
  lines.push('');
  lines.push('LEGAL OUTCOME TYPES (OutcomeType) — use these exact names:');
  for (const outcome of [...vocabulary.outcomes].sort((a, b) =>
    a.localeCompare(b),
  )) {
    lines.push(`  - ${outcome}`);
  }
  lines.push('');
  lines.push(
    'RULE SHAPE. The rule is the four-part anatomy WHEN + DECISION + ON SUCCESS + ON FAILURE:',
  );
  lines.push(
    '  - "appliesWhen": optional guard condition; the rule only runs when this is true.',
  );
  lines.push(
    '  - "assert": optional condition that must hold for success; its failure triggers "onFailure".',
  );
  lines.push(
    '  - "onSuccess": outcome when the assertion passes (usually {"type":"Continue"}).',
  );
  lines.push(
    '  - "onFailure": REQUIRED outcome when the assertion fails (the business effect: hold, alert, prevent, route, derive, ...).',
  );
  lines.push('');
  lines.push('CONDITION SHAPE (JSON):');
  lines.push(
    '  - leaf:  {"type":"leaf","subject":"<path>","operator":"<OperatorKind>","value":<literal>|"reference":"<key>","quantifier":"This"|"Any"|"Every"}',
  );
  lines.push(
    '  - group: {"type":"group","logicalOp":"All"|"Any"|"Not","conditions":[ ... ]}',
  );
  lines.push(
    '  Use "value" for an inline literal OR "reference" for a reference-data key, never both.',
  );
  lines.push('');
  lines.push(
    'OUTCOME SHAPE (JSON): {"type":"<OutcomeType>","scope":"order"|"test"|"specimen","reason":"...","parameters":{...}}',
  );
  lines.push(
    '  Parameter requirements: PreventAction/AllowAction need {"Action":"..."}; RouteToReview/RouteToQueue need {"Destination":"..."}; CreatePlaceholder needs {"SpecimenType":"..."}; SetValue/ApplyDefault/CalculateValue need {"Target":"...","Value":...}.',
  );
  lines.push('');
  lines.push(
    'OUTPUT. Respond with a single JSON object exactly matching this envelope (no prose, no markdown):',
  );
  lines.push('  {');
  lines.push(
    '    "candidateJson": <a JSON-as-string of the full rule object, or null if it cannot be expressed>,',
  );
  lines.push('    "confidence": <number 0..1>,');
  lines.push('    "unmappedPhrases": [<strings>],');
  lines.push('    "gaps": [<strings>]');
  lines.push('  }');
  lines.push(
    'The rule object inside "candidateJson" MUST include at least "key", "name", and "onFailure". Choose a short uppercase "key" if none is implied (e.g. "NL1").',
  );
  return lines.join('\n');
}

/** Builds the user prompt carrying the author's natural-language rule. */
export function buildUserPrompt(naturalLanguage: string): string {
  const trimmed = (naturalLanguage ?? '').trim();
  return `Interpret this rule into the controlled vocabulary:\n\n"${trimmed}"`;
}
