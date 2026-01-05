import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { listLanguages, submitRun, pollResult, type Judge0Language } from "@/lib/runner";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft, Clock, StickyNote, Zap, Cpu, HardDrive, Keyboard, ChevronDown, StopCircle, RotateCcw, Code2, Play, Terminal } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { runPythonClientSide, isPyodideSupported, tracePythonClientSide, type PyodideTraceResult } from "@/lib/pyodideRunner";
import MemoryStackView from "@/components/MemoryStackView";
import ExecutionVisualizer from "@/components/ExecutionVisualizer";
import OutputExplanation from "@/components/OutputExplanation";
import { apiCreateSession } from "@/lib/api";
import { useSearchParams } from "react-router-dom";
import { MonacoEditor } from "./MonacoEditor";

const STORAGE_KEYS = {
  CODE_SOURCE: 'code-runner-source',
  CODE_STDIN: 'code-runner-stdin',
  CODE_LANGUAGE: 'code-runner-language',
  CODE_RESULT: 'code-runner-result',
  CODE_EXPLANATION: 'code-runner-explanation',
  TIMER_SECONDS: 'code-runner-timer-seconds',
  TIMER_ACTIVE: 'code-runner-timer-active',
};

export const CodeRunner = () => {
  const [languages, setLanguages] = useState<Judge0Language[]>([]);
  const [languageId, setLanguageId] = useState<number | null>(null);
  const [source, setSource] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CODE_SOURCE);
      return stored || sampleCode("python");
    } catch {
      return sampleCode("python");
    }
  });
  const [stdin, setStdin] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.CODE_STDIN) || '';
    } catch {
      return '';
    }
  });
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{ stdout?: string; stderr?: string; compile?: string; time?: string | null; memory?: number | null } | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CODE_RESULT);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [explanation, setExplanation] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.CODE_EXPLANATION) || '';
    } catch {
      return '';
    }
  });
  const [activeTab, setActiveTab] = useState<'input' | 'output' | 'compile' | 'errors' | 'visualize' | 'debug' | 'explain'>("output");
  const [executionMode, setExecutionMode] = useState<'server' | 'client'>('server');
  const [sessionId, setSessionId] = useState<string>("");
  const RUNNER_SESSION_KEY = 'ia_runner_session_id';
  // Visualization state
  const [traceEvents, setTraceEvents] = useState<any[]>([]);
  const [isTracing, setIsTracing] = useState(false);

  // Professional features state
  const [panelWidth, setPanelWidth] = useState(50); // Percentage
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState<string>(() => {
    try { return localStorage.getItem('interview-notes') || ''; } catch { return ''; }
  });
  const [timerActive, setTimerActive] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.TIMER_ACTIVE) === 'true';
    } catch {
      return false;
    }
  });
  const [timerSeconds, setTimerSeconds] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.TIMER_SECONDS);
      return stored ? parseInt(stored, 10) : 2700; // 45 minutes default
    } catch {
      return 2700;
    }
  });
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showTimerDialog, setShowTimerDialog] = useState(false);
  const [timerInput, setTimerInput] = useState({ hours: 0, minutes: 45 });
  const [mobileView, setMobileView] = useState<'code' | 'output'>('code'); // Mobile toggle between code and output
  const monacoRef = useRef<any>(null);
  const { toast } = useToast();

  // Tracing temporarily removed

  useEffect(() => {
    // Get runner session ID from localStorage (separate from assistant session)
    try {
      const stored = window.localStorage.getItem(RUNNER_SESSION_KEY);
      if (stored) setSessionId(stored);
    } catch { }

    (async () => {
      try {
        const langs = await listLanguages();
        setLanguages(langs);

        // 1. Check for suggested language from Execute button
        const suggestedLang = localStorage.getItem('code-runner-language-suggest');
        if (suggestedLang) {
          localStorage.removeItem('code-runner-language-suggest');
          const match = langs.find(l =>
            l.name.toLowerCase().includes(suggestedLang.toLowerCase()) ||
            suggestedLang.toLowerCase().includes(l.name.toLowerCase().split(' ')[0])
          );
          if (match) {
            setLanguageId(match.id);
            return;
          }
        }

        // 2. Try to restore saved language ID
        try {
          const savedLangId = localStorage.getItem(STORAGE_KEYS.CODE_LANGUAGE);
          if (savedLangId && langs.find(l => l.id === Number(savedLangId))) {
            setLanguageId(Number(savedLangId));
          } else {
            throw new Error('Saved language not found');
          }
        } catch {
          // 3. Fallback: Prefer Python
          const py311 = langs.find(l => /python/i.test(l.name) && /3\.11(\.2)?/i.test(l.name));
          const py = langs.find(l => /python/i.test(l.name));
          setLanguageId(py311?.id || py?.id || langs[0]?.id || null);
        }

      } catch (e) {
        console.error("runner: languages", e);
      }
    })();
  }, []);

  // Ensure we have a valid session for Explain tab
  useEffect(() => {
    (async () => {
      try {
        if (!sessionId) {
          const res = await apiCreateSession();
          setSessionId(res.session_id);
          try { window.localStorage.setItem(RUNNER_SESSION_KEY, res.session_id); } catch { }
        }
      } catch (e) {
        // Non-fatal: Explain tab will handle retry as well
        console.warn("Failed to initialize runner session", e);
      }
    })();
  }, [sessionId]);

  // Auto-set execution mode when language changes
  useEffect(() => {
    if (!languageId || languages.length === 0) return;
    const selectedLang = languages.find(l => l.id === languageId);
    if (selectedLang && /python/i.test(selectedLang.name) && isPyodideSupported()) {
      setExecutionMode('client');
    } else {
      setExecutionMode('server');
    }
  }, [languageId, languages]);

  // Initialize timer input from saved timer seconds
  useEffect(() => {
    const hours = Math.floor(timerSeconds / 3600);
    const minutes = Math.floor((timerSeconds % 3600) / 60);
    setTimerInput({ hours, minutes });
  }, []); // Only on mount

  // Save notes to localStorage
  useEffect(() => {
    try { localStorage.setItem('interview-notes', notes); } catch { }
  }, [notes]);

  // Save source code to localStorage
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.CODE_SOURCE, source); } catch { }
  }, [source]);

  // Save stdin to localStorage
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.CODE_STDIN, stdin); } catch { }
  }, [stdin]);

  // Save result to localStorage
  useEffect(() => {
    if (result) {
      try { localStorage.setItem(STORAGE_KEYS.CODE_RESULT, JSON.stringify(result)); } catch { }
    }
  }, [result]);

  // Save explanation to localStorage
  useEffect(() => {
    if (explanation) {
      try { localStorage.setItem(STORAGE_KEYS.CODE_EXPLANATION, explanation); } catch { }
    }
  }, [explanation]);

  // Save timer state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TIMER_SECONDS, String(timerSeconds));
      localStorage.setItem(STORAGE_KEYS.TIMER_ACTIVE, String(timerActive));
    } catch { }
  }, [timerSeconds, timerActive]);

  // Save language ID to localStorage
  useEffect(() => {
    if (languageId) {
      try { localStorage.setItem(STORAGE_KEYS.CODE_LANGUAGE, String(languageId)); } catch { }
    }
  }, [languageId]);

  // Timer logic
  useEffect(() => {
    if (!timerActive || timerSeconds <= 0) return;
    const interval = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) {
          setTimerActive(false);
          toast({ title: "Time's up!", description: "Interview time has elapsed.", variant: "destructive" });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive, timerSeconds, toast]);

  const langLabel = useMemo(() => languages.find(l => l.id === languageId)?.name || "Language", [languages, languageId]);

  const onRun = useCallback(async () => {
    if (!languageId && executionMode === 'server') return;

    // Clear any previous explanation before a new run starts
    try { localStorage.removeItem(STORAGE_KEYS.CODE_EXPLANATION); } catch { }
    setExplanation('');
    // Tracing temporarily removed

    const currentLangLabel = languages.find(l => l.id === languageId)?.name || "Language";
    const isPython = currentLangLabel.toLowerCase().includes('python');
    const useClientSide = executionMode === 'client' && isPython && isPyodideSupported();

    setIsRunning(true);
    setResult(null);

    try {
      if (useClientSide) {
        // Client-side execution with Pyodide
        toast({ title: "Running client-side...", description: "Executing Python in browser." });
        const pyResult = await runPythonClientSide(source, stdin);
        setResult({
          stdout: pyResult.stdout || undefined,
          stderr: pyResult.stderr || undefined,
          time: pyResult.executionTime?.toFixed(3) || undefined,
          variables: pyResult.variables,
        } as any);
        if (pyResult.stdout) setActiveTab('output');
        else if (pyResult.stderr) setActiveTab('errors');
      } else {
        // Server-side execution with Judge0
        // For Java on Judge0: ensure the main class is named Main and no package line
        let sendSource = source;
        const langLabelLower = (languages.find(l => l.id === languageId)?.name || '').toLowerCase();
        if (/java\b/.test(langLabelLower)) {
          sendSource = transformJavaForJudge0(source);
        }
        const { token } = await submitRun({ languageId: languageId!, source: sendSource, stdin });
        const r = await pollResult(token, { timeoutMs: 25000 });
        setResult({
          stdout: r.stdout || undefined,
          stderr: r.stderr || undefined,
          compile: r.compile_output || undefined,
          time: r.time,
          memory: r.memory,
        });
        // Auto-focus the most relevant tab
        if (r.stdout) setActiveTab('output');
        else if (r.compile_output) setActiveTab('compile');
        else if (r.stderr) setActiveTab('errors');
      }
    } catch (e: any) {
      setResult({ stderr: String(e?.message || e) });
      setActiveTab('errors');
    } finally {
      setIsRunning(false);
    }
  }, [languageId, source, stdin, executionMode, languages, toast]);

  const onVisualize = useCallback(async () => {
    const currentLangLabel = languages.find(l => l.id === languageId)?.name || "Language";
    const isPython = currentLangLabel.toLowerCase().includes('python');
    if (!(isPython && isPyodideSupported())) {
      toast({ title: 'Visualization not available', description: 'Step visualization currently supports Python in-browser.', variant: 'destructive' });
      return;
    }
    setIsTracing(true);
    setActiveTab('visualize');
    try {
      const res: PyodideTraceResult = await tracePythonClientSide(source, stdin);
      setTraceEvents(res.events || []);
    } catch (e: any) {
      toast({ title: 'Trace failed', description: String(e?.message || e) });
      setTraceEvents([]);
    } finally {
      setIsTracing(false);
    }
  }, [languages, languageId, source, stdin, toast]);

  // Tracing removed

  const onResetAll = useCallback(() => {
    setResult(null);
    setExplanation('');
    setStdin('');
    setSource('');
    try {
      localStorage.removeItem(STORAGE_KEYS.CODE_SOURCE);
      localStorage.removeItem(STORAGE_KEYS.CODE_STDIN);
      localStorage.removeItem(STORAGE_KEYS.CODE_RESULT);
      localStorage.removeItem(STORAGE_KEYS.CODE_EXPLANATION);
    } catch { }
    toast({ title: 'Reset', description: 'Cleared source, input, outputs, explanation, and trace.' });
  }, [toast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Enter or Cmd+Enter to run
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isRunning && languageId) onRun();
      }
      // Ctrl+K to show shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowShortcuts(!showShortcuts);
      }
      // Ctrl+/ for comments (handled by Monaco)
      // Esc to close modals
      if (e.key === 'Escape') {
        setShowShortcuts(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, languageId, showShortcuts, onRun]);

  const formatTimer = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTimerDialogOpen = () => {
    const hours = Math.floor(timerSeconds / 3600);
    const minutes = Math.floor((timerSeconds % 3600) / 60);
    setTimerInput({ hours, minutes });
    setShowTimerDialog(true);
  };

  const handleTimerSet = () => {
    const totalSeconds = timerInput.hours * 3600 + timerInput.minutes * 60;
    if (totalSeconds <= 0) {
      toast({ title: "Invalid time", description: "Time must be greater than 0.", variant: "destructive" });
      return;
    }
    setTimerSeconds(totalSeconds);
    setShowTimerDialog(false);
    if (!timerActive) {
      setTimerActive(true);
    }
  };

  const handleTimerToggle = () => {
    if (timerActive) {
      // Stop the timer
      setTimerActive(false);
    } else {
      // Start the timer (if time is set) or show dialog to set time
      if (timerSeconds <= 0) {
        handleTimerDialogOpen();
      } else {
        setTimerActive(true);
      }
    }
  };

  // Handle double-click or long-press to set custom time
  const handleTimerSetTime = () => {
    handleTimerDialogOpen();
  };

  const handleResize = useCallback((e: MouseEvent) => {
    const newWidth = (e.clientX / window.innerWidth) * 100;
    setPanelWidth(Math.max(30, Math.min(70, newWidth)));
  }, []);

  const startResize = useCallback(() => {
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', () => {
      window.removeEventListener('mousemove', handleResize);
    }, { once: true });
  }, [handleResize]);

  const mapLanguageToMonaco = (langName: string): string => {
    const name = langName.toLowerCase();
    if (name.includes('python')) return 'python';
    if (name.includes('javascript') || name.includes('node.js')) return 'javascript';
    if (name.includes('typescript')) return 'typescript';
    if (name.includes('c++') || name.includes('cpp')) return 'cpp';
    if (name.includes('java')) return 'java';
    if (name.includes('go')) return 'go';
    if (name.includes('sql')) return 'sql';
    if (name.includes('c ')) return 'c';
    return name.split(' ')[0];
  };

  return (
    <div className="w-screen max-w-none px-0 h-screen md:h-[calc(100vh-48px)]">
      {/* Top toolbar - Mobile Optimized */}
      <div className="flex items-center justify-between gap-2 px-2 md:px-4 py-2 border-b bg-background/95">
        <div className="flex items-center gap-1 md:gap-2">
          <Link to="/" aria-label="Back to Assistant" title="Back">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="text-sm font-semibold tracking-wide hidden sm:block">Code Runner</div>
        </div>
        
        {/* Mobile: Compact Controls */}
        <div className="flex items-center gap-1 md:gap-2 flex-1 justify-end">
          {/* Timer - Compact on mobile */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTimerToggle}
              onContextMenu={(e) => {
                e.preventDefault();
                handleTimerDialogOpen();
              }}
              className="gap-1 px-2 md:px-3"
            >
              {timerActive ? (
                <Clock className="h-3.5 w-3.5" />
              ) : (
                <StopCircle className="h-3.5 w-3.5 text-destructive" />
              )}
              <span className={`text-xs md:text-sm ${timerSeconds < 300 && timerActive ? "text-destructive font-mono" : "font-mono"}`}>
                {formatTimer(timerSeconds)}
              </span>
            </Button>
            {timerActive && timerSeconds > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setTimerSeconds(0); setTimerActive(false); }}
                className="gap-1 px-1.5 md:px-2 text-destructive hover:bg-destructive/10"
                title="Reset timer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          
          {/* Notes - Hidden on mobile */}
          <Button variant={showNotes ? "default" : "ghost"} size="sm" onClick={() => setShowNotes(!showNotes)} className="gap-1.5 hidden md:flex">
            <StickyNote className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Notes</span>
          </Button>
          
          {/* Shortcuts - Hidden on mobile */}
          <Button variant="ghost" size="sm" onClick={() => setShowShortcuts(!showShortcuts)} className="gap-1.5 hidden md:flex">
            <Keyboard className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Shortcuts</span>
          </Button>
          
          {/* Language Selector - Compact on mobile */}
          <Select value={languageId ? String(languageId) : undefined} onValueChange={(v) => {
            const id = Number(v);
            setLanguageId(id);
            try { localStorage.removeItem(STORAGE_KEYS.CODE_EXPLANATION); } catch { }
            setExplanation('');
            const label = (languages.find(l => l.id === id)?.name || '').toLowerCase();
            if (/python/.test(label)) setSource(sampleCode('python'));
            else if (/node|javascript/.test(label)) setSource(sampleCode('node'));
            else if (/c\+\+/.test(label)) setSource(sampleCode('cpp'));
            else if (/\bc\b/.test(label)) setSource(sampleCode('c'));
            else if (/java\b/.test(label)) setSource(sampleCode('java'));
            else if (/go\b/.test(label)) setSource(sampleCode('go'));
            else if (/sql/.test(label)) setSource(sampleCode('sql'));
          }}>
            <SelectTrigger className="w-[120px] md:w-[260px] text-xs md:text-sm">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              {languages.map(l => (
                <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Run Button */}
          <Button onClick={onRun} disabled={!languageId || isRunning} size="sm" className="shadow-sm gap-1 px-2 md:px-3">
            <Zap className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isRunning ? 'Running…' : 'Run'}</span>
          </Button>
        </div>
      </div>

      {/* Mobile View Toggle */}
      <div className="md:hidden flex border-b bg-muted/30">
        <button
          onClick={() => setMobileView('code')}
          className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            mobileView === 'code' ? 'bg-background text-primary border-b-2 border-primary' : 'text-muted-foreground'
          }`}
        >
          <Code2 className="h-4 w-4" />
          Code
        </button>
        <button
          onClick={() => setMobileView('output')}
          className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            mobileView === 'output' ? 'bg-background text-primary border-b-2 border-primary' : 'text-muted-foreground'
          }`}
        >
          <Terminal className="h-4 w-4" />
          Output
        </button>
      </div>

      {/* Main split with resizable panels - Desktop */}
      <div className="hidden md:flex relative" style={{ height: 'calc(100% - 44px)' }}>
        {/* Left: Code Editor */}
        <div className="bg-background border-r p-2 lg:p-3 overflow-hidden" style={{ width: `${panelWidth}%`, minWidth: '300px' }}>
          <div className="text-xs mb-2 text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span>Source</span>
              <Button size="icon" variant="ghost" className="h-5 w-5" title="Reset editor & outputs" onClick={onResetAll}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </span>
            <span className="font-mono text-[10px]">{source.split('\n').length} lines</span>
          </div>
          <div className="h-[calc(100%-16px)]">
            <MonacoEditor
              value={source}
              language={mapLanguageToMonaco(languages.find(l => l.id === languageId)?.name || 'python')}
              onChange={setSource}
              onMount={(editor) => { monacoRef.current = editor; }}
              height="100%"
            />
          </div>
        </div>
        {/* Resize handle */}
        <div
          onMouseDown={startResize}
          className="w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors active:bg-primary"
          style={{ flexShrink: 0 }}
        />
        {/* Right: Output Panel */}
        <div className="bg-background flex-1 p-2 lg:p-3 overflow-hidden flex flex-col" style={{ minWidth: '300px' }}>
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full flex-1 flex flex-col overflow-hidden">
            <div className="mb-2 flex-shrink-0 overflow-x-auto scrollbar-professional">
              <TabsList className="inline-flex w-auto min-w-full">
                <TabsTrigger value="input" className="whitespace-nowrap flex-shrink-0">Input</TabsTrigger>
                <TabsTrigger value="output" className="whitespace-nowrap flex-shrink-0">Output</TabsTrigger>
                <TabsTrigger value="compile" className="whitespace-nowrap flex-shrink-0">Compiler</TabsTrigger>
                <TabsTrigger value="errors" className="whitespace-nowrap flex-shrink-0">Errors</TabsTrigger>
                <TabsTrigger value="visualize" className="whitespace-nowrap flex-shrink-0">Visualize</TabsTrigger>
                <TabsTrigger value="debug" className="whitespace-nowrap flex-shrink-0">Debug</TabsTrigger>
                <TabsTrigger value="explain" className="whitespace-nowrap flex-shrink-0">Explain</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <TabsContent value="input" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                <div className="mb-2 text-xs text-muted-foreground">
                  Input Simulator: Provide test cases or stdin input
                </div>
                <Textarea
                  value={stdin}
                  onChange={(e) => setStdin(e.target.value)}
                  className="font-mono flex-1 min-h-0 resize-none"
                  placeholder="Enter test input here...&#10;Example for Python:&#10;5&#10;1 2 3 4 5"
                />
                <div className="mt-2 text-[10px] text-muted-foreground">
                  Tip: Each line will be read by input() in order
                </div>
              </TabsContent>
              <TabsContent value="output" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                <div className="rounded-lg border p-3 bg-card flex-1 overflow-auto min-h-0 scrollbar-professional">
                  {result?.stdout ? (
                    <pre className="text-xs whitespace-pre-wrap font-mono">{result.stdout}</pre>
                  ) : (
                    <div className="text-xs text-muted-foreground">No output</div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="compile" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                <div className="rounded-lg border p-3 bg-card flex-1 overflow-auto min-h-0 scrollbar-professional">
                  {result?.compile ? (
                    <pre className="text-xs whitespace-pre-wrap font-mono">{result.compile}</pre>
                  ) : (
                    <div className="text-xs text-muted-foreground">No compiler messages</div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="errors" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                <div className="rounded-lg border p-3 bg-card flex-1 overflow-auto min-h-0 scrollbar-professional">
                  {result?.stderr ? (
                    <pre className="text-xs whitespace-pre-wrap font-mono text-red-600">{result.stderr}</pre>
                  ) : (
                    <div className="text-xs text-muted-foreground">No errors</div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="visualize" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                <div className="rounded-lg border p-3 bg-card flex-1 overflow-auto min-h-0 scrollbar-professional">
                  <ExecutionVisualizer
                    editor={monacoRef.current}
                    code={source}
                    events={traceEvents as any}
                    isTracing={isTracing}
                    onTrace={onVisualize}
                  />
                </div>
              </TabsContent>

              <TabsContent value="debug" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                <div className="rounded-lg border p-3 bg-card flex-1 overflow-auto min-h-0 scrollbar-professional">
                  <MemoryStackView
                    frames={[]}
                    variables={
                      result
                        ? {
                          ...((result as any).variables || {}),
                          output: result.stdout || 'N/A',
                          error: result.stderr || 'N/A'
                        }
                        : {}
                    }
                    code={source}
                    output={result?.stdout || ''}
                    isActive={activeTab === 'debug'}
                  />
                </div>
              </TabsContent>
              <TabsContent value="explain" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                <div className="flex-1 overflow-auto scrollbar-professional">
                  <OutputExplanation
                    output={result?.stdout || ''}
                    code={source}
                    language={langLabel}
                    isActive={activeTab === 'explain'}
                    sessionId={sessionId}
                    explanation={explanation}
                    onExplanationChange={setExplanation}
                  />
                </div>
              </TabsContent>
            </div>
          </Tabs>
          {/* Enhanced Metrics Bar */}
          {result && (
            <div className="mt-3 p-2 bg-muted/30 rounded-lg border flex items-center gap-4 text-xs">
              {result.time ? (
                <div className="flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono">{result.time}s</span>
                </div>
              ) : null}
              {typeof result.memory === 'number' ? (
                <div className="flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono">{(result.memory / 1024).toFixed(2)} MB</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
        {/* Notes Panel */}
        {showNotes && (
          <div className="w-72 border-l bg-background p-3 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <StickyNote className="h-4 w-4" />
                Interview Notes
              </h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowNotes(false)}>×</Button>
            </div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Jot down thoughts, strategies, or observations here..."
              className="flex-1 font-mono text-xs resize-none scrollbar-professional min-h-0"
            />
          </div>
        )}
      </div>

      {/* Mobile Layout - Stacked Panels */}
      <div className="md:hidden flex flex-col" style={{ height: 'calc(100% - 88px)' }}>
        {/* Code Editor - Mobile */}
        {mobileView === 'code' && (
          <div className="flex-1 bg-background p-2 overflow-hidden flex flex-col">
            <div className="text-xs mb-2 text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>Source</span>
                <Button size="icon" variant="ghost" className="h-5 w-5" title="Reset" onClick={onResetAll}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </span>
              <span className="font-mono text-[10px]">{source.split('\n').length} lines</span>
            </div>
            <div className="flex-1 min-h-0">
              <MonacoEditor
                value={source}
                language={mapLanguageToMonaco(languages.find(l => l.id === languageId)?.name || 'python')}
                onChange={setSource}
                onMount={(editor) => { monacoRef.current = editor; }}
                height="100%"
              />
            </div>
            {/* Mobile Input Area */}
            <div className="mt-2 border-t pt-2">
              <div className="text-xs text-muted-foreground mb-1">Input (stdin)</div>
              <Textarea
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                className="font-mono text-xs h-20 resize-none"
                placeholder="Enter test input..."
              />
            </div>
          </div>
        )}

        {/* Output Panel - Mobile */}
        {mobileView === 'output' && (
          <div className="flex-1 bg-background p-2 overflow-hidden flex flex-col">
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full flex-1 flex flex-col overflow-hidden">
              <div className="mb-2 flex-shrink-0 overflow-x-auto scrollbar-professional">
                <TabsList className="inline-flex w-auto">
                  <TabsTrigger value="output" className="text-xs px-2">Output</TabsTrigger>
                  <TabsTrigger value="errors" className="text-xs px-2">Errors</TabsTrigger>
                  <TabsTrigger value="compile" className="text-xs px-2">Compile</TabsTrigger>
                  <TabsTrigger value="explain" className="text-xs px-2">Explain</TabsTrigger>
                </TabsList>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <TabsContent value="output" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                  <div className="rounded-lg border p-3 bg-card flex-1 overflow-auto min-h-0 scrollbar-professional">
                    {result?.stdout ? (
                      <pre className="text-xs whitespace-pre-wrap font-mono">{result.stdout}</pre>
                    ) : (
                      <div className="text-xs text-muted-foreground">No output. Run your code to see results.</div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="errors" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                  <div className="rounded-lg border p-3 bg-card flex-1 overflow-auto min-h-0 scrollbar-professional">
                    {result?.stderr ? (
                      <pre className="text-xs whitespace-pre-wrap font-mono text-red-600">{result.stderr}</pre>
                    ) : (
                      <div className="text-xs text-muted-foreground">No errors</div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="compile" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                  <div className="rounded-lg border p-3 bg-card flex-1 overflow-auto min-h-0 scrollbar-professional">
                    {result?.compile ? (
                      <pre className="text-xs whitespace-pre-wrap font-mono">{result.compile}</pre>
                    ) : (
                      <div className="text-xs text-muted-foreground">No compiler messages</div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="explain" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                  <div className="flex-1 overflow-auto scrollbar-professional">
                    <OutputExplanation
                      output={result?.stdout || ''}
                      code={source}
                      language={langLabel}
                      isActive={activeTab === 'explain'}
                      sessionId={sessionId}
                      explanation={explanation}
                      onExplanationChange={setExplanation}
                    />
                  </div>
                </TabsContent>
              </div>
            </Tabs>
            {/* Mobile Metrics */}
            {result && (result.time || typeof result.memory === 'number') && (
              <div className="mt-2 p-2 bg-muted/30 rounded-lg border flex items-center gap-4 text-xs">
                {result.time && (
                  <div className="flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono">{result.time}s</span>
                  </div>
                )}
                {typeof result.memory === 'number' && (
                  <div className="flex items-center gap-1.5">
                    <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono">{(result.memory / 1024).toFixed(2)} MB</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timer Dialog */}
      <Dialog open={showTimerDialog} onOpenChange={setShowTimerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Timer Duration</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label htmlFor="hours">Hours</Label>
                <Input
                  id="hours"
                  type="number"
                  min="0"
                  max="23"
                  value={timerInput.hours}
                  onChange={(e) => setTimerInput({ ...timerInput, hours: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="minutes">Minutes</Label>
                <Input
                  id="minutes"
                  type="number"
                  min="0"
                  max="59"
                  value={timerInput.minutes}
                  onChange={(e) => setTimerInput({ ...timerInput, minutes: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Total: {formatTimer(timerInput.hours * 3600 + timerInput.minutes * 60)}
            </div>
            {timerActive && timerSeconds > 0 && (
              <div className="text-xs text-muted-foreground">
                Current Timer: {formatTimer(timerSeconds)}
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowTimerDialog(false)}>Cancel</Button>
            {timerActive && timerSeconds > 0 && (
              <Button variant="destructive" onClick={() => { setTimerSeconds(0); setTimerActive(false); setShowTimerDialog(false); }} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Reset Timer
              </Button>
            )}
            <Button onClick={handleTimerSet}>Set Timer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowShortcuts(false)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Keyboard Shortcuts</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowShortcuts(false)}>×</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between items-center py-1.5 border-b">
                <span className="text-sm">Run Code</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl/Cmd + Enter</kbd>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b">
                <span className="text-sm">Toggle Comment</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl/Cmd + /</kbd>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b">
                <span className="text-sm">Show Shortcuts</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl/Cmd + K</kbd>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b">
                <span className="text-sm">Close Modal</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs">Esc</kbd>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

function sampleCode(kind: 'python' | 'node' | 'cpp' | 'c' | 'java' | 'go' | 'sql'): string {
  switch (kind) {
    case 'python':
      return `print('Hello from Python')\nprint(input())`;
    case 'node':
      return `console.log('Hello from Node.js');\nprocess.stdin.on('data', d => console.log(String(d).trim()));`;
    case 'cpp':
      return `#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n  cout << "Hello from C++" << endl;\n  string s; if(getline(cin,s)) cout << s << endl;\n  return 0;\n}`;
    case 'c':
      return `#include <stdio.h>\nint main(){\n  printf("Hello from C\\n");\n  char s[256]; if(fgets(s,256,stdin)) printf("%s", s);\n  return 0;\n}`;
    case 'java':
      return `import java.util.*;\nclass Main{\n  public static void main(String[] args){\n    System.out.println("Hello from Java");\n    Scanner sc=new Scanner(System.in);\n    if(sc.hasNextLine()) System.out.println(sc.nextLine());\n  }\n}`;
    case 'go':
      return `package main\nimport (\n  "bufio"\n  "fmt"\n  "os"\n)\nfunc main(){\n  fmt.Println("Hello from Go")\n  in:=bufio.NewScanner(os.Stdin)\n  if in.Scan(){ fmt.Println(in.Text()) }\n}`;
    case 'sql':
      return `-- Hello from SQL (SQLite).\n-- Create a demo table and query it.\nCREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO users(name) VALUES ('Alice'), ('Bob'), ('Carol');\nSELECT * FROM users ORDER BY id;`;
  }
}

export default CodeRunner;


// Judge0 runs single-file Java; filename is assumed Main.java. If the user's
// class name doesn't match, we normalize to `class Main` and strip package lines.
function transformJavaForJudge0(src: string): string {
  let out = src;
  try {
    // Remove package declarations which break single-file execution
    out = out.replace(/^\s*package\s+[^;]+;\s*$/gm, '');
    if (/\bclass\s+Main\b/.test(out) && /public\s+static\s+void\s+main\s*\(/.test(out)) {
      // Ensure public class Main to satisfy stricter runners
      out = out.replace(/\bclass\s+Main\b/, 'public class Main');
      return out;
    }
    // Find the class that defines public static void main (capture generics if any)
    const classWithMain = out.match(/(?:public\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)(\s*<[^>{]*>)?[\s\S]*?public\s+static\s+void\s+main\s*\(/);
    if (classWithMain) {
      const cls = classWithMain[1];
      // Demote any other public top-level types (class/enum/interface) except Main
      out = out
        .replace(/(^|\n)\s*public\s+class\s+(?!Main\b)([A-Za-z_][A-Za-z0-9_]*)(\s*<[^>{]*>)?/g, ($0, p1, name, gen = '') => `${p1}class ${name}${gen || ''}`)
        .replace(/(^|\n)\s*public\s+enum\s+(?!Main\b)([A-Za-z_][A-Za-z0-9_]*)/g, ($0, p1, name) => `${p1}enum ${name}`)
        .replace(/(^|\n)\s*public\s+interface\s+(?!Main\b)([A-Za-z_][A-Za-z0-9_]*)/g, ($0, p1, name) => `${p1}interface ${name}`);
      // Append a delegating Main wrapper to call the located main
      out += `\n\npublic class Main { public static void main(String[] args) { ${cls}.main(args); } }\n`;
      return out;
    }
    // No main found anywhere: append a no-op Main so Judge0 can run without error
    if (!/\bclass\s+Main\b/.test(out)) {
      out += "\n\npublic class Main { public static void main(String[] args) { } }\n";
    }
    return out;
  } catch {
    return src;
  }
}


