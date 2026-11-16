import type { DraftPerson, PersonChoice } from "../../../contracts/draft.ts";
import { SELF_ID } from "../../../contracts/draft.ts";
import { cx } from "../../../lib/cx.ts";
import { Chip } from "../../basics/Chip/Chip.tsx";

export type PersonMatchItemProps = {
  person: DraftPerson;
  /** 需选择: pick a candidate or mark as a new person. */
  onChoose?: (choice: PersonChoice) => void;
  className?: string;
};

/** How a person mentioned in a draft is matched: 已匹配 / 需选择 / 新人物 (AC-12). */
export function PersonMatchItem({ person, onChoose, className }: PersonMatchItemProps) {
  const { mention, match } = person;

  if (match === "ambiguous") {
    return (
      <li
        data-person-match="ambiguous"
        className={cx("flex flex-col gap-sm border-b border-neutral-divider py-sm", className)}
      >
        <p className="truncate text-body-sm text-status-error-6" data-person-match-title="">
          {mention} → 选择是谁
        </p>
        <fieldset aria-label={`「${mention}」是谁`} className="flex flex-wrap gap-sm">
          {(person.candidates ?? []).map((c) => (
            <Chip key={c.person_id} onClick={() => onChoose?.({ person_id: c.person_id })}>
              {c.note ? `${c.name}（${c.note}）` : c.name}
            </Chip>
          ))}
          <Chip variant="selected" onClick={() => onChoose?.("new")}>
            ＋ 新人物
          </Chip>
        </fieldset>
      </li>
    );
  }

  const title =
    match === "matched"
      ? `${mention} → ${person.person_id === SELF_ID ? "我" : (person.name ?? mention)}`
      : mention;
  return (
    <li
      data-person-match={match}
      className={cx("flex items-center gap-sm border-b border-neutral-divider py-sm", className)}
    >
      <div className="flex min-w-[0] flex-1 flex-col">
        <p data-person-match-title="" className="truncate text-body-sm text-neutral-text-primary">
          {title}
        </p>
        {match === "matched" && person.note && (
          <p className="truncate text-caption text-neutral-text-secondary">{person.note}</p>
        )}
      </div>
      <Chip variant="selected">{match === "matched" ? "已匹配" : "新人物"}</Chip>
    </li>
  );
}
