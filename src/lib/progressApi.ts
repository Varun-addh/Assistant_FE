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
  average_overall_score: number | null;
  last_completed_at: string | null;
  best_dimension: string | null;
  worst_dimension: string | null;
  lookback_days: number;
  domain?: string;
}

type RawProgressSummary = Record<string, unknown>;

const PROGRESS_RECORD_KEYS = ['summary', 'progress', 'stats', 'analytics', 'result', 'payload', 'data', 'report'] as const;
const PROGRESS_ARRAY_KEYS = ['points', 'heatmap', 'data', 'items', 'rows', 'results', 'buckets', 'weeks', 'series'] as const;

const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
};

const asStringOrNull = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  return null;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const asNumberOrNull = (value: unknown): number | null => {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const coerceDimensionName = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const nameRaw = obj.name ?? obj.dimension ?? obj.dimension_name;
    if (typeof nameRaw === 'string') return nameRaw;
  }
  return null;
};

const collectProgressRecordCandidates = (raw: unknown): Record<string, unknown>[] => {
  const root = asRecord(raw);
  if (!root) return [];

  const visited = new Set<Record<string, unknown>>();
  const candidates: Record<string, unknown>[] = [];

  const push = (record: Record<string, unknown> | null) => {
    if (!record || visited.has(record)) return;
    visited.add(record);
    candidates.push(record);
  };

  push(root);

  for (const key of PROGRESS_RECORD_KEYS) {
    const nested = asRecord(root[key]);
    push(nested);
    if (!nested) continue;

    for (const nestedKey of PROGRESS_RECORD_KEYS) {
      push(asRecord(nested[nestedKey]));
    }
  }

  return candidates;
};

const selectProgressSummaryPayload = (raw: unknown): RawProgressSummary => {
  const candidates = collectProgressRecordCandidates(raw);
  if (candidates.length === 0) return {};

  const summaryFieldNames = [
    'attempts',
    'attempt_count',
    'attempts_count',
    'total_attempts',
    'completed_attempts',
    'completed_sessions',
    'completed_session_count',
    'session_count',
    'sessions_count',
    'total_sessions',
    'sessions',
    'count',
    'average_overall_score',
    'avg_overall_score',
    'average_score',
    'avg_score',
    'last_completed_at',
    'last_attempt_at',
    'last_session_at',
  ];

  return (candidates.find((candidate) => summaryFieldNames.some((field) => candidate[field] !== undefined)) ?? candidates[0]) as RawProgressSummary;
};

const coerceWeekStart = (value: unknown): string => {
  if (typeof value === 'string' && value.trim()) return value.trim();

  const record = asRecord(value);
  if (!record) return '';

  return (
    asStringOrNull(record.week_start) ??
    asStringOrNull(record.weekStart) ??
    asStringOrNull(record.week_of) ??
    asStringOrNull(record.weekOf) ??
    asStringOrNull(record.start_of_week) ??
    asStringOrNull(record.startOfWeek) ??
    asStringOrNull(record.bucket_start) ??
    asStringOrNull(record.bucketStart) ??
    asStringOrNull(record.week) ??
    asStringOrNull(record.date) ??
    asStringOrNull(record.label) ??
    ''
  );
};

const coerceHeatmapAttempts = (value: unknown, fallback = 0): number => {
  const record = asRecord(value);
  if (record) {
    return asNumber(
      record.attempts ??
      record.attempt_count ??
      record.attempts_count ??
      record.total_attempts ??
      record.completed_attempts ??
      record.completed_sessions ??
      record.count ??
      record.sessions,
      fallback
    );
  }

  return asNumber(value, fallback);
};

const coerceHeatmapScore = (value: unknown): number => {
  const record = asRecord(value);
  if (record) {
    return asNumber(
      record.avg_score ??
      record.avgScore ??
      record.score ??
      record.average ??
      record.average_score ??
      record.averageScore ??
      record.mean_score ??
      record.meanScore ??
      record.value,
      NaN
    );
  }

  return asNumber(value, NaN);
};

