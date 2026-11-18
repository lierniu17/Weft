import type { ReactNode } from "react";
import type { ClosenessLevel } from "../../../contracts/draft.ts";
import type { Taxonomy } from "../../../contracts/taxonomy.ts";
import { EMPTY_FILTER, type GraphFilter } from "../../../lib/graphFilter.ts";
import { CATEGORIES, categoryLabel } from "../../../lib/labels.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { Chip } from "../../basics/Chip/Chip.tsx";
import { Drawer, type DrawerVariant } from "../../basics/Drawer/Drawer.tsx";

export type GraphFilterSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Built-in + this user's custom subtypes. */
  taxonomy: Taxonomy;
  value: GraphFilter;
  /** Fires on every change; the panorama refilters live. */
  onChange: (value: GraphFilter) => void;
  variant?: DrawerVariant;
  /** `false`: the desktop right column beside the panorama (side-panel in place, page stays interactive). */
  modal?: boolean;
  /** 「只显示符合的人」 instead of fading the rest (graph-viz AC-13); omitted = no toggle. */
  onlyMatching?: boolean;
  onOnlyMatchingChange?: (only: boolean) => void;
};

const CLOSENESS: { value: ClosenessLevel | null; label: string }[] = [
  { value: null, label: "全部亲密度" },
  { value: "intimate", label: "至交" },
  { value: "close", label: "亲近及以上" },
  { value: "familiar", label: "熟悉及以上" },
  { value: "casual", label: "一般及以上" },
];

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="m-[0] flex min-w-[0] flex-col border-0 p-[0]">
      <legend className="mb-sm text-caption text-neutral-text-secondary">{label}</legend>
      <div className="flex flex-wrap gap-sm">{children}</div>
    </fieldset>
  );
}

/**
 * 全景图筛选: relationship categories and subtypes (multi-select) + a closeness floor (single);
 * people who do not match fade on the graph, or with 「只显示符合的人」 are left out.
 */
export function GraphFilterSheet({
  open,
  onOpenChange,
  taxonomy,
  value,
  onChange,
  variant = "bottom-sheet",
  modal,
  onlyMatching = false,
  onOnlyMatchingChange,
}: GraphFilterSheetProps) {
  const toggleCategory = (c: GraphFilter["categories"][number]) => {
    if (value.categories.includes(c)) {
      const dropped = new Set(
        taxonomy.find((g) => g.category === c)?.subtypes.map((s) => s.name) ?? [],
      );
      // A subtype stays selected only if another chosen category still offers it.
      const offered = new Set(
        taxonomy
          .filter((g) => g.category !== c && value.categories.includes(g.category))
          .flatMap((g) => g.subtypes.map((s) => s.name)),
      );
      onChange({
        ...value,
        categories: value.categories.filter((x) => x !== c),
        subtypes: value.subtypes.filter((s) => !dropped.has(s) || offered.has(s)),
      });
    } else {
      onChange({ ...value, categories: [...value.categories, c] });
    }
  };

  const toggleSubtype = (name: string) =>
    onChange({
      ...value,
      subtypes: value.subtypes.includes(name)
        ? value.subtypes.filter((s) => s !== name)
        : [...value.subtypes, name],
    });

  const subtypeGroups = taxonomy.filter((g) => value.categories.includes(g.category));

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="筛选"
      variant={variant}
      modal={modal}
      footer={
        <>
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={() => onChange(EMPTY_FILTER)}
          >
            重置
          </Button>
          <Button size="lg" className="flex-1" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-lg">
        <Group label="关系大类">
          {CATEGORIES.map((c) => {
            const on = value.categories.includes(c);
            return (
              <Chip
                key={c}
                variant={on ? "selected" : "neutral"}
                pressed={on}
                onClick={() => toggleCategory(c)}
              >
                {categoryLabel(c)}
              </Chip>
            );
          })}
        </Group>

        {subtypeGroups.length > 0 && (
          <Group label="关系小类">
            {subtypeGroups.flatMap((g) =>
              g.subtypes.map((s) => {
                const on = value.subtypes.includes(s.name);
                return (
                  <Chip
                    key={`${g.category}-${s.name}`}
                    variant={on ? "selected" : "neutral"}
                    pressed={on}
                    onClick={() => toggleSubtype(s.name)}
                    aria-label={
                      subtypeGroups.length > 1
                        ? `${categoryLabel(g.category)} · ${s.name}${s.custom ? "（自定义）" : ""}`
                        : undefined
                    }
                  >
                    {s.name}
                    {s.custom && "（自定义）"}
                  </Chip>
                );
              }),
            )}
          </Group>
        )}

        <Group label="亲密度">
          {CLOSENESS.map((o) => {
            const on = value.minCloseness === o.value;
            return (
              <Chip
                key={o.label}
                variant={on ? "selected" : "neutral"}
                pressed={on}
                onClick={() => onChange({ ...value, minCloseness: o.value })}
              >
                {o.label}
              </Chip>
            );
          })}
        </Group>

        {onOnlyMatchingChange && (
          <Group label="不符合的人">
            <Chip
              variant={onlyMatching ? "neutral" : "selected"}
              pressed={!onlyMatching}
              onClick={() => onOnlyMatchingChange(false)}
            >
              淡化显示
            </Chip>
            <Chip
              variant={onlyMatching ? "selected" : "neutral"}
              pressed={onlyMatching}
              onClick={() => onOnlyMatchingChange(true)}
            >
              只显示符合的人
            </Chip>
          </Group>
        )}
      </div>
    </Drawer>
  );
}
