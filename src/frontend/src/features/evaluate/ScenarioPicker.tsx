import {
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  MenuGroup,
  MenuGroupHeader,
  MenuDivider,
  Button,
} from '@fluentui/react-components';
import { ChevronDownRegular, CollectionsRegular } from '@fluentui/react-icons';
import { scenariosByCategory, CATEGORY_LABELS } from './scenarios';
import type { Scenario } from './scenarios';

/**
 * "Load an example" — a one-click library of curated PASS / FAIL / DERIVE transactions, grouped by
 * shelf (Passes / Fails / Derivations). Selecting an item hands the chosen {@link Scenario} back to
 * the page, which loads its facts into the editor and shows its description + expected result.
 *
 * Built on Fluent's `Menu`, so keyboard navigation (arrow keys, Enter, Escape) and focus management
 * come for free; each item is labeled with the scenario name and its expected result.
 */
export function ScenarioPicker({ onSelect }: { onSelect: (s: Scenario) => void }) {
  const groups = scenariosByCategory();

  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button appearance="primary" icon={<CollectionsRegular />} iconPosition="before">
          Load an example
          <ChevronDownRegular style={{ marginInlineStart: 6 }} />
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList data-testid="scenario-menu">
          {groups.map(({ category, items }, gi) => (
            <div key={category}>
              {gi > 0 && <MenuDivider />}
              <MenuGroup>
                <MenuGroupHeader>{CATEGORY_LABELS[category]}</MenuGroupHeader>
                {items.map((s) => (
                  <MenuItem
                    key={s.id}
                    secondaryContent={s.expected}
                    onClick={() => onSelect(s)}
                    data-testid={`scenario-${s.id}`}
                  >
                    {s.name}
                  </MenuItem>
                ))}
              </MenuGroup>
            </div>
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}