const normalizeHeatmapEntry = (entry: unknown, defaultDimension?: string): HeatmapPoint[] => {
  const obj = asRecord(entry);
  if (!obj) return [];

  const week_start = coerceWeekStart(obj);
  const directDimension =
    coerceDimensionName(obj.dimension) ??
    coerceDimensionName(obj.dimension_name) ??
    coerceDimensionName(obj.metric) ??
    coerceDimensionName(obj.skill) ??
    coerceDimensionName(obj.category) ??
    coerceDimensionName(obj.name) ??
    (defaultDimension && defaultDimension.trim() ? defaultDimension.trim() : null);

  const directScore = coerceHeatmapScore(obj);
  const directAttempts = coerceHeatmapAttempts(obj, 0);

  if (week_start && directDimension && !Number.isNaN(directScore)) {
    return [{ week_start, dimension: directDimension, avg_score: directScore, attempts: directAttempts }];
  }

  const nestedDimensions =
    asRecord(obj.dimensions) ??
    asRecord(obj.dimension_scores) ??
    asRecord(obj.scores) ??
    asRecord(obj.metrics) ??
    null;

  if (!week_start || !nestedDimensions) return [];

  const points: HeatmapPoint[] = [];
  for (const [dimension, rawValue] of Object.entries(nestedDimensions)) {
    const avg_score = coerceHeatmapScore(rawValue);
    if (Number.isNaN(avg_score)) continue;

    const attempts = coerceHeatmapAttempts(rawValue, directAttempts);
    points.push({
      week_start,
      dimension,
      avg_score,
      attempts,
    });
  }

  return points;
};

const extractHeatmapEntries = (raw: unknown): HeatmapPoint[] => {
  const directArrays: unknown[][] = [];

  if (Array.isArray(raw)) {
    directArrays.push(raw);
  }

  const recordCandidates = collectProgressRecordCandidates(raw);
  for (const record of recordCandidates) {
    for (const key of PROGRESS_ARRAY_KEYS) {
      const arrayValue = record[key];
      if (Array.isArray(arrayValue)) {
        directArrays.push(arrayValue);
      }
    }
  }

  const parsedFromArrays = directArrays.flatMap((entries) => entries.flatMap((entry) => normalizeHeatmapEntry(entry)));
  if (parsedFromArrays.length > 0) return parsedFromArrays;

  for (const record of recordCandidates) {
    const groupedPoints: HeatmapPoint[] = [];

    for (const [key, value] of Object.entries(record)) {
      if ((PROGRESS_RECORD_KEYS as readonly string[]).includes(key) || (PROGRESS_ARRAY_KEYS as readonly string[]).includes(key)) {
        continue;
      }
      if (!Array.isArray(value)) continue;

      groupedPoints.push(...value.flatMap((entry) => normalizeHeatmapEntry(entry, key)));
    }

    if (groupedPoints.length > 0) return groupedPoints;
  }

  return [];
};

const coerceProgressSummary = (
  raw: unknown,
  lookbackDays: number,
  domain?: string
): ProgressSummary => {
  const payload = selectProgressSummaryPayload(raw);

  const attempts = asNumber(
    payload.attempts ??
      payload.attempt_count ??
      payload.attempts_count ??
      payload.total_attempts ??
      payload.completed_attempts ??
      payload.completed_sessions ??
      payload.completed_session_count ??
      payload.session_count ??
      payload.sessions_count ??
      payload.total_sessions ??
      payload.sessions ??
      payload.count,
    0
  );

  const average_overall_score =
    asNumberOrNull(
      payload.average_overall_score ??
      payload.overall_average_score ??
      payload.overall_average ??
      payload.avg_overall_score ??
      payload.avgOverallScore ??
      payload.avg_score ??
      payload.average_score ??
      payload.averageScore ??
      payload.overall_avg ??
      payload.mean_score ??
      payload.meanScore
    ) ?? null;

  const last_completed_at =
    asStringOrNull(payload.last_completed_at) ??
    asStringOrNull(payload.completed_at) ??
    asStringOrNull(payload.last_attempt_at) ??
    asStringOrNull(payload.last_session_at) ??
    asStringOrNull(payload.updated_at) ??
    asStringOrNull(payload.generated_at);

  const best_dimension = coerceDimensionName(
    payload.best_dimension ?? payload.best ?? payload.top_dimension ?? payload.strongest_dimension ?? payload.best_skill
  );
  const worst_dimension = coerceDimensionName(
    payload.worst_dimension ?? payload.worst ?? payload.bottom_dimension ?? payload.weakest_dimension ?? payload.worst_skill
  );

  const lookback_days = asNumber(payload.lookback_days, lookbackDays);

  const domainValue = typeof payload.domain === 'string' ? payload.domain : domain;

  return {
    attempts,
    average_overall_score,
    last_completed_at,
    best_dimension,
    worst_dimension,
    lookback_days,
    domain: domainValue,
  };
};

export interface HeatmapPoint {
  week_start: string;  // ISO date string (Monday)
  dimension: string;   // 'correctness' | 'delivery' | 'clarity' | 'structure'
  avg_score: number;   // 0-100
  attempts: number;    // Number of attempts in this week/dimension
}

