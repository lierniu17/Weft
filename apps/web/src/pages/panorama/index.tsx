/** 全景图: everyone around 本人, filtered by relationship category / subtype and closeness. */
import { useState } from "react";
import { FiFilter } from "react-icons/fi";
import { useNavigate, useSearchParams } from "react-router";
import { enc } from "../../api/client.ts";
import { usePanorama, useTaxonomy } from "../../api/graph.ts";
import { exposeGraph } from "../../app/devHooks.ts";
import { useLayout, useSheetVariant } from "../../app/layout.ts";
import { Banner } from "../../components/basics/Banner/Banner.tsx";
import { Button } from "../../components/basics/Button/Button.tsx";
import { Skeleton } from "../../components/basics/Skeleton/Skeleton.tsx";
import { GraphFilterSheet } from "../../components/business/GraphFilterSheet/GraphFilterSheet.tsx";
import { RelationGraph } from "../../components/business/RelationGraph/RelationGraph.tsx";
import { NavBar } from "../../components/composites/NavBar/NavBar.tsx";
import { isEmptyFilter, parseGraphFilter, serializeGraphFilter } from "../../lib/graphFilter.ts";

export function PanoramaPage() {
  const navigate = useNavigate();
  const layout = useLayout();
  const sheetVariant = useSheetVariant();
  const [params, setParams] = useSearchParams();
  const filter = parseGraphFilter(params.toString());
  const query = serializeGraphFilter(filter);
  const graph = usePanorama(query);
  const taxonomy = useTaxonomy();
  const [open, setOpen] = useState(false);
  const active = !isEmptyFilter(filter);

  return (
    <>
      <NavBar
        title="全景图"
        subtitle={
          graph.data ? `${active ? "已筛选 · " : ""}共 ${graph.data.nodes.length} 人` : undefined
        }
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
        {graph.isError && <Banner variant="error">全景图加载失败</Banner>}
        {graph.data ? (
          <RelationGraph
            onReady={exposeGraph}
            variant="panorama"
            nodes={graph.data.nodes}
            edges={graph.data.edges}
            centerId={graph.data.center_id}
            truncatedCount={graph.data.omitted}
            onNodeClick={(id) => navigate(`/people/${enc(id)}`)}
            className="min-h-[0] flex-1"
          />
        ) : (
          !graph.isError && (
            <div role="status" aria-busy="true" aria-label="正在加载全景图" className="flex-1">
              <Skeleton variant="card" height="100%" />
            </div>
          )
        )}
      </div>
      <GraphFilterSheet
        open={open}
        onOpenChange={setOpen}
        taxonomy={taxonomy.data ?? []}
        value={filter}
        onChange={(next) => setParams(serializeGraphFilter(next), { replace: true })}
        variant={sheetVariant}
      />
    </>
  );
}
