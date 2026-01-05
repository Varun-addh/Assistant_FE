import { resolveIntelligenceFlag } from "./intelligenceConfig";
import { isDevelopmentMode } from "./devUtils";

export type AnswerStyle = "short" | "detailed";

const BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "https://intvmate-interview-assistant.hf.space";
const API_KEY = (import.meta as any).env?.VITE_API_KEY || undefined;

// Helper to get or create a stable user_id for history isolation
function getOrCreateUserId(): string {
  if (typeof window === 'undefined') return "guest";
  let userId = localStorage.getItem("stratax_user_id");
  if (!userId) {
    userId = `user_${Math.random().toString(36).substring(2, 15)}_${Date.now().toString(36)}`;
    localStorage.setItem("stratax_user_id", userId);
  }
  return userId;
}

function buildHeaders(options?: { forceGemini?: boolean }): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Primary method for personalized history isolation
  const userId = getOrCreateUserId();
  headers["X-User-ID"] = userId;

  // Developer/Default API key from environment
  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }

  // Interview Engine (Groq) - Primary key for questions, mock, search
  const groqKey = typeof window !== 'undefined' ? localStorage.getItem("user_api_key") : null;
  if (groqKey) {
    headers["X-API-Key"] = groqKey;
  }

  // Answer Engine (Gemini) - For advanced answer cards
  const geminiKey = typeof window !== 'undefined' ? localStorage.getItem("gemini_api_key") : null;
  if (geminiKey) {
    headers["X-Gemini-Key"] = geminiKey;
  }

  // In development mode, log if keys are being sent
  if (isDevelopmentMode()) {
    if (groqKey || geminiKey) {
      console.log('🔧 [Dev Mode] Sending user-provided API keys from local storage');
    } else {
      console.log('🔧 [Dev Mode] No local API keys found - backend will use its own environment variables');
    }
  }

  // If forceGemini is true and we have a Gemini key, use it as primary
  if (options?.forceGemini && geminiKey) {
    headers["X-API-Key"] = geminiKey;
  }

  return headers;
}

