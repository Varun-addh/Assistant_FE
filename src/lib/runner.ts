// Lightweight client for Judge0 CE / RapidAPI to compile & run code across many languages
// Configure with env:
// - VITE_JUDGE0_BASE_URL (e.g. https://judge0-ce.p.rapidapi.com or https://ce.judge0.com)
// - VITE_RAPIDAPI_KEY (if using RapidAPI)

export interface Judge0Language {
	id: number;
	name: string;
	version?: string;
}

export interface RunRequest {
	languageId: number;
	source: string;
	stdin?: string;
	args?: string[];
	timeoutMs?: number; // soft cap
}

export interface RunResult {
	status: { id: number; description: string };
	stdout?: string | null;
	stderr?: string | null;
	compile_output?: string | null;
	time?: string | null;
	memory?: number | null;
	token: string;
}

const BASE_URL = (import.meta as any).env?.VITE_JUDGE0_BASE_URL || "https://judge0-ce.p.rapidapi.com";
const RAPID_KEY = (import.meta as any).env?.VITE_RAPIDAPI_KEY || (import.meta as any).env?.VITE_JUDGE0_KEY || undefined;

function buildHeaders(): HeadersInit {
	const h: HeadersInit = {
		"Content-Type": "application/json",
	};
	// RapidAPI headers if a key is provided
  if (RAPID_KEY && BASE_URL.includes("rapidapi")) {
    try {
      (h as any)["X-RapidAPI-Key"] = RAPID_KEY;
      (h as any)["X-RapidAPI-Host"] = new URL(BASE_URL).host;
    } catch {}
  }
	return h;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let url: string;
  try {
    url = new URL(path, ensureBaseUrl()).toString();
  } catch (e) {
    throw new Error("Judge0 BASE URL is invalid. Set VITE_JUDGE0_BASE_URL to a full https URL (e.g. https://judge0-ce.p.rapidapi.com)." );
  }
  const res = await fetch(url, { ...init, headers: { ...(buildHeaders()), ...(init?.headers || {}) } });
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`Runner request failed: ${res.status} ${text}`);
	}
	return res.json();
}

function ensureBaseUrl(): string {
  // Ensure protocol present and no stray whitespace
  const raw = String(BASE_URL || "").trim();
  if (!raw) throw new Error("Missing VITE_JUDGE0_BASE_URL");
  // Will throw if invalid
  // eslint-disable-next-line no-new
  new URL(raw);
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export async function listLanguages(): Promise<Judge0Language[]> {
	// Some deployments require a specific pathname for languages
	try {
		const data = await http<any>("/languages");
		return (data || []).map((l: any) => ({ id: l.id, name: l.name }));
	} catch {
		return [
			{ id: 71, name: "Python (3.x)" },
			{ id: 63, name: "JavaScript (Node.js)" },
			{ id: 62, name: "Java (OpenJDK)" },
			{ id: 54, name: "C++ (GCC)" },
			{ id: 50, name: "C (GCC)" },
			{ id: 51, name: "C# (.NET)" },
      { id: 60, name: "Go" },
      // Common SQL engine on Judge0 (SQLite). Note: actual id may differ per deployment,
      // but 82 is the standard in Judge0 CE. Users can still select the proper one if available.
      { id: 82, name: "SQL (SQLite)" },
		];
	}
}

export async function submitRun(req: RunRequest): Promise<{ token: string }>{
	const body = {
		language_id: req.languageId,
		source_code: b64(req.source),
		stdin: req.stdin ? b64(req.stdin) : null,
		args: req.args || [],
		redirect_stderr_to_stdout: false,
		base64_encoded: true,
	};
	const data = await http<{ token: string }>("/submissions?base64_encoded=true&wait=false", {
		method: "POST",
		body: JSON.stringify(body),
	});
	return data;
}

export async function pollResult(token: string, opts?: { intervalMs?: number; timeoutMs?: number }): Promise<RunResult> {
	const interval = opts?.intervalMs ?? 700;
	const timeout = opts?.timeoutMs ?? 20000;
	const start = Date.now();
	while (true) {
		const result = await http<RunResult>(`/submissions/${encodeURIComponent(token)}?base64_encoded=true`);
		const statusId = result?.status?.id ?? 0;
		if (statusId >= 3 || statusId === 0) {
			// finished or received non-processing
			return decodeBase64Fields(result);
		}
		if (Date.now() - start > timeout) {
			return decodeBase64Fields(result);
		}
		await sleep(interval);
	}
}

function decodeBase64Fields(r: RunResult): RunResult {
	const dec = (v?: string | null) => (v ? atob(v) : v);
	return {
		...r,
		stdout: dec(r.stdout),
		stderr: dec(r.stderr),
		compile_output: dec(r.compile_output),
	};
}

function b64(s: string): string { return btoa(unescape(encodeURIComponent(s))); }
function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }


