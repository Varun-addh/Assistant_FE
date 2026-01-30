/**
 * Practice Progress Tracking API
 * Endpoints for progress summary, heatmap, and next session recommendations
 */

import { STRATAX_API_BASE_URL, strataxFetchJson } from './strataxClient';

const API_BASE_URL = STRATAX_API_BASE_URL;

// ============================================================================
// Progress API Types
// ============================================================================

export interface ProgressSummary {
  attempts: number;
  avg_overall_score: number;
  last_completed_at: string | null;
  best_dimension: {
    name: string;
    score: number;
  } | null;
  worst_dimension: {
    name: string;
    score: number;
  } | null;
  lookback_days: number;
  domain?: string;
}

export interface HeatmapPoint {
  week_start: string;  // ISO date string (Monday)
  dimension: string;   // 'correctness' | 'delivery' | 'clarity' | 'structure'
  avg_score: number;   // 0-100
  attempts: number;    // Number of attempts in this week/dimension
}

export interface NextSessionPlan {
  focus_dimension: string;
  question_count: number;
  recommended_round: string;
  difficulty: 'easy' | 'medium' | 'hard';
  reason: string;
  domain?: string;
}

export interface SessionScore {
  session_id?: string;
  overall_score: number;
  dimension_scores: {
    correctness: number;
    delivery: number;
    clarity: number;
    structure: number;
    [key: string]: number;
  };
  why?: string;
  improvement_plan?: string[];
  next_session_plan?: string[];
  evaluation_report?: unknown;

  // Live Practice additions
  media?: {
    screen_recording_url?: string;
    camera_recording_url?: string;
    [key: string]: unknown;
  };
  proctoring_summary?: {
    violation_count?: number;
    events?: unknown[];
    [key: string]: unknown;
  };
}

type RawSessionScore = {
  session_id?: string;
  overall_score?: unknown;
  dimension_scores?: unknown;
  dimensions?: unknown;
  why?: unknown;
  explanation?: unknown;
  improvement_plan?: unknown;
  next_session_plan?: unknown;
  action_plan?: unknown;
  evaluation_report?: unknown;

  media?: unknown;
  proctoring_summary?: unknown;
};

// ============================================================================
// Progress API Functions
// ============================================================================

/**
 * Get progress summary for the authenticated user
 * @param lookbackDays Number of days to look back (default: 30)
 * @param domain Optional domain filter (e.g., 'Python', 'System Design')
 */
export async function getProgressSummary(
  lookbackDays: number = 30,
  domain?: string
): Promise<ProgressSummary> {
  const params = new URLSearchParams();
  params.set('lookback_days', String(lookbackDays));
  if (domain) {
    params.set('domain', domain);
  }

  return await strataxFetchJson(
    `${API_BASE_URL}/api/practice/progress/summary?${params.toString()}`,
    { method: 'GET' }
  );
}

/**
 * Get heatmap data showing performance across dimensions over time
 * @param lookbackDays Number of days to look back (default: 90)
 * @param domain Optional domain filter
 */
export async function getProgressHeatmap(
  lookbackDays: number = 90,
  domain?: string
): Promise<HeatmapPoint[]> {
  const params = new URLSearchParams();
  params.set('lookback_days', String(lookbackDays));
  if (domain) {
    params.set('domain', domain);
  }

  const response = (await strataxFetchJson(
    `${API_BASE_URL}/api/practice/progress/heatmap?${params.toString()}`,
    { method: 'GET' }
  )) as unknown;

  // Backend may return either `{ points: [...] }` or the points array directly.
  if (Array.isArray(response)) return response as HeatmapPoint[];
  const obj = response as { points?: HeatmapPoint[] } | null;
  return obj?.points ?? [];
}

/**
 * Get next session recommendation based on user's weaknesses
 * @param domain Optional domain filter
 */
export async function getNextSessionPlan(
  domain?: string
): Promise<NextSessionPlan | null> {
  const params = new URLSearchParams();
  if (domain) {
    params.set('domain', domain);
  }

  const response = (await strataxFetchJson(
    `${API_BASE_URL}/api/practice/progress/next-session?${params.toString()}`,
    { method: 'GET' }
  )) as unknown;

  // Backend may return either `{ plan: {...} | null }` or the plan object directly.
  if (response === null) return null;
  const obj = response as { plan?: NextSessionPlan | null };
  if (typeof obj === 'object' && obj && 'plan' in obj) return obj.plan ?? null;
  return response as NextSessionPlan;
}

/**
 * Get instant score breakdown for a completed session
 * @param sessionId The session ID
 */
export async function getSessionScore(sessionId: string): Promise<SessionScore> {
  const raw = (await strataxFetchJson(
    `${API_BASE_URL}/api/practice/session/${sessionId}/score`,
    { method: 'GET' }
  )) as unknown;

  const data = (raw ?? {}) as RawSessionScore;

  const asNumber = (value: unknown, fallback = 0): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return fallback;
  };

  const asString = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value;
    return undefined;
  };

  const asStringArray = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const items = value.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
    return items.length > 0 ? items : undefined;
  };

  const coerceDimensionScores = (value: unknown): SessionScore['dimension_scores'] | null => {
    if (!value || typeof value !== 'object') return null;
    const obj = value as Record<string, unknown>;
    const correctness = asNumber(obj.correctness, 0);
    const delivery = asNumber(obj.delivery, 0);
    const clarity = asNumber(obj.clarity, 0);
    const structure = asNumber(obj.structure, 0);

    const extra: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'correctness' || k === 'delivery' || k === 'clarity' || k === 'structure') continue;
      const n = asNumber(v, NaN);
      if (!Number.isNaN(n)) extra[k] = n;
    }

    return {
      correctness,
      delivery,
      clarity,
      structure,
      ...extra,
    };
  };

  const dimension_scores =
    coerceDimensionScores(data.dimension_scores) ??
    coerceDimensionScores(data.dimensions) ??
    ({ correctness: 0, delivery: 0, clarity: 0, structure: 0 } as SessionScore['dimension_scores']);

  const improvement_plan = asStringArray(data.improvement_plan) ?? asStringArray(data.action_plan);
  const next_session_plan = asStringArray(data.next_session_plan);

  return {
    session_id: asString(data.session_id) ?? sessionId,
    overall_score: asNumber(data.overall_score, 0),
    dimension_scores,
    why: asString(data.why) ?? asString(data.explanation),
    improvement_plan,
    next_session_plan,
    evaluation_report: data.evaluation_report,
    media: (data.media && typeof data.media === 'object') ? (data.media as any) : undefined,
    proctoring_summary: (data.proctoring_summary && typeof data.proctoring_summary === 'object') ? (data.proctoring_summary as any) : undefined,
  };
}
