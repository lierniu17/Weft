/** 关系页: RelationshipOverview, 感受 in both directions, and the facts between the two. */
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ApiError, enc } from "../../api/client.ts";
import { usePair } from "../../api/graph.ts";
import { CONTENT_COLUMN, useSidePanel, useToday } from "../../app/layout.ts";
import { Banner } from "../../components/basics/Banner/Banner.tsx";
import { Button } from "../../components/basics/Button/Button.tsx";
import { Skeleton } from "../../components/basics/Skeleton/Skeleton.tsx";
import { CitationSheet } from "../../components/business/CitationSheet/CitationSheet.tsx";
import { FactTimeline } from "../../components/business/FactTimeline/FactTimeline.tsx";
import { FeelingRow } from "../../components/business/FeelingRow/FeelingRow.tsx";
import { RelationshipOverview } from "../../components/business/RelationshipOverview/RelationshipOverview.tsx";
import { EmptyState } from "../../components/composites/EmptyState/EmptyState.tsx";
import { NavBar } from "../../components/composites/NavBar/NavBar.tsx";
import { SectionHeader } from "../../components/composites/SectionHeader/SectionHeader.tsx";
import type { Citation } from "../../contracts/answer.ts";
import { confidenceLabel } from "../../lib/confidence.ts";
import { cx } from "../../lib/cx.ts";
import { feelingDimensions, toCitations } from "../../lib/pageModels.ts";

export function RelationshipPage() {
  const { personId = "", otherId = "" } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const sheet = useSidePanel();
  const pair = usePair(personId, otherId);
  const [citations, setCitations] = useState<Citation[] | null>(null);

  const notFound =
    pair.error instanceof ApiError && (pair.error.notFound || pair.error.status === 422);
  if (notFound || personId === otherId) {
    return (
      <>
        <NavBar title="关系" variant="pushed" onBack={() => navigate(-1)} />
        <EmptyState
          variant="not-found"
          title="这段关系不存在"
          onAction={() => navigate("/people")}
        />
      </>
    );
  }

  const d = pair.data;
  const name = (p: { name: string; is_self: boolean }) => (p.is_self ? "我" : p.name);
  const selfPair = Boolean(d && (d.a.is_self || d.b.is_self));
  const rel = d?.relationship;
  const title = d ? `${name(d.a)} 与 ${name(d.b)}` : "关系";
  const subtitle = d
    ? selfPair
      ? "我的关系"
      : `第三方关系${rel ? ` · ${confidenceLabel(rel.confidence)}` : ""}`
    : undefined;

  return (
    <div className="flex min-h-[0] flex-1">
      <div className="flex min-w-[0] flex-1 flex-col">
        <NavBar title={title} subtitle={subtitle} variant="pushed" onBack={() => navigate(-1)} />
        <div className="min-h-[0] flex-1 overflow-y-auto bg-neutral-bg-layout">
          {pair.isError && !notFound && (
            <Banner variant="error" className={CONTENT_COLUMN}>
              关系加载失败
            </Banner>
          )}
          {!d ? (
            <div
              role="status"
              aria-busy="true"
              aria-label="正在加载关系"
              className={cx(CONTENT_COLUMN, "flex flex-col gap-md py-md")}
            >
              <Skeleton width="60%" />
              <Skeleton width="80%" />
              <Skeleton variant="card" />
            </div>
          ) : (
            <div
              data-page-content=""
              className="motion-stagger mx-auto flex w-full max-w-[720px] flex-col gap-lg pb-xl"
            >
              <RelationshipOverview
                variant={selfPair ? "self-pair" : "third-party"}
                a={name(d.a)}
                b={name(d.b)}
                types={rel?.types ?? []}
                status={rel?.status}
                metAt={rel?.met_at}
                origin={rel?.origin}
                introducedBy={rel?.introduced_by}
                summary={rel?.summary}
                confidence={rel?.confidence}
                today={today}
                onIntroducerClick={(id) => navigate(`/people/${enc(id)}`)}
              />
              {rel && rel.citations.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mx-md self-start"
                  onClick={() => setCitations(toCitations(rel.citations))}
                >
                  查看关系的出处（{rel.citations.length}）
                </Button>
              )}
              <section aria-label="感受" className="flex flex-col gap-sm px-md">
                <SectionHeader title="感受（各自方向）" level={3} />
                <FeelingRow
                  from={name(d.a)}
                  to={name(d.b)}
                  dimensions={feelingDimensions(d.a_to_b)}
                  today={today}
                />
                <FeelingRow
                  from={name(d.b)}
                  to={name(d.a)}
                  dimensions={feelingDimensions(d.b_to_a)}
                  today={today}
                />
              </section>
              <section aria-label="事实时间线" className="flex flex-col gap-sm px-md">
                <SectionHeader title="事实时间线" level={3} />
                <FactTimeline
                  today={today}
                  facts={d.facts.map((f) => ({
                    id: f.id,
                    occurred_on: f.valid_at ?? f.citations[0]?.occurred_on ?? "1970",
                    text: f.fact || f.object,
                    status: f.unverified ? "unverified" : f.current ? "current" : "invalidated",
                    confidence: f.confidence,
                  }))}
                  onFactOpen={(id) => {
                    const f = d.facts.find((x) => x.id === id);
                    if (f) setCitations(toCitations(f.citations));
                  }}
                />
              </section>
            </div>
          )}
        </div>
      </div>
      <CitationSheet
        open={citations !== null}
        onOpenChange={(open) => !open && setCitations(null)}
        citations={citations ?? []}
        today={today}
        {...sheet}
      />
    </div>
  );
}
