/** 全景图: everyone around 本人 — star layout, legend, timeline, filter, list view, answers. */
import { useCallback, useState } from "react";
import { FiFilter } from "react-icons/fi";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { enc } from "../../api/client.ts";
import { useTaxonomy } from "../../api/graph.ts";
import { useLayout, useSidePanel } from "../../app/layout.ts";
import { Button } from "../../components/basics/Button/Button.tsx";
import { GraphFilterSheet } from "../../components/business/GraphFilterSheet/GraphFilterSheet.tsx";
import { NavBar } from "../../components/composites/NavBar/NavBar.tsx";
import type { Answer } from "../../contracts/answer.ts";
import { isEmptyFilter, parseGraphFilter, serializeGraphFilter } from "../../lib/graphFilter.ts";
import { PanoramaBody } from "./PanoramaView.tsx";

/** Router state when arriving from 「在图上查看」 (mobile / tablet). */
export type PanoramaState = { answer?: Answer } | null;

export function PanoramaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const layout = useLayout();
  const sheet = useSidePanel();
  const [params, setParams] = useSearchParams();
  const filter = parseGraphFilter(params.toString());
  const filterQuery = serializeGraphFilter(filter);
  const only = params.get("only") === "1";
  const at = params.get("at");
  const taxonomy = useTaxonomy();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const active = !isEmptyFilter(filter);
  const answer = (location.state as PanoramaState)?.answer ?? null;

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true, state: location.state });
  };
  const onAtChange = useCallback(
    (value: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set("at", value);
          else next.delete("at");
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  return (
    <div className="flex min-h-[0] flex-1">
      <div className="flex min-w-[0] flex-1 flex-col">
        <NavBar
          title="全景图"
          subtitle={count !== null ? `${active ? "已筛选 · " : ""}共 ${count} 人` : undefined}
          variant={layout === "mobile" ? "pushed" : "root"}
          onBack={() => navigate("/people")}
          actions={
            <Button variant="ghost" size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
              <FiFilter aria-hidden="true" />
              筛选{active ? " · 已选" : ""}
            </Button>
          }
        />
        <div className="flex min-h-[0] flex-1 flex-col bg-neutral-bg-layout p-md">
          <PanoramaBody
            filterQuery={filterQuery}
            filterMode={only ? "only" : "fade"}
            at={answer ? null : at}
            onAtChange={onAtChange}
            answer={answer}
            onClearAnswer={() => {
              const q = params.toString();
              navigate(`/graph${q ? `?${q}` : ""}`, { replace: true, state: null });
            }}
            onOpenPerson={(id) => navigate(`/people/${enc(id)}`)}
            onOpenFilter={() => setOpen(true)}
            onCount={setCount}
          />
        </div>
      </div>
      <GraphFilterSheet
        open={open}
        onOpenChange={setOpen}
        taxonomy={taxonomy.data ?? []}
        value={filter}
        onChange={(next) => {
          const kept = new URLSearchParams(serializeGraphFilter(next));
          if (only) kept.set("only", "1");
          if (at) kept.set("at", at);
          setParams(kept, { replace: true, state: location.state });
        }}
        onlyMatching={only}
        onOnlyMatchingChange={(v) => update({ only: v ? "1" : null })}
        {...sheet}
      />
    </div>
  );
}
