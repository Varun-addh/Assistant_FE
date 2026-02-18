import { useState, useEffect, useCallback, useRef } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, RefreshCw, BookOpen, Loader2, AlertCircle, History as HistoryIcon, Trash2, X, Maximize2, SlidersHorizontal, ChevronDown, ShieldCheck, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  apiGetTopics,
  apiGetQuestionsByTopic,
  apiSearchQuestions,
  apiTriggerUpdate,
  apiSearchQuestionsEnhanced,
  apiGetCompanies,
  apiGetHistoryTabs,
  apiDeleteHistoryTab,
  apiDeleteAllHistory,
  apiSaveHistoryTab,
} from "@/lib/api";
import type {
  InterviewQuestion,
  TopicsResponse,
  EnhancedQuestion,
  CompanyInfo,
  HistoryTabSummary,
} from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  intelligenceFeatureDefaults,
  intelligenceFeatureGates,
} from "@/lib/intelligenceConfig";
import { STRATAX_API_BASE_URL } from "@/lib/strataxClient";

// Syntax highlighting helper functions
const applyHighlighting = (token: string, tokenType: string): string => {
  switch (tokenType) {
    case 'keyword':
      return `<span class="code-keyword">${token}</span>`;
    case 'number':
      return `<span class="code-number">${token}</span>`;
    case 'string':
      return `<span class="code-string">${token}</span>`;
    case 'builtin':
      return `<span class="code-builtin">${token}</span>`;
    case 'function':
      return `<span class="code-function">${token}</span>`;
    case 'print':
      return `<span class="code-print">${token}</span>`;
    default:
      return token
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
  }
}

const getTokenType = (token: string, config: any, lang: string): string => {
  // Check for numbers
  if (/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(token) ||
    /^0[xX][0-9a-fA-F]+$/.test(token) ||
    /^0[bB][01]+$/.test(token) ||
    /^0[0-7]+$/.test(token)) {
    return 'number';
  }

  // Check for strings
  if (config.stringChars?.some((char: string) =>
    (token.startsWith(char) && token.endsWith(char)) ||
    (char === '`' && token.startsWith('`') && token.endsWith('`')))) {
    return 'string';
  }

  // Check for keywords
  if (config.keywords?.includes(token)) {
    return 'keyword';
  }

  // Check for builtins
  if (config.builtins?.includes(token)) {
    return 'builtin';
  }

  // Special cases
  if (lang === 'python' && token === 'print') {
    return 'print';
  }

  if (token.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
    return 'function';
  }

  return 'text';
};

