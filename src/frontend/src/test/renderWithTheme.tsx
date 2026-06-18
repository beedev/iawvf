import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { FluentProvider } from '@fluentui/react-components';
import { iawLightTheme } from '../theme';

/** Renders a component inside the IAW FluentProvider so theme tokens resolve in tests. */
export function renderWithTheme(ui: ReactElement): RenderResult {
  return render(<FluentProvider theme={iawLightTheme}>{ui}</FluentProvider>);
}
