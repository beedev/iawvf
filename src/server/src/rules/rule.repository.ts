import { Injectable, Logger } from '@nestjs/common';
import { Prisma, RulePhase as PrismaRulePhase } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ruleFromObject } from '../vdf/serializer';
import { RuleDefinition } from '../vdf/types';

/** Provenance / governance metadata supplied when saving a rule version. */
export interface SaveRuleOptions {
  authorNl?: string;
  interpreterVersion?: string;
  authoredBy: string;
}

/**
 * The .NET MinValue sentinel (year 0001) the serializer emits when a rule has no
 * effective date. Treated as "always effective" by the selector. We store it as a
 * concrete far-past timestamp so the DB column (NOT NULL) and effective-date
 * windowing both behave correctly.
 */
const MIN_EFFECTIVE_ISO = '0001-01-01T00:00:00+00:00';

/**
 * Prisma-backed implementation of the engine's rule-repository seam.
 *
 * Versioning / effective-dating contract (mirrors EfRuleRepository in the .NET
 * IAW.Vdf.Persistence project, semantics for semantics):
 *
 *  - {@link saveAsync} appends a new {@link RuleVersion} (version++). When the new
 *    version is immediately effective (effectiveDate <= now), all prior active
 *    versions are deactivated (isActive=false) and the new one becomes active.
 *    Future-dated versions are stored isActive=false and the prior active version
 *    stays live until the future date arrives.
 *  - {@link getActiveRulesAsync} performs effective-date windowing: for each enabled
 *    Rule it picks the highest-version RuleVersion whose
 *    effectiveDate <= asOf < (expiryDate ?? +inf). This supports time-travel queries
 *    for any past/future asOf, independent of the denormalized isActive flag.
 *  - {@link getByKey} returns the isActive=true version (the fast "current" path).
 *
 * All queries are parameterized by Prisma — there is no raw SQL concatenation, so
 * arbitrary string inputs (e.g. a ruleSet containing a quote) are injection-safe.
 */
