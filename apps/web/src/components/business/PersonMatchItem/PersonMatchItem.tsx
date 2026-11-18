import type { DraftPerson, PersonChoice } from "../../../contracts/draft.ts";
import { SELF_ID } from "../../../contracts/draft.ts";
import { cx } from "../../../lib/cx.ts";
import { Avatar } from "../../basics/Avatar/Avatar.tsx";
import { Chip } from "../../basics/Chip/Chip.tsx";

export type PersonMatchItemProps = {
  person: DraftPerson;
  /** 需选择: pick a candidate or mark as a new person. */
  onChoose?: (choice: PersonChoice) => void;
  className?: string;
};

const ROW = "flex items-center gap-sm py-sm";

/**
 * How a person mentioned in a draft is matched (AC-12), as a sentence (style refresh AC-8):
 * 已匹配 「老张 是 张伟」 + a green status chip; 需选择 「小李 是谁？」 in error text with the
 * candidates; 新人物 the mention with a neutral chip.
 */
export function PersonMatchItem({ person, onChoose, className }: PersonMatchItemProps) {
  const { mention, match } = person;

  if (match === "ambiguous") {
    return (
      <li data-person-match="ambiguous" className={cx("flex flex-col gap-sm py-sm", className)}>
        <div className="flex items-center gap-sm">
          <Avatar name={mention} size="md" />
          <p
            className="min-w-[0] flex-1 truncate text-body-md text-status-error-6"
            data-person-match-title=""
          >
            {mention} 是谁？
          </p>
          <Chip variant="danger">需选择</Chip>
        </div>
        <fieldset aria-label={`「${mention}」是谁`} className="flex flex-wrap gap-sm pl-[44px]">
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

  const isSelf = person.person_id === SELF_ID;
  const name = isSelf ? "我" : (person.name ?? mention);
  const same = match !== "matched" || name === mention;
  return (
    <li data-person-match={match} className={cx(ROW, className)}>
      <Avatar name={name} variant={isSelf ? "self" : "initial"} size="md" />
      <div className="flex min-w-[0] flex-1 flex-col">
        <p data-person-match-title="" className="truncate text-body-md text-neutral-text-primary">
          {same ? (
            name
          ) : (
            <>
              {mention} <span className="text-neutral-text-tertiary">是</span> {name}
            </>
          )}
        </p>
        {match === "matched" && person.note && (
          <p className="truncate text-meta text-neutral-text-tertiary">{person.note}</p>
        )}
        {match === "new" && (
          <p className="text-meta text-neutral-text-tertiary">图谱里还没有这个人</p>
        )}
      </div>
      {match === "matched" ? <Chip variant="success">已匹配</Chip> : <Chip>新人物</Chip>}
    </li>
  );
}
