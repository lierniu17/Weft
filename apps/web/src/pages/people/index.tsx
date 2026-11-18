/** 人物: search by name or alias, 本人 pinned, the rest grouped by my closeness to them. */
import { useState } from "react";
import { FiChevronRight } from "react-icons/fi";
import { useNavigate } from "react-router";
import { enc } from "../../api/client.ts";
import { usePanorama, usePersons } from "../../api/graph.ts";
import { CONTENT_COLUMN, useLayout } from "../../app/layout.ts";
import { Banner } from "../../components/basics/Banner/Banner.tsx";
import { Button } from "../../components/basics/Button/Button.tsx";
import { Input } from "../../components/basics/Input/Input.tsx";
import { PersonRow } from "../../components/business/PersonRow/PersonRow.tsx";
import { EmptyState } from "../../components/composites/EmptyState/EmptyState.tsx";
import { NavBar } from "../../components/composites/NavBar/NavBar.tsx";
import { SectionHeader } from "../../components/composites/SectionHeader/SectionHeader.tsx";
import { cx } from "../../lib/cx.ts";
import { closenessGroups } from "../../lib/pageModels.ts";

export function PeoplePage() {
  const navigate = useNavigate();
  const layout = useLayout();
  const [query, setQuery] = useState("");
  const all = usePersons();
  const found = usePersons(query);
  const panorama = usePanorama();
  const searching = query.trim().length > 0;
  const open = (id: string) => navigate(`/people/${enc(id)}`);

  const { self, groups } = closenessGroups(all.data ?? [], panorama.data);
  const onlySelf = all.isSuccess && (all.data ?? []).every((p) => p.is_self);

  return (
    <>
      <NavBar
        title="人物"
        actions={
          layout === "mobile" ? (
            <Button variant="ghost" size="sm" onClick={() => navigate("/graph")}>
              全景图
              <FiChevronRight aria-hidden="true" />
            </Button>
          ) : undefined
        }
      />
      <div className="min-h-[0] flex-1 overflow-y-auto bg-neutral-bg-layout">
        <div data-page-content="" className={cx(CONTENT_COLUMN, "flex flex-col gap-lg pb-xl")}>
          <div className="pt-xs">
            <Input
              variant="search"
              aria-label="搜索姓名或别名"
              placeholder="搜索姓名或别名"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {all.isError && (
            <Banner
              variant="error"
              action={
                <Button variant="ghost" size="sm" onClick={() => all.refetch()}>
                  重试
                </Button>
              }
            >
              人物加载失败
            </Banner>
          )}
          {all.isPending && (
            <div role="status" aria-busy="true" aria-label="正在加载人物" className="-mx-md">
              <PersonRow loading />
              <PersonRow loading />
              <PersonRow loading />
            </div>
          )}

          {searching ? (
            <section aria-label="搜索结果" className="flex flex-col">
              {found.data && found.data.length === 0 && (
                <p className="py-md text-body-sm text-neutral-text-tertiary">
                  没有找到「{query.trim()}」
                </p>
              )}
              <ul className="motion-stagger -mx-md">
                {(found.data ?? []).map((p) => (
                  <li key={p.id}>
                    <PersonRow
                      person={{
                        id: p.id,
                        name: p.name,
                        alias: p.aliases.join("、") || null,
                        relation: p.aliases.length ? `别名：${p.aliases.join("、")}` : p.note,
                        isSelf: p.is_self,
                      }}
                      onClick={open}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            all.isSuccess && (
              <>
                {self && (
                  <ul aria-label="本人" className="-mx-md">
                    <li>
                      <PersonRow
                        person={{ id: self.id, name: self.name, isSelf: true }}
                        onClick={open}
                      />
                    </li>
                  </ul>
                )}
                {onlySelf ? (
                  <EmptyState variant="no-people" onAction={() => navigate("/")} />
                ) : (
                  groups.map((g) => (
                    <section key={g.key} aria-label={g.title} className="flex flex-col gap-sm">
                      <SectionHeader title={g.title} count={g.people.length} />
                      <ul className="motion-stagger -mx-md">
                        {g.people.map((p) => (
                          <li key={p.id}>
                            <PersonRow
                              person={{
                                id: p.id,
                                name: p.name,
                                alias: p.aliases[0] ?? null,
                                relation: p.relation ?? p.note,
                              }}
                              onClick={open}
                            />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))
                )}
              </>
            )
          )}
        </div>
      </div>
    </>
  );
}
