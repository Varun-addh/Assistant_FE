import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";

export interface VisualizeEvent {
  step: number;
  line: number;
  event: "call" | "line" | "return" | "exception";
  function?: string;
  locals: Record<string, any>;
  stack: string[];
}

interface Props {
  editor: any | null;
  code: string;
  events: VisualizeEvent[];
  isTracing: boolean;
  onTrace: () => void;
}

export const ExecutionVisualizer = ({ editor, code, events, isTracing, onTrace }: Props) => {
  const [current, setCurrent] = useState<number>(0);
  const [playing, setPlaying] = useState(false);
  const [collapseRepeats, setCollapseRepeats] = useState(true);
  const decorationsRef = useRef<string[]>([]);

  // Precompute unique (collapsed) steps when requested
  type DisplayEvent = VisualizeEvent & { count?: number };
  const displayEvents: DisplayEvent[] = useMemo(() => {
    if (!collapseRepeats) return events as DisplayEvent[];
    const out: DisplayEvent[] = [];
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const last = out[out.length - 1];
      if (last && last.line === e.line) {
        last.count = (last.count || 1) + 1;
        // update locals/stack to the latest snapshot in the run for that line
        last.locals = e.locals;
        last.stack = e.stack;
      } else {
        out.push({ ...e, count: 1 });
      }
    }
    return out;
  }, [events, collapseRepeats]);

  const total = displayEvents.length;
  const evt = displayEvents[Math.max(0, Math.min(current, Math.max(0, total - 1)))] as DisplayEvent | undefined;

  // Highlight current line in Monaco
  const highlight = useCallback((line: number | undefined) => {
    if (!editor || !line || line <= 0) return;
    try {
      const range = {
        startLineNumber: line,
        endLineNumber: line,
        startColumn: 1,
        endColumn: 1,
      } as any;
      const newDecos = editor.deltaDecorations(
        decorationsRef.current,
        [
          {
            range,
            options: {
              isWholeLine: true,
              className: "viz-current-line",
              linesDecorationsClassName: "viz-gutter",
              marginClassName: "viz-margin",
            },
          },
        ]
      );
      decorationsRef.current = newDecos;
      editor.revealLineInCenter(line);
    } catch {}
  }, [editor]);

  useEffect(() => {
    highlight(evt?.line);
    return () => {
      try { if (editor && decorationsRef.current.length) editor.deltaDecorations(decorationsRef.current, []); } catch {}
    };
  }, [evt?.line, editor, highlight]);

  // Playback loop
  useEffect(() => {
    if (!playing) return;
    if (current >= total - 1) { setPlaying(false); return; }
    const id = window.setTimeout(() => setCurrent((c) => Math.min(total - 1, c + 1)), 500);
    return () => window.clearTimeout(id);
  }, [playing, current, total]);

  const onRestart = () => { setCurrent(0); setPlaying(false); };
  const onPrev = () => setCurrent((c) => Math.max(0, c - 1));
  const onNext = () => setCurrent((c) => Math.min(Math.max(0, total - 1), c + 1));

  const localsList = useMemo(() => Object.entries(evt?.locals || {}), [evt]);

  // Simple rule-based explainer (fast, local)
  const lineText = useMemo(() => {
    const lines = String(code || '').split(/\r?\n/);
    const idx = (evt?.line || 1) - 1;
    return lines[idx] ?? '';
  }, [code, evt?.line]);

  const explanation = useMemo(() => explainLine(lineText, evt?.locals || {}), [lineText, evt?.locals]);

  return (
    <div className="flex flex-col lg:flex-row h-full gap-3">
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={onTrace} disabled={isTracing}>
            {isTracing ? "Tracing…" : "Visualize"}
          </Button>
          <Button size="sm" variant="outline" onClick={onRestart} disabled={!total}><RotateCcw className="h-3.5 w-3.5 mr-1"/>Restart</Button>
          <Button size="sm" variant="outline" onClick={onPrev} disabled={!total || current===0}><ChevronLeft className="h-3.5 w-3.5 mr-1"/>Prev</Button>
          <Button size="sm" variant="outline" onClick={onNext} disabled={!total || current>=total-1}><ChevronRight className="h-3.5 w-3.5 mr-1"/>Next</Button>
          <Button size="sm" variant="outline" onClick={()=>setPlaying(p=>!p)} disabled={!total}>
            {playing ? (<><Pause className="h-3.5 w-3.5 mr-1"/>Pause</>) : (<><Play className="h-3.5 w-3.5 mr-1"/>Play</>)}
          </Button>
          <label className="text-xs flex items-center gap-1 ml-2 select-none cursor-pointer">
            <input type="checkbox" checked={collapseRepeats} onChange={(e)=>{ setCurrent(0); setCollapseRepeats(e.target.checked); }} />
            Collapse repeats
          </label>
          <div className="text-xs text-muted-foreground ml-2">{total ? `Step ${current+1} / ${total}` : 'No trace yet'}</div>
        </div>

        <Card className="flex-1 min-h-0">
          <CardHeader className="pb-2">
            <div className="text-sm font-semibold">Step Details</div>
            {evt ? <div className="text-[11px] text-muted-foreground">{evt.event} at line {evt.line} {evt.function ? `in ${evt.function}` : ''}</div> : null}
          </CardHeader>
          <CardContent className="h-full min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-full">
              <Card className="h-full">
                <CardHeader className="pb-2"><div className="text-xs font-semibold">Locals</div></CardHeader>
                <CardContent className="h-[240px] sm:h-full min-h-0">
                  <ScrollArea className="h-full pr-2">
                    <div className="space-y-1">
                      {localsList.length ? localsList.map(([k,v]) => (
                        <div key={k} className="text-[11px] font-mono flex justify-between gap-3 pr-2">
                          <span className="text-muted-foreground shrink-0">{k}:</span>
                          <span className="text-foreground truncate">{String(v)}</span>
                        </div>
                      )) : <div className="text-[11px] text-muted-foreground">No locals</div>}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <div className="text-xs font-semibold">Line Explanation</div>
                  <div className="text-[11px] text-muted-foreground truncate">{lineText.trim() || '(blank line)'}</div>
                </CardHeader>
                <CardContent className="h-[240px] sm:h-full min-h-0">
                  <ScrollArea className="h-full pr-2">
                    <div className="space-y-2">
                      <div className="text-xs text-foreground">{explanation}</div>
                      {!!evt?.count && evt.count > 1 ? (
                        <div className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">×{evt.count} occurrences (collapsed)</div>
                      ) : null}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
              <Card className="col-span-1 md:col-span-2">
                <CardHeader className="pb-2"><div className="text-xs font-semibold">Call Stack</div></CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {(evt?.stack || []).length ? (evt?.stack || []).map((fn, idx) => (
                      <div key={idx} className="text-[11px] font-mono">{fn}</div>
                    )) : <div className="text-[11px] text-muted-foreground">Empty stack</div>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Style hooks for Monaco decorations */}
      <style>{`
        .monaco-editor .view-zones .viz-current-line {}
        .viz-current-line { background: rgba(59,130,246,0.18); }
        .viz-gutter { border-left: 3px solid rgba(59,130,246,0.9); }
      `}</style>
    </div>
  );
};

