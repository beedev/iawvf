/**
 * Registry-grounded vocabulary-linter tests.
 *
 * These ground on the LIVE entity registry (seeded into Postgres) projected via
 * {@link VocabularyProjectionService} — NOT a static catalog. That is the N4 key
 * difference from .NET: the legal subjects ARE the registry's Active entity.field
 * paths, and the registry's declared types power the new type-aware LINT020.
 *
 * Requires `iawnode` (Postgres on :5433) to be up.
 */

import * as fs from 'fs';
import * as path from 'path';

import { PrismaService } from '../../prisma/prisma.service';
import { RegistrySeeder } from '../../registry/registry.seeder';
import { RegistryService } from '../../registry/registry.service';
import { DbReferenceDataLoader } from '../../rules/db-reference-data.provider';
import { RuleRepository } from '../../rules/rule.repository';
import { RulesCorpusImporter } from '../../rules/rules-corpus.importer';
import { VocabularyProjectionService } from '../../rules/vocabulary-projection.service';
import { ReferenceDataProvider } from '../../vdf/reference-data';
import { deserializeRule } from '../../vdf/serializer';
import { RuleDefinition } from '../../vdf/types';
import { RULES_DIR, readRuleJson } from '../../vdf/__tests__/corpus';
import {
  GroundingSubject,
  LintFinding,
  VocabularyLinter,
} from '../vocabulary-linter';

const errors = (findings: LintFinding[]): LintFinding[] =>
  findings.filter((f) => f.severity === 'Error');

