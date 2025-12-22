// Mock Interview API Client
// Follows the same patterns as api.ts for consistency

const BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "https://intvmate-interview-assistant.hf.space";

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // User-provided API key (Bring Your Own Key)
  const userKey = typeof window !== 'undefined' ? localStorage.getItem("user_api_key") : null;
  if (userKey) {
    headers["X-API-Key"] = userKey;
  }

  return headers;
}

// Request/Response Types
export type InterviewType = "coding" | "behavioral" | "system_design" | "technical";
export type Difficulty = "easy" | "medium" | "hard";
export type InputMethod = "text" | "voice";

export interface StartSessionRequest {
  user_id: string;
  interview_type: InterviewType;
  difficulty: Difficulty;
  num_questions: number;
  topic?: string;
}

export interface StartSessionResponse {
  session_id: string;
  first_question: {
    question_id: string;
    question_text: string;
    question_number: number;
    difficulty: Difficulty;
    topic: string;
    interview_type: InterviewType;
    hints?: string[];
    total_questions: number;
  };
  total_questions: number;
  interview_type: InterviewType;
  difficulty: Difficulty;
}

export interface SubmitAnswerRequest {
  session_id: string;
  answer_text: string;
  time_taken_seconds?: number;
  input_method: InputMethod;
  code_solution?: string;
  language?: string;
}

export interface SubmitAnswerResponse {
  evaluation: {
    criteria_scores: {
      correctness: number;
      completeness: number;
      clarity: number;
      confidence: number;
      technical_depth: number;
    };
    detailed_feedback: string;
    overall_score: number;
    performance_summary: string;
    rating_category: string;
    strengths: string[];
    weaknesses: string[];
    improvement_suggestions: string[];
    missing_points: string[];
    model_answer?: string;
  };
  follow_up_questions?: string[];
  next_question?: {
    question_id: string;
    question_text: string;
    question_number: number;
    difficulty: Difficulty;
    topic: string;
    interview_type: InterviewType;
    total_questions: number;
  };
  is_last_question: boolean;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
}

export interface SessionStatusResponse {
  session_id: string;
  user_id: string;
  interview_type: InterviewType;
  difficulty: Difficulty;
  status: "active" | "completed" | "abandoned";
  current_question_index: number;
  total_questions: number;
  start_time: string;
  current_question?: {
    question_id: string;
    question_text: string;
    difficulty: Difficulty;
    topic: string;
  };
}

export interface SessionSummaryResponse {
  session_id: string;
  average_score: number;
  interview_type: InterviewType;
  difficulty: Difficulty;
  questions_answered: number;
  total_questions: number;
  started_at: string;
  completed_at: string;
  evaluations: Array<{
    question: string;
    score: number;
    rating: string;
    summary: string;
  }>;
}

export interface HintResponse {
  hint: string;
  hint_level: 1 | 2 | 3;
  hints_used_count: number;
  hint_description: string;
}

export interface ProgressResponse {
  session_id: string;
  current_question: number;
  total_questions: number;
  questions_answered: number;
  average_score: number;
  total_time_seconds: number;
  hints_used_total: number;
  question_times: number[];
  question_scores: number[];
}

// API Functions
export async function apiStartMockInterview(
  request: StartSessionRequest
): Promise<StartSessionResponse> {
  console.log("[MockInterviewAPI] Starting interview, request:", request);
  console.log("[MockInterviewAPI] URL:", `${BASE_URL}/api/mock-interview/sessions/start`);

  const res = await fetch(`${BASE_URL}/api/mock-interview/sessions/start`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(request),
  });

  console.log("[MockInterviewAPI] Response status:", res.status, res.statusText);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[MockInterviewAPI] Error response:", text);
    throw new Error(`Failed to start mock interview: ${res.status} ${text}`);
  }

  const data = await res.json();
  console.log("[MockInterviewAPI] Response data:", data);
  return data;
}

export async function apiSubmitMockAnswer(
  request: SubmitAnswerRequest
): Promise<SubmitAnswerResponse> {
  console.log("[MockInterviewAPI] Submitting answer, request:", request);

  const res = await fetch(`${BASE_URL}/api/mock-interview/sessions/submit-answer`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(request),
  });

  console.log("[MockInterviewAPI] Submit response status:", res.status, res.statusText);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[MockInterviewAPI] Submit error response:", text);
    throw new Error(`Failed to submit answer: ${res.status} ${text}`);
  }

  const data = await res.json();
  console.log("[MockInterviewAPI] Submit response data:", data);
  return data;
}

