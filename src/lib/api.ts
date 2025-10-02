export type AnswerStyle = "short" | "detailed";

const BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";
const API_KEY = (import.meta as any).env?.VITE_API_KEY || undefined;

function buildHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (API_KEY) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${API_KEY}`;
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
}
export interface SubmitQuestionResponse {
  answer: string;
  style: AnswerStyle;
  created_at: string; // ISO8601
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
  const res = await fetch(`${BASE_URL}/api/history/${encodeURIComponent(sessionId)}`, {
    method: "GET",
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error(`Get history failed: ${res.status}`);
  return res.json();
}

export async function apiDeleteHistoryItem(params: { session_id: string; created_at: string }): Promise<{ status: string }> {
  const { session_id, created_at } = params;
  // Try DELETE first (query param)
  const urlDelete = `${BASE_URL}/api/history/${encodeURIComponent(session_id)}?created_at=${encodeURIComponent(created_at)}`;
  let res = await fetch(urlDelete, { method: "DELETE", headers: buildHeaders() });
  if (res.ok) return res.json();

  // Fallback: some servers don't allow DELETE here; try POST-based delete endpoint
  const urlPost = `${BASE_URL}/api/history/${encodeURIComponent(session_id)}/delete`;
  res = await fetch(urlPost, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ created_at }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Delete history failed: ${res.status} ${text}`);
  }
  return res.json();
}

export interface SessionSummary {
  session_id: string;
  last_update: string;
  qna_count: number;
}
export async function apiGetSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${BASE_URL}/api/sessions`, {
    method: "GET",
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error(`Get sessions failed: ${res.status}`);
  return res.json();
}

export async function apiDeleteSession(sessionId: string): Promise<{ status: string }>{
  const res = await fetch(`${BASE_URL}/api/session/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Delete session failed: ${res.status} ${text}`);
  }
  return res.json();
}

// New: delete a single history item by index
export async function apiDeleteHistoryItemByIndex(params: { session_id: string; index: number }): Promise<{ status: string }>{
  const { session_id, index } = params;
  const res = await fetch(`${BASE_URL}/api/history/${encodeURIComponent(session_id)}/${index}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Delete history item failed: ${res.status} ${text}`);
  }
  return res.json();
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
  const headers: HeadersInit = {};
  if (API_KEY) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${API_KEY}`;
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


