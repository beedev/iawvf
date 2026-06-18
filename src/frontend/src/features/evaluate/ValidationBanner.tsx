import {
  makeStyles,
  tokens,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Text,
} from '@fluentui/react-components';
import { fonts, radius, space } from '../../theme/tokens';
import type { ValidationBlock } from '../../lib/types/api';
import { humanizeValidationError } from './validationMessages';

const useStyles = makeStyles({
  list: {
    listStyle: 'none',
    margin: 0,
    marginTop: space.sm,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
    maxHeight: '200px',
    overflowY: 'auto',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: space.sm,
    borderRadius: radius.sm,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  path: {
    fontFamily: fonts.mono,
    fontSize: '12px',
    color: tokens.colorPaletteDarkOrangeForeground1,
  },
  message: { fontSize: '12.5px', color: tokens.colorNeutralForeground2 },
});

export interface ValidationBannerProps {
  validation: ValidationBlock | undefined;
}

/**
 * A NON-BLOCKING banner that surfaces registry validation findings attached to an evaluation. The
 * decision still ran — the outcomes and trace are shown regardless — so this is a warning, not an
 * error: it tells the author that N facts did not match the registry's typed schema, names each
 * offending path and the expected type in plain language, and reassures that the rules still ran.
 * Renders nothing when the facts validated cleanly (or no block was returned).
 *
 * The count is announced as text (WCAG 1.4.1: never color alone), and `role="status"` lets assistive
 * tech read it without stealing focus from the result.
 */
export function ValidationBanner({ validation }: ValidationBannerProps) {
  const styles = useStyles();

  const errors = validation?.errors ?? [];
  if (validation === undefined || validation.valid || errors.length === 0) {
    return null;
  }

  const n = errors.length;

  return (
    <MessageBar intent="warning" role="status" data-testid="validation-banner">
      <MessageBarBody>
        <MessageBarTitle>
          {n} fact{n === 1 ? '' : 's'} {n === 1 ? "doesn't" : "don't"} match the registry. The rules
          still ran.
        </MessageBarTitle>
        <Text size={200} as="p">
          {n === 1 ? 'This value was' : 'These values were'} outside the typed registry — review{' '}
          {n === 1 ? 'it' : 'them'} so the rules ground on the intended terms.
        </Text>
        <ul className={styles.list} aria-label="Registry validation findings">
          {errors.map((err, i) => (
            <li key={`${err.path}-${i}`} className={styles.item}>
              <span className={styles.path}>{err.path}</span>
              <span className={styles.message}>{humanizeValidationError(err)}</span>
            </li>
          ))}
        </ul>
      </MessageBarBody>
    </MessageBar>
  );
}
