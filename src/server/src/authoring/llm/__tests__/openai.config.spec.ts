/**
 * Offline tests for OpenAI config binding and the live interpreter's fail-fast
 * behaviour. No network: the SDK client is never reached because interpret() throws
 * first when the live path is unusable. Crucially, error messages NEVER contain the
 * key.
 */

import OpenAI from 'openai';

import { GroundingVocabulary } from '../interpreter';
import { OpenAiRuleInterpreter } from '../openai-rule-interpreter';
import {
  OpenAiOptions,
  canCallLiveModel,
  resolveOpenAiOptions,
} from '../openai.config';
import { RuleInterpretationGate } from '../rule-interpretation-gate';

/** A minimal ConfigService stand-in returning a canned `openai` section. */
function fakeConfig(section: unknown): { get: (key: string) => unknown } {
  return {
    get: (key: string) => (key === 'openai' ? section : undefined),
  };
}

const EMPTY_GROUNDING: GroundingVocabulary = {
  subjects: [],
  operators: [],
  outcomes: [],
  references: [],
};

// A gate factory that should never be invoked in these throw-first tests.
const unusedGateFactory = (): Promise<RuleInterpretationGate> => {
  throw new Error(
    'gate factory must not be called when interpret() throws first',
  );
};

function makeInterpreter(options: OpenAiOptions): OpenAiRuleInterpreter {
  const client = new OpenAI({ apiKey: 'unset', baseURL: options.baseUrl });
  return new OpenAiRuleInterpreter(client, options, unusedGateFactory);
}

describe('resolveOpenAiOptions (env binding via @nestjs/config)', () => {
  it('binds the openai config section', () => {
    const config = fakeConfig({
      enabled: true,
      apiKey: 'sk-test-binding',
      model: 'gpt-4.1',
      baseUrl: 'https://example.test/v1',
    });
    const opts = resolveOpenAiOptions(config as never);
    expect(opts.enabled).toBe(true);
    expect(opts.model).toBe('gpt-4.1');
    expect(opts.baseUrl).toBe('https://example.test/v1');
    expect(opts.temperature).toBe(0);
  });

  it('falls back to documented defaults when the section is absent', () => {
    const opts = resolveOpenAiOptions(fakeConfig(undefined) as never);
    expect(opts.enabled).toBe(false);
    expect(opts.apiKey).toBe('');
    expect(opts.model).toBe('gpt-4.1');
    expect(opts.baseUrl).toBe('https://api.openai.com/v1');
  });

  it('canCallLiveModel requires both enabled and a non-empty key', () => {
    expect(
      canCallLiveModel({ enabled: true, apiKey: 'k' } as OpenAiOptions),
    ).toBe(true);
    expect(
      canCallLiveModel({ enabled: true, apiKey: '' } as OpenAiOptions),
    ).toBe(false);
    expect(
      canCallLiveModel({ enabled: false, apiKey: 'k' } as OpenAiOptions),
    ).toBe(false);
  });
});

describe('OpenAiRuleInterpreter fail-fast (no network)', () => {
  const baseOptions: OpenAiOptions = {
    enabled: true,
    apiKey: '',
    model: 'gpt-4.1',
    baseUrl: 'https://api.openai.com/v1',
    temperature: 0,
    timeoutMs: 60_000,
  };

  it('throws a clear error when enabled but no key (caller falls back to stub)', async () => {
    const interpreter = makeInterpreter({ ...baseOptions, apiKey: '' });
    await expect(
      interpreter.interpret('hold the order', EMPTY_GROUNDING),
    ).rejects.toThrow(/No OpenAI API key is configured/);
  });

  it('throws a clear error when disabled', async () => {
    const interpreter = makeInterpreter({
      ...baseOptions,
      enabled: false,
      apiKey: 'sk-secret-value',
    });
    await expect(
      interpreter.interpret('hold the order', EMPTY_GROUNDING),
    ).rejects.toThrow(/disabled \(OPENAI_ENABLED=false\)/);
  });

  it('error messages never leak the API key', async () => {
    const secret = 'sk-super-secret-leak-canary';
    const interpreter = makeInterpreter({
      ...baseOptions,
      enabled: false,
      apiKey: secret,
    });
    let thrown: unknown;
    try {
      await interpreter.interpret('hold the order', EMPTY_GROUNDING);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toContain(secret);
  });

  it('rejects empty natural-language input', async () => {
    const interpreter = makeInterpreter(baseOptions);
    await expect(interpreter.interpret('   ', EMPTY_GROUNDING)).rejects.toThrow(
      /must be provided/,
    );
  });
});
