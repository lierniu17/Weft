import { Avatar } from "../../basics/Avatar/Avatar.tsx";
import { ListItem } from "../../composites/ListItem/ListItem.tsx";

export type PersonRowPerson = {
  id: string;
  name: string;
  /** Primary alias, shown as 「李明（小李）」. */
  alias?: string | null;
  /** Relationship to 本人, e.g. 「大学同学」. */
  relation?: string | null;
  /** Already-formatted recency, e.g. 「3 天前提到」. */
  lastMentioned?: string | null;
  isSelf?: boolean;
};

export type PersonRowProps = {
  person?: PersonRowPerson;
  onClick?: (id: string) => void;
  /** Skeleton row for the first load. */
  loading?: boolean;
  className?: string;
};

/** 人物列表行: Avatar + 姓名（别名）+ 关系 · 最近提到 + ›; 本人 shows 「（我）」 without a chevron. */
export function PersonRow({ person, onClick, loading, className }: PersonRowProps) {
  if (loading || !person) {
    return <ListItem title="" variant="with-avatar" loading className={className} />;
  }
  const self = Boolean(person.isSelf);
  const title = !self && person.alias ? `${person.name}（${person.alias}）` : person.name;
  const subtitle = self
    ? "本人"
    : [person.relation, person.lastMentioned].filter(Boolean).join(" · ") || undefined;
  return (
    <ListItem
      variant={self ? "with-avatar" : "navigational"}
      title={title}
      titleSuffix={self ? "（我）" : undefined}
      subtitle={subtitle}
      leading={<Avatar name={person.name} variant={self ? "self" : "initial"} />}
      onClick={onClick ? () => onClick(person.id) : undefined}
      className={className}
    />
  );
}