const findCommentIndex = (line: string, commentChars: string[]): number => {
  if (!commentChars || commentChars.length === 0) return -1;

  for (const char of commentChars) {
    if (!char) continue;
    const index = line.indexOf(char);
    if (index !== -1) {
      if (char.length > 1) {
        const beforeComment = line.substring(0, index);
        const singleQuotes = (beforeComment.match(/'/g) || []).length;
        const doubleQuotes = (beforeComment.match(/"/g) || []).length;
        if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0) {
          return index;
        }
      } else {
        return index;
      }
    }
  }
  return -1;
};

const highlightCode = (code: string, lang: string): string => {
  if (!code) return '';

  const languageConfigs: Record<string, any> = {
    python: {
      keywords: ['def', 'class', 'if', 'else', 'elif', 'for', 'while', 'return', 'import', 'from', 'try', 'except', 'finally', 'with', 'as', 'pass', 'break', 'continue', 'in', 'is', 'not', 'and', 'or', 'True', 'False', 'None', 'lambda', 'yield', 'raise', 'assert', 'del', 'global', 'nonlocal', 'async', 'await', 'match', 'case'],
      builtins: ['print', 'len', 'range', 'abs', 'min', 'max', 'sum', 'sorted', 'reversed', 'enumerate', 'zip', 'map', 'filter', 'any', 'all', 'isinstance', 'type', 'str', 'int', 'float', 'bool', 'list', 'dict', 'set', 'tuple', 'input', 'open', 'round', 'divmod', 'pow', 'bin', 'hex', 'oct', 'chr', 'ord', 'hash', 'id', 'dir', 'vars', 'locals', 'globals', 'eval', 'exec', 'pandas', 'pd', 'numpy', 'np'],
      commentChars: ['#'],
      stringChars: ['"', "'"],
    },
    javascript: {
      keywords: ['function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'class', 'extends', 'import', 'export', 'from', 'as', 'default', 'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined'],
      builtins: ['console', 'document', 'window', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'Math', 'JSON', 'Promise', 'Set', 'Map', 'RegExp', 'Error'],
      commentChars: ['//', '/*'],
      stringChars: ['"', "'", '`'],
    },
    typescript: {
      keywords: ['function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'class', 'extends', 'implements', 'interface', 'type', 'enum', 'namespace', 'module', 'import', 'export', 'from', 'as', 'default', 'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined', 'any', 'void', 'never', 'unknown', 'string', 'number', 'boolean', 'object'],
      builtins: ['console', 'document', 'window', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'Math', 'JSON', 'Promise', 'Set', 'Map', 'RegExp', 'Error'],
      commentChars: ['//', '/*'],
      stringChars: ['"', "'", '`'],
    },
    java: {
      keywords: ['public', 'private', 'protected', 'static', 'final', 'abstract', 'class', 'interface', 'extends', 'implements', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super', 'import', 'package'],
      builtins: ['System', 'String', 'Object', 'Integer', 'Double', 'Float', 'Boolean', 'Math', 'Arrays', 'Collections', 'List', 'ArrayList', 'HashMap'],
      commentChars: ['//', '/*'],
      stringChars: ['"'],
    },
    sql: {
      keywords: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'INDEX', 'VIEW', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'NULL', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'ON', 'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC', 'LIMIT'],
      builtins: ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CONCAT', 'SUBSTRING', 'LENGTH', 'UPPER', 'LOWER'],
      commentChars: ['--', '/*'],
      stringChars: ['"', "'"],
    },
  };

  const config = languageConfigs[lang?.toLowerCase()] || languageConfigs.python;
  const lines = code.split('\n');
  const highlightedLines: string[] = [];
  let inMultilineComment = false;
  let multilineCommentEnd = '';

  for (const line of lines) {
    let highlightedLine = '';

    // Check for full line comments
    const trimmedLine = line.trim();
    const isFullLineComment = config.commentChars?.some((char: string) => trimmedLine.startsWith(char));

    if (isFullLineComment) {
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      highlightedLine = `<span class="code-comment">${escaped}</span>`;
    } else if (inMultilineComment) {
      const endPos = line.indexOf(multilineCommentEnd);
      if (endPos !== -1) {
        const before = line.substring(0, endPos + multilineCommentEnd.length);
        const after = line.substring(endPos + multilineCommentEnd.length);
        const escBefore = before.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        highlightedLine = `<span class="code-comment">${escBefore}</span>`;
        // Process after part
        let i = 0;
        while (i < after.length) {
          if (/\s/.test(after[i])) {
            highlightedLine += after[i];
            i++;
            continue;
          }
          let token = '';
          let j = i;
          while (j < after.length && !/\s/.test(after[j])) {
            token += after[j];
            j++;
          }
          const ttype = getTokenType(token, config, lang);
          highlightedLine += applyHighlighting(token, ttype);
          i = j;
        }
        inMultilineComment = false;
        multilineCommentEnd = '';
      } else {
        const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        highlightedLine = `<span class="code-comment">${escaped}</span>`;
      }
    } else {
      // Check for multiline comment start
      if (trimmedLine.startsWith('/*')) {
        const endPos = line.indexOf('*/');
        if (endPos !== -1) {
          const before = line.substring(0, endPos + 2);
          const after = line.substring(endPos + 2);
          const escBefore = before.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          highlightedLine = `<span class="code-comment">${escBefore}</span>`;
          // Process after part
          let i = 0;
          while (i < after.length) {
            if (/\s/.test(after[i])) {
              highlightedLine += after[i];
              i++;
              continue;
            }
            let token = '';
            let j = i;
            while (j < after.length && !/\s/.test(after[j])) {
              token += after[j];
              j++;
            }
            const ttype = getTokenType(token, config, lang);
            highlightedLine += applyHighlighting(token, ttype);
            i = j;
          }
        } else {
          inMultilineComment = true;
          multilineCommentEnd = '*/';
          const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          highlightedLine = `<span class="code-comment">${escaped}</span>`;
        }
      } else {
        // Process line with tokenization
        const commentIndex = findCommentIndex(line, config.commentChars || []);
        if (commentIndex !== -1) {
          const codePart = line.substring(0, commentIndex);
          const commentPart = line.substring(commentIndex);

          let i = 0;
          while (i < codePart.length) {
            if (/\s/.test(codePart[i])) {
              highlightedLine += codePart[i];
              i++;
              continue;
            }
            let token = '';
            let j = i;
            while (j < codePart.length && !/\s/.test(codePart[j])) {
              token += codePart[j];
              j++;
            }
            const ttype = getTokenType(token, config, lang);
            highlightedLine += applyHighlighting(token, ttype);
            i = j;
          }

          const escComment = commentPart.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          highlightedLine += `<span class="code-comment">${escComment}</span>`;
        } else {
          let i = 0;
          while (i < line.length) {
            if (/\s/.test(line[i])) {
              highlightedLine += line[i];
              i++;
              continue;
            }
            let token = '';
            let j = i;
            while (j < line.length && !/\s/.test(line[j])) {
              token += line[j];
              j++;
            }
            const ttype = getTokenType(token, config, lang);
            highlightedLine += applyHighlighting(token, ttype);
            i = j;
          }
        }
      }

    }

    highlightedLines.push(highlightedLine);
  }

  return highlightedLines.join('\n');
}

// Enhanced markdown formatter for answer display with syntax highlighting
const formatAnswerMarkdown = (text: string): string => {
  if (!text) return "";

  // Backend now handles code block detection and formatting
  // Frontend only needs to render the properly formatted markdown

  // Extract code blocks first and replace them with placeholders
  const codeBlockPlaceholders: string[] = [];
  let processedText = text;

  // Handle triple-backtick code blocks (already formatted by backend)
  processedText = processedText.replace(/```(\w+)?\s*\n?([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlockPlaceholders.length}__`;
    const cleanedCode = (code || '').replace(/^\n+/, '').replace(/\n+$/, '');
    const highlightedCode = highlightCode(cleanedCode, (lang || '').toString());
    codeBlockPlaceholders.push(
      `<div class="code-block-wrapper my-3"><pre class="bg-[#0b1020] border border-[#30363d] rounded-lg overflow-x-auto p-4" style="background-color: #0b1020; border: 1px solid #30363d; border-radius: 0.5rem; overflow-x: auto; padding: 1rem; margin: 0.75rem 0;"><code class="language-${lang || 'text'}" style="font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 0.875rem; line-height: 1.5; color: #d4d4d4; display: block; white-space: pre;">${highlightedCode}</code></pre></div>`
    );
    return placeholder;
  });

  // Escape the remaining text as HTML
  const escaped = processedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Parse the escaped text line-by-line, keeping placeholders intact
  const linesRaw = processedText.split('\n');
  const linesEscaped = escaped.split('\n');

  const outParts: string[] = [];
  let currList: 'ul' | 'ol' | null = null;
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const inner = paragraphLines.join('<br>');
    outParts.push(`<p class="my-2 text-sm leading-relaxed">${inner}</p>`);
    paragraphLines = [];
  };

  const closeList = () => {
    if (!currList) return;
    outParts.push(`</${currList}>`);
    currList = null;
  };

  const openList = (type: 'ul' | 'ol') => {
    if (currList === type) return;
    closeList();
    if (type === 'ul') outParts.push('<ul class="list-disc my-2 space-y-1 pl-5">');
    else outParts.push('<ol class="list-decimal my-2 space-y-1 pl-7">');
    currList = type;
  };

  const processInline = (s: string) => {
    // Inline code with backticks (backend should handle most code formatting)
    s = s.replace(/`([^`]+)`/g, (_m, code) => {
      const decoded = (code || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      return `<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">${decoded}</code>`;
    });

    // Bold
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>');
    // Italic
    s = s.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');
    return s;
  };

  for (let i = 0; i < linesRaw.length; i++) {
    const raw = (linesRaw[i] || '').trim();
    const esc = linesEscaped[i] || '';

    // Code block placeholder line
    const placeholderMatch = raw.match(/^__CODE_BLOCK_(\d+)__$/);
    if (placeholderMatch) {
      flushParagraph();
      closeList();
      outParts.push(`__CODE_BLOCK_${placeholderMatch[1]}__`); // replace later
      continue;
    }

    // Headers
    if (raw.startsWith('### ')) {
      flushParagraph();
      closeList();
      const content = processInline(esc.substring(4).trim());
      outParts.push(`<h3 class="text-base font-semibold mt-3 mb-1">${content}</h3>`);
      continue;
    }
    if (raw.startsWith('## ')) {
      flushParagraph();
      closeList();
      const content = processInline(esc.substring(3).trim());
      outParts.push(`<h2 class="text-lg font-semibold mt-3 mb-1">${content}</h2>`);
      continue;
    }
    if (raw.startsWith('# ')) {
      flushParagraph();
      closeList();
      const content = processInline(esc.substring(2).trim());
      outParts.push(`<h1 class="text-xl font-semibold mt-3 mb-1">${content}</h1>`);
      continue;
    }

    // Unordered list
    const ulMatch = raw.match(/^[-*] (.*)$/);
    if (ulMatch) {
      flushParagraph();
      openList('ul');
      const content = processInline(linesEscaped[i].replace(/^[-*] /, '').trim());
      outParts.push(`<li class="ml-0">${content}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = raw.match(/^\d+\. (.*)$/);
    if (olMatch) {
      flushParagraph();
      openList('ol');
      const content = processInline(linesEscaped[i].replace(/^\d+\. /, '').trim());
      outParts.push(`<li class="ml-0">${content}</li>`);
      continue;
    }

    // Empty line -> paragraph boundary
    if (raw === '') {
      flushParagraph();
      closeList();
      continue;
    }

    // Regular paragraph line -> accumulate (preserve single-line breaks with <br>)
    paragraphLines.push(processInline(esc));
  }

  flushParagraph();
  closeList();

  // Join result and replace placeholders with actual code-block HTML
  let finalHtml = outParts.join('\n');
  codeBlockPlaceholders.forEach((htmlBlock, idx) => {
    finalHtml = finalHtml.replace(`__CODE_BLOCK_${idx}__`, htmlBlock);
  });

  return finalHtml;
};

const featureGates = intelligenceFeatureGates;
const defaultRerankingEnabled = featureGates.reranking
  ? (intelligenceFeatureDefaults.enableReranking ?? true)
  : false;
const defaultQueryExpansionEnabled = featureGates.queryExpansion
  ? (intelligenceFeatureDefaults.enableQueryExpansion ?? true)
  : false;

interface InterviewIntelligenceProps {
  onHistoryRefresh?: () => void;
  historyTabs?: HistoryTabSummary[];
  // Enhanced to support 'clear' action or 'select' (default)
  externalHistorySelection?: { tab?: HistoryTabSummary; type?: 'select' | 'clear'; ts: number } | null;
  onExternalHistorySelectionConsumed?: () => void;
}

export const InterviewIntelligence = ({
  onHistoryRefresh,
  historyTabs: externalHistoryTabs = [],
  externalHistorySelection,
  onExternalHistorySelectionConsumed,
}: InterviewIntelligenceProps) => {
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InterviewQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<InterviewQuestion | null>(null);
  const [activeView, setActiveView] = useState<"topics" | "search">("topics");
  const [limit, setLimit] = useState<number>(20);
  const { toast } = useToast();
  // Enhanced mode
  const [enhanced, setEnhanced] = useState<boolean>(false);
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(false);
  const [minCred, setMinCred] = useState<number>(0.0);
  const [company, setCompany] = useState<string | null>(null);
  const [refreshEnhanced, setRefreshEnhanced] = useState<boolean>(true);
  const [enableReranking, setEnableReranking] = useState<boolean>(defaultRerankingEnabled);
  const [enableQueryExpansion, setEnableQueryExpansion] = useState<boolean>(defaultQueryExpansionEnabled);
  // UI search status state (for enhanced mode UX)
  const [searchStatus, setSearchStatus] = useState<
    'idle' | 'analyzing' | 'searching' | 'generating' | 'ranking' | 'complete' | 'error'
  >('idle');
  const [statusSources, setStatusSources] = useState<Array<{ name: string; status: 'pending' | 'searching' | 'complete' | 'failed'; count?: number }>>([]);
  const statusTimersRef = useRef<number[]>([]);
  // Ref to track active WebSocket connection for proper cleanup
  const activeWsRef = useRef<WebSocket | null>(null);
  // Advanced controls hidden by default to reduce UI clutter
  const [showAdvancedControls, setShowAdvancedControls] = useState<boolean>(false);
  // Collapsible filters drawer
  const [showFilters, setShowFilters] = useState<boolean>(false);
  // Copy button state for answer panel
  const [answerCopied, setAnswerCopied] = useState<boolean>(false);
  // Enhanced mode confirmation (avoid native browser confirm)
  const [enhancedConfirmOpen, setEnhancedConfirmOpen] = useState<boolean>(false);
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyRefreshing, setHistoryRefreshing] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedHistoryTabId, setSelectedHistoryTabId] = useState<string | null>(null);
  const [isAnswerExpanded, setIsAnswerExpanded] = useState<boolean>(false);
  const historyInitialLoadRef = useRef<boolean>(false);

  // Consolidate history tabs from prop
  const historyTabs = externalHistoryTabs;

  useEffect(() => {
    // Only load topics once on mount
    loadTopics();

    // Load companies (enhanced filter)
    (async () => {
      try {
        const list = await apiGetCompanies();
        if (Array.isArray(list)) setCompanies(list);
      } catch (e) {
        console.warn("[Intelligence] Failed to load companies", e);
      }
    })();
    
    // Cleanup WebSocket on unmount
    return () => {
      if (activeWsRef.current) {
        console.log('[Intelligence] Cleaning up WebSocket on unmount');
        activeWsRef.current.close();
        activeWsRef.current = null;
      }
    };
  }, []);

  const loadHistoryTabs = useCallback(async (opts?: { silent?: boolean }) => {
    // This now just triggers the parent's refresh
    onHistoryRefresh?.();
  }, [onHistoryRefresh]);

  const [historyDeletingTabId, setHistoryDeletingTabId] = useState<string | null>(null);
  const [historyClearingAll, setHistoryClearingAll] = useState<boolean>(false);

  type DestructiveConfirmConfig = {
    title: string;
    description: React.ReactNode;
    confirmLabel?: string;
    requireAckLabel?: string;
    onConfirm: () => Promise<void>;
  };

  const [destructiveConfirmOpen, setDestructiveConfirmOpen] = useState(false);
  const [destructiveConfirmConfig, setDestructiveConfirmConfig] = useState<DestructiveConfirmConfig | null>(null);
  const [destructiveConfirmBusy, setDestructiveConfirmBusy] = useState(false);
  const [destructiveConfirmAck, setDestructiveConfirmAck] = useState(false);

  const openDestructiveConfirm = (config: DestructiveConfirmConfig) => {
    setDestructiveConfirmConfig(config);
    setDestructiveConfirmAck(false);
    setDestructiveConfirmOpen(true);
  };

  const closeDestructiveConfirm = () => {
    if (destructiveConfirmBusy) return;
    setDestructiveConfirmOpen(false);
    setDestructiveConfirmConfig(null);
    setDestructiveConfirmAck(false);
  };

  const runDestructiveConfirm = async () => {
    if (!destructiveConfirmConfig) return;
    if (destructiveConfirmConfig.requireAckLabel && !destructiveConfirmAck) return;
    setDestructiveConfirmBusy(true);
    try {
      await destructiveConfirmConfig.onConfirm();
    } finally {
      setDestructiveConfirmBusy(false);
      setDestructiveConfirmOpen(false);
      setDestructiveConfirmConfig(null);
      setDestructiveConfirmAck(false);
    }
  };

  const handleLoadHistoryTab = useCallback((tab: HistoryTabSummary) => {
    // CRITICAL: Close any active WebSocket to prevent results from mixing
    if (activeWsRef.current) {
      console.log('[Intelligence] Closing active WebSocket before loading history');
      activeWsRef.current.close();
      activeWsRef.current = null;
    }
    // Reset search state
    setSearchLoading(false);
    setSearchStatus('idle');
    
    setSearchQuery(tab.query);
    setLastSubmittedQuery(tab.query);
    setSearchResults((tab.questions as unknown as InterviewQuestion[]) || []);
    setActiveView("search");
    setSelectedHistoryTabId(tab.tab_id);
    setSelectedQuestion((tab.questions?.[0] as InterviewQuestion) || null);
    // Don't trigger a new search when loading from history - just display the saved results
  }, []);

  const handleDeleteHistoryTab = useCallback(async (tabId: string) => {
    openDestructiveConfirm({
      title: "Delete saved search?",
      description: "This will permanently delete this saved search. This action cannot be undone.",
      confirmLabel: "Delete",
      onConfirm: async () => {
        setHistoryDeletingTabId(tabId);
        try {
          await apiDeleteHistoryTab(tabId);
          onHistoryRefresh?.();
          if (selectedHistoryTabId === tabId) {
            setSelectedHistoryTabId(null);
          }
          toast({
            title: "History entry deleted",
            description: "The saved search has been removed.",
          });
        } catch (err: any) {
          toast({
            title: "Failed to delete history",
            description: err?.message || "Could not remove saved search.",
            variant: "destructive",
          });
          throw err;
        } finally {
          setHistoryDeletingTabId(null);
        }
      },
    });
  }, [selectedHistoryTabId, toast, onHistoryRefresh]);

  const handleDeleteAllHistory = useCallback(async () => {
    openDestructiveConfirm({
      title: "Delete all saved searches?",
      description: "This will permanently delete all saved searches. This action cannot be undone.",
      confirmLabel: "Delete all",
      requireAckLabel: "I understand this will permanently delete all saved searches",
      onConfirm: async () => {
        setHistoryClearingAll(true);
        try {
          const result = await apiDeleteAllHistory();
          onHistoryRefresh?.();
          setSelectedHistoryTabId(null);
          toast({
            title: "History cleared",
            description: result?.message || "All saved searches were deleted.",
          });
        } catch (err: any) {
          toast({
            title: "Failed to clear history",
            description: err?.message || "Could not delete saved searches.",
            variant: "destructive",
          });
          throw err;
        } finally {
          setHistoryClearingAll(false);
        }
      },
    });
  }, [toast, onHistoryRefresh]);

  const loadTopics = async () => {
    try {
      setLoading(true);
      const data: TopicsResponse = await apiGetTopics();
      setTopics(data.topics || []);
    } catch (err: any) {
      console.error("[Intelligence] Failed to load topics", err);
      toast({
        title: "Failed to load topics",
        description: err?.message || "Could not fetch interview topics.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadQuestionsByTopic = async (topic: string) => {
    try {
      setLoading(true);
      setSelectedTopic(topic);
      const data = await apiGetQuestionsByTopic(topic, limit);
      setQuestions(data.questions || []);
      setActiveView("topics");
    } catch (err: any) {
      console.error("[Intelligence] Failed to load questions", err);
      toast({
        title: "Failed to load questions",
        description: err?.message || `Could not fetch questions for ${topic}.`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = useCallback(async (query: string, forceRefresh: boolean = true, saveToHistory: boolean = true) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    // Use WebSocket streaming for enhanced mode, fallback to HTTP
    const useStreaming = enhanced && typeof WebSocket !== 'undefined';

    if (useStreaming) {
      handleSearchWithWebSocket(query, forceRefresh, saveToHistory);
    } else {
      handleSearchWithHTTP(query, forceRefresh, saveToHistory);
    }
  }, [enhanced, limit, verifiedOnly, minCred, company, refreshEnhanced, enableReranking, enableQueryExpansion]);

  const handleSearchWithWebSocket = useCallback((query: string, forceRefresh: boolean, saveToHistory: boolean = true) => {
    try {
      // Close any existing WebSocket before starting a new search
      if (activeWsRef.current) {
        console.log('[Intelligence] Closing previous WebSocket before new search');
        activeWsRef.current.close();
        activeWsRef.current = null;
      }
      
      setSearchLoading(true);
      setSearchStatus('analyzing');
      setStatusSources([]); // Will be populated dynamically from source_update messages
      setActiveView("search");
      setLastSubmittedQuery(query);
      setSearchResults([]); // Clear previous results

      // Determine WebSocket URL based on current API URL
      const apiUrl = STRATAX_API_BASE_URL;
      const wsUrl = apiUrl.replace(/^http/, 'ws') + '/api/intelligence/ws/search';

      const ws = new WebSocket(wsUrl);
      activeWsRef.current = ws; // Store reference for cleanup

      ws.onopen = () => {
        console.log('[Intelligence] WebSocket connected');
        setSearchStatus('searching');
        ws.send(JSON.stringify({
          query: query,
          limit: limit,
          verified_only: verifiedOnly,
          min_credibility: minCred,
          company: company || undefined,
          refresh: refreshEnhanced || forceRefresh,
          enhanced: enhanced,
          enable_reranking: featureGates.reranking ? enableReranking : undefined,
          enable_query_expansion: featureGates.queryExpansion ? enableQueryExpansion : undefined,
          save_to_history: saveToHistory, // Pass through to backend
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log('[Intelligence] WebSocket message:', msg.type, msg);

          if (msg.type === 'status') {
            // Update search status
            setSearchStatus(msg.status || 'searching');
          } else if (msg.type === 'source_update') {
            console.log('[Intelligence] Source update:', msg.source, msg.status, msg.count);
            // Update individual source status or add new source dynamically
            setStatusSources(prev => {
              const existingIndex = prev.findIndex(s => s.name === msg.source);
              if (existingIndex >= 0) {
                // Update existing source
                const updated = prev.map((source, idx) =>
                  idx === existingIndex
                    ? { ...source, status: msg.status, count: msg.count }
                    : source
                );
                console.log('[Intelligence] Updated sources:', updated);
                return updated;
              } else {
                // Add new source
                const newSources = [...prev, { name: msg.source, status: msg.status, count: msg.count }];
                console.log('[Intelligence] Added new source:', newSources);
                return newSources;
              }
            });
          } else if (msg.type === 'result') {
            // Add result immediately to UI (streaming!)
            setSearchResults(prev => [...prev, msg.data]);
            setSearchStatus('generating');

            // Extract source from result and update source status
            if (msg.data?.source) {
              setStatusSources(prev => {
                const existingIndex = prev.findIndex(s => s.name === msg.data.source);
                if (existingIndex >= 0) {
                  // Update count for existing source
                  return prev.map((source, idx) =>
                    idx === existingIndex
                      ? { ...source, count: (source.count || 0) + 1, status: 'searching' as const }
                      : source
                  );
                } else {
                  // Add new source with "searching" status initially
                  return [...prev, { name: msg.data.source, status: 'searching' as const, count: 1 }];
                }
              });
            }
          } else if (msg.type === 'search_complete') {
            console.log('[Intelligence] Search complete:', msg.total_results, 'tab_id:', msg.tab_id);
            setSearchStatus('complete');
            setStatusSources(prev => prev.map(s => ({ ...s, status: 'complete' })));

            // Handle history saving - give backend time to save before refreshing
            if (msg.tab_id) {
              setSelectedHistoryTabId(msg.tab_id);
              console.log('[Intelligence] Refreshing history with tab_id:', msg.tab_id);
              // Wait longer to ensure backend has saved
              setTimeout(() => {
                loadHistoryTabs({ silent: true });
                onHistoryRefresh?.();
                // Retry after another delay to catch any late saves
                setTimeout(() => {
                  loadHistoryTabs({ silent: true });
                  onHistoryRefresh?.();
                }, 1000);
              }, 800);
            } else {
              // Backend didn't send tab_id, manually save the search to history
              console.warn('[Intelligence] No tab_id from backend, refreshing history anyway');
              setTimeout(() => {
                loadHistoryTabs({ silent: true });
                onHistoryRefresh?.();
                // Retry after another delay
                setTimeout(() => {
                  loadHistoryTabs({ silent: true });
                  onHistoryRefresh?.();
                }, 1000);
              }, 800);
            }

            ws.close();
            activeWsRef.current = null;
            setSearchLoading(false);
          } else if (msg.type === 'error') {
            console.error('[Intelligence] WebSocket error:', msg.message);
            toast({
              title: "Search failed",
              description: msg.message || "Could not search questions.",
              variant: "destructive",
            });
            setSearchStatus('error');
            setStatusSources(prev => prev.map(s => ({ ...s, status: 'failed' })));
            ws.close();
            activeWsRef.current = null;
            setSearchLoading(false);
          }
        } catch (err) {
          console.error('[Intelligence] Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('[Intelligence] WebSocket error:', error);
        toast({
          title: "Connection error",
          description: "Failed to connect to streaming search. Using fallback.",
          variant: "destructive",
        });
        setSearchStatus('error');
        ws.close();
        activeWsRef.current = null;
        // Fallback to HTTP
        handleSearchWithHTTP(query, forceRefresh);
      };

      ws.onclose = () => {
        console.log('[Intelligence] WebSocket closed');
        activeWsRef.current = null;
      };

    } catch (err: any) {
      console.error('[Intelligence] WebSocket setup failed:', err);
      // Fallback to HTTP
      handleSearchWithHTTP(query, forceRefresh);
    }
  }, [enhanced, limit, verifiedOnly, minCred, company, refreshEnhanced, enableReranking, enableQueryExpansion, toast, loadHistoryTabs, onHistoryRefresh]);

  const handleSearchWithHTTP = useCallback(async (query: string, forceRefresh: boolean, saveToHistory: boolean = true) => {
    try {
      setSearchLoading(true);
      // If enhanced mode, kick off a simulated realtime status lifecycle for better UX
      if (enhanced) {
        setSearchStatus('analyzing');
        setStatusSources([]); // Will show actual sources from results
        // staged transitions to mimic backend pipeline
        // analyzing -> searching
        const t1 = window.setTimeout(() => setSearchStatus('searching'), 700);
        // searching -> generating -> ranking
        const t5 = window.setTimeout(() => setSearchStatus('generating'), 1600);
        const t6 = window.setTimeout(() => setSearchStatus('ranking'), 2000);
        statusTimersRef.current = [t1, t5, t6];
      }
      setActiveView("search");
      setLastSubmittedQuery(query);
      let searchData: any;
      if (enhanced) {
        searchData = await apiSearchQuestionsEnhanced({
          query,
          limit,
          verified_only: verifiedOnly,
          min_credibility: minCred,
          company,
          refresh: refreshEnhanced || !!forceRefresh,
          enable_reranking: featureGates.reranking ? enableReranking : undefined,
          enable_query_expansion: featureGates.queryExpansion ? enableQueryExpansion : undefined,
          save_to_history: saveToHistory, // Pass through to API
        });
        setSearchResults((searchData.questions as unknown as InterviewQuestion[]) || []);
      } else {
        searchData = await apiSearchQuestions(query, limit, !!forceRefresh, saveToHistory); // Pass through to API
        setSearchResults(searchData.questions || []);
      }

      console.log("[Intelligence] Search response:", {
        tab_id: searchData?.tab_id,
        questionCount: searchData?.questions?.length,
        query: searchData?.query
      });

      // Handle history saving
      if (searchData?.tab_id) {
        setSelectedHistoryTabId(searchData.tab_id);
        // Refresh history after a short delay to ensure server has saved
        setTimeout(() => {
          loadHistoryTabs({ silent: true });
          onHistoryRefresh?.();
        }, 500);
      } else if (searchData?.questions && searchData.questions.length > 0) {
        // If search succeeded but no tab_id, manually save to history
        try {
          const saved = await apiSaveHistoryTab({
            query: searchData.query || query,
            questions: searchData.questions as InterviewQuestion[],
            metadata: {
              limit,
              refresh: refreshEnhanced || !!forceRefresh,
              enhanced,
            },
          });
          console.log("[Intelligence] Manually saved to history:", saved.tab_id);
          setSelectedHistoryTabId(saved.tab_id);
          setTimeout(() => {
            loadHistoryTabs({ silent: true });
            onHistoryRefresh?.();
          }, 500);
        } catch (err) {
          console.warn("[Intelligence] Failed to manually save history:", err);
          // Still try to load history in case server saved it
          loadHistoryTabs({ silent: true });
        }
      } else {
        loadHistoryTabs({ silent: true });
      }
      // mark status complete on success
      if (enhanced) {
        setSearchStatus('complete');
        setStatusSources((s) => s.map((x) => ({ ...x, status: 'complete' })));
      }
    } catch (err: any) {
      console.error("[Intelligence] Search failed", err);
      toast({
        title: "Search failed",
        description: err?.message || "Could not search questions.",
        variant: "destructive",
      });
      if (enhanced) {
        setSearchStatus('error');
        setStatusSources((s) => s.map((x) => ({ ...x, status: 'failed' })));
      }
    } finally {
      // clear any simulated timers
      (statusTimersRef.current || []).forEach((t) => clearTimeout(t));
      statusTimersRef.current = [];
      setSearchLoading(false);
    }
  }, [toast, limit, enhanced, verifiedOnly, minCred, company, refreshEnhanced, enableReranking, enableQueryExpansion, loadHistoryTabs, onHistoryRefresh]);

  const handleTriggerUpdate = async () => {
    try {
      const data = await apiTriggerUpdate();
      toast({
        title: "Update initiated",
        description: data.message || "Questions will be available shortly.",
      });
    } catch (err: any) {
      console.error("[Intelligence] Update failed", err);
      toast({
        title: "Update failed",
        description: err?.message || "Could not trigger update.",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const currentQuestions = activeView === "search" ? searchResults : questions;

  useEffect(() => {
    if (externalHistorySelection) {
      if (externalHistorySelection.type === 'clear') {
        // Reset state to initial view (topics) and clear search artifacts
        setSearchQuery("");
        setSearchResults([]);
        setActiveView("topics");
        setSelectedQuestion(null);
        setSelectedHistoryTabId(null);
        setLastSubmittedQuery("");
        onExternalHistorySelectionConsumed?.();
      } else if (externalHistorySelection.tab) {
        handleLoadHistoryTab(externalHistorySelection.tab);
        onExternalHistorySelectionConsumed?.();
      }
    }
  }, [externalHistorySelection, handleLoadHistoryTab, onExternalHistorySelectionConsumed]);

  return (
    <div className="flex flex-col h-full gap-4 px-4 md:px-0">
      <AlertDialog
        open={destructiveConfirmOpen}
        onOpenChange={(open) => {
          if (!open) closeDestructiveConfirm();
          else setDestructiveConfirmOpen(true);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{destructiveConfirmConfig?.title || "Are you sure?"}</AlertDialogTitle>
            <AlertDialogDescription>{destructiveConfirmConfig?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          {destructiveConfirmConfig?.requireAckLabel ? (
            <div className="flex items-start gap-2">
              <Checkbox
                id="intelligence-destructive-confirm-ack"
                checked={destructiveConfirmAck}
                onCheckedChange={(v) => setDestructiveConfirmAck(!!v)}
                disabled={destructiveConfirmBusy}
              />
              <Label
                htmlFor="intelligence-destructive-confirm-ack"
                className="text-sm text-muted-foreground leading-tight cursor-pointer"
              >
                {destructiveConfirmConfig.requireAckLabel}
              </Label>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={destructiveConfirmBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={
                destructiveConfirmBusy ||
                !destructiveConfirmConfig ||
                (!!destructiveConfirmConfig?.requireAckLabel && !destructiveConfirmAck)
              }
              onClick={(e) => {
                e.preventDefault();
                void runDestructiveConfirm();
              }}
            >
              {destructiveConfirmBusy ? "Working..." : destructiveConfirmConfig?.confirmLabel || "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Enhanced mode confirmation dialog */}
      <AlertDialog open={enhancedConfirmOpen} onOpenChange={setEnhancedConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable Enhanced Search?</AlertDialogTitle>
            <AlertDialogDescription>
              Enhanced Search uses verified sources and advanced filters to improve result quality.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setEnhanced(true);
                setEnhancedConfirmOpen(false);
              }}
            >
              Enable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header with Search */}
      <div className="flex-shrink-0 space-y-3 py-1">
        {/* Search Bar Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1 flex gap-2">
            <div className="flex-1 relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                placeholder="Search topics or questions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch(searchQuery, true);
                }}
                maxLength={512}
                className="pl-9 pr-8 bg-card/50 backdrop-blur-sm focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 hover:bg-transparent"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedQuestion(null);
                  }}
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              )}
            </div>

            <Button
              variant="default"
              size="sm"
              onClick={() => handleSearch(searchQuery, true)}
              disabled={!searchQuery.trim()}
              className="shrink-0 h-10 px-4 md:px-3 bg-primary hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
            >
              {searchLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Search className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Send</span>
                </>
              )}
            </Button>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={handleTriggerUpdate}
            title="Trigger database update"
            className="shrink-0 h-10 w-10 border-border/50 bg-card/30 hidden sm:flex"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Controls Row */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap pb-1">
          {/* Enhanced mode toggle */}
          <button
            onClick={() => {
              if (enhanced) {
                setEnhanced(false);
                return;
              }
              setEnhancedConfirmOpen(true);
            }}
            disabled={searchLoading}
            className={`group flex items-center gap-1.5 h-5 px-1.5 rounded-md border transition-all duration-300 ${enhanced
              ? 'bg-primary/10 border-primary/50 text-primary shadow-[0_0_8px_-3px_rgba(var(--primary),0.3)]'
              : 'bg-transparent border-border/20 text-muted-foreground hover:border-border/40'
              }`}
          >
            <div className={`w-1 h-1 rounded-full transition-all duration-300 ${enhanced ? 'bg-primary shadow-[0_0_4px_rgba(var(--primary),1)]' : 'bg-muted-foreground/30'}`} />
            <span className="text-[9px] font-black uppercase tracking-tight">Enhanced</span>
          </button>

          {/* Limit selector */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card/40 border border-border/30">
            <span className="text-[9px] sm:text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Limit</span>
            <input
              type="number"
              min="1"
              max="100"
              value={limit === null ? '' : limit}
              onChange={(e) => {
                // Allow empty string for editing
                if (e.target.value === '') setLimit(null);
                else {
                  const num = parseInt(e.target.value, 10);
                  if (!isNaN(num) && num >= 1 && num <= 100) setLimit(num);
                }
              }}
              onBlur={(e) => {
                // If left empty, reset to 1
                if (e.target.value === '' || isNaN(Number(e.target.value))) setLimit(1);
              }}
              className="bg-transparent border-none text-[10px] sm:text-xs font-bold w-7 sm:w-8 focus:outline-none text-center text-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          {/* Enhanced filters - show when enhanced mode is on */}
          {enhanced && (
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => setVerifiedOnly(!verifiedOnly)}
                className={`group flex items-center gap-1.5 h-5 px-1.5 rounded-md border transition-all duration-300 ${verifiedOnly
                  ? 'bg-primary/10 border-primary/50 text-primary shadow-[0_0_8px_-3px_rgba(var(--primary),0.3)]'
                  : 'bg-transparent border-border/20 text-muted-foreground hover:border-border/40'
                  }`}
              >
                <div className={`w-1 h-1 rounded-full transition-all duration-300 ${verifiedOnly ? 'bg-primary shadow-[0_0_4px_rgba(var(--primary),1)]' : 'bg-muted-foreground/30'}`} />
                <span className="text-[9px] font-black uppercase tracking-tight">Verified</span>
              </button>

              {/* Min credibility slider - more compact on mobile */}
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-card/30 border border-border/20">
                <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden sm:inline">Cred</span>
                <div className="w-10 sm:w-16">
                  <Slider
                    min={0}
                    max={1}
                    step={0.1}
                    value={[minCred]}
                    onValueChange={(v) => setMinCred(Math.max(0, Math.min(1, v?.[0] ?? 0)))}
                  />
                </div>
                <span className="text-[8px] font-bold tabular-nums text-foreground">{minCred.toFixed(1)}</span>
              </div>

              {/* Company select */}
              <Select
                value={company ?? "_any"}
                onValueChange={(v) => setCompany(v === "_any" ? null : v)}
              >
                <SelectTrigger className="h-6 sm:h-7 w-[85px] sm:w-[120px] rounded-md text-[9px] sm:text-[10px] bg-card/40 border-border/30 font-semibold">
                  <SelectValue placeholder="Company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_any">Any company</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.slug} value={c.slug} className="text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Show advanced toggle */}
              <button
                type="button"
                className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-primary hover:bg-primary/10 rounded-md transition-all"
                onClick={() => setShowAdvancedControls((s) => !s)}
              >
                {showAdvancedControls ? 'Less' : 'More'}
              </button>
            </div>
          )}
        </div>

        {/* Advanced controls - show when enabled */}
        {enhanced && showAdvancedControls && (
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap pt-0.5">
            <button
              onClick={() => setRefreshEnhanced(!refreshEnhanced)}
              className={`group flex items-center gap-1.5 h-5 px-1.5 rounded-md border transition-all duration-300 ${refreshEnhanced
                ? 'bg-primary/10 border-primary/50 text-primary shadow-[0_0_8px_-3px_rgba(var(--primary),0.3)]'
                : 'bg-transparent border-border/20 text-muted-foreground hover:border-border/40'
                }`}
            >
              <div className={`w-1 h-1 rounded-full transition-all duration-300 ${refreshEnhanced ? 'bg-primary shadow-[0_0_4px_rgba(var(--primary),1)]' : 'bg-muted-foreground/30'}`} />
              <span className="text-[9px] font-black uppercase tracking-tight">Refresh</span>
            </button>
            {featureGates.reranking && (
              <button
                onClick={() => setEnableReranking(!enableReranking)}
                className={`group flex items-center gap-1.5 h-5 px-1.5 rounded-md border transition-all duration-300 ${enableReranking
                  ? 'bg-primary/10 border-primary/50 text-primary shadow-[0_0_8px_-3px_rgba(var(--primary),0.3)]'
                  : 'bg-transparent border-border/20 text-muted-foreground hover:border-border/40'
                  }`}
              >
                <div className={`w-1 h-1 rounded-full transition-all duration-300 ${enableReranking ? 'bg-primary shadow-[0_0_4px_rgba(var(--primary),1)]' : 'bg-muted-foreground/30'}`} />
                <span className="text-[9px] font-black uppercase tracking-tight">Rerank</span>
              </button>
            )}
            {featureGates.queryExpansion && (
              <button
                onClick={() => setEnableQueryExpansion(!enableQueryExpansion)}
                className={`group flex items-center gap-1.5 h-5 px-1.5 rounded-md border transition-all duration-300 ${enableQueryExpansion
                  ? 'bg-primary/10 border-primary/50 text-primary shadow-[0_0_8px_-3px_rgba(var(--primary),0.3)]'
                  : 'bg-transparent border-border/20 text-muted-foreground hover:border-border/40'
                  }`}
              >
                <div className={`w-1 h-1 rounded-full transition-all duration-300 ${enableQueryExpansion ? 'bg-primary shadow-[0_0_4px_rgba(var(--primary),1)]' : 'bg-muted-foreground/30'}`} />
                <span className="text-[9px] font-black uppercase tracking-tight whitespace-nowrap">Query Exp.</span>
              </button>
            )}
          </div>
        )}

        {/* Enhanced realtime status (shows while an enhanced search is running) */}
        {enhanced && (searchLoading || searchStatus !== 'idle') && (
          <div className="w-full">
            <div role="status" aria-live="polite" className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="font-medium">Search:</span>
              <span className="capitalize">{searchStatus}</span>
              {searchLoading && <Loader2 className="h-3 w-3 animate-spin text-primary/60" />}
            </div>
            <div className="flex items-center gap-2 mt-2">
              {statusSources.map((s) => (
                <div key={s.name} className="text-xs px-2.5 py-1.5 rounded-lg bg-card/40 backdrop-blur-sm border border-border/20 transition-all duration-300">
                  <div className="font-medium text-foreground/80">{s.name}</div>
                  <div className="text-muted-foreground/60 text-[10px]">{s.status}{s.count ? ` • ${s.count}` : ''}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Topics Pills */}
        {topics.length > 0 && (
          <div className="flex flex-nowrap sm:flex-wrap gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {topics.map((topic) => (
              <Badge
                key={topic}
                variant={selectedTopic === topic ? "default" : "outline"}
                className={`cursor-pointer transition-all duration-200 whitespace-nowrap px-3 py-1 text-[10px] sm:text-xs rounded-full ${selectedTopic === topic ? 'shadow-md shadow-primary/20' : 'hover:bg-primary/10 hover:border-primary/30'}`}
                onClick={() => loadQuestionsByTopic(topic)}
              >
                {topic}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4 overflow-hidden">
        <div className={`flex-1 min-w-0 flex flex-col gap-4 overflow-hidden ${selectedQuestion ? 'hidden md:flex' : 'flex'}`}>
          {/* Questions List */}
          <Card className="flex-1 min-w-0 flex flex-col overflow-hidden bg-card/40 backdrop-blur-sm border-border/30 shadow-lg shadow-black/5">
            <CardHeader className="pb-3 flex-shrink-0 border-b border-border/10">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary/60" />
                {activeView === "search" ? (
                  <>Search Results {searchLoading && <Loader2 className="h-3 w-3 animate-spin text-primary" />}</>
                ) : selectedTopic ? (
                  <>{selectedTopic} Questions {loading && <Loader2 className="h-3 w-3 animate-spin text-primary" />}</>
                ) : (
                  <>Select a topic to view questions</>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
              <ScrollArea className="h-full">
                {/* Trust indicator — subtle inline meter instead of yellow warning */}
                {!enhanced && activeView === "search" && Array.isArray(currentQuestions) && currentQuestions.length > 0 && (
                  (() => {
                    const results = currentQuestions as unknown as EnhancedQuestion[];
                    const total = results.length;
                    const verifiedCount = results.filter(r => (r.verification_status === "verified") || r.source_type === "verified").length;
                    const ratio = total > 0 ? verifiedCount / total : 0;
                    if (ratio < 0.5) {
                      return (
                        <div className="mx-3 my-2 flex items-center gap-3 p-2.5 rounded-xl bg-card/40 backdrop-blur-sm border border-border/20">
                          <div className="flex items-center gap-2 min-w-0">
                            <ShieldCheck className="h-4 w-4 text-amber-400/80 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Trust Score</span>
                                <span className="text-[10px] font-bold text-amber-400">{Math.round(ratio * 100)}%</span>
                              </div>
                              <div className="w-full h-1 rounded-full bg-border/30 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700 ease-out"
                                  style={{
                                    width: `${Math.round(ratio * 100)}%`,
                                    background: ratio < 0.3 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, #f59e0b, #eab308)'
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setShowFilters(true);
                              setEnhancedConfirmOpen(true);
                            }}
                            className="text-[9px] font-semibold text-primary hover:text-primary/80 whitespace-nowrap transition-colors px-2 py-1 rounded-md hover:bg-primary/10"
                          >
                            Enable Enhanced
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()
                )}
                {loading && !currentQuestions.length ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : currentQuestions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-muted/10 border border-border/20 flex items-center justify-center mb-3">
                      <AlertCircle className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm text-muted-foreground/60">
                      {activeView === "search"
                        ? "No questions found. Try a different search."
                        : "Select a topic to view interview questions."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5 p-3 md:p-3">
                    {currentQuestions.map((q, idx) => (
                      <Card
                        key={idx}
                        className={`group/card cursor-pointer transition-all duration-300 ease-out border border-border/30 bg-card/40 backdrop-blur-sm hover:bg-card/70 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-[1px] ${
                          selectedQuestion?.question === q.question
                            ? "border-primary/60 bg-primary/5 shadow-md shadow-primary/10 ring-1 ring-primary/20"
                            : ""
                          }`}
                        onClick={() => setSelectedQuestion(q)}
                      >
                        <CardContent className="p-4">
                          <div className="space-y-2.5">
                            <p className="text-sm font-medium line-clamp-2 group-hover/card:text-foreground transition-colors">{q.question}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {q.topic && (
                                <Badge variant="secondary" className="text-[10px] bg-primary/8 text-primary/80 border-0">
                                  {q.topic}
                                </Badge>
                              )}
                              <span className="text-muted-foreground/60">{formatDate((q as any).updated_at)}</span>
                              {enhanced && (
                                <>
                                  {(q as any).source && (
                                    <Badge variant="outline" className="text-[10px] border-border/30 bg-card/50">
                                      {(q as any).source}
                                    </Badge>
                                  )}
                                  {(q as any).verification_status && (
                                    <Badge variant={(q as any).verification_status === "verified" ? "default" : "outline"} className="text-[10px]">
                                      {(q as any).verification_status}
                                    </Badge>
                                  )}
                                  {typeof (q as any).credibility_score === "number" && (
                                    <span className="text-[10px] tabular-nums text-muted-foreground/60">cred {(q as any).credibility_score.toFixed(2)}</span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Selected Question Answer - Mobile optimized view */}
        {selectedQuestion && (
          <div className="flex md:hidden flex-1 flex-col overflow-hidden animate-in slide-in-from-right duration-300">
            <Card className="flex-1 flex flex-col overflow-hidden border-primary/20 bg-card/50 backdrop-blur-xl">
              <CardHeader className="pb-3 flex-shrink-0 border-b border-border/10">
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedQuestion(null)}
                    className="h-8 px-2 -ml-2 text-primary gap-1"
                  >
                    <X className="h-4 w-4" />
                    Back
                  </Button>
                  <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tighter">Answer View</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => setIsAnswerExpanded(true)}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 p-0">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-6 pb-20">
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/70 mb-2">Question</h3>
                      <p className="text-base font-medium text-foreground leading-snug">{selectedQuestion.question}</p>
                    </div>
                    <div className="border-t border-border/30 pt-4">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/70 mb-3">Model Answer</h3>
                      <div
                        className="text-sm text-foreground leading-relaxed prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{
                          __html: formatAnswerMarkdown(selectedQuestion.answer || '')
                        }}
                      />
                    </div>
                    {/* Display code_solution if available */}
                    {(selectedQuestion as any).code_solution && (
                      <div className="border-t border-border/30 pt-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/70 mb-3">Code Implementation</h3>
                        <div
                          className="text-sm text-foreground leading-relaxed prose prose-sm max-w-none dark:prose-invert"
                          dangerouslySetInnerHTML={{
                            __html: formatAnswerMarkdown((selectedQuestion as any).code_solution)
                          }}
                        />
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Selected Question Answer - Desktop view — Premium elevated panel */}
        {selectedQuestion && (
          <div className="hidden md:flex w-[50%] min-w-[320px] flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-500">
            <Card className="flex-1 flex flex-col overflow-hidden bg-card/40 backdrop-blur-xl border-border/30 shadow-xl shadow-black/5 ring-1 ring-white/[0.03]">
              <CardHeader className="pb-3 flex-shrink-0 border-b border-border/10">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.4)]" />
                    Answer
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:bg-muted/50 rounded-lg transition-all"
                      onClick={() => {
                        const text = selectedQuestion.question + '\n\n' + (selectedQuestion.answer || '');
                        navigator.clipboard.writeText(text);
                        setAnswerCopied(true);
                        setTimeout(() => setAnswerCopied(false), 2000);
                      }}
                      title="Copy answer"
                    >
                      {answerCopied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:bg-muted/50 rounded-lg transition-all"
                      onClick={() => setIsAnswerExpanded(true)}
                      title="Expand answer"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-5 space-y-5">
                    <div className="p-4 rounded-xl bg-muted/5 border border-border/10">
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary/60 mb-2">Question</h3>
                      <p className="text-sm font-medium text-foreground leading-relaxed">{selectedQuestion.question}</p>
                      {selectedQuestion.topic && (
                        <Badge variant="secondary" className="mt-2 text-[10px] bg-primary/8 text-primary/70 border-0">{selectedQuestion.topic}</Badge>
                      )}
                    </div>
                    <div>
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary/60 mb-3">Answer</h3>
                      <div
                        className="text-sm text-foreground leading-relaxed prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{
                          __html: formatAnswerMarkdown(selectedQuestion.answer || '')
                        }}
                      />
                    </div>
                    {(selectedQuestion as any).code_solution && (
                      <div className="border-t border-border/10 pt-5">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary/60 mb-3">Code Solution</h3>
                        <div
                          className="text-sm text-foreground leading-relaxed prose prose-sm max-w-none dark:prose-invert"
                          dangerouslySetInnerHTML={{
                            __html: formatAnswerMarkdown((selectedQuestion as any).code_solution)
                          }}
                        />
                      </div>
                    )}
                    {selectedQuestion.source && (
                      <div className="border-t border-border/10 pt-4">
                        <p className="text-xs text-muted-foreground/60">
                          Source: <span className="font-mono text-muted-foreground/80">{selectedQuestion.source}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Expanded Answer Dialog */}
            <Dialog open={isAnswerExpanded} onOpenChange={setIsAnswerExpanded}>
              <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90vh] flex flex-col p-0 border-border/20 bg-background/95 backdrop-blur-2xl shadow-2xl ring-1 ring-white/[0.05]">
                <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/10">
                  <DialogTitle className="text-lg font-semibold pr-8 flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.4)]" />
                    Question & Answer
                  </DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto px-6 pb-6 scrollbar-hide">
                  <div className="space-y-6">
                    <div className="p-5 rounded-xl bg-muted/5 border border-border/10">
                      <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary/70 mb-3">Question</h3>
                      <p className="text-base text-foreground leading-relaxed">{selectedQuestion.question}</p>
                      {selectedQuestion.topic && (
                        <Badge variant="secondary" className="mt-3 text-[10px] bg-primary/8 text-primary/70 border-0">
                          {selectedQuestion.topic}
                        </Badge>
                      )}
                    </div>

                    <div className="border-t border-border/10 pt-6">
                      <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary/70 mb-3">Answer</h3>
                      <div
                        className="text-base text-foreground leading-relaxed prose prose-base max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{
                          __html: formatAnswerMarkdown(selectedQuestion.answer || '')
                        }}
                      />
                    </div>

                    {(selectedQuestion as any).code_solution && (
                      <div className="border-t border-border/10 pt-6">
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary/70 mb-3">Code Solution</h3>
                        <div
                          className="text-base text-foreground leading-relaxed prose prose-base max-w-none dark:prose-invert"
                          dangerouslySetInnerHTML={{
                            __html: formatAnswerMarkdown((selectedQuestion as any).code_solution)
                          }}
                        />
                      </div>
                    )}

                    {selectedQuestion.source && (
                      <div className="border-t border-border/10 pt-6">
                        <p className="text-sm text-muted-foreground/60">
                          Source: <span className="font-mono text-muted-foreground/80">{selectedQuestion.source}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </div>
  );
};