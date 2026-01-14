/**
 * Unified Stratax API client wrapper.
 *
 * Responsibilities:
 * - Attach JWT auth when logged in (Authorization: Bearer <jwt>)
 * - Attach user-provided LLM keys (X-API-Key / X-Gemini-Key) when authenticated
 * - Support demo gating errors (DEMO_LIMIT_REACHED / DEMO_UNAVAILABLE) via window events
 * - Capture and persist effective session id from response headers (X-Stratax-Session-Id)
 */

import { isDevelopmentMode } from "./devUtils";

export const STRATAX_API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "https://intvmate-interview-assistant.hf.space";

export type DemoRemaining = {
  questions?: number;
  designs?: number;
  practice_rounds?: number;
  [key: string]: unknown;
};

export type DemoGateDetail = {
  error: "DEMO_LIMIT_REACHED";
  message?: string;
  user_type?: "demo";
  demo_remaining?: DemoRemaining;
  [key: string]: unknown;
};

export type DemoUnavailableDetail = {
  error: "DEMO_UNAVAILABLE";
  message?: string;
  [key: string]: unknown;
};

export type ApiErrorDetail =
  | { error?: string; message?: string; [key: string]: unknown }
  | string
  | unknown;

export class StrataxApiError extends Error {
  status: number;
  detail: ApiErrorDetail;

  constructor(message: string, opts: { status: number; detail: ApiErrorDetail }) {
    super(message);
    this.name = "StrataxApiError";
    this.status = opts.status;
    this.detail = opts.detail;
  }
}

function getOrCreateUserId(): string {
  if (typeof window === "undefined") return "guest";
  let userId = localStorage.getItem("stratax_user_id");
  if (!userId) {
    userId = `user_${Math.random().toString(36).substring(2, 15)}_${Date.now().toString(36)}`;
    localStorage.setItem("stratax_user_id", userId);
  }
  return userId;
}

function getJwtToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function getUserKeys(): { groqKey?: string; geminiKey?: string } {
  if (typeof window === "undefined") return {};
  const groqKey = localStorage.getItem("user_api_key") || undefined;
  const geminiKey = localStorage.getItem("gemini_api_key") || undefined;
  return { groqKey: groqKey || undefined, geminiKey: geminiKey || undefined };
}

export type BuildHeadersOptions = {
  json?: boolean;
  forceGeminiAsPrimary?: boolean;
};

export function buildStrataxHeaders(options?: BuildHeadersOptions): HeadersInit {
  const headers: Record<string, string> = {};

  if (options?.json !== false) {
    headers["Content-Type"] = "application/json";
  }

  // Per-user isolation
  headers["X-User-ID"] = getOrCreateUserId();

  // Auth: JWT only (never put LLM keys in Authorization)
  const jwt = getJwtToken();
  if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

  // User-provided LLM keys
  // IMPORTANT: In guest/demo mode (no JWT), do NOT attach BYOK headers.
  // Otherwise stale localStorage keys can flip the backend into "registered" mode.
  const allowUserKeys = !!jwt;
  const { groqKey, geminiKey } = allowUserKeys ? getUserKeys() : {};
  if (groqKey) headers["X-API-Key"] = groqKey;
  if (geminiKey) headers["X-Gemini-Key"] = geminiKey;

  // If Groq isn't provided, allow Gemini to act as the primary key.
  if (allowUserKeys && !groqKey && geminiKey) headers["X-API-Key"] = geminiKey;

  if (allowUserKeys && options?.forceGeminiAsPrimary && geminiKey) headers["X-API-Key"] = geminiKey;

  if (isDevelopmentMode()) {
    const demoMode = !jwt;
    console.log("🔧 [Dev Mode] Request mode:", demoMode ? "demo" : "authenticated/with-keys");
  }

  return headers;
}

function readSessionHeaders(res: Response): {
  sessionId?: string;
  recovered?: boolean;
  reused?: boolean;
} {
  const sessionId =
    res.headers.get("X-Stratax-Session-Id") ||
    res.headers.get("x-stratax-session-id") ||
    undefined;

  const recovered =
    (res.headers.get("X-Stratax-Session-Recovered") || res.headers.get("x-stratax-session-recovered")) === "1";
  const reused = (res.headers.get("X-Stratax-Session-Reused") || res.headers.get("x-stratax-session-reused")) === "1";

  return { sessionId, recovered, reused };
}

function persistEffectiveSessionId(info: { sessionId?: string; recovered?: boolean; reused?: boolean }) {
  if (!info.sessionId || typeof window === "undefined") return;
  try {
    localStorage.setItem("stratax_effective_session_id", info.sessionId);
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(new CustomEvent("stratax:session", { detail: info }));
  } catch {
    // ignore
  }
}

async function safeReadJson(res: Response): Promise<any> {
  return await res.json().catch(() => null);
}

