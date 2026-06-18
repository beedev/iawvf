/**
 * Typed OpenAI interpreter options, read from `@nestjs/config` (env-backed).
 *
 * Mirrors {@link ../../../../backend/IAW.Vdf.Authoring.Llm/Configuration/OpenAiOptions.cs}.
 * The API key is read here but is NEVER logged or surfaced in an error message. The
 * root {@link ../../config/configuration} already binds `OPENAI_*` env vars into the
 * typed `openai` config section; this resolver lifts that section into a small,
 * self-validating options object the interpreter consumes.
 */

import { ConfigService } from '@nestjs/config';

/** The OpenAI options consumed by the live interpreter. */
export interface OpenAiOptions {
  /** Whether the live interpreter is enabled (`OPENAI_ENABLED`). */
  enabled: boolean;
  /** The API key (`OPENAI_API_KEY`). Never logged or surfaced in errors. */
  apiKey: string;
  /** The chat-completions model id (`OPENAI_MODEL`, default `gpt-4.1`). */
  model: string;
  /** The API base URL (`OPENAI_BASE_URL`, default the public OpenAI endpoint). */
  baseUrl: string;
  /** Sampling temperature. Always 0 for maximum determinism at authoring time. */
  temperature: number;
  /** Per-request timeout in milliseconds. */
  timeoutMs: number;
}

/** The shape the root configuration factory binds the `openai` section into. */
interface OpenAiConfigSection {
  enabled: boolean;
  apiKey: string;
  model: string;
  baseUrl: string;
}

/** True when the live path can be attempted (enabled and a non-empty key present). */
export function canCallLiveModel(options: OpenAiOptions): boolean {
  return options.enabled && options.apiKey.trim().length > 0;
}

/**
 * Resolves {@link OpenAiOptions} from the Nest {@link ConfigService}. Falls back to
 * the documented defaults when individual values are absent. Temperature is fixed at
 * 0 (deterministic authoring) and the timeout defaults to 60s.
 */
export function resolveOpenAiOptions(config: ConfigService): OpenAiOptions {
  const section = config.get<OpenAiConfigSection>('openai');
  return {
    enabled: section?.enabled ?? false,
    apiKey: section?.apiKey ?? '',
    model: section?.model ?? 'gpt-4.1',
    baseUrl: section?.baseUrl ?? 'https://api.openai.com/v1',
    temperature: 0,
    timeoutMs: 60_000,
  };
}
