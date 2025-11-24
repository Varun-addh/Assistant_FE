type EnvRecord = Record<string, unknown>;

const rawEnv: EnvRecord = ((import.meta as any)?.env ?? {}) as EnvRecord;

const TRUTHY_VALUES = new Set(["1", "true", "yes", "on", "enable", "enabled"]);
const FALSY_VALUES = new Set(["0", "false", "no", "off", "disable", "disabled"]);

function readBooleanEnv(key: string, fallback?: boolean): boolean | undefined {
  const raw = rawEnv[key];
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof raw === "boolean") return raw;
  const normalized = String(raw).trim().toLowerCase();
  if (TRUTHY_VALUES.has(normalized)) return true;
  if (FALSY_VALUES.has(normalized)) return false;
  return fallback;
}

export interface IntelligenceFeatureGates {
  hybridSearch: boolean;
  reranking: boolean;
  codeExecution: boolean;
  queryExpansion: boolean;
  streaming: boolean;
}

export interface IntelligenceFeatureDefaults {
  enableReranking?: boolean;
  enableQueryExpansion?: boolean;
}

export const intelligenceFeatureGates: IntelligenceFeatureGates = {
  hybridSearch: readBooleanEnv("VITE_INTELLIGENCE_ENABLE_HYBRID_SEARCH", true) ?? true,
  reranking: readBooleanEnv("VITE_INTELLIGENCE_ENABLE_RERANKING", true) ?? true,
  codeExecution: readBooleanEnv("VITE_INTELLIGENCE_ENABLE_CODE_EXECUTION", true) ?? true,
  queryExpansion: readBooleanEnv("VITE_INTELLIGENCE_ENABLE_QUERY_EXPANSION", true) ?? true,
  streaming: readBooleanEnv("VITE_INTELLIGENCE_ENABLE_STREAMING", true) ?? true,
};

export const intelligenceFeatureDefaults: IntelligenceFeatureDefaults = {
  enableReranking: readBooleanEnv("VITE_INTELLIGENCE_ENABLE_RERANKING"),
  enableQueryExpansion: readBooleanEnv("VITE_INTELLIGENCE_ENABLE_QUERY_EXPANSION"),
};

export function isIntelligenceFeatureEnabled(feature: keyof IntelligenceFeatureGates): boolean {
  return intelligenceFeatureGates[feature];
}

export function resolveIntelligenceFlag(
  preferred: boolean | undefined,
  key: keyof IntelligenceFeatureDefaults
): boolean | undefined {
  if (typeof preferred === "boolean") return preferred;
  return intelligenceFeatureDefaults[key];
}