@Injectable()
export class RuleRepository {
  private readonly logger = new Logger(RuleRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the active {@link RuleDefinition} for every enabled rule at {@link asOf},
   * deserialized from JSONB and merged with the identity-row metadata. Optionally
   * filtered to a rule set.
   */
  async getActiveRulesAsync(
    asOf: Date,
    ruleSet?: string,
  ): Promise<RuleDefinition[]> {
    const rules = await this.prisma.rule.findMany({
      where: {
        enabled: true,
        ...(ruleSet !== undefined ? { ruleSet } : {}),
      },
      include: { versions: true },
      orderBy: { ruleKey: 'asc' },
    });

    const result: RuleDefinition[] = [];
    for (const rule of rules) {
      const active = rule.versions
        .filter(
          (v) =>
            v.effectiveDate <= asOf &&
            (v.expiryDate === null || v.expiryDate > asOf),
        )
        .sort((a, b) => b.version - a.version)[0];

      if (active !== undefined) {
        result.push(
          this.deserializeVersion(
            active.definitionJson,
            active.version,
            active.effectiveDate,
            active.expiryDate,
            rule,
          ),
        );
      }
    }
    return result;
  }

  /** Fast path: returns the currently-active version for a key, or null. */
  async getByKey(key: string): Promise<RuleDefinition | null> {
    const version = await this.prisma.ruleVersion.findFirst({
      where: { isActive: true, rule: { ruleKey: key } },
      include: { rule: true },
      orderBy: { version: 'desc' },
    });
    if (version === null) {
      return null;
    }
    return this.deserializeVersion(
      version.definitionJson,
      version.version,
      version.effectiveDate,
      version.expiryDate,
      version.rule,
    );
  }

  /**
   * Upserts a rule: creates/updates the {@link Rule} identity row, then appends the
   * next {@link RuleVersion} (serializing the full body to JSONB) honouring the
   * effective-dating rules above. Runs in a transaction so the supersede + insert
   * are atomic.
   */
  async saveAsync(
    rule: RuleDefinition,
    options: SaveRuleOptions,
  ): Promise<void> {
    const now = new Date();
    const effectiveDate = this.parseEffective(rule.effectiveDate);
    const expiryDate =
      rule.expiryDate !== undefined ? new Date(rule.expiryDate) : null;
    const isImmediatelyEffective = effectiveDate <= now;

    await this.prisma.$transaction(async (tx) => {
      const ruleRow = await tx.rule.upsert({
        where: { ruleKey: rule.key },
        create: {
          ruleKey: rule.key,
          ruleSet: rule.ruleSet ?? null,
          name: rule.name,
          description: rule.description ?? null,
          priority: rule.priority,
          phase: rule.phase,
          enabled: rule.enabled,
        },
        update: {
          ruleSet: rule.ruleSet ?? null,
          name: rule.name,
          description: rule.description ?? null,
          priority: rule.priority,
          phase: rule.phase,
          enabled: rule.enabled,
        },
        include: { versions: true },
      });

      const nextVersion =
        ruleRow.versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;

      if (isImmediatelyEffective) {
        await tx.ruleVersion.updateMany({
          where: { ruleId: ruleRow.id, isActive: true },
          data: { isActive: false },
        });
      }

      await tx.ruleVersion.create({
        data: {
          ruleId: ruleRow.id,
          version: nextVersion,
          effectiveDate,
          expiryDate,
          // The compiled RuleDefinition is itself a plain JSON-serializable object;
          // store it verbatim as JSONB. deserializeVersion re-merges DB-authoritative
          // version + effective dates on the way out.
          definitionJson: rule as unknown as Prisma.InputJsonValue,
          authorNl: options.authorNl ?? null,
          interpreterVersion: options.interpreterVersion ?? null,
          authoredBy: options.authoredBy,
          isActive: isImmediatelyEffective,
        },
      });
    });

    this.logger.log(
      `Saved rule '${rule.key}' v${(await this.currentVersion(rule.key)) ?? '?'} by ${options.authoredBy}.`,
    );
  }

  /**
   * Governance: approves the currently-active version of a rule, recording the
   * approver and timestamp. Throws if the rule has no active version.
   */
  async approve(key: string, approver: string): Promise<void> {
    const active = await this.prisma.ruleVersion.findFirst({
      where: { isActive: true, rule: { ruleKey: key } },
      orderBy: { version: 'desc' },
    });
    if (active === null) {
      throw new Error(`No active version to approve for rule '${key}'.`);
    }
    await this.prisma.ruleVersion.update({
      where: { id: active.id },
      data: { approvedBy: approver, approvedAt: new Date() },
    });
    this.logger.log(
      `Approved rule '${key}' v${active.version} by ${approver}.`,
    );
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async currentVersion(key: string): Promise<number | undefined> {
    const v = await this.prisma.ruleVersion.findFirst({
      where: { isActive: true, rule: { ruleKey: key } },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return v?.version;
  }

  /**
   * Deserializes the JSONB body back into a {@link RuleDefinition} and merges the
   * DB-authoritative version number + effective dates and identity-row metadata.
   */
  private deserializeVersion(
    definitionJson: Prisma.JsonValue,
    version: number,
    effectiveDate: Date,
    expiryDate: Date | null,
    ruleRow: {
      ruleKey: string;
      ruleSet: string | null;
      name: string;
      description: string | null;
      priority: number;
      phase: PrismaRulePhase;
      enabled: boolean;
    },
  ): RuleDefinition {
    const body = ruleFromObject(definitionJson);
    const merged: RuleDefinition = {
      ...body,
      key: ruleRow.ruleKey,
      name: ruleRow.name,
      priority: ruleRow.priority,
      phase: ruleRow.phase,
      enabled: ruleRow.enabled,
      version,
      effectiveDate: effectiveDate.toISOString(),
    };
    if (ruleRow.description !== null) {
      merged.description = ruleRow.description;
    } else {
      delete merged.description;
    }
    if (ruleRow.ruleSet !== null) {
      merged.ruleSet = ruleRow.ruleSet;
    } else {
      delete merged.ruleSet;
    }
    if (expiryDate !== null) {
      merged.expiryDate = expiryDate.toISOString();
    } else {
      delete merged.expiryDate;
    }
    return merged;
  }

  private parseEffective(iso: string | undefined): Date {
    if (iso === undefined || iso.startsWith('0001-01-01')) {
      return new Date(MIN_EFFECTIVE_ISO);
    }
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? new Date(MIN_EFFECTIVE_ISO) : d;
  }
}
