/** 我的: account, data links, today's quota, logout, account deletion; 词表 and 注销 sub-pages. */
import { type FormEvent, useId, useState } from "react";
import { useNavigate } from "react-router";
import { useDeleteAccount, useLogout, useMe } from "../../api/auth.ts";
import { ApiError } from "../../api/client.ts";
import { useEntries } from "../../api/entries.ts";
import { useAddSubtype, useTaxonomy, useUsage } from "../../api/graph.ts";
import { usePreferences, useUpdatePreferences } from "../../api/preferences.ts";
import { CONTENT_COLUMN } from "../../app/layout.ts";
import { Avatar } from "../../components/basics/Avatar/Avatar.tsx";
import { Banner } from "../../components/basics/Banner/Banner.tsx";
import { Button } from "../../components/basics/Button/Button.tsx";
import { Input } from "../../components/basics/Input/Input.tsx";
import { Skeleton } from "../../components/basics/Skeleton/Skeleton.tsx";
import { Toast } from "../../components/basics/Toast/Toast.tsx";
import { GraphAppearanceSetting } from "../../components/business/GraphAppearanceSetting/GraphAppearanceSetting.tsx";
import { QuotaMeter } from "../../components/business/QuotaMeter/QuotaMeter.tsx";
import { TaxonomyEditor } from "../../components/business/TaxonomyEditor/TaxonomyEditor.tsx";
import { ListItem } from "../../components/composites/ListItem/ListItem.tsx";
import { NavBar } from "../../components/composites/NavBar/NavBar.tsx";
import { SectionHeader } from "../../components/composites/SectionHeader/SectionHeader.tsx";
import { cx } from "../../lib/cx.ts";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-sm">
      <SectionHeader title={title} />
      <div className="-mx-md flex flex-col divide-y divide-neutral-divider">{children}</div>
    </section>
  );
}

export function MePage() {
  const navigate = useNavigate();
  const me = useMe();
  const entries = useEntries();
  const taxonomy = useTaxonomy();
  const usage = useUsage();
  const logout = useLogout();
  const prefs = usePreferences();
  const updatePrefs = useUpdatePreferences();
  const customCount = (taxonomy.data ?? []).reduce(
    (n, g) => n + g.subtypes.filter((s) => s.custom).length,
    0,
  );

  return (
    <>
      <NavBar title="我的" />
      <div className="min-h-[0] flex-1 overflow-y-auto bg-neutral-bg-layout">
        <div
          data-page-content=""
          className={cx(CONTENT_COLUMN, "motion-stagger flex flex-col gap-lg pt-xs pb-xl")}
        >
          {me.data && (
            <div className="flex items-center gap-md">
              <Avatar name={me.data.display_name} variant="self" size="lg" />
              <div className="flex min-w-[0] flex-col">
                <p className="truncate text-h1 text-neutral-text-primary">{me.data.display_name}</p>
                <p className="truncate text-meta text-neutral-text-tertiary">
                  账号 {me.data.username}
                </p>
              </div>
            </div>
          )}
          <Group title="数据">
            <ListItem
              variant="navigational"
              title="我的记录"
              trailing={entries.data ? `${entries.data.length} 条` : undefined}
              onClick={() => navigate("/entries")}
            />
            <ListItem
              variant="navigational"
              title="关系类型词表"
              trailing={`自定义 ${customCount} 个`}
              onClick={() => navigate("/me/taxonomy")}
            />
          </Group>
          <Group title="外观">
            <GraphAppearanceSetting
              value={prefs.data?.graph_theme ?? "light"}
              disabled={!prefs.data}
              onChange={(graph_theme) => updatePrefs.mutate({ graph_theme })}
            />
          </Group>
          {usage.data ? (
            <QuotaMeter
              className="-mx-md"
              record={{ used: usage.data.entry.used, limit: usage.data.entry.limit }}
              ask={{ used: usage.data.ask.used, limit: usage.data.ask.limit }}
              resetHint="北京时间 0 点重置"
            />
          ) : (
            <div
              className="flex flex-col gap-sm"
              role="status"
              aria-busy="true"
              aria-label="正在加载额度"
            >
              <Skeleton width="50%" />
              <Skeleton width="50%" />
            </div>
          )}
          <Group title="账户">
            <ListItem
              variant="navigational"
              title="退出登录"
              onClick={() =>
                logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) })
              }
            />
            <ListItem
              variant="navigational"
              title="注销账户"
              className="[&_[data-list-item-title]]:text-status-error-6"
              subtitle="删除全部数据"
              onClick={() => navigate("/me/delete-account")}
            />
          </Group>
        </div>
      </div>
    </>
  );
}

