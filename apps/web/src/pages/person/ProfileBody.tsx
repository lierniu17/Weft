/** 画像 sections of one person, with in-place editing (S6 ①) and citations on every item. */
import { useId, useState } from "react";
import type { Profile, ProfileEdit } from "../../api/graph.ts";
import { Input } from "../../components/basics/Input/Input.tsx";
import { ProfileSection } from "../../components/business/ProfileSection/ProfileSection.tsx";
import { FormRow } from "../../components/composites/FormRow/FormRow.tsx";
import { SectionHeader } from "../../components/composites/SectionHeader/SectionHeader.tsx";
import { beijingDate, profileView } from "../../lib/pageModels.ts";

const IDENTITY_FIELDS = [
  ["birthday", "生日", "如 3 月 5 日"],
  ["gender", "性别", ""],
  ["hometown", "籍贯", "如 湖南长沙"],
] as const;

export type ProfileBodyProps = {
  profile: Profile;
  today: Date;
  editing: boolean;
  onOpenSources: (itemId: string) => void;
  /** Applied immediately (removing a tag) or on 完成 (text changes). */
  onEdit: (edit: ProfileEdit) => void;
  /** Text edits collected while editing; the page sends them on 完成. */
  pending: Map<string, ProfileEdit>;
};

function IdentityForm({
  profile,
  pending,
}: {
  profile: Profile;
  pending: Map<string, ProfileEdit>;
}) {
  const base = useId();
  return (
    <section aria-label="基本身份" className="flex flex-col gap-sm">
      <SectionHeader title="基本身份" level={3} />
      {IDENTITY_FIELDS.map(([field, label, placeholder]) => (
        <FormRow key={field} label={label} htmlFor={`${base}-${field}`}>
          <Input
            id={`${base}-${field}`}
            defaultValue={profile.identity[field]?.value ?? ""}
            placeholder={placeholder}
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

export function ProfileBody({
  profile,
  today,
  editing,
  onOpenSources,
  onEdit,
  pending,
}: ProfileBodyProps) {
  const view = profileView(profile);
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
  const editable = {
    editing,
    onItemRemove: remove,
    onItemChange: change,
  };

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
        today={today}
      />
      {editing ? (
        <IdentityForm profile={profile} pending={pending} />
      ) : (
        <ProfileSection variant="notes" title="基本身份" items={view.identity} {...common} />
      )}
      <ProfileSection variant="roles" items={view.roles} {...common} />
      <ProfileSection
        variant="tags"
        title="性格"
        items={view.traits}
        {...common}
        {...editable}
        onItemAdd={add("HAS_TRAIT")}
      />
      <ProfileSection
        variant="tags"
        title="喜好与厌恶"
        items={view.likes}
        {...common}
        {...editable}
        onItemAdd={add("LIKES")}
      />
      <ProfileSection
        variant="notes"
        title="生活事件"
        items={view.events}
        {...common}
        {...editable}
      />
      <ProfileSection
        variant="notes"
        title="相处之道"
        items={view.etiquette}
        {...common}
        {...editable}
      />
      <ProfileSection variant="opinion" items={view.opinions} {...common} {...editable} />
    </div>
  );
}