// Intentionally flexible: backend returns `{ plan: object | null }` and the plan shape may evolve.
export type NextSessionPlan = Record<string, unknown>;

const coerceStringArrayLoose = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/\n|(?<=\.)\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const coerceBooleanOrUndefined = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
};

const coerceNumberMap = (value: unknown): Record<string, number> | undefined => {
  const record = asRecord(value);
  if (!record) return undefined;

  const entries = Object.entries(record)
    .map(([key, raw]) => {
      const parsed = asNumberOrNull(raw);
      return parsed === null ? null : [key, parsed] as const;
    })
    .filter((entry): entry is readonly [string, number] => entry !== null);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const coerceUnknownArray = (value: unknown): unknown[] | undefined => {
  return Array.isArray(value) ? value : undefined;
};

const coerceNextSessionPlanValue = (value: unknown): NextSessionPlan | null => {
  if (value === null || value === undefined) return null;

  const record = asRecord(value);
  if (record) return record;

  const list = coerceStringArrayLoose(value);
  if (list.length > 0) {
    return { focus: list };
  }

  return null;
};

export interface SessionScore {
  source?: 'runtime' | 'db' | (string & {});
  session_id?: string;
  complete?: boolean;
  overall_score: number;
  dimension_scores: {
    correctness: number;
    delivery: number;
    clarity: number;
    structure: number;
    [key: string]: number;
  };
  why: string[];
  improvement_plan: string[];
  next_session_plan?: NextSessionPlan | null;
  evaluation_report?: unknown;

  // Optional runtime extensions (may be absent on older backends)
  evaluation_trace?: unknown;
  trajectory?: unknown;

  screen_recording_url?: string;
  camera_recording_url?: string;
  violation_count?: number;
  total_violation_count?: number;
  serious_violation_count?: number;
  risk_level?: string | null;
  terminated_reason?: string | null;
  heartbeat_stale?: boolean;
  last_heartbeat_at?: string | null;
  remaining_total_before_termination?: number | null;
  remaining_serious_before_termination?: number | null;
  events?: unknown[];
  recent_events?: unknown[];
  event_counts?: Record<string, number>;

  // Live Practice additions
  media?: {
    screen_recording_url?: string;
    camera_recording_url?: string;
    [key: string]: unknown;
  };
  proctoring_summary?: {
    status?: string;
    risk_level?: string;
    violation_count?: number;
    total_violations?: number;
    serious_violations?: number;
    event_counts?: Record<string, number>;
    recent_events?: unknown[];
    terminated_reason?: string;
    events?: unknown[];
    [key: string]: unknown;
  };
}

type RawSessionScore = {
  session_id?: string;
  overall_score?: unknown;
  dimension_scores?: unknown;
  dimensions?: unknown;
  source?: unknown;
  complete?: unknown;
  why?: unknown;
  explanation?: unknown;
  reasoning?: unknown;
  reasons?: unknown;
  score_reasoning?: unknown;
  summary?: unknown;
  feedback_summary?: unknown;
  improvement_plan?: unknown;
  next_session_plan?: unknown;
  action_plan?: unknown;
  next_steps?: unknown;
  recommendations?: unknown;
  evaluation_report?: unknown;

  evaluation_trace?: unknown;
  trajectory?: unknown;

  screen_recording_url?: unknown;
  camera_recording_url?: unknown;
  violation_count?: unknown;
  total_violation_count?: unknown;
  total_violations?: unknown;
  serious_violation_count?: unknown;
  serious_violations?: unknown;
  risk_level?: unknown;
  terminated_reason?: unknown;
  heartbeat_stale?: unknown;
  last_heartbeat_at?: unknown;
  remaining_total_before_termination?: unknown;
  remaining_serious_before_termination?: unknown;
  event_counts?: unknown;
  recent_events?: unknown;
  events?: unknown;

  media?: unknown;
  proctoring_summary?: unknown;
  [key: string]: unknown;
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
  params.set('_t', String(Date.now()));
  const raw = (await strataxFetchJson(
    `${API_BASE_URL}/api/practice/progress/summary?${params.toString()}`,
    {
      method: 'GET',
      includeUserKeys: false,
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    }
  )) as unknown;

  console.log('📊 [Progress API] Summary raw response:', raw);
  return coerceProgressSummary(raw, lookbackDays, domain);
}

/**
 * Get heatmap data showing performance across dimensions over time
 * @param lookbackDays Number of days to look back (default: 90)
 * @param domain Optional domain filter
 * @param maxPoints Limit output size 1–5000 (default: 500)
 */
export async function getProgressHeatmap(
  lookbackDays: number = 90,
  domain?: string,
  maxPoints: number = 500
): Promise<HeatmapPoint[]> {
  const params = new URLSearchParams();
  params.set('lookback_days', String(lookbackDays));
  if (domain) {
    params.set('domain', domain);
  }
  params.set('max_points', String(maxPoints));
  // Cache-bust to ensure fresh data
  params.set('_t', String(Date.now()));

  const response = (await strataxFetchJson(
    `${API_BASE_URL}/api/practice/progress/heatmap?${params.toString()}`,
    {
      method: 'GET',
      includeUserKeys: false,
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    }
  )) as unknown;

  console.log('📊 [Progress API] Heatmap raw response:', response);

  const points = extractHeatmapEntries(response);

  if (points.length === 0 && response && typeof response === 'object') {
    console.warn('📊 [Progress API] Could not normalize any heatmap points from response:', response);
  }

  return points;
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
  // Cache-bust to ensure fresh data
  params.set('_t', String(Date.now()));

  const response = (await strataxFetchJson(
    `${API_BASE_URL}/api/practice/progress/next-session?${params.toString()}`,
    {
      method: 'GET',
      includeUserKeys: false,
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    }
  )) as unknown;

  console.log('📊 [Progress API] Next-session raw response:', response);

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
    { method: 'GET', includeUserKeys: false }
  )) as unknown;

  console.log('📊 [Session Score] Raw API response:', raw);

  const data = (raw ?? {}) as RawSessionScore;

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

  const improvement_plan = coerceStringArrayLoose(data.improvement_plan ?? data.action_plan);
  const next_session_plan = coerceNextSessionPlanValue(
    data.next_session_plan ?? data.next_steps ?? data.recommendations
  );

  let why = coerceStringArrayLoose(
    data.why ??
    data.reasons ??
    data.explanation ??
    data.reasoning ??
    data.score_reasoning ??
    data.summary ??
    data.feedback_summary
  );

  // Auto-generate from dimension scores if nothing else was provided
  if (why.length === 0 && dimension_scores) {
    const overall = asNumber(data.overall_score, 0);
    const sorted = Object.entries(dimension_scores)
      .filter(([, v]) => typeof v === 'number' && v > 0)
      .sort((a, b) => b[1] - a[1]);
    if (sorted.length >= 2) {
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      why = [
        `Your overall score is ${overall.toFixed(0)}/100.`,
        `Your strongest area was ${best[0]} (${best[1].toFixed(0)}%).`,
        `${worst[0]} (${worst[1].toFixed(0)}%) needs the most improvement.`,
      ];
    }
  }

  const screen_recording_url =
    asStringOrNull(data.screen_recording_url) ??
    asStringOrNull(asRecord(data.media)?.screen_recording_url) ??
    undefined;
  const camera_recording_url =
    asStringOrNull(data.camera_recording_url) ??
    asStringOrNull(asRecord(data.media)?.camera_recording_url) ??
    undefined;

  const proctoringSummaryRecord = asRecord(data.proctoring_summary);
  const event_counts =
    coerceNumberMap(data.event_counts) ??
    coerceNumberMap(proctoringSummaryRecord?.event_counts) ??
    undefined;
  const recent_events = coerceUnknownArray(data.recent_events) ?? coerceUnknownArray(proctoringSummaryRecord?.recent_events);
  const events = coerceUnknownArray(data.events) ?? coerceUnknownArray(proctoringSummaryRecord?.events);
  const risk_level =
    asStringOrNull(data.risk_level) ??
    asStringOrNull(proctoringSummaryRecord?.risk_level) ??
    null;
  const terminated_reason =
    asStringOrNull(data.terminated_reason) ??
    asStringOrNull(proctoringSummaryRecord?.terminated_reason) ??
    null;
  const violation_count =
    asNumberOrNull(data.violation_count ?? proctoringSummaryRecord?.violation_count) ??
    undefined;
  const total_violation_count =
    asNumberOrNull(data.total_violation_count ?? data.total_violations ?? proctoringSummaryRecord?.total_violations) ??
    violation_count ??
    undefined;
  const serious_violation_count =
    asNumberOrNull(data.serious_violation_count ?? data.serious_violations ?? proctoringSummaryRecord?.serious_violations) ??
    undefined;
  const heartbeat_stale =
    coerceBooleanOrUndefined(data.heartbeat_stale ?? proctoringSummaryRecord?.heartbeat_stale) ??
    undefined;
  const last_heartbeat_at =
    asStringOrNull(data.last_heartbeat_at ?? proctoringSummaryRecord?.last_heartbeat_at) ??
    null;
  const remaining_total_before_termination =
    asNumberOrNull(data.remaining_total_before_termination ?? proctoringSummaryRecord?.remaining_total_before_termination) ??
    null;
  const remaining_serious_before_termination =
    asNumberOrNull(data.remaining_serious_before_termination ?? proctoringSummaryRecord?.remaining_serious_before_termination) ??
    null;

  console.log('📊 [Session Score] Parsed:', {
    overall: asNumber(data.overall_score, 0),
    why,
    improvement_plan,
    next_session_plan,
    source: data.source,
    complete: data.complete,
  });

  return {
    source: (asStringOrNull(data.source) ?? undefined) as SessionScore['source'],
    session_id: asStringOrNull(data.session_id) ?? sessionId,
    complete: coerceBooleanOrUndefined(data.complete) ?? undefined,
    overall_score: asNumber(data.overall_score, 0),
    dimension_scores,
    why,
    improvement_plan,
    next_session_plan,
    evaluation_report: data.evaluation_report,
    evaluation_trace: data.evaluation_trace,
    trajectory: data.trajectory,
    screen_recording_url,
    camera_recording_url,
    violation_count,
    total_violation_count,
    serious_violation_count,
    risk_level,
    terminated_reason,
    heartbeat_stale,
    last_heartbeat_at,
    remaining_total_before_termination,
    remaining_serious_before_termination,
    event_counts,
    recent_events,
    events,
    media: (screen_recording_url || camera_recording_url)
      ? {
          ...(asRecord(data.media) ?? {}),
          screen_recording_url,
          camera_recording_url,
        }
      : undefined,
    proctoring_summary: {
      ...(proctoringSummaryRecord ?? {}),
      risk_level: risk_level ?? undefined,
      violation_count,
      total_violations: total_violation_count,
      serious_violations: serious_violation_count,
      event_counts,
      recent_events,
      events,
      terminated_reason: terminated_reason ?? undefined,
      heartbeat_stale,
      last_heartbeat_at: last_heartbeat_at ?? undefined,
      remaining_total_before_termination: remaining_total_before_termination ?? undefined,
      remaining_serious_before_termination: remaining_serious_before_termination ?? undefined,
    },
  };
}