export async function apiGetSessionStatus(
  sessionId: string
): Promise<SessionStatusResponse> {
  const res = await fetch(`${BASE_URL}/api/mock-interview/sessions/${encodeURIComponent(sessionId)}`, {
    method: "GET",
    headers: buildHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to get session status: ${res.status} ${text}`);
  }

  return res.json();
}

export async function apiGetSessionSummary(
  sessionId: string
): Promise<SessionSummaryResponse> {
  const res = await fetch(
    `${BASE_URL}/api/mock-interview/sessions/${encodeURIComponent(sessionId)}/summary`,
    {
      method: "GET",
      headers: buildHeaders(),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to get session summary: ${res.status} ${text}`);
  }

  return res.json();
}

export async function apiEndSession(sessionId: string): Promise<{ message: string }> {
  const res = await fetch(
    `${BASE_URL}/api/mock-interview/sessions/${encodeURIComponent(sessionId)}/end`,
    {
      method: "POST",
      headers: buildHeaders(),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to end session: ${res.status} ${text}`);
  }

  return res.json();
}

export async function apiGetHint(
  sessionId: string,
  hintLevel: 1 | 2 | 3
): Promise<HintResponse> {
  console.log("[MockInterviewAPI] Requesting hint, level:", hintLevel);

  const res = await fetch(
    `${BASE_URL}/api/mock-interview/sessions/${encodeURIComponent(sessionId)}/hint?hint_level=${hintLevel}`,
    {
      method: "POST",
      headers: buildHeaders(),
    }
  );

  console.log("[MockInterviewAPI] Hint response status:", res.status, res.statusText);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[MockInterviewAPI] Hint error response:", text);
    throw new Error(`Failed to get hint: ${res.status} ${text}`);
  }

  const data = await res.json();
  console.log("[MockInterviewAPI] Hint response data:", data);
  return data;
}

export async function apiGetProgress(
  sessionId: string
): Promise<ProgressResponse> {
  const res = await fetch(
    `${BASE_URL}/api/mock-interview/sessions/${encodeURIComponent(sessionId)}/progress`,
    {
      method: "GET",
      headers: buildHeaders(),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to get progress: ${res.status} ${text}`);
  }

  return res.json();
}

export interface MockInterviewHistorySession {
  session_id: string;
  user_id: string;
  interview_type: InterviewType;
  difficulty: Difficulty;
  status: "completed" | "active" | "abandoned";
  started_at: string;
  completed_at?: string;
  average_score: number;
  questions_answered: number;
  total_questions: number;
  evaluations?: Array<{
    question: string;
    user_answer: string;
    model_answer?: string;
    score: number;
    rating: string;
    feedback: string;
  }>;
}

export async function apiGetMockInterviewHistory(
  userId: string
): Promise<{ sessions: MockInterviewHistorySession[] }> {
  console.log("[MockInterviewAPI] Fetching history for userId:", userId);
  console.log("[MockInterviewAPI] URL:", `${BASE_URL}/api/mock-interview/history/${encodeURIComponent(userId)}`);

  const res = await fetch(
    `${BASE_URL}/api/mock-interview/history/${encodeURIComponent(userId)}?include_evaluations=true`,
    {
      method: "GET",
      headers: buildHeaders(),
    }
  );

  console.log("[MockInterviewAPI] History response status:", res.status, res.statusText);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[MockInterviewAPI] History error response:", text);
    // Return empty array if endpoint doesn't exist yet
    if (res.status === 404) {
      console.log("[MockInterviewAPI] 404 - returning empty sessions");
      return { sessions: [] };
    }
    throw new Error(`Failed to get mock interview history: ${res.status} ${text}`);
  }

  const data = await res.json();
  console.log("[MockInterviewAPI] History response data:", data);
  return data;
}

export async function apiDeleteMockInterviewSession(
  userId: string,
  sessionId: string
): Promise<{ message: string }> {
  console.log("[MockInterviewAPI] Deleting session:", sessionId, "for user:", userId);

  const res = await fetch(
    `${BASE_URL}/api/mock-interview/history/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
      headers: buildHeaders(),
    }
  );

  console.log("[MockInterviewAPI] Delete response status:", res.status, res.statusText);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[MockInterviewAPI] Delete error response:", text);
    if (res.status === 403) {
      throw new Error("You don't have permission to delete this session");
    }
    throw new Error(`Failed to delete session: ${res.status} ${text}`);
  }

  const data = await res.json();
  console.log("[MockInterviewAPI] Delete response data:", data);
  return data;
}

export async function apiDeleteAllMockInterviewSessions(
  userId: string
): Promise<{ message: string; deleted_count: number }> {
  console.log("[MockInterviewAPI] Deleting all sessions for user:", userId);

  const res = await fetch(
    `${BASE_URL}/api/mock-interview/history/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: buildHeaders(),
    }
  );

  console.log("[MockInterviewAPI] Delete all response status:", res.status, res.statusText);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[MockInterviewAPI] Delete all error response:", text);
    throw new Error(`Failed to delete all sessions: ${res.status} ${text}`);
  }

  const data = await res.json();
  console.log("[MockInterviewAPI] Delete all response data:", data);
  return data;
}
