import { useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";

type MonacoType = any; // avoid type dependency on monaco-editor when loaded via CDN

interface Props {
  value: string;
  language: string;
  onChange: (code: string) => void;
  className?: string;
  height?: number | string;
  onEditorReady?: (editor: any) => void;
}

// Lazy-load Monaco via CDN (no npm dependency) and create the editor
export const MonacoEditor = ({ value, language, onChange, className, height = 420, onEditorReady }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<MonacoType | null>(null);
  const { theme } = useTheme();

  const getEffectiveTheme = (): 'light' | 'dark' => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    if (document.documentElement.classList.contains('dark')) return 'dark';
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch {}
    return 'light';
  };

  const ensureForceStyle = (fg: string) => {
    // Ensure a readable default foreground on initial paint without overriding token colors.
    // Do NOT target .mtk* classes to preserve Monaco syntax highlighting.
    const styleId = 'monaco-force-foreground';
    const css = `
      .monaco-editor,
      .monaco-editor .view-lines,
      .monaco-editor .view-line,
      .monaco-editor .view-lines span:not([class^="mtk"]):not([class*=" mtk"]) {
        color: ${fg} !important;
      }
      .monaco-editor .cigr { border-color: ${fg} !important; }
    `;
    let el = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = styleId;
      document.head.appendChild(el);
    }
    if (el.textContent !== css) el.textContent = css;
  };

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      if ((window as any).monaco && (window as any).require) {
        initWithWindow((window as any).monaco);
        return;
      }
      // loader
      await ensureScript("https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/loader.min.js");
      const globalAny = window as any;
      if (!globalAny.require) return;
      globalAny.require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs" } });
      globalAny.require(["vs/editor/editor.main"], () => {
        if (disposed) return;
        const monaco = globalAny.monaco as MonacoType;
        initWithWindow(monaco);
      });
    };

    const initWithWindow = (monaco: MonacoType) => {
      monacoRef.current = monaco;
      if (!containerRef.current) return;
      // Resolve theme synchronously to avoid flash/wrong colors on first paint
      const initialTheme = getEffectiveTheme();
      // Define custom theme FIRST - no base inheritance to prevent default colors
      const bg = toHexColor(getComputedStyle(document.body).backgroundColor) || (initialTheme === 'dark' ? '#0b1020' : '#ffffff');
      const fg = initialTheme === 'dark' ? '#e5e7eb' : '#111827';
      const tokenFg = (fg.startsWith('#') ? fg.slice(1) : fg);
      
      // Comprehensive theme rules - ensure ALL tokens are visible
      const darkRules = [
        { token: '', foreground: tokenFg }, // Default foreground - MUST be first and explicit
        // Core language tokens
        { token: 'keyword', foreground: '60a5fa' },
        { token: 'string', foreground: 'fb923c' },
        { token: 'comment', foreground: '6b7280' },
        { token: 'number', foreground: '34d399' },
        { token: 'type', foreground: '60a5fa' },
        { token: 'function', foreground: 'fbbf24' },
        { token: 'variable', foreground: tokenFg },
        { token: 'operator', foreground: tokenFg },
        { token: 'delimiter', foreground: 'fbbf24' },
        { token: 'identifier', foreground: tokenFg }, // Critical for variable names
        { token: 'punctuation', foreground: 'fbbf24' },
        // Python-specific tokens
        { token: 'string.quoted.single.python', foreground: 'fb923c' },
        { token: 'string.quoted.double.python', foreground: 'fb923c' },
        { token: 'string.quoted.triple.python', foreground: 'fb923c' },
        { token: 'keyword.python', foreground: '60a5fa' },
        { token: 'number.python', foreground: '34d399' },
        { token: 'identifier.python', foreground: tokenFg },
        // Additional Python identifier patterns
        { token: 'variable.python', foreground: tokenFg },
        { token: 'variable.name.python', foreground: tokenFg },
        // Common patterns that might be missed
        { token: 'attribute.name', foreground: tokenFg },
        { token: 'property', foreground: tokenFg },
        { token: 'constant', foreground: '34d399' },
        { token: 'parameter', foreground: tokenFg },
        { token: 'argument', foreground: tokenFg },
      ];
      
      const lightRules = [
        { token: '', foreground: tokenFg },
        { token: 'keyword', foreground: '2563eb' },
        { token: 'string', foreground: 'ea580c' },
        { token: 'comment', foreground: '9ca3af' },
        { token: 'number', foreground: '059669' },
        { token: 'type', foreground: '2563eb' },
        { token: 'function', foreground: 'd97706' },
        { token: 'variable', foreground: tokenFg },
        { token: 'string.quoted.single.python', foreground: 'ea580c' },
        { token: 'string.quoted.double.python', foreground: 'ea580c' },
        { token: 'string.quoted.triple.python', foreground: 'ea580c' },
      ];
      
      monaco.editor.defineTheme('app-dark', {
        base: 'vs-dark', // Use vs-dark as base
        inherit: false, // Don't inherit to ensure all colors are explicit
        rules: darkRules,
        colors: {
          'editor.background': bg,
          'editor.foreground': fg, // Main text color - force light text
          'minimap.background': bg,
          'minimap.foreground': fg,
          'editorLineNumber.foreground': '#6b7280',
          'editorLineNumber.activeForeground': '#e5e7eb',
          'editor.lineHighlightBackground': 'transparent',
          'editor.lineHighlightBorder': 'transparent',
          'editor.selectionBackground': '#3b82f6',
          'editor.selectionHighlightBackground': '#3b82f640',
          'editorCursor.foreground': fg,
          'editorWhitespace.foreground': '#6b728080',
          'editorIndentGuide.background': '#6b728030',
          'editorIndentGuide.activeBackground': '#6b728050',
          'editorWidget.background': bg,
          'editorWidget.foreground': fg,
        }
      });
      
      monaco.editor.defineTheme('app-light', {
        base: 'hc-black', // Same minimal base
        inherit: false,
        rules: lightRules,
        colors: {
          'editor.background': bg,
          'editor.foreground': fg,
          'minimap.background': bg,
          'editorLineNumber.foreground': '#9ca3af',
          'editorLineNumber.activeForeground': '#111827',
          'editor.lineHighlightBackground': 'transparent',
          'editor.lineHighlightBorder': 'transparent',
        }
      });

      // Safety net: force visible text via CSS in case theme mapping lags on first paint
      ensureForceStyle(fg);

      const resolvedLang = mapLanguage(language);
      editorRef.current = monaco.editor.create(containerRef.current, {
        value,
        language: resolvedLang,
        automaticLayout: true,
        theme: initialTheme === "dark" ? "app-dark" : "app-light",
        minimap: { enabled: true },
        fontLigatures: false, // Disable ligatures to prevent rendering issues
        fontSize: 14,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        scrollBeyondLastLine: false,
        renderWhitespace: "selection",
        renderLineHighlight: "none",
        bracketPairColorization: { enabled: true },
        tabSize: 2,
        wordWrap: 'off',
        // Ensure proper rendering
        disableLayerHinting: false,
        roundedSelection: false,
      });
      editorRef.current.onDidChangeModelContent(() => onChange(editorRef.current.getValue()));
      
      // Expose editor instance for context menu and other customizations
      if (onEditorReady) onEditorReady(editorRef.current);
    };

    load();

    return () => {
      disposed = true;
      try { editorRef.current?.dispose?.(); } catch {}
    };
  }, []);

  // Update theme
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    const bg = toHexColor(getComputedStyle(document.body).backgroundColor) || (theme === 'dark' ? '#0b1020' : '#ffffff');
    const fg = theme === 'dark' ? '#e5e7eb' : '#111827';
    const tokenFg = (fg.startsWith('#') ? fg.slice(1) : fg);

    // Re-apply strong CSS safeguard for foreground
    ensureForceStyle(fg);
    
    const darkRules = [
      { token: '', foreground: tokenFg }, // Default foreground - MUST be first and explicit
      // Core language tokens
      { token: 'keyword', foreground: '60a5fa' },
      { token: 'string', foreground: 'fb923c' },
      { token: 'comment', foreground: '6b7280' },
      { token: 'number', foreground: '34d399' },
      { token: 'type', foreground: '60a5fa' },
      { token: 'function', foreground: 'fbbf24' },
      { token: 'variable', foreground: tokenFg },
      { token: 'operator', foreground: tokenFg },
      { token: 'delimiter', foreground: 'fbbf24' },
      { token: 'identifier', foreground: tokenFg }, // Critical for variable names
      { token: 'punctuation', foreground: 'fbbf24' },
      // Python-specific tokens
      { token: 'string.quoted.single.python', foreground: 'fb923c' },
      { token: 'string.quoted.double.python', foreground: 'fb923c' },
      { token: 'string.quoted.triple.python', foreground: 'fb923c' },
      { token: 'keyword.python', foreground: '60a5fa' },
      { token: 'number.python', foreground: '34d399' },
      { token: 'identifier.python', foreground: tokenFg },
      // Additional Python identifier patterns
      { token: 'variable.python', foreground: tokenFg },
      { token: 'variable.name.python', foreground: tokenFg },
      // Common patterns that might be missed
      { token: 'attribute.name', foreground: tokenFg },
      { token: 'property', foreground: tokenFg },
      { token: 'constant', foreground: '34d399' },
      { token: 'parameter', foreground: tokenFg },
      { token: 'argument', foreground: tokenFg },
    ];
    
    const lightRules = [
      { token: '', foreground: tokenFg },
      { token: 'keyword', foreground: '2563eb' },
      { token: 'string', foreground: 'ea580c' },
      { token: 'comment', foreground: '9ca3af' },
      { token: 'number', foreground: '059669' },
      { token: 'type', foreground: '2563eb' },
      { token: 'function', foreground: 'd97706' },
      { token: 'variable', foreground: tokenFg },
      { token: 'string.quoted.single.python', foreground: 'ea580c' },
      { token: 'string.quoted.double.python', foreground: 'ea580c' },
      { token: 'string.quoted.triple.python', foreground: 'ea580c' },
    ];
    
    monaco.editor.defineTheme('app-dark', {
      base: 'vs-dark', // Use vs-dark as base
      inherit: false, // Don't inherit to ensure all colors are explicit
      rules: darkRules,
      colors: {
        'editor.background': bg,
        'editor.foreground': fg, // Main text color - force light text
        'minimap.background': bg,
        'minimap.foreground': fg,
        'editorLineNumber.foreground': '#6b7280',
        'editorLineNumber.activeForeground': '#e5e7eb',
        'editor.lineHighlightBackground': 'transparent',
        'editor.lineHighlightBorder': 'transparent',
      }
    });
    
    monaco.editor.defineTheme('app-light', {
      base: 'hc-black',
      inherit: false,
      rules: lightRules,
      colors: {
        'editor.background': bg,
        'editor.foreground': fg,
        'minimap.background': bg,
        'editorLineNumber.foreground': '#9ca3af',
        'editorLineNumber.activeForeground': '#111827',
      }
    });
    
    monaco.editor.setTheme(theme === "dark" ? "app-dark" : "app-light");
    
    // Force refresh to ensure colors are applied and text is visible
    if (editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        // Force a complete re-render by updating options
        editorRef.current.updateOptions({
          theme: theme === "dark" ? "app-dark" : "app-light",
          fontSize: 14,
          fontLigatures: false, // Ensure ligatures are disabled
        });
        
        // Force layout update to ensure proper rendering
        editorRef.current.layout();
      }
    }
  }, [theme]);

  // Update language when prop changes
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !editorRef.current) return;
    const model = editorRef.current.getModel();
    monaco.editor.setModelLanguage(model, mapLanguage(language));
  }, [language]);

  // Update value external
  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.getValue()) {
      const sel = editorRef.current.getSelection();
      editorRef.current.setValue(value);
      if (sel) editorRef.current.setSelection(sel);
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    />
  );
};

function ensureScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const exists = Array.from(document.scripts).some(s => s.src === src);
    if (exists) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Failed to load Monaco loader'));
    document.head.appendChild(el);
  });
}

function mapLanguage(label: string): string {
  const l = (label || '').toLowerCase();
  if (/python/.test(l)) return 'python';
  if (/node|javascript/.test(l)) return 'javascript';
  if (/typescript/.test(l)) return 'typescript';
  if (/c\+\+/.test(l)) return 'cpp';
  if (/\bc\b/.test(l)) return 'c';
  if (/java\b/.test(l)) return 'java';
  if (/go\b/.test(l)) return 'go';
  if (/sql\b/.test(l)) return 'sql';
  if (/rust/.test(l)) return 'rust';
  return 'plaintext';
}

export default MonacoEditor;

function toHexColor(input?: string): string | null {
  if (!input) return null;
  const s = input.trim();
  // rgb or rgba
  const m = s.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\)$/i);
  if (m) {
    const r = clamp255(parseInt(m[1], 10));
    const g = clamp255(parseInt(m[2], 10));
    const b = clamp255(parseInt(m[3], 10));
    return `#${to2(r)}${to2(g)}${to2(b)}`;
  }
  // already hex
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s;
  return null;
}
function to2(n: number): string { return n.toString(16).padStart(2, '0'); }
function clamp255(n: number): number { return Math.max(0, Math.min(255, n || 0)); }