describe('VocabularyLinter (registry-grounded)', () => {
  let prisma: PrismaService;
  let subjects: GroundingSubject[];
  let references: ReferenceDataProvider;
  let linter: VocabularyLinter;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    // Ground on the registry: force a CLEAN canonical seed (other suites may have
    // left a partial/empty registry — ensureSeeded only seeds an empty table, so
    // we clear first to guarantee the full canonical vocabulary is present), then
    // import reference data and PROJECT.
    await prisma.entity.deleteMany();
    const seeder = new RegistrySeeder(prisma);
    await seeder.ensureSeeded();

    await prisma.referenceDataEntry.deleteMany();
    const repo = new RuleRepository(prisma);
    const importer = new RulesCorpusImporter(prisma, repo);
    await importer.importCorpus();

    const projection = new VocabularyProjectionService(
      new RegistryService(prisma),
      prisma,
    );
    subjects = (await projection.project()).subjects;
    references = await new DbReferenceDataLoader(prisma).load();
    linter = new VocabularyLinter(subjects, references);
  }, 60000);

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('lints a corpus rule clean (no errors)', () => {
    const report = linter.lint(deserializeRule(readRuleJson('PM17')));
    expect(errors(report.findings)).toHaveLength(0);
    expect(report.isValid).toBe(true);
  });

  it('LINT001 Error: unknown subject (typo "speciment.age")', () => {
    const rule = deserializeRule(readRuleJson('PM48'));
    // Corrupt the appliesWhen subject to a typo not in the registry.
    (rule.appliesWhen as { subject: string }).subject = 'speciment.age';
    const report = linter.lint(rule);
    const finding = report.findings.find((f) => f.code === 'LINT001');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('Error');
    expect(finding!.message).toMatch(/speciment\.age/);
    expect(report.isValid).toBe(false);
  });

  it('LINT002 Error: unknown outcome type', () => {
    const rule = deserializeRule(readRuleJson('PM17'));
    (rule.onFailure as { type: string }).type = 'Teleport';
    const report = linter.lint(rule);
    const finding = report.findings.find((f) => f.code === 'LINT002');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('Error');
    expect(report.isValid).toBe(false);
  });

  it('LINT003 Error: unknown reference key', () => {
    const rule = deserializeRule(readRuleJson('PM48'));
    (rule.appliesWhen as { reference: string }).reference =
      'NoSuchReference.key';
    const report = linter.lint(rule);
    const finding = report.findings.find((f) => f.code === 'LINT003');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('Error');
  });

  it('LINT020 Warning: numeric/range operator on a String field (uses registry types)', () => {
    // patient.gender is a String field in the registry; GreaterThan is numeric.
    const rule: RuleDefinition = {
      key: 'TYPE_MISMATCH',
      name: 'Numeric op on a string field',
      priority: 0,
      phase: 'Validate',
      enabled: true,
      version: 1,
      effectiveDate: '0001-01-01T00:00:00+00:00',
      assert: {
        type: 'leaf',
        subject: 'patient.gender',
        operator: 'GreaterThan',
        value: 'X',
      },
      onSuccess: { type: 'Continue', parameters: {} },
      onFailure: { type: 'Warning', parameters: {} },
    };
    const report = linter.lint(rule);
    const finding = report.findings.find((f) => f.code === 'LINT020');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('Warning');
    expect(finding!.message).toMatch(/patient\.gender/);
    // A warning does not invalidate the rule.
    expect(report.isValid).toBe(true);
  });

  it('LINT020 Warning: Equals against an allowedValues field with an out-of-set value', () => {
    // specimen.type has a closed allowedValues set; "Plasma" is not in it.
    const rule: RuleDefinition = {
      key: 'OUT_OF_SET',
      name: 'Value outside allowedValues',
      priority: 0,
      phase: 'Validate',
      enabled: true,
      version: 1,
      effectiveDate: '0001-01-01T00:00:00+00:00',
      assert: {
        type: 'leaf',
        subject: 'specimen.type',
        operator: 'Equals',
        value: 'Plasma',
      },
      onSuccess: { type: 'Continue', parameters: {} },
      onFailure: { type: 'Warning', parameters: {} },
    };
    const finding = linter
      .lint(rule)
      .findings.find((f) => f.code === 'LINT020');
    expect(finding).toBeDefined();
    expect(finding!.message).toMatch(/Plasma/);
  });

  it('LINT005 Error: CreatePlaceholder missing SpecimenType', () => {
    const rule = deserializeRule(readRuleJson('BL36'));
    rule.onFailure.parameters = {}; // strip SpecimenType
    const report = linter.lint(rule);
    const finding = report.findings.find((f) => f.code === 'LINT005');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('Error');
    expect(report.isValid).toBe(false);
  });

  it('LINT101 Warning: assert present but OnFailure is Continue', () => {
    const rule = deserializeRule(readRuleJson('PM17'));
    rule.onFailure = { type: 'Continue', parameters: {} };
    const report = linter.lint(rule);
    const finding = report.findings.find((f) => f.code === 'LINT101');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('Warning');
    expect(report.isValid).toBe(true);
  });

  it('lintJson surfaces deserialization failure as LINT000', () => {
    const report = linter.lintJson('{ not valid json');
    expect(report.isValid).toBe(false);
    expect(report.findings[0].code).toBe('LINT000');
  });

  // ── Corpus-consistency: the Node analogue of the .NET corpus-consistency test ──
  describe('corpus consistency — every rules/*.json lints with no Errors', () => {
    const ruleFiles = fs
      .readdirSync(RULES_DIR)
      .filter((f) => f.endsWith('.json') && f !== 'reference-data.json')
      .sort((a, b) => a.localeCompare(b));

    it('has rule files to check', () => {
      expect(ruleFiles.length).toBeGreaterThan(0);
    });

    it.each(ruleFiles)('%s lints clean against the registry', (file) => {
      const json = fs.readFileSync(path.join(RULES_DIR, file), 'utf8');
      const report = linter.lintJson(json);
      const errs = errors(report.findings);
      // If this fails, the seeded registry is missing a subject the corpus uses —
      // the fix is to add it to the N1 seed, not to weaken this test.
      expect(errs).toEqual([]);
    });
  });
});