export async function apiHealth(): Promise<any> {
  const res = await fetch(`${BASE_URL}/health`, {
    method: "GET",
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export interface CreateSessionResponse { session_id: string }
export async function apiCreateSession(): Promise<CreateSessionResponse> {
  const res = await fetch(`${BASE_URL}/api/session`, {
    method: "POST",
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error(`Create session failed: ${res.status}`);
  return res.json();
}

export interface SubmitQuestionRequest {
  session_id: string;
  question: string;
  style: AnswerStyle;
  architecture_mode?: "single" | "multi-view" | null;
}
export interface SubmitQuestionResponse {
  answer: string;
  style: AnswerStyle;
  created_at: string; // ISO8601
  truncated?: boolean; // Backend indicates if answer was cut off
}
export async function apiSubmitQuestion(body: SubmitQuestionRequest): Promise<SubmitQuestionResponse> {
  const res = await fetch(`${BASE_URL}/api/question`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ ...body, stream: false }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Submit question failed: ${res.status} ${text}`);
  }
  return res.json();
}

// Streaming version of apiSubmitQuestion
export async function apiSubmitQuestionStream(
  body: SubmitQuestionRequest,
  onChunk: (chunk: string) => void
): Promise<{ answer: string; style: AnswerStyle; created_at: string; truncated?: boolean }> {
  const res = await fetch(`${BASE_URL}/api/question`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Submit question failed: ${res.status} ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullAnswer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    if (chunk) {
      fullAnswer += chunk;
      onChunk(chunk);
    }
  }

  return {
    answer: fullAnswer,
    style: body.style,
    created_at: new Date().toISOString(),
    truncated: false
  };
}

// Streaming evaluation
export interface EvaluateRequest {
  session_id: string;
  code: string;
  problem: string;
  language: string; // e.g., "python"
}

export async function apiEvaluateStream(body: EvaluateRequest, onChunk: (text: string) => void): Promise<void> {
  // Ensure session exists upstream; assume caller created session_id
  const res = await fetch(`${BASE_URL}/api/evaluate`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Evaluate failed: ${res.status} ${text}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) onChunk(chunk);
  }
}

export interface HistoryItem {
  question: string;
  answer: string;
  style: AnswerStyle;
  created_at: string;
}
export interface GetHistoryResponse {
  session_id: string;
  items: HistoryItem[];
}
export async function apiGetHistory(sessionId: string): Promise<GetHistoryResponse> {
  // FIXED: Use SessionManager endpoint for chat history, not HistoryManager (Search Intelligence)
  const res = await fetch(`${BASE_URL}/api/session/${encodeURIComponent(sessionId)}/chat`, {
    method: "GET",
    headers: buildHeaders(),
  });
  if (res.status === 404) {
    // Gracefully handle missing session/history as empty
    return { session_id: sessionId, items: [] };
  }
  if (!res.ok) throw new Error(`Get history failed: ${res.status}`);
  return res.json();
}

export async function apiDeleteHistoryItem(params: { session_id: string; created_at: string }): Promise<{ status: string }> {
  const { session_id, created_at } = params;
  // Try DELETE first (query param)
  const urlDelete = `${BASE_URL}/api/history/${encodeURIComponent(session_id)}?created_at=${encodeURIComponent(created_at)}`;
  let res = await fetch(urlDelete, { method: "DELETE", headers: buildHeaders() });
  if (res.status === 404) return { status: "deleted" };
  if (res.ok) return res.json();

  // Fallback: some servers don't allow DELETE here; try POST-based delete endpoint
  const urlPost = `${BASE_URL}/api/history/${encodeURIComponent(session_id)}/delete`;
  res = await fetch(urlPost, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ created_at }),
  });
  if (!res.ok) {
    if (res.status === 404) return { status: "deleted" };
    const text = await res.text().catch(() => "");
    throw new Error(`Delete history failed: ${res.status} ${text}`);
  }
  return res.json();
}

export interface SessionSummary {
  session_id: string;
  last_update: string;
  qna_count: number;
  title?: string;
  custom_title?: string;
}
export async function apiGetSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${BASE_URL}/api/sessions`, {
    method: "GET",
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error(`Get sessions failed: ${res.status}`);
  const data = await res.json();

  // Backend returns { items: [sessions] }, not a direct array
  if (data && typeof data === 'object' && Array.isArray(data.items)) {
    return data.items;
  }

  // Fallback: if it's already an array, use it directly
  if (Array.isArray(data)) {
    return data;
  }

  console.warn('[apiGetSessions] Unexpected response format:', data);
  return [];
}

export async function apiDeleteSession(sessionId: string): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/api/session/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });
  if (res.status === 404) {
    // If not found, treat as already deleted
    return { status: "deleted" };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Delete session failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function apiUpdateSessionTitle(sessionId: string, title: string): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/api/session/${encodeURIComponent(sessionId)}/title`, {
    method: "PUT",
    headers: buildHeaders(),
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Update title failed: ${res.status} ${text}`);
  }
  return res.json();
}

// New: delete a single history item by index
export async function apiDeleteHistoryItemByIndex(params: { session_id: string; index: number }): Promise<{ status: string }> {
  const { session_id, index } = params;
  const res = await fetch(`${BASE_URL}/api/history/${encodeURIComponent(session_id)}/${index}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });
  if (!res.ok) {
    if (res.status === 404) return { status: "deleted" };
    const text = await res.text().catch(() => "");
    throw new Error(`Delete history item failed: ${res.status} ${text}`);
  }
  return res.json();
}

// Render Mermaid to SVG via backend (preferred over direct Kroki calls)
export async function apiRenderMermaid(params: { code: string; theme?: string; style?: string; size?: "compact" | "medium" | "large" }): Promise<string> {
  const { code, theme = "default", style = "modern", size = "medium" } = params;
  const res = await fetch(`${BASE_URL}/api/render_mermaid`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ code, theme, style, size }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Render mermaid failed: ${res.status} ${text}`);
  }
  // Backend returns raw SVG text
  return res.text();
}

export type SttEvent =
  | { type: "partial_transcript"; text: string }
  | { type: "end" };

export function openSttWebSocket(sessionId: string): WebSocket {
  const wsProtocol = BASE_URL.startsWith("https") ? "wss" : "ws";
  const url = `${wsProtocol}://${BASE_URL.replace(/^https?:\/\//, "")}/ws/stt/${encodeURIComponent(sessionId)}`;
  const protocols = API_KEY ? [API_KEY] : undefined;
  const ws = new WebSocket(url, protocols);
  return ws;
}


// Upload user profile (resume) for personalization
export interface UploadProfileResponse { status: "ok"; characters: number }
export async function apiUploadProfile(params: { session_id: string; file: File }): Promise<UploadProfileResponse> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("session_id", params.session_id);

  // Build headers without forcing Content-Type; let the browser set multipart boundary
  const headers: Record<string, string> = {
    "X-User-ID": getOrCreateUserId(),
  };

  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }

  // Also send user key if present
  const userKey = typeof window !== 'undefined' ? localStorage.getItem("user_api_key") : null;
  if (userKey) {
    headers["X-API-Key"] = userKey;
  }

  const res = await fetch(`${BASE_URL}/api/upload_profile`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload profile failed: ${res.status} ${text}`);
  }
  return res.json();
}

// Interview Intelligence API
const INTELLIGENCE_BASE_URL = (import.meta as any).env?.VITE_INTELLIGENCE_API_URL || "https://intvmate-interview-assistant.hf.space/api/intelligence";
// History API - use same server as intelligence API (extract base URL)
// If INTELLIGENCE_BASE_URL is "https://intvmate-interview-assistant.hf.space/api/intelligence", history should be "https://intvmate-interview-assistant.hf.space/api/history/"
// Note: Trailing slash is required to avoid 307 redirects from FastAPI
const getHistoryBaseUrl = () => {
  if ((import.meta as any).env?.VITE_HISTORY_API_URL) {
    const url = (import.meta as any).env.VITE_HISTORY_API_URL;
    return url.endsWith('/') ? url : `${url}/`;
  }
  // Extract base URL from intelligence API (remove /api/intelligence suffix)
  const intelligenceUrl = INTELLIGENCE_BASE_URL;
  const urlObj = new URL(intelligenceUrl);
  return `${urlObj.origin}/api/history/`;
};
const HISTORY_BASE_URL = getHistoryBaseUrl();
console.log("[API Config] INTELLIGENCE_BASE_URL:", INTELLIGENCE_BASE_URL);
console.log("[API Config] HISTORY_BASE_URL:", HISTORY_BASE_URL);

export interface InterviewQuestion {
  question: string;
  answer: string;
  source: string;
  updated_at: string;
  topic?: string;
}

export interface TopicsResponse {
  topics: string[];
}

export interface QuestionsByTopicResponse {
  topic: string;
  questions: InterviewQuestion[];
  count: number;
}

export interface SearchQuestionsResponse {
  query: string;
  questions: InterviewQuestion[];
  count: number;
  tab_id?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateResponse {
  status: string;
  message: string;
}

// Ultra-production Interview Intelligence search
export interface UltraSearchRequest {
  query: string;
  limit?: number; // default 20, max 50 server side
  verified_only?: boolean; // default false
  min_credibility?: number; // 0.0 - 1.0, default 0.0
  company?: string | null; // e.g., "amazon"
  refresh?: boolean; // default false
  enable_reranking?: boolean;
  enable_query_expansion?: boolean;
  save_to_history?: boolean; // default true - set to false for refreshes/retries/loading history
}

export type EnhancedSearchRequest = UltraSearchRequest;

export interface EnhancedQuestion extends InterviewQuestion {
  source_type?: "verified" | "community" | "generated" | string;
  verification_status?: "verified" | "unverified" | "ai" | string;
  credibility_score?: number; // 0.0 - 1.0
  metadata?: {
    warning?: string;
    [k: string]: any;
  };
}

export interface EnhancedSearchResponse {
  query: string;
  questions: EnhancedQuestion[];
  count: number;
  metadata?: {
    verified_ratio?: number; // 0.0 - 1.0
    warning?: string;
    [k: string]: any;
  };
  tab_id?: string;
}

export interface SourceStatsResponse {
  totals_by_source: Array<{ source: string; count: number }>;
  credibility_buckets?: Array<{ range: string; count: number }>;
  verified_sources?: string[];
  generated_sources?: string[];
}

export interface CompanyInfo {
  slug: string;
  name: string;
  question_count?: number;
}

export interface HistoryTabMetadata {
  limit?: number;
  refresh?: boolean;
  enhanced?: boolean;
  [k: string]: any;
}

export interface HistoryTabSummary {
  tab_id: string;
  query: string;
  questions: InterviewQuestion[];
  created_at: string;
  metadata?: HistoryTabMetadata;
  question_count: number;
}

export interface HistoryTabsResponse {
  tabs: HistoryTabSummary[];
  total: number;
  offset: number;
  limit: number;
}

export interface HistoryTabsQueryParams {
  limit?: number;
  offset?: number;
  sort_by?: string;
  ascending?: boolean;
}

export interface HistoryStatsResponse {
  total_tabs: number;
  total_questions: number;
  avg_questions_per_tab: number;
  most_common_queries: Array<[string, number]>;
  oldest_tab: string;
  newest_tab: string;
}

export interface HistorySearchResponse {
  tabs: HistoryTabSummary[];
  total: number;
}

function buildUltraSearchQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  const entries = Object.entries(params);
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "boolean") {
      search.set(key, value ? "true" : "false");
    } else {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

async function getUltraSearch(params: Record<string, unknown>) {
  const query = buildUltraSearchQuery(params);
  const url =
    query.length > 0
      ? `${INTELLIGENCE_BASE_URL}/search/ultra-production?${query}`
      : `${INTELLIGENCE_BASE_URL}/search/ultra-production`;
  return fetch(url, {
    method: "GET",
    headers: buildHeaders(),
  });
}

export async function apiSearchQuestionsEnhanced(req: EnhancedSearchRequest): Promise<EnhancedSearchResponse> {
  const safeLimit = Math.max(1, Math.min(50, req.limit ?? 20));
  const enableReranking = resolveIntelligenceFlag(req.enable_reranking, "enableReranking");
  const enableQueryExpansion = resolveIntelligenceFlag(req.enable_query_expansion, "enableQueryExpansion");

  const body: Record<string, unknown> = {
    query: req.query,
    limit: safeLimit,
    verified_only: !!req.verified_only,
    min_credibility: typeof req.min_credibility === "number" ? req.min_credibility : 0.0,
    company: req.company ?? null,
    refresh: !!req.refresh,
    // Only save to history if explicitly requested (default true for backward compatibility)
    save_to_history: req.save_to_history !== false,
  };
  if (typeof enableReranking === "boolean") {
    body.enable_reranking = enableReranking;
  }
  if (typeof enableQueryExpansion === "boolean") {
    body.enable_query_expansion = enableQueryExpansion;
  }

  let res = await getUltraSearch({
    q: body.query,
    limit: body.limit,
    verified_only: body.verified_only,
    min_credibility: body.min_credibility,
    company: body.company,
    refresh: body.refresh,
    enable_reranking: body.enable_reranking,
    enable_query_expansion: body.enable_query_expansion,
    save_to_history: body.save_to_history,
  });
  if (res.status === 404 || res.status === 405) {
    console.warn("[Intelligence API] /search/ultra-production not available (status", res.status, ") – falling back to /search/enhanced");
    // Remove ultra-only flags for legacy endpoint compatibility
    const legacyBody = { ...body };
    delete legacyBody.enable_reranking;
    delete legacyBody.enable_query_expansion;
    const fallbackUrl = new URL(`${INTELLIGENCE_BASE_URL}/search/enhanced`);
    fallbackUrl.searchParams.set("save_to_history", String(body.save_to_history));
    res = await fetch(fallbackUrl.toString(), {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(legacyBody),
    });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Enhanced search failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  console.log("[Intelligence API] Search response:", {
    hasTabId: !!data?.tab_id,
    tabId: data?.tab_id,
    questionCount: data?.questions?.length,
    query: data?.query
  });
  return data;
}

export async function apiGetSourceStats(): Promise<SourceStatsResponse> {
  const res = await fetch(`${INTELLIGENCE_BASE_URL}/sources/stats`, {
    method: "GET",
    headers: buildHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Get source stats failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function apiGetCompanies(): Promise<CompanyInfo[]> {
  const res = await fetch(`${INTELLIGENCE_BASE_URL}/companies`, {
    method: "GET",
    headers: buildHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Get companies failed: ${res.status} ${text}`);
  }
  return res.json();
}

