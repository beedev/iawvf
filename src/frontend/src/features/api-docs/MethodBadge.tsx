import { makeStyles, tokens, mergeClasses, shorthands } from '@fluentui/react-components';
import { fonts, radius } from '../../theme/tokens';
import type { HttpMethod } from './openapi';

/**
 * A color-coded HTTP-method pill. Color is reinforced by the method TEXT (never color-alone — WCAG
 * 1.4.1) and every pair is drawn from Fluent's semantic status tokens, so it stays AA in both light
 * and dark themes. GET reads informational, POST success, DELETE danger, the rest neutral/warning.
 */

const useStyles = makeStyles({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '58px',
    paddingInline: '8px',
    paddingBlock: '3px',
    borderRadius: radius.sm,
    fontFamily: fonts.mono,
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    lineHeight: '1.4',
    ...shorthands.border('1px', 'solid', 'transparent'),
  },
  get: {
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorBrandBackground2,
    ...shorthands.borderColor(tokens.colorBrandStroke2),
  },
  post: {
    color: tokens.colorStatusSuccessForeground1,
    backgroundColor: tokens.colorStatusSuccessBackground1,
    ...shorthands.borderColor(tokens.colorStatusSuccessBorder1),
  },
  put: {
    color: tokens.colorStatusWarningForeground1,
    backgroundColor: tokens.colorStatusWarningBackground1,
    ...shorthands.borderColor(tokens.colorStatusWarningBorder1),
  },
  patch: {
    color: tokens.colorStatusWarningForeground1,
    backgroundColor: tokens.colorStatusWarningBackground1,
    ...shorthands.borderColor(tokens.colorStatusWarningBorder1),
  },
  delete: {
    color: tokens.colorStatusDangerForeground1,
    backgroundColor: tokens.colorStatusDangerBackground1,
    ...shorthands.borderColor(tokens.colorStatusDangerBorder1),
  },
  neutral: {
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.borderColor(tokens.colorNeutralStroke2),
  },
});

const VARIANT: Record<string, keyof ReturnType<typeof useStyles>> = {
  GET: 'get',
  POST: 'post',
  PUT: 'put',
  PATCH: 'patch',
  DELETE: 'delete',
};

export interface MethodBadgeProps {
  method: Uppercase<HttpMethod> | string;
  className?: string;
}

export function MethodBadge({ method, className }: MethodBadgeProps) {
  const styles = useStyles();
  const variant = VARIANT[method] ?? 'neutral';
  return (
    <span
      className={mergeClasses(styles.base, styles[variant], className)}
      data-testid="method-badge"
      data-method={method}
    >
      {method}
    </span>
  );
}
