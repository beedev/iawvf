import {
  makeStyles,
  mergeClasses,
  tokens,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Text,
} from '@fluentui/react-components';
import { CheckmarkRegular, DismissRegular } from '@fluentui/react-icons';
import { fonts, radius, space } from '../../theme/tokens';
import { StatusBadge } from '../../components';
import type { DecisionTrace } from '../../lib/types/api';

/**
 * A readable, per-rule decision trace. Each rule is an accordion item showing whether it applied,
 * its assertion result, the leaf conditions (subject / operator / resolved values / result), and the
 * outcome it produced — the framework's explanation of *why* it decided what it decided.
 */

const useStyles = makeStyles({
  headerInner: {
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  ruleKey: { fontFamily: fonts.mono, fontWeight: 500, color: tokens.colorBrandForeground1 },
  phase: {
    fontSize: '11px',
    fontWeight: 600,
    paddingInline: '7px',
    paddingBlock: '1px',
    borderRadius: radius.sm,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
  },
  panelBody: { display: 'flex', flexDirection: 'column', gap: space.md, paddingBlock: space.sm },
  condList: { display: 'flex', flexDirection: 'column', gap: space.xs },
  cond: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: space.sm,
    alignItems: 'center',
    padding: space.sm,
    borderRadius: radius.sm,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  condText: { fontFamily: fonts.mono, fontSize: '12px', color: tokens.colorNeutralForeground1 },
  condResult: {
    display: 'grid',
    placeItems: 'center',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
  },
  pass: {
    backgroundColor: tokens.colorPaletteGreenBackground2,
    color: tokens.colorPaletteGreenForeground1,
  },
  fail: {
    backgroundColor: tokens.colorPaletteRedBackground2,
    color: tokens.colorPaletteRedForeground1,
  },
  produced: {
    fontFamily: fonts.mono,
    fontSize: '12.5px',
    color: tokens.colorNeutralForeground2,
    padding: space.sm,
    borderRadius: radius.sm,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  op: { color: tokens.colorNeutralForeground3 },
  val: { color: tokens.colorBrandForeground1 },
});

export function DecisionTracePanel({ trace }: { trace: DecisionTrace[] }) {
  const styles = useStyles();

  return (
    <Accordion multiple collapsible data-testid="decision-trace">
      {trace.map((t, idx) => (
        <AccordionItem value={`${t.ruleKey}-${idx}`} key={`${t.ruleKey}-${idx}`}>
          <AccordionHeader>
            <div className={styles.headerInner}>
              <span className={styles.ruleKey}>{t.ruleKey}</span>
              <span className={styles.phase}>{t.phase}</span>
              {t.applied ? (
                <StatusBadge kind="info">Applied</StatusBadge>
              ) : (
                <StatusBadge kind="neutral">Not applied</StatusBadge>
              )}
              {t.assertResult !== null && (
                <StatusBadge kind={t.assertResult ? 'success' : 'error'}>
                  Assert {t.assertResult ? 'passed' : 'failed'}
                </StatusBadge>
              )}
              {t.produced && <StatusBadge kind="warning">{t.produced.type}</StatusBadge>}
            </div>
          </AccordionHeader>
          <AccordionPanel>
            <div className={styles.panelBody}>
              {t.conditions.length > 0 ? (
                <div>
                  <Text size={200} weight="semibold" block style={{ marginBottom: space.xs }}>
                    Conditions
                  </Text>
                  <div className={styles.condList}>
                    {t.conditions.map((c, i) => (
                      <div className={styles.cond} key={i}>
                        <span
                          className={mergeClasses(styles.condResult, c.result ? styles.pass : styles.fail)}
                          aria-label={c.result ? 'condition met' : 'condition not met'}
                        >
                          {c.result ? (
                            <CheckmarkRegular fontSize={14} />
                          ) : (
                            <DismissRegular fontSize={14} />
                          )}
                        </span>
                        <span className={styles.condText}>
                          {c.subject} <span className={styles.op}>{c.operator}</span>{' '}
                          {c.resolvedRight !== null && (
                            <span className={styles.val}>{c.resolvedRight}</span>
                          )}
                          {c.resolvedLeft !== null && (
                            <span className={styles.op}> (left: {c.resolvedLeft})</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  No leaf conditions evaluated for this rule.
                </Text>
              )}

              {t.produced && (
                <div className={styles.produced}>
                  <Text size={200} weight="semibold" block style={{ marginBottom: 4 }}>
                    Produced outcome
                  </Text>
                  {t.produced.type}
                  {t.produced.reason ? ` — ${t.produced.reason}` : ''}
                </div>
              )}
            </div>
          </AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
