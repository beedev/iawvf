import { BadRequestException } from '@nestjs/common';
import { ruleFromObject } from '../serializer';
import { RuleDefinition } from '../types';

/**
 * Parses a `ruleJson` object body into a {@link RuleDefinition}, raising a 400
 * BadRequest (RFC 7807 via the global filter) when the body is not a valid rule.
 * Shared by the authoring and rules controllers so the failure surface is uniform.
 */
export function parseRuleJson(
  ruleJson: Record<string, unknown>,
): RuleDefinition {
  try {
    return ruleFromObject(ruleJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BadRequestException(`ruleJson is not a valid rule: ${message}`);
  }
}