export default ExecutionVisualizer;

function explainLine(src: string, locals: Record<string, any>): string {
  const s = (src || '').trim();
  if (!s) return 'Blank line; no operation performed.';
  if (/^#/.test(s)) return 'Comment line; ignored by Python.';
  
  const getValue = (varName: string): any => {
    if (varName in locals) return locals[varName];
    return undefined;
  };

  const evaluateIndexAccess = (expr: string): { name: string; value: any } | null => {
    // Handle array/list access like arr[0], arr[-1], stack[-1]
    const indexMatch = expr.match(/^(\w+)\[(-?\d+)\]$/);
    if (indexMatch) {
      const [, name, idxStr] = indexMatch;
      const arr = locals[name];
      if (Array.isArray(arr)) {
        const idx = parseInt(idxStr);
        const value = idx < 0 ? arr[arr.length + idx] : arr[idx];
        return { name, value };
      }
    }
    return null;
  };

  const formatValue = (v: any): string => {
    if (v === undefined) return 'undefined';
    if (v === null) return 'None';
    if (Array.isArray(v)) return `[${v.slice(0, 5).join(', ')}${v.length > 5 ? '...' : ''}]`;
    if (typeof v === 'object') return JSON.stringify(v).slice(0, 50);
    return String(v);
  };

  const resolveExpression = (expr: string): string => {
    const parts: string[] = [];
    
    // First, handle index access patterns like stack[-1]
    const indexAccess = evaluateIndexAccess(expr);
    if (indexAccess) {
      parts.push(`${expr} = ${formatValue(indexAccess.value)}`);
    } else {
      // Extract variable names from expression (excluding those in index access)
      const vars = expr.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
      for (const v of vars) {
        // Skip if this variable is part of an index access we already handled
        if (expr.includes(`${v}[`)) continue;
        const val = getValue(v);
        if (val !== undefined) {
          parts.push(`${v} = ${formatValue(val)}`);
        }
      }
      
      // Also check for index access patterns within the expression
      const indexPattern = /(\w+)\[(-?\d+)\]/g;
      let match;
      while ((match = indexPattern.exec(expr)) !== null) {
        const [, name, idxStr] = match;
        const arr = locals[name];
        if (Array.isArray(arr)) {
          const idx = parseInt(idxStr);
          const value = idx < 0 ? arr[arr.length + idx] : arr[idx];
          parts.push(`${name}[${idxStr}] = ${formatValue(value)}`);
        }
      }
    }
    
    return parts.length > 0 ? ` (${parts.join(', ')})` : '';
  };

  // Function definition
  const defMatch = s.match(/^def\s+([\w_]+)\s*\(([^)]*)\)/);
  if (defMatch) {
    const [, name, params] = defMatch;
    return `Defines function "${name}" with parameters: ${params || 'none'}.`;
  }

  // Class definition
  const classMatch = s.match(/^class\s+([\w_]+)/);
  if (classMatch) {
    return `Declares class "${classMatch[1]}".`;
  }

  // Return statement
  if (/^return\b/.test(s)) {
    const expr = s.replace(/^return\s+/, '').trim();
    if (!expr || expr === 'None') return 'Returns None from the function.';
    const ctx = resolveExpression(expr);
    return `Returns the value of: ${expr}${ctx}.`;
  }

  // Import statements
  if (/^import\b|^from\b/.test(s)) {
    return `Imports: ${s}.`;
  }

  // Assignment with arithmetic operations
  const augAssignPattern = /^(\w+)\s*(\+=|-=|\*=|\/=|%=|\/\/=|&=|\|=|\^=|>>=|<<=)\s*(.+)/;
  const augAssignMatch = s.match(augAssignPattern);
  if (augAssignMatch) {
    const [, varName, op, expr] = augAssignMatch;
    const opDesc: Record<string, string> = {
      '+=': 'adds', '-=': 'subtracts', '*=': 'multiplies', '/=': 'divides',
      '//=': 'floor divides', '%=': 'takes modulo', '&=': 'bitwise AND',
      '|=': 'bitwise OR', '^=': 'bitwise XOR', '>>=': 'right shifts', '<<=': 'left shifts'
    };
    const current = getValue(varName);
    const ctx = resolveExpression(expr);
    const opText = opDesc[op] || op;
    return `Updates ${varName}${current !== undefined ? ` (currently ${formatValue(current)})` : ''} by ${opText}ing ${expr}${ctx}.`;
  }

  // Simple assignment
  const assignMatch = s.match(/^(\w+)\s*=\s*(.+)/);
  if (assignMatch) {
    const [, varName, expr] = assignMatch;
    const ctx = resolveExpression(expr);
    
    // Method calls
    if (expr.includes('.')) {
      const methodMatch = expr.match(/^(\w+)\.(\w+)\(([^)]*)\)/);
      if (methodMatch) {
        const [, objName, method, args] = methodMatch;
        const objVal = getValue(objName);
        if (method === 'pop') {
          return `Removes and returns the last element from ${objName}${objVal !== undefined ? ` (${formatValue(objVal)})` : ''}. The popped value is assigned to ${varName}.`;
        }
        if (method === 'append') {
          const argMatch = args.match(/^(\w+)/);
          const argVal = argMatch ? getValue(argMatch[1]) : undefined;
          return `Adds ${args}${argVal !== undefined ? ` (${formatValue(argVal)})` : ''} to the end of ${objName}${objVal !== undefined ? ` (${formatValue(objVal)})` : ''}.`;
        }
        return `Calls method "${method}" on ${objName}${objVal !== undefined ? ` (${formatValue(objVal)})` : ''} with arguments: ${args}. Result assigned to ${varName}.`;
      }
    }
    
    // Function calls
    if (expr.includes('(') && !expr.includes('.')) {
      const funcMatch = expr.match(/^(\w+)\(([^)]*)\)/);
      if (funcMatch) {
        const [, funcName, args] = funcMatch;
        const ctx2 = resolveExpression(args);
        return `Calls function "${funcName}" with arguments: ${args}${ctx2}. Result assigned to ${varName}.`;
      }
    }
    
    // Index access (simple case like arr[0])
    const indexMatch = expr.match(/^(\w+)\[([^\]]+)\]/);
    if (indexMatch) {
      const [, arrName, index] = indexMatch;
      const arrVal = getValue(arrName);
      const indexAccess = evaluateIndexAccess(expr);
      if (indexAccess) {
        return `Accesses element at index ${index} of ${arrName}${arrVal !== undefined ? ` (${formatValue(arrVal)})` : ''}, which is ${formatValue(indexAccess.value)}, and assigns it to ${varName}.`;
      }
      const idxVal = getValue(index) !== undefined ? getValue(index) : index;
      return `Accesses element at index ${index}${typeof idxVal === 'number' ? ` (${idxVal})` : ''} of ${arrName}${arrVal !== undefined ? ` (${formatValue(arrVal)})` : ''} and assigns it to ${varName}.`;
    }
    
    // Arithmetic operations (including complex expressions like i - stack[-1] - 1)
    if (/[+\-*/%]/.test(expr)) {
      const ctx2 = resolveExpression(expr);
      // Extract all index access patterns and simple variables
      const indexPattern = /(\w+)\[(-?\d+)\]/g;
      const replacements: Array<{pattern: string; value: string}> = [];
      let match;
      
      // First, handle index accesses
      while ((match = indexPattern.exec(expr)) !== null) {
        const [, name, idxStr] = match;
        const arr = locals[name];
        if (Array.isArray(arr)) {
          const idx = parseInt(idxStr);
          const value = idx < 0 ? arr[arr.length + idx] : arr[idx];
          replacements.push({ pattern: match[0], value: formatValue(value) });
        }
      }
      
      // Then handle simple variables
      const vars = expr.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
      for (const v of vars) {
        // Skip if already handled as index access
        if (replacements.some(r => r.pattern.includes(v))) continue;
        const val = getValue(v);
        if (val !== undefined) {
          replacements.push({ pattern: v, value: formatValue(val) });
        }
      }
      
      // Build explanation with actual values
      if (replacements.length > 0) {
        const parts = replacements.map(r => `${r.pattern} = ${r.value}`);
        return `Calculates ${expr} (${parts.join(', ')}) and assigns the result to ${varName}.`;
      }
      
      return `Calculates ${expr}${ctx2} and assigns the result to ${varName}.`;
    }
    
    return `Assigns ${expr}${ctx} to ${varName}.`;
  }

  // For loop
  const forMatch = s.match(/^for\s+(\w+)\s+in\s+(.+):/);
  if (forMatch) {
    const [, varName, iterable] = forMatch;
    const iterVal = getValue(iterable);
    const ctx = resolveExpression(iterable);
    return `Iterates over ${iterable}${iterVal !== undefined ? ` (${formatValue(iterVal)})` : ''}${ctx}. Each element is assigned to ${varName}.`;
  }

  // While loop
  const whileMatch = s.match(/^while\s+(.+):/);
  if (whileMatch) {
    const condition = whileMatch[1];
    const ctx = resolveExpression(condition);
    return `Repeats the following block while ${condition}${ctx} is True.`;
  }

  // If statement
  const ifMatch = s.match(/^if\s+(.+):/);
  if (ifMatch) {
    const condition = ifMatch[1];
    const ctx = resolveExpression(condition);
    return `Checks if ${condition}${ctx}. If True, executes the following block.`;
  }

  // Elif/else
  if (/^elif\b/.test(s)) {
    const elifMatch = s.match(/^elif\s+(.+):/);
    if (elifMatch) {
      const condition = elifMatch[1];
      const ctx = resolveExpression(condition);
      return `Checks if ${condition}${ctx}. Only evaluated if previous conditions were False.`;
    }
  }
  if (/^else\b/.test(s)) return 'Executes if all previous conditions were False.';

  // Try/except
  if (/^try\b/.test(s)) return 'Begins exception handling. Code inside will be monitored for errors.';
  if (/^except\b/.test(s)) return 'Catches exceptions raised in the try block.';

  // Method calls without assignment
  const methodCallMatch = s.match(/^(\w+)\.(\w+)\(([^)]*)\)/);
  if (methodCallMatch) {
    const [, objName, method, args] = methodCallMatch;
    const objVal = getValue(objName);
    const ctx = resolveExpression(args);
    if (method === 'append') {
      const argVal = args ? getValue(args) : undefined;
      return `Adds ${args}${argVal !== undefined ? ` (${formatValue(argVal)})` : ''} to the end of ${objName}${objVal !== undefined ? ` (${formatValue(objVal)})` : ''}.`;
    }
    if (method === 'pop') {
      return `Removes and returns the last element from ${objName}${objVal !== undefined ? ` (${formatValue(objVal)})` : ''}.`;
    }
    return `Calls method "${method}" on ${objName}${objVal !== undefined ? ` (${formatValue(objVal)})` : ''} with arguments: ${args}${ctx}.`;
  }

  // Function calls without assignment
  const funcCallMatch = s.match(/^(\w+)\(([^)]*)\)/);
  if (funcCallMatch) {
    const [, funcName, args] = funcCallMatch;
    const ctx = resolveExpression(args);
    return `Calls function "${funcName}" with arguments: ${args}${ctx}.`;
  }

  // Print statement
  if (/^print\s*\(/.test(s)) {
    const printMatch = s.match(/^print\s*\(([^)]*)\)/);
    if (printMatch) {
      const content = printMatch[1];
      const ctx = resolveExpression(content);
      return `Outputs ${content}${ctx} to the console.`;
    }
  }

  return `Executes: ${s}.`;
}


