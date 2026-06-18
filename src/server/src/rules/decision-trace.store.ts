import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EvaluationResult } from '../vdf/types';

/**
 * Persists an {@link EvaluationResult}'s per-rule {@link DecisionTrace}s to the
 * append-only `decision_trace` table. Never updates or deletes — a true audit log.
 *
 * Optional collaborator: the N6 /evaluate API uses this to record an evaluation's
 * full decision provenance (conditions, facts read, produced outcome) under a
 * caller-supplied correlation id.
 */
@Injectable()
export class DecisionTraceStore {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Saves every trace from a result. Returns the number of rows written.
   * @param result The engine evaluation result whose traces to persist.
   * @param correlationId Links traces from the same evaluation request.
   */
  async saveResult(
    result: EvaluationResult,
    correlationId?: string,
  ): Promise<number> {
    if (result.trace.length === 0) {
      return 0;
    }
    await this.prisma.decisionTrace.createMany({
      data: result.trace.map((t) => ({
        correlationId: correlationId ?? null,
        ruleKey: t.ruleKey,
        version: t.version,
        phase: t.phase,
        applied: t.applied,
        assertResult: t.assertResult,
        producedOutcomeJson:
          t.produced === null
            ? Prisma.JsonNull
            : (t.produced as unknown as Prisma.InputJsonValue),
        conditionsJson: t.conditions as unknown as Prisma.InputJsonValue,
        factsReadJson: t.factsRead,
        evaluatedAt: new Date(t.evaluatedAt),
      })),
    });
    return result.trace.length;
  }
}