// ============================================================================
// Mirror confidence trend (cross-session)
// ============================================================================

export interface MirrorTrendPoint {
  confidence: number;
  created_at: string | null;
  question: string;
  session_id: string;
}

export interface MirrorTopicTrend {
  topic: string;
  attempts: number;
  first_confidence: number;
  latest_confidence: number;
  best_confidence: number;
  delta: number;
  direction: 'improving' | 'declining' | 'steady' | 'insufficient_data';
  points: MirrorTrendPoint[];
}

export interface MirrorTrend {
  summary: {
    total_attempts: number;
    topics_tracked: number;
    improving: number;
    declining: number;
    weakest_topic: string | null;
    weakest_confidence: number | null;
    strongest_topic: string | null;
    strongest_confidence: number | null;
  };
  topics: MirrorTopicTrend[];
}

const EMPTY_MIRROR_TREND: MirrorTrend = {
  summary: {
    total_attempts: 0,
    topics_tracked: 0,
    improving: 0,
    declining: 0,
    weakest_topic: null,
    weakest_confidence: null,
    strongest_topic: null,
    strongest_confidence: null,
  },
  topics: [],
};

/**
 * Mirror Mode confidence per topic across every session.
 *
 * Returns an empty trend rather than throwing: this is one panel on a page of
 * many, and a user with no Mirror history is the normal case, not an error.
 */
export async function getMirrorTrend(maxPoints: number = 20): Promise<MirrorTrend> {
  try {
    const raw = (await strataxFetchJson(
      `${API_BASE_URL}/api/mirror/trend?max_points=${encodeURIComponent(String(maxPoints))}&_t=${Date.now()}`,
      { method: 'GET', includeUserKeys: false, cache: 'no-store' }
    )) as Partial<MirrorTrend> | null;

    if (!raw || !Array.isArray(raw.topics)) return EMPTY_MIRROR_TREND;
    return {
      summary: { ...EMPTY_MIRROR_TREND.summary, ...(raw.summary || {}) },
      topics: raw.topics,
    };
  } catch (err) {
    console.warn('[Progress API] Mirror trend unavailable:', err);
    return EMPTY_MIRROR_TREND;
  }
}
