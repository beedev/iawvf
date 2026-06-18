import { makeStyles, tokens } from '@fluentui/react-components';
import { fonts, radius, space } from '../../theme/tokens';
import type { SchemaField } from './openapi';

/**
 * A compact, scannable table of schema fields: name (mono), type, a required marker (text, not color
 * alone), and an optional description. Used inside an endpoint to show the request body and the main
 * success response shape without overwhelming the reader.
 */

const useStyles = makeStyles({
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  headRow: {
    textAlign: 'left',
    color: tokens.colorNeutralForeground4,
    fontSize: '10.5px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  headCell: {
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    whiteSpace: 'nowrap',
  },
  cell: {
    paddingBlock: '7px',
    paddingInline: space.sm,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    verticalAlign: 'top',
    color: tokens.colorNeutralForeground2,
  },
  name: {
    fontFamily: fonts.mono,
    fontSize: '12.5px',
    color: tokens.colorNeutralForeground1,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  type: {
    fontFamily: fonts.mono,
    fontSize: '12px',
    color: tokens.colorBrandForeground1,
    whiteSpace: 'nowrap',
  },
  req: {
    display: 'inline-block',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: tokens.colorStatusDangerForeground1,
    backgroundColor: tokens.colorStatusDangerBackground1,
    borderRadius: radius.sm,
    paddingInline: '6px',
    paddingBlock: '1px',
  },
  optional: {
    fontSize: '11px',
    color: tokens.colorNeutralForeground4,
  },
  desc: { color: tokens.colorNeutralForeground3, fontSize: '12.5px', lineHeight: 1.5 },
  empty: { color: tokens.colorNeutralForeground4, fontSize: '12.5px', fontStyle: 'italic' },
});

export interface SchemaTableProps {
  fields: SchemaField[];
  /** Accessible caption, e.g. "Request body fields". */
  caption: string;
  /** Shown when there are no first-level fields (e.g. a free-form object). */
  emptyHint?: string;
}

export function SchemaTable({ fields, caption, emptyHint }: SchemaTableProps) {
  const styles = useStyles();

  if (fields.length === 0) {
    return (
      <p className={styles.empty}>{emptyHint ?? 'Free-form object — see the example below.'}</p>
    );
  }

  return (
    <table className={styles.table}>
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className={styles.headRow}>
          <th className={styles.headCell} scope="col">
            Field
          </th>
          <th className={styles.headCell} scope="col">
            Type
          </th>
          <th className={styles.headCell} scope="col">
            Required
          </th>
          <th className={styles.headCell} scope="col">
            Description
          </th>
        </tr>
      </thead>
      <tbody>
        {fields.map((field) => (
          <tr key={field.name}>
            <td className={`${styles.cell} ${styles.name}`}>{field.name}</td>
            <td className={`${styles.cell} ${styles.type}`}>{field.type}</td>
            <td className={styles.cell}>
              {field.required ? (
                <span className={styles.req}>Required</span>
              ) : (
                <span className={styles.optional}>Optional</span>
              )}
            </td>
            <td className={`${styles.cell} ${styles.desc}`}>{field.description ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
