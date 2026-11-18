/** 我的记录: every Entry by 发生日期 (newest first), and one Entry with what it produced. */
import { useNavigate, useParams } from "react-router";
import { ApiError, enc } from "../../api/client.ts";
import { useEntries, useEntry } from "../../api/entries.ts";
import { CONTENT_COLUMN, useToday } from "../../app/layout.ts";
import { Banner } from "../../components/basics/Banner/Banner.tsx";
import { Button } from "../../components/basics/Button/Button.tsx";
import { ConfidenceBadge } from "../../components/business/ConfidenceBadge/ConfidenceBadge.tsx";
import { EntryListItem } from "../../components/business/EntryListItem/EntryListItem.tsx";
import { PersonRow } from "../../components/business/PersonRow/PersonRow.tsx";
import { EmptyState } from "../../components/composites/EmptyState/EmptyState.tsx";
import { ListItem } from "../../components/composites/ListItem/ListItem.tsx";
import { NavBar } from "../../components/composites/NavBar/NavBar.tsx";
import { SectionHeader } from "../../components/composites/SectionHeader/SectionHeader.tsx";
import { cx } from "../../lib/cx.ts";
import { comparePartialDate, formatPartialDate } from "../../lib/datePrecision.ts";
import { predicateLabel } from "../../lib/labels.ts";
import { entryStatus, isBackfilled, monthHeading } from "../../lib/pageModels.ts";

const STATUS_TEXT = {
  confirmed: "已确认",
  pending: "待确认",
  discarded: "已放弃",
  failed: "整理失败",
};

function Loading({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col">
      <ListItem title="" loading />
      <ListItem title="" loading />
      <ListItem title="" loading />
    </div>
  );
}

export function EntriesPage() {
  const navigate = useNavigate();
  const today = useToday();
  const entries = useEntries();
  const sorted = [...(entries.data ?? [])].sort(
    (a, b) =>
      comparePartialDate(b.occurred_on, a.occurred_on) || b.created_at.localeCompare(a.created_at),
  );
  const groups: { heading: string; items: typeof sorted }[] = [];
  for (const e of sorted) {
    const heading = monthHeading(e.occurred_on);
    const last = groups[groups.length - 1];
    if (last?.heading === heading) last.items.push(e);
    else groups.push({ heading, items: [e] });
  }

  return (
    <>
      <NavBar title="我的记录" variant="pushed" onBack={() => navigate(-1)} />
      <div className="min-h-[0] flex-1 overflow-y-auto bg-neutral-bg-layout">
        <div
          data-page-content=""
          className={cx(CONTENT_COLUMN, "flex flex-col gap-lg pt-xs pb-xl")}
        >
          {entries.isPending && <Loading label="正在加载记录" />}
          {entries.isError && (
            <Banner
              variant="error"
              action={
                <Button variant="ghost" size="sm" onClick={() => entries.refetch()}>
                  重试
                </Button>
              }
            >
              记录加载失败
            </Banner>
          )}
          {entries.isSuccess && sorted.length === 0 && (
            <EmptyState
              variant="no-people"
              title="还没有记录"
              description="在对话里写下第一条和人有关的事"
              onAction={() => navigate("/")}
            />
          )}
          {groups.map((g) => (
            <section key={g.heading} aria-label={g.heading} className="flex flex-col gap-sm">
              <SectionHeader title={g.heading} />
              <ul className="motion-stagger -mx-md flex flex-col divide-y divide-neutral-divider">
                {g.items.map((e) => (
                  <li key={e.id}>
                    <EntryListItem
                      text={e.text}
                      occurredOn={e.occurred_on}
                      today={today}
                      status={entryStatus(e)}
                      backfilled={e.kind === "user" && isBackfilled(e)}
                      manual={e.kind === "manual_edit"}
                      onClick={() => navigate(`/entries/${enc(e.id)}`)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

export function EntryPage() {
  const { entryId } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const entry = useEntry(entryId);
  const notFound =
    entry.error instanceof ApiError && (entry.error.notFound || entry.error.status === 422);

  return (
    <>
      <NavBar title="记录" variant="pushed" onBack={() => navigate(-1)} />
      <div className="min-h-[0] flex-1 overflow-y-auto">
        <div data-page-content="" className={cx(CONTENT_COLUMN, "flex flex-col pb-xl")}>
          {entry.isPending && <Loading label="正在加载记录" />}
          {notFound && (
            <EmptyState
              variant="not-found"
              title="这条记录不存在"
              description="可能已被删除，或不属于你"
              actionLabel="回到记录列表"
              onAction={() => navigate("/entries")}
            />
          )}
          {entry.isError && !notFound && <Banner variant="error">记录加载失败</Banner>}
          {entry.data && (
            <div className="flex flex-col gap-lg pt-xs">
              {/* the Entry itself, as its own words on the page (no card, AC-4) */}
              <div className="flex flex-col gap-sm">
                <p className="whitespace-pre-wrap break-words text-body-lg">
                  {entry.data.entry.text}
                </p>
                <p className="text-meta text-neutral-text-tertiary">
                  {entry.data.entry.kind === "manual_edit" ? "手动编辑 · " : "记录 · "}
                  {formatPartialDate(entry.data.entry.occurred_on, today)} ·{" "}
                  {STATUS_TEXT[entryStatus(entry.data.entry)]}
                </p>
              </div>
              <section aria-label="提到的人物" className="flex flex-col gap-sm">
                <SectionHeader title="提到的人物" count={entry.data.persons.length} />
                {entry.data.persons.length === 0 ? (
                  <p className="text-body-sm text-neutral-text-tertiary">没有写进图谱的人物</p>
                ) : (
                  <ul className="-mx-md">
                    {entry.data.persons.map((p) => (
                      <li key={p.id}>
                        <PersonRow
                          person={{
                            id: p.id,
                            name: p.name,
                            alias: p.aliases[0],
                            isSelf: p.is_self,
                          }}
                          onClick={(id) => navigate(`/people/${enc(id)}`)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section aria-label="产生的信息" className="flex flex-col gap-sm">
                <SectionHeader title="产生的信息" count={entry.data.facts.length} />
                {entry.data.facts.length === 0 ? (
                  <p className="text-body-sm text-neutral-text-tertiary">没有写进图谱的信息</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-neutral-divider">
                    {entry.data.facts.map((f) => (
                      <li key={f.id} className="py-sm text-body-md">
                        <ConfidenceBadge
                          level={f.confidence}
                          sentence={f.fact || `${predicateLabel(f.predicate)}：${f.object}`}
                        />
                        {!f.current && !f.unverified && (
                          <span className="text-meta text-neutral-text-tertiary"> · 已失效</span>
                        )}
                        {f.unverified && (
                          <span className="text-meta text-status-warning-6"> · 待核实</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
