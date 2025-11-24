// Client-side Python execution using Pyodide (no backend needed)
// Loads Pyodide from CDN and provides sandbox execution

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

let pyodideInstance: any = null;
let pyodideLoading: Promise<any> | null = null;

async function loadPyodideInstance(): Promise<any> {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideLoading) return pyodideLoading;
  
  pyodideLoading = (async () => {
    // @ts-ignore
    const loadFn = (window as any).loadPyodide;
    if (!loadFn) throw new Error('Pyodide loader not available');
    const pyodide = await loadFn({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/",
    });
    pyodideInstance = pyodide;
    return pyodide;
  })();
  
  return pyodideLoading;
}

// Load Pyodide script if not already loaded
async function ensurePyodide(): Promise<any> {
  if ((window as any).loadPyodide) {
    return loadPyodideInstance();
  }
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
    script.async = true;
    script.onload = () => {
      // @ts-ignore
      if ((window as any).loadPyodide) {
        loadPyodideInstance().then(resolve).catch(reject);
      } else {
        reject(new Error('Pyodide failed to load'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load Pyodide script'));
    document.head.appendChild(script);
  });
}

export async function runPythonClientSide(code: string, stdin: string = ''): Promise<PyodideResult> {
  const startTime = Date.now();
  let stdout = '';
  let stderr = '';
  
  try {
    const pyodide = await ensurePyodide();
    
    // Redirect stdout/stderr
    pyodide.runPython(`
import sys
from io import StringIO

class OutputCapture:
    def __init__(self):
        self.buffer = StringIO()
    
    def write(self, s):
        self.buffer.write(s)
    
    def getvalue(self):
        return self.buffer.getvalue()

stdout_capture = OutputCapture()
stderr_capture = OutputCapture()
sys.stdout = stdout_capture
sys.stderr = stderr_capture
`);
    
    // Handle stdin by setting up input() mock
    if (stdin.trim()) {
      const lines = stdin.trim().split('\n');
      let stdinIndex = 0;
      pyodide.runPython(`
import sys
_stdin_lines = ${JSON.stringify(lines)}
_stdin_index = 0

def input(prompt=''):
    global _stdin_index
    if _stdin_index < len(_stdin_lines):
        result = _stdin_lines[_stdin_index]
        _stdin_index += 1
        return result
    return ''
`);
    } else {
      pyodide.runPython(`
def input(prompt=''):
    return ''
`);
    }
    
    // Execute user code
    let variables: Record<string, any> = {};
    try {
      pyodide.runPython(code);
      stdout = pyodide.runPython('stdout_capture.getvalue()');
      stderr = pyodide.runPython('stderr_capture.getvalue()');
      
      // Try to extract variables (limited scope - only if code completes)
      try {
        pyodide.runPython(`
import json
_vars_to_export = {}
_ignore_vars = {'__builtins__', '__name__', '__doc__', '__file__', '__package__', '_stdin_lines', '_stdin_index', 'stdout_capture', 'stderr_capture', 'OutputCapture', 'sys', 'StringIO'}
for name, val in globals().items():
    if name not in _ignore_vars and not name.startswith('_'):
        try:
            if isinstance(val, (int, float, str, bool, type(None))):
                _vars_to_export[name] = str(val)
            elif isinstance(val, (list, tuple)):
                _vars_to_export[name] = str(val)[:100]  # Limit length
            else:
                _vars_to_export[name] = type(val).__name__
        except:
            pass
`);
        const varsJson = pyodide.runPython('json.dumps(_vars_to_export)');
        if (varsJson) {
          try {
            variables = JSON.parse(varsJson);
          } catch {}
        }
      } catch {
        // Variable extraction failed, continue
      }
    } catch (error: any) {
      stderr = String(error?.message || error || 'Execution error');
    }
    
    const executionTime = (Date.now() - startTime) / 1000;
    
    return {
      stdout: stdout || '',
      stderr: stderr || '',
      executionTime,
      variables: Object.keys(variables).length > 0 ? variables : undefined,
    };
  } catch (error: any) {
    return {
      stdout: '',
      stderr: String(error?.message || error || 'Failed to initialize Pyodide'),
      executionTime: (Date.now() - startTime) / 1000,
    };
  }
}

export function isPyodideSupported(): boolean {
  return typeof WebAssembly !== 'undefined';
}

// Advanced: tracing execution using sys.settrace and emitting normalized events
export async function tracePythonClientSide(code: string, stdin: string = ''): Promise<PyodideTraceResult> {
  const startTime = Date.now();
  try {
    const pyodide = await ensurePyodide();

    // Boot runtime + I/O
    pyodide.runPython(`
import sys, json
from io import StringIO

stdout_capture = StringIO()
stderr_capture = StringIO()
sys_stdout_orig = sys.stdout
sys_stderr_orig = sys.stderr
sys.stdout = stdout_capture
sys.stderr = stderr_capture

events = []
step_counter = 0
stack_names = []
MAX_EVENTS = 4000

TARGET_FILENAME = '<user>'

def _normalize_locals(locals_dict):
    out = {}
    for k,v in list(locals_dict.items())[:100]:
        try:
            if isinstance(v, (int, float, str, bool, type(None))):
                out[k] = v
            elif isinstance(v, (list, tuple, set)):
                out[k] = list(v)[:50]
            elif isinstance(v, dict):
                out[k] = {str(kk): str(vv) for kk, vv in list(v.items())[:50]}
            else:
                out[k] = type(v).__name__
        except Exception:
            out[k] = 'unrepr'
    return out

def tracer(frame, event, arg):
    global step_counter
    try:
        fname = getattr(frame.f_code, 'co_filename', '') or ''
        # Only keep events from the compiled user code
        if fname != TARGET_FILENAME:
            return tracer
        if step_counter >= MAX_EVENTS:
            return None
        # Emit only line-level events for smooth stepping
        if event != 'line':
            return tracer
        line_no = frame.f_lineno
        payload = {
            'step': step_counter,
            'line': line_no,
            'event': event,
            'function': frame.f_code.co_name,
            'locals': _normalize_locals(frame.f_locals),
            'stack': list(stack_names) if stack_names else ([frame.f_code.co_name] if frame.f_code.co_name else []),
        }
        events.append(payload)
        step_counter += 1
        return tracer
    except Exception:
        return tracer

sys.settrace(tracer)
`);

    // stdin mocking
    if (stdin.trim()) {
      const lines = stdin.trim().split('\n');
      pyodide.runPython(`
_stdin_lines = ${JSON.stringify(lines)}
_stdin_index = 0
def input(prompt=''):
    global _stdin_index
    if _stdin_index < len(_stdin_lines):
        s = _stdin_lines[_stdin_index]
        _stdin_index += 1
        return s
    return ''
`);
    } else {
      pyodide.runPython(`
def input(prompt=''):
    return ''
`);
    }

    // Execute compiled user code as '<user>' so line numbers map 1:1
    let stdout = '';
    let stderr = '';
    try {
      const pyCode = `src_code = ${JSON.stringify(code)}\ncode_obj = compile(src_code, '<user>', 'exec')\nstack_names.clear()\ntry:\n    exec(code_obj, globals(), globals())\nfinally:\n    import sys\n    sys.settrace(None)`;
      pyodide.runPython(pyCode);
    } catch (e) {
      // capture error message from thrown Python exception bridge
    }

    stdout = pyodide.runPython('stdout_capture.getvalue()') || '';
    stderr = pyodide.runPython('stderr_capture.getvalue()') || '';

    const eventsJson = pyodide.runPython('json.dumps(events)');
    const events: TraceEvent[] = JSON.parse(eventsJson || '[]');

    return {
      events,
      stdout,
      stderr,
      executionTime: (Date.now() - startTime) / 1000,
    };
  } catch (error: any) {
    return {
      events: [],
      stdout: '',
      stderr: String(error?.message || error || 'Trace failed'),
      executionTime: (Date.now() - startTime) / 1000,
    };
  }
}