function shouldLogoutFor401(url: string, body: any): boolean {
  // Only force-logout when we are confident the 401 is about the JWT/session.
  // Some backend paths can return 401 for other reasons (e.g. invalid LLM API key),
  // and we must NOT clear the user's login session in those cases.
  const lowerUrl = (url || '').toLowerCase();
  if (lowerUrl.includes('/auth/me') || lowerUrl.includes('/auth/login') || lowerUrl.includes('/auth/register')) return true;

  const detail = body?.detail ?? body;
  const msg = (typeof detail === 'string' ? detail : (detail?.message || detail?.error || '')).toString().toLowerCase();

  // Common JWT/session-expiry indicators
  if (msg.includes('token') || msg.includes('jwt') || msg.includes('expired') || msg.includes('signature')) return true;

  // Common non-session causes we should NOT treat as a logout.
  if (msg.includes('api key') || msg.includes('invalid api key') || msg.includes('invalid_key') || msg.includes('authentication key')) return false;

  // Default: be conservative and don't log out.
  return false;
}

function dispatchDemoEvents(opts: {
  status: number;
  detail: any;
  headers: Headers;
}) {
  if (typeof window === "undefined") return;

  const { status, detail, headers } = opts;
  const d = detail?.detail ?? detail;

  if (status === 429 && d?.error === "DEMO_LIMIT_REACHED") {
    const reset = headers.get("X-RateLimit-Reset") || headers.get("x-ratelimit-reset") || undefined;
    const remaining = headers.get("X-RateLimit-Remaining") || headers.get("x-ratelimit-remaining") || undefined;

    window.dispatchEvent(
      new CustomEvent("demo:limit-reached", {
        detail: {
          ...d,
          rate_limit_reset: reset ? Number(reset) : undefined,
          rate_limit_remaining: remaining ? Number(remaining) : undefined,
        } satisfies DemoGateDetail & { rate_limit_reset?: number; rate_limit_remaining?: number },
      })
    );
    return;
  }

  if (status === 503 && d?.error === "DEMO_UNAVAILABLE") {
    window.dispatchEvent(new CustomEvent("demo:unavailable", { detail: d as DemoUnavailableDetail }));
    return;
  }
}

export async function strataxFetch(
  pathOrUrl: string,
  init: RequestInit & { json?: boolean; throwOnError?: boolean } = {}
): Promise<Response> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${STRATAX_API_BASE_URL}${pathOrUrl}`;

  const wantsJsonHeader = init.json !== false;
  const defaultHeaders = buildStrataxHeaders({ json: wantsJsonHeader });

  const mergedHeaders: Record<string, string> = {
    ...(defaultHeaders as Record<string, string>),
    ...((init.headers as Record<string, string>) || {}),
  };

  // If the body is FormData, do not set Content-Type (browser will set boundary)
  if (typeof FormData !== "undefined" && init.body instanceof FormData) {
    delete mergedHeaders["Content-Type"];
  }

  const res = await fetch(url, {
    ...init,
    headers: mergedHeaders,
  });

  const sessionInfo = readSessionHeaders(res);
  persistEffectiveSessionId(sessionInfo);

  if (!res.ok) {
    // If caller wants to handle non-OK status codes themselves, do not consume the body.
    if (init.throwOnError === false) {
      // Best-effort logout only when 401 is clearly JWT/session related.
      if (res.status === 401 && typeof window !== "undefined") {
        let body: any = null;
        try {
          body = await safeReadJson(res.clone());
        } catch {
          body = null;
        }

        if (!shouldLogoutFor401(url, body)) {
          return res;
        }

        try {
          localStorage.removeItem("token");
          localStorage.removeItem("userId");
          localStorage.removeItem("tier");
        } catch {
          // ignore
        }
        try {
          window.dispatchEvent(new CustomEvent("auth:logout", { detail: { reason: "Session expired" } }));
        } catch {
          // ignore
        }
      }

      return res;
    }

    const body = await safeReadJson(res);

    // Demo gates
    dispatchDemoEvents({ status: res.status, detail: body, headers: res.headers });

    // Expired auth (only if it's truly JWT/session related)
    if (res.status === 401 && typeof window !== "undefined" && shouldLogoutFor401(url, body)) {
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        localStorage.removeItem("tier");
      } catch {
        // ignore
      }
      try {
        window.dispatchEvent(new CustomEvent("auth:logout", { detail: { reason: "Session expired" } }));
      } catch {
        // ignore
      }
    }

    const detail = body?.detail ?? body;
    const message = typeof detail === "string" ? detail : detail?.message || `Request failed (${res.status})`;
    throw new StrataxApiError(message, { status: res.status, detail });
  }

  return res;
}

export async function strataxFetchJson<T>(
  pathOrUrl: string,
  init: RequestInit & { json?: boolean } = {}
): Promise<T> {
  const res = await strataxFetch(pathOrUrl, init);
  return (await res.json()) as T;
}
