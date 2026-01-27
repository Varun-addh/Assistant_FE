/**
 * DEPRECATED (frontend).
 *
 * This app now performs code execution backend-only via `POST /api/code/execute`
 * (see `apiExecuteCode` in `src/lib/api.ts`).
 *
 * Do not add any RapidAPI/Judge0 keys to Vite env vars (any `VITE_*` value is shipped to browsers).
 */

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
	timeoutMs?: number;
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

function deprecated(): never {
	throw new Error(
		"Deprecated frontend runner: use backend POST /api/code/execute (apiExecuteCode in src/lib/api.ts).",
	);
}

export async function listLanguages(): Promise<Judge0Language[]> {
	deprecated();
}

export async function submitRun(_req: RunRequest): Promise<{ token: string }> {
	deprecated();
}

export async function pollResult(_token: string): Promise<RunResult> {
	deprecated();
}