export interface CommunitySubmitRequest {
  question: string;
  company?: string;
  position?: string;
  level?: string;
  interview_round?: string;
  year_asked?: string;
  difficulty?: string;
  question_type?: string;
  answer?: string;
  code_solution?: string;
}
export interface CommunitySubmitResponse { status: string; id?: string; message?: string }
export async function apiSubmitCommunityQuestion(params: { submitted_by: string; body: CommunitySubmitRequest }): Promise<CommunitySubmitResponse> {
  const { submitted_by, body } = params;
  const url = new URL(`${INTELLIGENCE_BASE_URL}/community/submit`);
  url.searchParams.set("submitted_by", submitted_by);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Community submit failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function apiGetTransparency(): Promise<string> {
  const res = await fetch(`${INTELLIGENCE_BASE_URL}/transparency`, {
    method: "GET",
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error(`Get transparency failed: ${res.status}`);
  return res.text();
}

export async function apiGetEnhancedHealth(): Promise<any> {
  const res = await fetch(`${INTELLIGENCE_BASE_URL}/health/enhanced`, {
    method: "GET",
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error(`Enhanced health failed: ${res.status}`);
  return res.json();
}
export async function apiGetTopics(): Promise<TopicsResponse> {
  const res = await fetch(`${INTELLIGENCE_BASE_URL}/topics`, {
    method: "GET",
    headers: buildHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Get topics failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  console.log("[Intelligence API] GET /topics ->", data);
  return data;
}

export async function apiGetQuestionsByTopic(topic: string, limit: number = 50): Promise<QuestionsByTopicResponse> {
  const url = new URL(`${INTELLIGENCE_BASE_URL}/questions/${encodeURIComponent(topic)}`);
  url.searchParams.set("limit", String(Math.max(1, Math.min(100, limit))));
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Get questions by topic failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  console.log(`[Intelligence API] GET /questions/${topic}?limit=${limit} ->`, data);
  return data;
}

export async function apiSearchQuestions(
  query: string,
  limit: number = 20,
  refresh: boolean = false,
  save_to_history: boolean = true
): Promise<SearchQuestionsResponse> {
  const safeLimit = Math.max(1, Math.min(50, limit));
  const url = new URL(`${INTELLIGENCE_BASE_URL}/search`);
  url.searchParams.set("save_to_history", String(save_to_history));
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ query, limit: safeLimit, refresh })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Search questions failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  console.log("[Intelligence API] Regular search response:", {
    hasTabId: !!data?.tab_id,
    tabId: data?.tab_id,
    questionCount: data?.questions?.length,
    query: data?.query
  });
  return data;
}

export async function apiTriggerUpdate(): Promise<UpdateResponse> {
  const res = await fetch(`${INTELLIGENCE_BASE_URL}/update`, {
    method: "POST",
    headers: buildHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Trigger update failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  console.log("[Intelligence API] POST /update ->", data);
  return data;
}

// History management APIs
export async function apiGetHistoryTabs(params?: HistoryTabsQueryParams): Promise<HistoryTabsResponse> {
  const url = new URL(HISTORY_BASE_URL);
  if (typeof params?.limit === "number") url.searchParams.set("limit", String(params.limit));
  if (typeof params?.offset === "number") url.searchParams.set("offset", String(params.offset));
  if (params?.sort_by) url.searchParams.set("sort_by", params.sort_by);
  if (typeof params?.ascending === "boolean") url.searchParams.set("ascending", params.ascending ? "true" : "false");

  console.log("[History API] Fetching history tabs from:", url.toString());

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(),
  });

  console.log("[History API] Response status:", res.status);

  if (!res.ok) {
    // If 404, return empty result instead of throwing (API might not be deployed yet)
    if (res.status === 404) {
      console.warn("[History API] Endpoint not found (404), returning empty history");
      return { tabs: [], total: 0, offset: 0, limit: params?.limit || 50 };
    }
    const text = await res.text().catch(() => "");
    console.error("[History API] GET /api/history failed:", res.status, text);
    throw new Error(`Get history tabs failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  console.log("[History API] GET /api/history -> Success:", {
    tabCount: data?.tabs?.length,
    total: data?.total
  });
  return data;
}

export async function apiGetHistoryTab(tabId: string): Promise<HistoryTabSummary> {
  // HISTORY_BASE_URL already ends with /, so no need to add another slash
  const res = await fetch(`${HISTORY_BASE_URL}${encodeURIComponent(tabId)}`, {
    method: "GET",
    headers: buildHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Get history tab failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function apiSaveHistoryTab(payload: {
  query: string;
  questions: InterviewQuestion[];
  metadata?: HistoryTabMetadata;
}): Promise<{ tab_id: string }> {
  const res = await fetch(HISTORY_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Save history tab failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function apiUpdateHistoryTab(
  tabId: string,
  payload: {
    query?: string;
    questions?: InterviewQuestion[];
    metadata?: HistoryTabMetadata;
  }
): Promise<{ tab_id: string }> {
  // HISTORY_BASE_URL already ends with /, so no need to add another slash
  const res = await fetch(`${HISTORY_BASE_URL}${encodeURIComponent(tabId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Update history tab failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function apiDeleteHistoryTab(tabId: string): Promise<{ status: string }> {
  // HISTORY_BASE_URL already ends with /, so no need to add another slash
  const res = await fetch(`${HISTORY_BASE_URL}${encodeURIComponent(tabId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    if (res.status === 404) return { status: "deleted" };
    const text = await res.text().catch(() => "");
    throw new Error(`Delete history tab failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function apiDeleteAllHistory(): Promise<{ message: string }> {
  const res = await fetch(HISTORY_BASE_URL, {
    method: "DELETE",
  });
  if (!res.ok) {
    if (res.status === 404) return { message: "All history deleted" };
    const text = await res.text().catch(() => "");
    throw new Error(`Delete all history failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function apiSearchHistory(query: string, limit: number = 20): Promise<HistorySearchResponse> {
  // HISTORY_BASE_URL already ends with /, so no need to add another slash
  const url = new URL(`search/query`, HISTORY_BASE_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(Math.max(1, limit)));
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Search history failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function apiGetHistoryStats(): Promise<HistoryStatsResponse> {
  // HISTORY_BASE_URL already ends with /, so no need to add another slash
  const res = await fetch(`${HISTORY_BASE_URL}stats/overview`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Get history stats failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function apiExportHistory(format: "json" | "csv" = "json"): Promise<Blob> {
  // HISTORY_BASE_URL already ends with /, so no need to add another slash
  const res = await fetch(`${HISTORY_BASE_URL}export/${format}`, {
    method: "GET",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Export history failed: ${res.status} ${text}`);
  }
  return res.blob();
}


