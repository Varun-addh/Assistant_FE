/**
 * DEPRECATED (frontend).
 *
 * Browser-side execution (Pyodide/WASM) has been removed.
 * Use backend-only execution via `POST /api/code/execute` (see `apiExecuteCode` in `src/lib/api.ts`).
 */

export interface PyodideResult {
  stdout: string;
  stderr: string;
  result?: any;
  error?: string;
  executionTime?: number;
  variables?: Record<string, any>;
}

export interface TraceEvent {
  step: number;
  line: number;
  event: 'call' | 'line' | 'return' | 'exception';
  function?: string;
  locals: Record<string, any>;
  stack: string[];
  stdout?: string;
  stderr?: string;
}

export interface PyodideTraceResult {
  events: TraceEvent[];
  stdout: string;
  stderr: string;
  executionTime?: number;
}

function deprecated(): never {
  throw new Error(
    "Deprecated Pyodide runner: use backend POST /api/code/execute (apiExecuteCode in src/lib/api.ts).",
  );
}

export async function runPythonClientSide(_code: string, _stdin: string = ""): Promise<PyodideResult> {
  deprecated();
}

export async function tracePythonClientSide(_code: string, _stdin: string = ""): Promise<PyodideTraceResult> {
  deprecated();
}

export function isPyodideSupported(): boolean {
  return false;
}

