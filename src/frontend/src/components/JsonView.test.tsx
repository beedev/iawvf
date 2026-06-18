import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { JsonView } from './JsonView';
import { tokenizeJson } from './jsonTokens';
import { renderWithTheme } from '../test/renderWithTheme';

describe('tokenizeJson', () => {
  it('classifies keys, strings, numbers, booleans, and null distinctly', () => {
    const json = JSON.stringify(
      { key: 'BL20', priority: 6, enabled: true, bodySite: null },
      null,
      2,
    );
    const tokens = tokenizeJson(json);

    const types = tokens.map((t) => t.type);
    expect(types).toContain('key');
    expect(types).toContain('string');
    expect(types).toContain('number');
    expect(types).toContain('boolean');
    expect(types).toContain('null');

    // A key token includes its trailing colon; a string value does not.
    const keyToken = tokens.find((t) => t.type === 'key');
    expect(keyToken?.value).toMatch(/"key"\s*:/);
    expect(tokens.some((t) => t.type === 'string' && t.value === '"BL20"')).toBe(true);
    expect(tokens.some((t) => t.type === 'number' && t.value === '6')).toBe(true);
    expect(tokens.some((t) => t.type === 'boolean' && t.value === 'true')).toBe(true);
    expect(tokens.some((t) => t.type === 'null' && t.value === 'null')).toBe(true);
  });

  it('reassembles to the original input losslessly', () => {
    const json = JSON.stringify({ a: [1, 2, { b: 'x' }], c: false }, null, 2);
    const reassembled = tokenizeJson(json)
      .map((t) => t.value)
      .join('');
    expect(reassembled).toBe(json);
  });
});

describe('JsonView', () => {
  it('renders an accessible labelled region with typed token spans', () => {
    renderWithTheme(<JsonView value={{ key: 'BL20', enabled: true }} label="Rule JSON" />);

    const region = screen.getByRole('region', { name: 'Rule JSON' });
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('tabindex', '0');

    // Distinct token types are present as data attributes for styling/testing.
    expect(region.querySelector('[data-token="key"]')).toBeTruthy();
    expect(region.querySelector('[data-token="boolean"]')).toBeTruthy();
    expect(region.textContent).toContain('"BL20"');
  });
});
