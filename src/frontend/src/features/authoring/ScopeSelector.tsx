import { useQuery } from '@tanstack/react-query';
import {
  makeStyles,
  tokens,
  mergeClasses,
  shorthands,
  Text,
  Spinner,
  Button,
  Checkbox,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { CubeRegular, DismissCircleRegular } from '@fluentui/react-icons';
import { fonts, radius, space } from '../../theme/tokens';
import { ScopeChips } from '../../components';
import { api } from '../../lib/api';
import type { VocabularyObject } from '../../lib/types/api';
import { type ScopeSelection, isUnscoped, selectionToChips } from './scope';

/**
 * The authoring "Scope" selector. Loads the controlled vocabulary tree and lets a BA pick the
 * OBJECT(S) a rule operates on (a row of toggle chips), then optionally narrow to specific
 * PROPERTIES within each chosen object. The active selection is shown as removable chips that read
 * identically to the repository "Operates on" panel (shared {@link ScopeChips}). Selection is
 * controlled by the parent so it persists across interpret iterations.
 */

const useStyles = makeStyles({
  wrap: { display: 'flex', flexDirection: 'column', gap: space.md },
  helper: { color: tokens.colorNeutralForeground3, lineHeight: 1.5 },
  flowLabel: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground4,
  },
  objectRow: { display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  toggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    paddingInline: space.md,
    paddingBlock: '7px',
    borderRadius: radius.pill,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground2,
    fontFamily: fonts.body,
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'border-color 0.14s ease, background-color 0.14s ease, color 0.14s ease',
    ':hover': {
      ...shorthands.borderColor(tokens.colorBrandStroke1),
      backgroundColor: tokens.colorBrandBackground2,
    },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: tokens.colorBrandStroke1,
      outlineOffset: '2px',
    },
  },
  toggleSelected: {
    ...shorthands.borderColor(tokens.colorBrandStroke1),
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontWeight: 600,
  },
  toggleIcon: { flexShrink: 0 },
  propsPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke3),
  },
  propsHeader: { fontWeight: 600, color: tokens.colorNeutralForeground2, fontSize: '12.5px' },
  propsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
    gap: '2px 16px',
  },
  dataType: { color: tokens.colorNeutralForeground4, fontSize: '11px', marginInlineStart: '4px' },
  activeRow: { display: 'flex', flexDirection: 'column', gap: space.sm },
});

export interface ScopeSelectorProps {
  selection: ScopeSelection;
  onChange: (next: ScopeSelection) => void;
}

export function ScopeSelector({ selection, onChange }: ScopeSelectorProps) {
  const styles = useStyles();

  const vocabQuery = useQuery({
    queryKey: ['vocabulary'],
    queryFn: ({ signal }) => api.getVocabulary(signal),
    staleTime: 5 * 60_000,
  });

  const objects: VocabularyObject[] = vocabQuery.data?.objects ?? [];

  const toggleObject = (name: string) => {
    const isSelected = selection.objects.includes(name);
    if (isSelected) {
      // Deselecting an object also drops any of its properties from the property scope.
      const obj = objects.find((o) => o.name === name);
      const objPaths = new Set((obj?.properties ?? []).map((p) => p.path));
      onChange({
        objects: selection.objects.filter((o) => o !== name),
        properties: selection.properties.filter((p) => !objPaths.has(p)),
      });
    } else {
      onChange({ ...selection, objects: [...selection.objects, name] });
    }
  };

  const toggleProperty = (path: string, checked: boolean) => {
    onChange({
      ...selection,
      properties: checked
        ? [...selection.properties, path]
        : selection.properties.filter((p) => p !== path),
    });
  };

  const removeObject = (name: string) => toggleObject(name);
  const clearAll = () => onChange({ objects: [], properties: [] });

  const selectedObjects = objects.filter((o) => selection.objects.includes(o.name));
  const chips = selectionToChips(selection, objects);

  return (
    <div className={styles.wrap}>
      <Text className={styles.helper} size={200} as="p">
        Pick the object(s) this rule operates on, then describe the rule — the interpreter is
        constrained to your selection.
      </Text>

      {vocabQuery.isLoading && <Spinner size="tiny" label="Loading vocabulary…" />}

      {vocabQuery.isError && (
        <MessageBar intent="warning" role="status">
          <MessageBarBody>
            Could not load the vocabulary; you can still interpret against the full vocabulary.
          </MessageBarBody>
        </MessageBar>
      )}

      {!vocabQuery.isLoading && !vocabQuery.isError && objects.length > 0 && (
        <>
          <div className={styles.objectRow} role="group" aria-label="Objects this rule operates on">
            {objects.map((obj) => {
              const isSelected = selection.objects.includes(obj.name);
              return (
                <button
                  key={obj.name}
                  type="button"
                  className={mergeClasses(styles.toggle, isSelected && styles.toggleSelected)}
                  aria-pressed={isSelected}
                  onClick={() => toggleObject(obj.name)}
                >
                  <CubeRegular className={styles.toggleIcon} fontSize={15} aria-hidden />
                  {obj.label}
                </button>
              );
            })}
            <Button
              appearance="subtle"
              size="small"
              icon={<DismissCircleRegular />}
              onClick={clearAll}
              disabled={isUnscoped(selection)}
            >
              All objects
            </Button>
          </div>

          {/* Secondary, optional property narrowing for each selected object. */}
          {selectedObjects.map((obj) => (
            <fieldset
              key={obj.name}
              className={styles.propsPanel}
              style={{ margin: 0 }}
              aria-label={`Properties of ${obj.label}`}
            >
              <legend className={styles.propsHeader}>
                Narrow {obj.label} to specific properties{' '}
                <Text size={100} style={{ color: tokens.colorNeutralForeground4 }}>
                  (optional)
                </Text>
              </legend>
              <div className={styles.propsGrid}>
                {obj.properties.map((prop) => (
                  <Checkbox
                    key={prop.path}
                    checked={selection.properties.includes(prop.path)}
                    onChange={(_, d) => toggleProperty(prop.path, d.checked === true)}
                    label={
                      <span>
                        {prop.name}
                        <span className={styles.dataType}>{prop.dataType}</span>
                      </span>
                    }
                  />
                ))}
              </div>
            </fieldset>
          ))}

          {chips.length > 0 && (
            <div className={styles.activeRow}>
              <Text className={styles.flowLabel} as="p">
                Scoped to
              </Text>
              <ScopeChips
                items={chips}
                onRemove={removeObject}
                ariaLabel="Active scope selection"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
