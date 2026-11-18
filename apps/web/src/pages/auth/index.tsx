import { type FormEvent, useId, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { useLogin, useMe, useRegister } from "../../api/auth.ts";
import { ApiError } from "../../api/client.ts";
import { Banner } from "../../components/basics/Banner/Banner.tsx";
import { Button } from "../../components/basics/Button/Button.tsx";
import { Input } from "../../components/basics/Input/Input.tsx";
import { FormRow } from "../../components/composites/FormRow/FormRow.tsx";

type Field = "invite_code" | "username" | "password" | "display_name";
type Errors = Partial<Record<Field | "form", string>>;

const REGISTER_ERRORS: Record<string, [Field | "form", string]> = {
  invite_invalid: ["invite_code", "邀请码无效或已被使用"],
  invite_revoked: ["invite_code", "邀请码已作废"],
  invite_used: ["invite_code", "邀请码无效或已被使用"],
  username_taken: ["username", "这个账号已被注册"],
};

const FIELD_HINTS: Record<Field, string> = {
  invite_code: "请输入邀请码",
  username: "账号为 3–32 位字母、数字、下划线、点或短横线",
  password: "密码至少 8 位",
  display_name: "请输入称呼",
};

function toErrors(e: unknown): Errors {
  if (!(e instanceof ApiError)) return { form: "出错了，请稍后再试" };
  const mapped = REGISTER_ERRORS[e.code];
  if (mapped) return { [mapped[0]]: mapped[1] };
  if (e.code === "invalid_credentials") return { form: "账号或密码错误" };
  if (e.code === "validation_error") {
    const out: Errors = {};
    for (const key of Object.keys(e.fields)) {
      if (key in FIELD_HINTS) out[key as Field] = FIELD_HINTS[key as Field];
    }
    return Object.keys(out).length ? out : { form: e.message };
  }
  return { form: e.message };
}

function Brand() {
  return (
    <div className="flex flex-col gap-xs">
      <p className="text-h1 text-neutral-text-primary">Weft</p>
      <p className="text-body-sm text-neutral-text-secondary">记住你身边的每一个人</p>
    </div>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh justify-center bg-neutral-bg-layout px-md py-xxl">
      <div className="flex w-full max-w-[400px] flex-col gap-xl">
        <Brand />
        <section
          aria-label={title}
          className="flex flex-col gap-md rounded-md border border-neutral-divider bg-neutral-bg-container p-lg shadow-sm"
        >
          <h1 className="text-h2 text-neutral-text-primary">{title}</h1>
          {children}
        </section>
      </div>
    </main>
  );
}

function useField(errors: Errors, name: Field) {
  const id = useId();
  return { id, name, error: errors[name] };
}

export function RegisterPage() {
  const me = useMe();
  const navigate = useNavigate();
  const register = useRegister();
  const [errors, setErrors] = useState<Errors>({});
  const invite = useField(errors, "invite_code");
  const username = useField(errors, "username");
  const password = useField(errors, "password");
  const name = useField(errors, "display_name");

  if (me.data) return <Navigate to="/" replace />;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const body = {
      invite_code: String(data.get("invite_code") ?? "").trim(),
      username: String(data.get("username") ?? "").trim(),
      password: String(data.get("password") ?? ""),
      display_name: String(data.get("display_name") ?? "").trim(),
    };
    const local: Errors = {};
    for (const [k, v] of Object.entries(body)) if (!v) local[k as Field] = FIELD_HINTS[k as Field];
    if (body.password && body.password.length < 8) local.password = FIELD_HINTS.password;
    setErrors(local);
    if (Object.keys(local).length) return;
    register.mutate(body, {
      onSuccess: () => navigate("/", { replace: true }),
      onError: (err) => setErrors(toErrors(err)),
    });
  };

  return (
    <Frame title="注册">
      <form noValidate onSubmit={submit} className="flex flex-col gap-md">
        <FormRow label="邀请码" htmlFor={invite.id}>
          <Input
            id={invite.id}
            name="invite_code"
            placeholder="WEFT-XXXX"
            error={invite.error}
            autoComplete="off"
          />
        </FormRow>
        <FormRow label="账号" htmlFor={username.id}>
          <Input
            id={username.id}
            name="username"
            placeholder="字母、数字或下划线"
            error={username.error}
            autoComplete="username"
          />
        </FormRow>
        <FormRow label="密码" htmlFor={password.id}>
          <Input
            id={password.id}
            name="password"
            variant="password"
            placeholder="至少 8 位"
            error={password.error}
            autoComplete="new-password"
          />
        </FormRow>
        <FormRow label="称呼" htmlFor={name.id}>
          <Input id={name.id} name="display_name" placeholder="别人怎么叫你" error={name.error} />
        </FormRow>
        {errors.form && <Banner variant="error">{errors.form}</Banner>}
        <Button type="submit" size="lg" loading={register.isPending}>
          注册
        </Button>
      </form>
      <Link to="/login" className="focus-ring self-center rounded-sm text-body-sm text-primary-6">
        已有账号？登录
      </Link>
    </Frame>
  );
}

export function LoginPage() {
  const me = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();
  const [errors, setErrors] = useState<Errors>({});
  const username = useField(errors, "username");
  const password = useField(errors, "password");
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  if (me.data) return <Navigate to={from} replace />;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const body = {
      username: String(data.get("username") ?? "").trim(),
      password: String(data.get("password") ?? ""),
    };
    const local: Errors = {};
    if (!body.username) local.username = "请输入账号";
    if (!body.password) local.password = "请输入密码";
    setErrors(local);
    if (Object.keys(local).length) return;
    login.mutate(body, {
      onSuccess: () => navigate(from, { replace: true }),
      onError: (err) => setErrors(toErrors(err)),
    });
  };

  return (
    <Frame title="登录">
      <form noValidate onSubmit={submit} className="flex flex-col gap-md">
        <FormRow label="账号" htmlFor={username.id}>
          <Input id={username.id} name="username" error={username.error} autoComplete="username" />
        </FormRow>
        <FormRow label="密码" htmlFor={password.id}>
          <Input
            id={password.id}
            name="password"
            variant="password"
            error={password.error}
            autoComplete="current-password"
          />
        </FormRow>
        {errors.form && <Banner variant="error">{errors.form}</Banner>}
        <Button type="submit" size="lg" loading={login.isPending}>
          登录
        </Button>
      </form>
      <Link
        to="/register"
        className="focus-ring self-center rounded-sm text-body-sm text-primary-6"
      >
        有邀请码？注册
      </Link>
    </Frame>
  );
}
