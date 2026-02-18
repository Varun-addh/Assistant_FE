import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface StackFrame {
  function: string;
  line: number;
  variables: Record<string, any>;
}

interface MemoryStackViewProps {
  frames?: StackFrame[];
  variables?: Record<string, any>;
  code?: string;
  output?: string;
  isActive: boolean;
}

const extractVariablesFromCode = (code: string, output: string): Record<string, any> => {
  const vars: Record<string, any> = {};
  
  // Extract common variable patterns
  const varPatterns = [
    /(\w+)\s*=\s*(\[[^\]]+\])/g,  // arr = [1, 2, 3]
    /(\w+)\s*=\s*(\d+)/g,          // n = 5
    /(\w+)\s*=\s*["']([^"']+)["']/g, // s = "hello"
    /(\w+)\s*=\s*(\w+\([^)]*\))/g,  // result = function()
  ];
  
  varPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const varName = match[1];
      const varValue = match[2];
      if (!vars[varName] && !['if', 'for', 'while', 'def', 'class', 'import', 'from'].includes(varName)) {
        vars[varName] = varValue;
      }
    }
  });
  
  // Try to extract values from output
  const outputMatch = output.match(/(\w+):\s*(\S+)/g);
  if (outputMatch) {
    outputMatch.forEach(line => {
      const parts = line.split(':');
      if (parts.length === 2) {
        vars[parts[0].trim()] = parts[1].trim();
      }
    });
  }
  
  // Add runtime info from output
  if (output) {
    const arrayMatch = output.match(/\[([^\]]+)\]/);
    if (arrayMatch) {
      vars['_output_array'] = `[${arrayMatch[1]}]`;
    }
    if (output.trim()) {
      vars['_stdout'] = output.trim().substring(0, 50) + (output.length > 50 ? '...' : '');
    }
  }
  
  return vars;
};

export const MemoryStackView = ({ frames = [], variables = {}, code = '', output = '', isActive }: MemoryStackViewProps) => {
  if (!isActive) return null;

  // Parse variables from code and output
  const codeVars = code ? extractVariablesFromCode(code, output) : {};
  
  // Merge with provided variables
  const merged = Object.keys(variables || {}).length > 0 
    ? { ...variables, ...codeVars }
    : Object.keys(codeVars).length > 0
    ? codeVars
    : { 
        '_info': 'Run code to see variables',
      };

  // Grouping logic
  const RESERVED = new Set(['output', 'error', '_info', '_stdout', '_output_array']);
  // Hide presentational labels that duplicate the detailed Output section
  const EXCLUDED_LABELS = new Set(['Input', 'Output', 'Expected']);
  const INPUT_KEYS = new Set(['s', 'p']);

  const outputValue = merged['output'];
  const errorValue = merged['error'];

  const inputVars: Array<[string, any]> = [];
  const memoryVars: Array<[string, any]> = [];

  Object.entries(merged).forEach(([key, value]) => {
    if (key.startsWith('_') || RESERVED.has(key)) return;
    if (EXCLUDED_LABELS.has(key)) return;
    if (INPUT_KEYS.has(key)) {
      inputVars.push([key, value]);
      return;
    }
    // dp and everything else (intermediate) goes to Memory & Stack
    memoryVars.push([key, value]);
  });

  const SectionRow = ({ label, value, highlight = false }: { label: string; value: any; highlight?: boolean }) => (
    <div 
      className={`flex justify-between items-center py-1.5 px-2 rounded border-b border-border/50 ${highlight ? 'bg-primary/5' : ''} gap-3`}
    >
      <span className="text-xs font-mono text-muted-foreground flex items-center gap-1 shrink-0">{label}</span>
      <span className="text-xs font-mono text-foreground truncate" title={String(value)}>
        {String(value)}
      </span>
    </div>
  );

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader className="pb-2">
        <h3 className="text-sm font-semibold">Memory & Stack</h3>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full scrollbar-professional">
          <div className="space-y-4 min-w-max w-max">
            {/* Stack Frames */}
            {frames.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Call Stack</h4>
                <div className="space-y-2">
                  {frames.map((frame, idx) => (
                    <div key={idx} className="border rounded p-2 bg-muted/30">
                      <div className="text-xs font-mono text-primary">{frame.function}</div>
                      <div className="text-[10px] text-muted-foreground">Line {frame.line}</div>
                      {Object.keys(frame.variables).length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {Object.entries(frame.variables).map(([key, val]) => (
                            <div key={key} className="text-[10px] font-mono flex justify-between gap-3 min-w-max whitespace-pre pr-2">
                              <span className="text-muted-foreground">{key}:</span>
                              <span className="text-foreground">{String(val)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Memory & Stack (intermediate/state like dp, temp, etc.) */}
            {memoryVars.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Memory & Stack</h4>
                <div className="space-y-1">
                  {memoryVars.map(([k, v]) => (
                    <SectionRow key={k} label={k} value={v} />
                  ))}
                </div>
              </div>
            )}

            {/* Input Variables */}
            {inputVars.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Input Variables</h4>
                <div className="space-y-1">
                  {inputVars.map(([k, v]) => (
                    <SectionRow key={k} label={k} value={v} highlight />
                  ))}
                </div>
              </div>
            )}

            {/* Output */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Output</h4>
              <div className="space-y-1">
                <SectionRow label="Result" value={typeof outputValue !== 'undefined' ? outputValue : 'N/A'} />
              </div>
            </div>

            {/* Errors: render only when present */}
            {typeof errorValue !== 'undefined' && String(errorValue).trim() !== '' && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Errors</h4>
                <div className="space-y-1">
                  <SectionRow label="Error" value={errorValue} />
                </div>
              </div>
            )}

            {/* Footer hint */}
            <div className="text-[10px] text-muted-foreground italic">
              Debug view - grouped into Memory, Input, Output, and Errors
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default MemoryStackView;