export function TaxonomyPage() {
  const navigate = useNavigate();
  const taxonomy = useTaxonomy();
  const add = useAddSubtype();
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  return (
    <>
      <NavBar title="关系类型" variant="pushed" onBack={() => navigate(-1)} />
      <div className="min-h-[0] flex-1 overflow-y-auto bg-neutral-bg-layout">
        <div data-page-content="" className="mx-auto w-full max-w-[720px] pb-xl">
          <h2 className="sr-only">关系类型词表</h2>
          {taxonomy.data ? (
            <TaxonomyEditor
              taxonomy={taxonomy.data}
              onAddSubtype={(category, name) =>
                add.mutate(
                  { category, name },
                  {
                    onSuccess: () => setToast({ text: `已添加「${name}」` }),
                    onError: (e) =>
                      setToast({
                        text: e instanceof ApiError ? e.message : "添加失败",
                        error: true,
                      }),
                  },
                )
              }
            />
          ) : (
            <div
              className="flex flex-col gap-md p-md"
              role="status"
              aria-busy="true"
              aria-label="正在加载词表"
            >
              <Skeleton width="30%" />
              <Skeleton width="70%" />
              <Skeleton width="30%" />
              <Skeleton width="70%" />
            </div>
          )}
          <p className="px-md py-md text-meta text-neutral-text-tertiary">
            自定义小类只对你自己可见，会参与之后的抽取归类。
          </p>
        </div>
      </div>
      <Toast
        open={toast !== null}
        onOpenChange={(o) => !o && setToast(null)}
        variant={toast?.error ? "error" : "success"}
      >
        {toast?.text}
      </Toast>
    </>
  );
}

export function DeleteAccountPage() {
  const navigate = useNavigate();
  const remove = useDeleteAccount();
  const [error, setError] = useState<string>();
  const passwordId = useId();

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    if (!password) {
      setError("请输入密码");
      return;
    }
    remove.mutate(password, {
      onSuccess: () => navigate("/login", { replace: true, state: { deleted: true } }),
      onError: (err) =>
        setError(
          err instanceof ApiError && err.code === "wrong_password"
            ? "密码不正确"
            : err instanceof ApiError
              ? err.message
              : "注销失败，请稍后再试",
        ),
    });
  };

  return (
    <>
      <NavBar title="注销账户" variant="pushed" onBack={() => navigate(-1)} />
      <form
        noValidate
        onSubmit={submit}
        aria-label="注销账户"
        data-page-content=""
        className="mx-auto flex min-h-[0] w-full max-w-[720px] flex-1 flex-col gap-lg overflow-y-auto bg-neutral-bg-layout px-md pt-xs pb-md"
      >
        <div className="flex flex-col gap-sm">
          <p className="text-h3 text-neutral-text-primary">注销后将删除：</p>
          <ul className="list-disc pl-lg text-body-sm text-neutral-text-primary">
            <li>全部记录原文</li>
            <li>全部人物、关系、感受</li>
            <li>账号本身，邀请码不能再用</li>
          </ul>
          <Banner variant="error">此操作无法恢复。</Banner>
        </div>
        <div className="flex flex-col gap-sm">
          <label htmlFor={passwordId} className="text-section text-neutral-text-tertiary">
            输入密码确认
          </label>
          <Input
            id={passwordId}
            name="password"
            variant="password"
            autoComplete="current-password"
            error={error}
          />
        </div>
        <div className="mt-auto flex gap-sm">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={() => navigate(-1)}
          >
            取消
          </Button>
          <Button
            type="submit"
            variant="danger"
            size="lg"
            className="flex-1"
            loading={remove.isPending}
          >
            注销
          </Button>
        </div>
      </form>
    </>
  );
}
