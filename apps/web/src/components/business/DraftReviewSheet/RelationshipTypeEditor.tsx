import { useState } from "react";
import type {
  Category,
  DraftRelationship,
  DraftRelationshipType,
} from "../../../contracts/draft.ts";
import type { Taxonomy } from "../../../contracts/taxonomy.ts";
import { categoryLabel } from "../../../lib/labels.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { Chip } from "../../basics/Chip/Chip.tsx";
import { RelationshipTypeTag } from "../RelationshipTypeTag/RelationshipTypeTag.tsx";

export type RelationshipTypeEditorProps = {
  relationship: DraftRelationship;
  taxonomy: Taxonomy;
  onChange?: (index: number, type: Omit<DraftRelationshipType, "original">) => void;
};

/**
 * The relationship types of one draft relationship, each re-classifiable from the
 * user's vocabulary (built-in + custom subtypes, AC-32). Inline, so focus stays in the sheet.
 */
export function RelationshipTypeEditor({
  relationship,
  taxonomy,
  onChange,
}: RelationshipTypeEditorProps) {
  const [editing, setEditing] = useState<number | null>(null);
  const types = relationship.types ?? [];
  const isCustom = (t: DraftRelationshipType) =>
    taxonomy
      .find((g) => g.category === t.category)
      ?.subtypes.some((s) => s.name === t.subtype && s.custom) ?? false;

  const toggle = (index: number) => setEditing((e) => (e === index ? null : index));
  const pick = (category: Category, subtype: string) => {
    if (editing === null) return;
    onChange?.(editing, { category, subtype });
    setEditing(null);
  };
  const current = editing === null ? null : types[editing];

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-xs">
        {types.map((t, i) => {
          const label = `${categoryLabel(t.category)} · ${t.subtype}`;
          return (
            <span key={`${t.category}-${t.subtype}`} className="flex items-center gap-xs">
              <RelationshipTypeTag {...t} custom={isCustom(t)} />
              {onChange && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`修改关系类型「${label}」`}
                  aria-expanded={editing === i}
                  onClick={() => toggle(i)}
                >
                  改
                </Button>
              )}
            </span>
          );
        })}
        {onChange && types.length === 0 && (
          <Button variant="ghost" size="sm" aria-expanded={editing === 0} onClick={() => toggle(0)}>
            添加关系类型
          </Button>
        )}
      </div>
      {editing !== null && (
        <div className="flex flex-col gap-sm rounded-md bg-neutral-bg-subtle p-sm">
          {taxonomy.map((group) => {
            const name = categoryLabel(group.category);
            return (
              <fieldset key={group.category} className="flex flex-col gap-xs">
                <legend className="mb-xs text-caption text-neutral-text-secondary">{name}</legend>
                <div className="flex flex-wrap gap-xs">
                  {group.subtypes.map((s) => {
                    const selected =
                      current?.category === group.category && current.subtype === s.name;
                    return (
                      <Chip
                        key={s.name}
                        variant={selected ? "selected" : "neutral"}
                        pressed={selected}
                        onClick={() => pick(group.category, s.name)}
                      >
                        {s.custom ? `${s.name}（自定义）` : s.name}
                      </Chip>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}
    </div>
  );
}
