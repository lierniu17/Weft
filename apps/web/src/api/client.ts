/**
 * The only place in the web app that calls `fetch`. Every request goes to `/api/...` on the
 * same origin (Vite proxies it to the API in dev), carrying the httpOnly session cookie.
 *
 * Errors come back as `ApiError` with the API's stable `error` code (apps/api ErrorBody):
 * 401 → not logged in, 404 → 不存在, 429 → quota used up, 422 → validation.
 */
import type { components } from "./schema.gen.ts";

export type Schemas = components["schemas"];

export class ApiError extends Error {
  readonly status: number;
  /** Machine code, e.g. "invite_invalid", "quota_exceeded", "not_found". */
  readonly code: string;
  readonly body: Record<string, unknown>;

  constructor(status: number, code: string, message: string, body: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }

  get unauthenticated() {
    return this.status === 401 && this.code !== "invalid_credentials";
  }
  get notFound() {
    return this.status === 404;
  }
  get quotaExceeded() {
    return this.status === 429;
  }
  /** Field errors of a 422 validation error: the last `loc` part → message. */
  get fields(): Record<string, string> {
    const list = (this.body.fields as { loc: string[]; msg: string }[] | undefined) ?? [];
    return Object.fromEntries(list.map((f) => [f.loc[f.loc.length - 1], f.msg]));
  }
}

/** Unauthenticated responses are reported here; the app shell redirects to /login. */
let onUnauthenticated: (() => void) | null = null;
export function setUnauthenticatedHandler(handler: (() => void) | null) {
  onUnauthenticated = handler;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network_error", "网络异常，请检查网络后重试", {});
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const json = text ? safeJson(text) : null;
  if (!response.ok) {
    const data = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
    const error = new ApiError(
      response.status,
      typeof data.error === "string" ? data.error : `http_${response.status}`,
      typeof data.message === "string" ? data.message : "服务暂时不可用，请稍后再试",
      data,
    );
    // /auth/me answers "not logged in" as a state; the shell redirects for it itself.
    if (error.unauthenticated && path !== "/auth/me") onUnauthenticated?.();
    throw error;
  }
  return json as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};

export const enc = encodeURIComponent;
