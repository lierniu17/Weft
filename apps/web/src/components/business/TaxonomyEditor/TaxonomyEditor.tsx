import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { Category } from "../../../contracts/draft.ts";
import type { Taxonomy, TaxonomyCategory } from "../../../contracts/taxonomy.ts";
import { cx } from "../../../lib/cx.ts";
import { CATEGORIES, categoryLabel } from "../../../lib/labels.ts";
import { validateSubtype } from "../../../lib/taxonomy.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { Input } from "../../basics/Input/Input.tsx";

export type TaxonomyEditorProps = {
  taxonomy: Taxonomy;
  /** Called with a validated, trimmed name; the parent persists it and passes the new taxonomy. */
  onAddSubtype: (category: Category, name: string) => void;
  className?: string;
};

function Group({
  group,
  taxonomy,
  onAddSubtype,
}: {
  group: TaxonomyCategory;
  taxonomy: Taxonomy;
  onAddSubtype: TaxonomyEditorProps["onAddSubtype"];
}) {
  const headingId = useId();
  const label = categoryLabel(group.category);
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const addButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) input.current?.focus();
    if (!adding && returnFocus.current) {
      returnFocus.current = false;
      addButton.current?.focus();
    }
  }, [adding]);

  const close = () => {
    setAdding(false);
    setValue("");
    setError(undefined);
    returnFocus.current = true;
  };

  const submit = () => {
    const result = validateSubtype(taxonomy, group.category, value);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onAddSubtype(group.category, result.name);
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-xs border-b border-neutral-divider px-md py-sm"
    >
      <div className="flex items-center gap-sm">
        <h3 id={headingId} className="flex-1 text-body-md font-semibold text-neutral-text-primary">
          {label}
        </h3>
        {!adding && (
          <Button
            ref={addButton}
            variant="ghost"
            size="sm"
            aria-label={`在「${label}」下新增小类`}
            onClick={() => setAdding(true)}
          >
            ＋ 小类
          </Button>
        )}
      </div>
      <p className="text-caption text-neutral-text-secondary">
        {group.subtypes.map((s, i) => (
          <span key={s.name}>
            {i > 0 && " · "}
            {s.name}
            {s.custom && <span className="text-neutral-text-tertiary">（自定义）</span>}
          </span>
        ))}
      </p>
      {adding && (
        <div className="flex items-start gap-sm">
          <Input
            aria-label="新小类名称"
            placeholder="例如：球友"
            ref={input}
            value={value}
            error={error}
            onChange={(e) => {
              setValue(e.target.value);
              setError(undefined);
            }}
            onKeyDown={onKeyDown}
            className="flex-1"
          />
          <Button variant="secondary" onClick={submit} className="mt-xs">
            添加
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * 关系类型词表: the five categories, each listing its subtypes; a custom subtype can be
 * added inside a category (AC-32). Custom subtypes are marked 「（自定义）」.
 */
export function TaxonomyEditor({ taxonomy, onAddSubtype, className }: TaxonomyEditorProps) {
  const groups = CATEGORIES.map(
    (c) => taxonomy.find((g) => g.category === c) ?? { category: c, subtypes: [] },
  );
  return (
    <div className={cx("flex flex-col", className)}>
      {groups.map((g) => (
        <Group key={g.category} group={g} taxonomy={taxonomy} onAddSubtype={onAddSubtype} />
      ))}
    </div>
  );
}
