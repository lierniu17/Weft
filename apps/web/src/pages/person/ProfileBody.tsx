/** 画像 sections of one person, with in-place editing (S6 ①) and citations on every item. */
import { useId, useState } from "react";
import type { Profile, ProfileEdit } from "../../api/graph.ts";
import { Input } from "../../components/basics/Input/Input.tsx";
import {
  type ProfileGap,
  ProfileSection,
  ProfileSectionFold,
} from "../../components/business/ProfileSection/ProfileSection.tsx";
import { FormRow } from "../../components/composites/FormRow/FormRow.tsx";
import { SectionHeader } from "../../components/composites/SectionHeader/SectionHeader.tsx";
import { beijingDate, type ProfileView, profileView } from "../../lib/pageModels.ts";

const IDENTITY_FIELDS = [
  ["birthday", "生日", "如 3 月 5 日"],
  ["gender", "性别", ""],
  ["hometown", "籍贯", "如 湖南长沙"],
] as const;

/** The profile's sections in page order: key, title, the view's items, the predicate 添加 writes. */
const SECTIONS = [
  ["roles", "社会角色", "WORKS_AT"],
  ["traits", "性格", "HAS_TRAIT"],
  ["likes", "喜好与厌恶", "LIKES"],
  ["events", "生活事件", "EXPERIENCED"],
  ["etiquette", "相处之道", "HAS_ETIQUETTE"],
  ["opinions", "我的评价", "OPINION"],
] as const satisfies readonly (readonly [keyof ProfileView, string, string])[];

type SectionKey = (typeof SECTIONS)[number][0];

/**
 * What a person's 画像 has nothing for yet, in page order (style refresh AC-9): the missing
 * identity fields, then the empty sections — folded into one 「还可以补充：……」 line.
 */
export function profileGaps(profile: Profile, view = profileView(profile)): ProfileGap[] {
  const identity = IDENTITY_FIELDS.filter(([field]) => !profile.identity[field]).map(
    ([field, label]) => ({ key: field, label }),
  );
  const sections = SECTIONS.filter(([key]) => view[key].length === 0).map(([key, label]) => ({
    key,
    label,
  }));
  return [...identity, ...sections];
}

export type ProfileBodyProps = {
  profile: Profile;
  today: Date;
  editing: boolean;
  /** The field or section the user picked in 「还可以补充」: focused once editing opens. */
  focus?: string | null;
  /** 「还可以补充」 → open in-place editing at that field or section. */
  onPick: (key: string) => void;
  onOpenSources: (itemId: string) => void;
  /** Applied immediately (removing a tag) or on 完成 (text changes). */
  onEdit: (edit: ProfileEdit) => void;
  /** Text edits collected while editing; the page sends them on 完成. */
  pending: Map<string, ProfileEdit>;
  /** His relation subtypes with 本人 (同事、朋友): a current role reads 「… · 同事」. */
  relations?: string[];
  /** No 综合描述 yet, but one is being generated: a skeleton holds its place. */
  summaryPending?: boolean;
};

function IdentityForm({
  profile,
  pending,
  focus,
}: {
  profile: Profile;
  pending: Map<string, ProfileEdit>;
  focus?: string | null;
}) {
  const base = useId();
  return (
    <section aria-label="基本身份" className="flex flex-col gap-sm">
      <SectionHeader title="基本身份" level={2} />
      {IDENTITY_FIELDS.map(([field, label, placeholder]) => (
        <FormRow key={field} label={label} htmlFor={`${base}-${field}`}>
          <Input
            id={`${base}-${field}`}
            defaultValue={profile.identity[field]?.value ?? ""}
            placeholder={placeholder}
            autoFocus={focus === field}
            onChange={(e) => {
              const value = e.target.value.trim();
              if (value) pending.set(`identity:${field}`, { op: "set_identity", field, value });
              else pending.delete(`identity:${field}`);
            }}
          />
        </FormRow>
      ))}
    </section>
  );
}

const VARIANT: Record<SectionKey, "roles" | "tags" | "notes" | "opinion"> = {
  roles: "roles",
  traits: "tags",
  likes: "tags",
  events: "notes",
  etiquette: "notes",
  opinions: "opinion",
};

export function ProfileBody({
  profile,
  today,
  editing,
  focus,
  onPick,
  onOpenSources,
  onEdit,
  pending,
  relations,
  summaryPending,
}: ProfileBodyProps) {
  const view = profileView(profile, relations);
  const [, rerender] = useState(0);
  const remove = (id: string) => onEdit({ op: "delete_fact", fact_id: id });
  const add = (predicate: string) => (text: string) =>
    onEdit({ op: "add_fact", predicate, object: text });
  const change = (id: string, text: string) => {
    const value = text.trim();
    if (value) pending.set(id, { op: "update_fact", fact_id: id, object: value });
    rerender((n) => n + 1);
  };
  const common = { today, onItemOpen: editing ? undefined : onOpenSources };

  return (
    <div className="flex flex-col gap-lg">
      <ProfileSection
        variant="summary"
        items={[]}
        summary={
          profile.summary
            ? { text: profile.summary.text, generatedAt: beijingDate(profile.summary.generated_at) }
            : null
        }
        summaryPending={summaryPending}
        today={today}
      />
      {editing ? (
        <IdentityForm profile={profile} pending={pending} focus={focus} />
      ) : (
        <ProfileSection variant="notes" title="基本身份" items={view.identity} {...common} />
      )}
      {SECTIONS.map(([key, title, predicate]) => (
        <ProfileSection
          key={key}
          variant={VARIANT[key]}
          title={title}
          items={view[key]}
          {...common}
          editing={editing && (key !== "roles" || view.roles.length === 0)}
          onItemRemove={remove}
          onItemChange={change}
          // roles are edited through their citations; empty, they still take a 工作单位
          onItemAdd={key !== "roles" || view.roles.length === 0 ? add(predicate) : undefined}
          focusAdd={focus === key}
        />
      ))}
      {!editing && <ProfileSectionFold gaps={profileGaps(profile, view)} onPick={onPick} />}
    </div>
  );
}
