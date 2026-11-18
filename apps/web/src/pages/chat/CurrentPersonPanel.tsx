/** Desktop right column of the chat when no sheet is open: the person last written about. */
import { useNavigate } from "react-router";
import { enc } from "../../api/client.ts";
import { useEntry } from "../../api/entries.ts";
import { useProfile } from "../../api/graph.ts";
import { useToday } from "../../app/layout.ts";
import { Button } from "../../components/basics/Button/Button.tsx";
import { PersonHeader } from "../../components/business/PersonHeader/PersonHeader.tsx";
import { ProfileSection } from "../../components/business/ProfileSection/ProfileSection.tsx";
import { SectionHeader } from "../../components/composites/SectionHeader/SectionHeader.tsx";
import { beijingDate, profileView } from "../../lib/pageModels.ts";

export function CurrentPersonPanel({ entryId }: { entryId: string | undefined }) {
  const navigate = useNavigate();
  const today = useToday();
  const entry = useEntry(entryId);
  const personId = entry.data?.persons.find((p) => !p.is_self)?.id;
  const profile = useProfile(personId);

  if (!personId) {
    return (
      <div className="flex flex-col gap-sm p-md">
        <SectionHeader title="当前人物" />
        <p className="text-body-sm text-neutral-text-secondary">
          确认草稿、查看出处时会在这里展开；记一笔之后，这里显示最近提到的人。
        </p>
      </div>
    );
  }
  if (!profile.data) return <PersonHeader name="" loading className="p-md" />;

  const p = profile.data;
  const view = profileView(p);
  return (
    <div className="flex flex-col">
      <SectionHeader title="当前人物" className="px-md pt-md" />
      <PersonHeader
        name={p.person.name}
        aliases={p.person.aliases}
        isSelf={p.person.is_self}
        headingLevel={2}
        className="px-md pt-sm"
      />
      <div className="flex flex-col gap-md p-md">
        <ProfileSection
          variant="summary"
          items={[]}
          summary={
            p.summary
              ? { text: p.summary.text, generatedAt: beijingDate(p.summary.generated_at) }
              : null
          }
          today={today}
        />
        <ProfileSection variant="roles" items={view.roles} today={today} />
        <ProfileSection variant="tags" title="喜好与厌恶" items={view.likes} today={today} />
        <Button variant="secondary" onClick={() => navigate(`/people/${enc(personId)}`)}>
          查看人物页
        </Button>
      </div>
    </div>
  );
}
