import { useEffect, useRef, useState } from "react";
import { EvaluationOverlay } from "./components/EvaluationOverlay";
import { apiCreateSession, apiEvaluateStream } from "./lib/api";

type OverlayController = {
  start: (params: { code: string; problem: string; language?: string; title?: string; sessionId?: string }) => Promise<void>;
  close: () => void;
};

const controller: { current: OverlayController | null } = { current: null };

export function getEvaluationController() {
  if (!controller.current) throw new Error("Evaluation overlay not initialized yet");
  return controller.current;
}

// Public helpers to start/close overlay from anywhere
export async function startEvaluationOverlay(params: { code: string; problem: string; language?: string; title?: string; sessionId?: string }) {
  const c = getEvaluationController();
  await c.start(params);
}

export function closeEvaluationOverlay() {
  const c = getEvaluationController();
  c.close();
}

export const EvaluationOverlayHost = () => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("Evaluating...");
  const [isStreaming, setIsStreaming] = useState(false);
  const rawBufferRef = useRef<string>("");
  const [summaryHtml, setSummaryHtml] = useState<string>("");

  useEffect(() => {
    controller.current = {
      start: async ({ code, problem, language = "python", title: t, sessionId }) => {
        setTitle(t || "Evaluating...");
        // Do not clear text if we are going to reuse cache; we will overwrite when needed
        setOpen(true);
        setIsStreaming(true);

        const cacheKey = buildEvalCacheKey({ code, problem, language });
        const cached = readEvalFromCache(cacheKey);
        if (cached) {
          try { console.log('[eval][cache-hit]', { cacheKey, length: cached.length }); } catch {}
          setText(cached);
          setIsStreaming(false);
          // Try to build summary from cached full text if it looks like JSON-made markdown
          setSummaryHtml(buildSummaryFromRaw(cached));
          return;
        }

        let sid = sessionId;
        try {
          if (!sid) {
            const res = await apiCreateSession();
            sid = res.session_id;
          }
        } catch (e) {
          setIsStreaming(false);
          setText('Failed to create session.');
          return;
        }

        try {
          rawBufferRef.current = "";
          await apiEvaluateStream(
            { session_id: sid!, code, problem, language },
            (chunk) => {
              // Accumulate raw; we render after processing for structured formatting
              rawBufferRef.current += chunk;
              try { console.log('[eval][chunk]', chunk); } catch {}
            }
          );
        } catch (e: any) {
          const msg = `Error: ${String(e?.message || 'Evaluation failed')}`;
          rawBufferRef.current = (rawBufferRef.current || "") + `\n\n${msg}`;
        } finally {
          setIsStreaming(false);
          // Process final buffer into a pleasant, display-ready text (prefer markdown if present)
          try { console.log('[eval][raw]', rawBufferRef.current); } catch {}
          const processed = processRawEvaluation(rawBufferRef.current);
          try {
            const json = JSON.parse(rawBufferRef.current);
            console.log('[eval][json]', json);
          } catch {}
          setText(processed);
          setSummaryHtml(buildSummaryFromRaw(rawBufferRef.current));
          writeEvalToCache(cacheKey, processed);
        }
      },
      close: () => setOpen(false),
    };
    return () => {
      controller.current = null;
    };
  }, []);

  return (
    <EvaluationOverlay
      open={open}
      title={title}
      streamedText={text}
      isStreaming={isStreaming}
      summaryHtml={summaryHtml}
      onClose={() => setOpen(false)}
    />
  );
};

// ------- Simple cache (localStorage) -------
const CACHE_KEY_ROOT = "eval_cache_v1";
type EvalCache = Record<string, string>;

function readCacheRoot(): EvalCache {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY_ROOT);
    return raw ? (JSON.parse(raw) as EvalCache) : {};
  } catch {
    return {};
  }
}

function writeCacheRoot(cache: EvalCache) {
  try { window.localStorage.setItem(CACHE_KEY_ROOT, JSON.stringify(cache)); } catch {}
}

function buildEvalCacheKey(params: { code: string; problem: string; language: string }): string {
  // Simple deterministic key; good enough for local caching
  const { code, problem, language } = params;
  return `${language}::${hashString(problem)}::${hashString(code)}`;
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

function readEvalFromCache(key: string): string | null {
  const root = readCacheRoot();
  return root[key] || null;
}

function writeEvalToCache(key: string, value: string) {
  const root = readCacheRoot();
  root[key] = value;
  writeCacheRoot(root);
}

// ------- Post-processing -------
function processRawEvaluation(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  // Try to parse JSON and extract markdown if present
  try {
    const json = JSON.parse(trimmed);
    if (typeof json?.markdown === 'string' && json.markdown.trim()) {
      return json.markdown as string;
    }
    // Build a pleasant textual representation with better formatting
    const parts: string[] = [];
    if (json.problem) parts.push(`### Problem\n${json.problem}`);
    
    // Format approach with bullet points for better UX
    if (json.approach_auto_explanation) {
      const approach = json.approach_auto_explanation;
      // If it's already a string, try to convert to bullets
      if (typeof approach === 'string') {
        // Split by sentences and convert to bullet points
        const sentences = approach.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const bulletPoints = sentences.map(sentence => `- ${sentence.trim()}`).join('\n');
        parts.push(`### Approach\n${bulletPoints}`);
      } else {
        parts.push(`### Approach\n${approach}`);
      }
    }
    
    if (Array.isArray(json.strengths) && json.strengths.length) {
      parts.push(`### Strengths\n${json.strengths.map(s => `- ${s}`).join('\n')}`);
    }
    if (Array.isArray(json.weaknesses) && json.weaknesses.length) {
      parts.push(`### Areas for Improvement\n${json.weaknesses.map(w => `- ${w}`).join('\n')}`);
    }
    if (json.scores && typeof json.scores === 'object') {
      const scoreLines = Object.entries(json.scores).map(([k,v]) => `- ${k}: ${v}`);
      if (scoreLines.length) parts.push(`### Scores\n${scoreLines.join('\n')}`);
    }
    if (parts.length) return parts.join('\n\n');
  } catch {}
  // Fallback: return raw text
  return trimmed;
}

// Build a concise bullet summary section using JSON fields when available
function buildSummaryFromRaw(raw: string): string {
  try {
    const json = JSON.parse(String(raw || ""));
    const bullets: string[] = [];
    if (Array.isArray(json?.strengths)) bullets.push(...json.strengths.map((s: string) => `✓ ${s}`));
    if (Array.isArray(json?.weaknesses)) bullets.push(...json.weaknesses.map((s: string) => `⚠ ${s}`));
    if (json?.scores && typeof json.scores === 'object') {
      Object.entries(json.scores).forEach(([k, v]) => bullets.push(`${k}: ${v}`));
    }
    if (!bullets.length) return "";
    return `<ul class="bullet-list summary">${bullets.map(b => `<li class=\"bullet\">${escapeHtml(String(b))}</li>`).join('')}</ul>`;
  } catch {
    return "";
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


