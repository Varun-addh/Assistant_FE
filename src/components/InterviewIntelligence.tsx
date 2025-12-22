import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, RefreshCw, BookOpen, Loader2, AlertCircle, History as HistoryIcon, Trash2, X, Maximize2 } from "lucide-react";
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
  intelligenceFeatureDefaults,
  intelligenceFeatureGates,
} from "@/lib/intelligenceConfig";

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
  // Advanced controls hidden by default to reduce UI clutter
  const [showAdvancedControls, setShowAdvancedControls] = useState<boolean>(false);
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
  }, []);

  const loadHistoryTabs = useCallback(async (opts?: { silent?: boolean }) => {
    // This now just triggers the parent's refresh
    onHistoryRefresh?.();
  }, [onHistoryRefresh]);

  const [historyDeletingTabId, setHistoryDeletingTabId] = useState<string | null>(null);
  const [historyClearingAll, setHistoryClearingAll] = useState<boolean>(false);

  const handleLoadHistoryTab = useCallback((tab: HistoryTabSummary) => {
    setSearchQuery(tab.query);
    setLastSubmittedQuery(tab.query);
    setSearchResults((tab.questions as unknown as InterviewQuestion[]) || []);
    setActiveView("search");
    setSelectedHistoryTabId(tab.tab_id);
    setSelectedQuestion((tab.questions?.[0] as InterviewQuestion) || null);
    // Don't trigger a new search when loading from history - just display the saved results
  }, []);

  const handleDeleteHistoryTab = useCallback(async (tabId: string) => {
    const confirmed = window.confirm("Delete this search history entry?");
    if (!confirmed) return;
    setHistoryDeletingTabId(tabId);
    try {
      await apiDeleteHistoryTab(tabId);
      // Parent should handle state update
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
    } finally {
      setHistoryDeletingTabId(null);
    }
  }, [selectedHistoryTabId, toast]);

  const handleDeleteAllHistory = useCallback(async () => {
    const confirmed = window.confirm("Delete ALL saved searches? This cannot be undone.");
    if (!confirmed) return;
    const doubleConfirmed = window.confirm("Are you absolutely sure? This action is permanent.");
    if (!doubleConfirmed) return;
    setHistoryClearingAll(true);
    try {
      const result = await apiDeleteAllHistory();
      // Parent should handle state update
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
    } finally {
      setHistoryClearingAll(false);
    }
  }, [toast]);

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
      setSearchLoading(true);
      setSearchStatus('analyzing');
      setStatusSources([]); // Will be populated dynamically from source_update messages
      setActiveView("search");
      setLastSubmittedQuery(query);
      setSearchResults([]); // Clear previous results

      // Determine WebSocket URL based on current API URL
      const apiUrl = import.meta.env.VITE_API_URL || 'https://intvmate-interview-assistant.hf.space';
      const wsUrl = apiUrl.replace(/^http/, 'ws') + '/api/intelligence/ws/search';

      const ws = new WebSocket(wsUrl);

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
        // Fallback to HTTP
        handleSearchWithHTTP(query, forceRefresh);
      };

      ws.onclose = () => {
        console.log('[Intelligence] WebSocket closed');
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
    <div className="flex flex-col h-full gap-4">
      {/* Header with Search */}
      <div className="flex-shrink-0 space-y-3">
        {/* Search Bar Row */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search interview questions..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  // Always fetch fresh results first
                  handleSearch(searchQuery, true);
                }
              }}
              className="pl-9 pr-8"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedQuestion(null);
                }}
                title="Clear search"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          <Button
            variant="default"
            size="sm"
            onClick={() => handleSearch(searchQuery, true)}
            disabled={!searchQuery.trim()}
            title="Send search"
            className="shrink-0"
          >
            {searchLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Search className="h-4 w-4 mr-1" />
                Send
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={handleTriggerUpdate}
            title="Trigger database update"
            className="shrink-0"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Controls Row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Enhanced mode toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Enhanced</span>
            <Switch
              checked={enhanced}
              onCheckedChange={(checked) => {
                if (checked !== enhanced) {
                  const confirmed = window.confirm(
                    'Enhanced Search uses verified sources and advanced filters to improve result quality. Continue?'
                  );
                  if (!confirmed) return;
                }
                setEnhanced(checked);
              }}
              disabled={searchLoading}
            />
          </div>

          {/* Limit selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Limit</span>
            <Input
              type="number"
              min="1"
              max="100"
              value={limit}
              onChange={(e) => {
                const value = e.target.value;
                // Allow empty string for manual typing
                if (value === '') {
                  setLimit(1);
                  return;
                }
                const num = parseInt(value, 10);
                if (!isNaN(num) && num >= 1 && num <= 100) {
                  setLimit(num);
                }
              }}
              onBlur={(e) => {
                // Ensure valid value on blur
                const value = e.target.value;
                if (value === '' || parseInt(value, 10) < 1) {
                  setLimit(1);
                } else if (parseInt(value, 10) > 100) {
                  setLimit(100);
                }
              }}
              className="h-9 w-[80px] text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="1-100"
            />
          </div>

          {/* Enhanced filters - show when enhanced mode is on */}
          {enhanced && (
            <>
              {/* Verified only */}
              <div className="flex items-center gap-2">
                <Switch checked={verifiedOnly} onCheckedChange={setVerifiedOnly} />
                <span className="text-xs">Verified only</span>
              </div>

              {/* Min credibility slider */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Min credibility</span>
                <div className="w-32">
                  <Slider
                    min={0}
                    max={1}
                    step={0.1}
                    value={[minCred]}
                    onValueChange={(v) => setMinCred(Math.max(0, Math.min(1, v?.[0] ?? 0)))}
                  />
                </div>
                <span className="text-xs tabular-nums w-8">{minCred.toFixed(1)}</span>
              </div>

              {/* Company select */}
              <Select
                value={company ?? "_any"}
                onValueChange={(v) => setCompany(v === "_any" ? null : v)}
              >
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue placeholder="Any company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_any">Any company</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.name}{c.question_count ? ` (${c.question_count})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Show advanced toggle */}
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                onClick={() => setShowAdvancedControls((s) => !s)}
              >
                {showAdvancedControls ? 'Hide advanced' : 'Show advanced'}
              </button>
            </>
          )}
        </div>

        {/* Advanced controls - show when enabled */}
        {enhanced && showAdvancedControls && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch checked={refreshEnhanced} onCheckedChange={setRefreshEnhanced} />
              <span className="text-xs">Refresh</span>
            </div>
            {featureGates.reranking && (
              <div className="flex items-center gap-2">
                <Switch checked={enableReranking} onCheckedChange={setEnableReranking} />
                <span className="text-xs">Rerank</span>
              </div>
            )}
            {featureGates.queryExpansion && (
              <div className="flex items-center gap-2">
                <Switch checked={enableQueryExpansion} onCheckedChange={setEnableQueryExpansion} />
                <span className="text-xs">Query expansion</span>
              </div>
            )}
          </div>
        )}

        {/* Enhanced realtime status (shows while an enhanced search is running) */}
        {enhanced && (searchLoading || searchStatus !== 'idle') && (
          <div className="w-full">
            <div role="status" aria-live="polite" className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="font-medium">Search:</span>
              <span className="capitalize">{searchStatus}</span>
              {searchLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-2 mt-2">
              {statusSources.map((s) => (
                <div key={s.name} className="text-xs px-2 py-1 rounded bg-muted/10 border border-muted/20">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-muted-foreground">{s.status}{s.count ? ` • ${s.count}` : ''}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Topics Pills */}
        {topics.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {topics.map((topic) => (
              <Badge
                key={topic}
                variant={selectedTopic === topic ? "default" : "outline"}
                className="cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => loadQuestionsByTopic(topic)}
              >
                {topic}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-hidden">
          {/* Questions List */}
          <Card className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <CardHeader className="pb-3 flex-shrink-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                {activeView === "search" ? (
                  <>Search Results {searchLoading && <Loader2 className="h-3 w-3 animate-spin" />}</>
                ) : selectedTopic ? (
                  <>{selectedTopic} Questions {loading && <Loader2 className="h-3 w-3 animate-spin" />}</>
                ) : (
                  <>Select a topic to view questions</>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
              <ScrollArea className="h-full">
                {/* Trust warning for non-enhanced mode when verified ratio is low */}
                {!enhanced && activeView === "search" && Array.isArray(currentQuestions) && currentQuestions.length > 0 && (
                  (() => {
                    const results = currentQuestions as unknown as EnhancedQuestion[];
                    const total = results.length;
                    const verifiedCount = results.filter(r => (r.verification_status === "verified") || r.source_type === "verified").length;
                    const ratio = total > 0 ? verifiedCount / total : 0;
                    if (ratio < 0.5) {
                      return (
                        <div className="mx-3 my-2 p-2 rounded border border-amber-300 bg-amber-50 text-amber-900 text-xs">
                          Verified results are below 50%. Consider enabling Enhanced mode, Verified only, selecting a company, or raising the credibility threshold.
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
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {activeView === "search"
                        ? "No questions found. Try a different search."
                        : "Select a topic to view interview questions."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 p-3">
                    {currentQuestions.map((q, idx) => (
                      <Card
                        key={idx}
                        className={`cursor-pointer transition-all hover:border-primary/50 ${selectedQuestion?.question === q.question ? "border-primary bg-primary/5" : ""
                          }`}
                        onClick={() => setSelectedQuestion(q)}
                      >
                        <CardContent className="p-4">
                          <div className="space-y-2">
                            <p className="text-sm font-medium line-clamp-2">{q.question}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {q.topic && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {q.topic}
                                </Badge>
                              )}
                              <span>{formatDate((q as any).updated_at)}</span>
                              {/* Enhanced badges */}
                              {enhanced && (
                                <>
                                  {(q as any).source && (
                                    <Badge variant="outline" className="text-[10px]">
                                      {(q as any).source}
                                    </Badge>
                                  )}
                                  {(q as any).verification_status && (
                                    <Badge variant={(q as any).verification_status === "verified" ? "default" : "outline"} className="text-[10px]">
                                      {(q as any).verification_status}
                                    </Badge>
                                  )}
                                  {typeof (q as any).credibility_score === "number" && (
                                    <span className="text-[10px]">cred {(q as any).credibility_score.toFixed(2)}</span>
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

        {/* Selected Question Answer */}
        {selectedQuestion && (
          <>
            <Card className="w-[50%] min-w-[400px] flex flex-col overflow-hidden">
              <CardHeader className="pb-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Answer</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setIsAnswerExpanded(true)}
                    title="Expand answer"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Question</h3>
                      <p className="text-sm text-foreground">{selectedQuestion.question}</p>
                    </div>
                    <div className="border-t pt-4">
                      <h3 className="text-sm font-semibold mb-2">Answer</h3>
                      <div
                        className="text-sm text-foreground leading-relaxed prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{
                          __html: formatAnswerMarkdown(selectedQuestion.answer || '')
                        }}
                      />
                    </div>
                    {/* Display code_solution if available */}
                    {(selectedQuestion as any).code_solution && (
                      <div className="border-t pt-4">
                        <h3 className="text-sm font-semibold mb-2">Code Solution</h3>
                        <div
                          className="text-sm text-foreground leading-relaxed prose prose-sm max-w-none dark:prose-invert"
                          dangerouslySetInnerHTML={{
                            __html: formatAnswerMarkdown((selectedQuestion as any).code_solution)
                          }}
                        />
                      </div>
                    )}
                    {selectedQuestion.source && (
                      <div className="border-t pt-4">
                        <p className="text-xs text-muted-foreground">
                          Source: <span className="font-mono">{selectedQuestion.source}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Expanded Answer Dialog */}
            <Dialog open={isAnswerExpanded} onOpenChange={setIsAnswerExpanded}>
              <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
                <DialogHeader className="px-6 pt-6 pb-4">
                  <DialogTitle className="text-lg font-semibold pr-8">Question & Answer</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto px-6 pb-6 scrollbar-hide">
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-base font-semibold mb-3 text-primary">Question</h3>
                      <p className="text-base text-foreground leading-relaxed">{selectedQuestion.question}</p>
                      {selectedQuestion.topic && (
                        <Badge variant="secondary" className="mt-2">
                          {selectedQuestion.topic}
                        </Badge>
                      )}
                    </div>

                    <div className="border-t pt-6">
                      <h3 className="text-base font-semibold mb-3 text-primary">Answer</h3>
                      <div
                        className="text-base text-foreground leading-relaxed prose prose-base max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{
                          __html: formatAnswerMarkdown(selectedQuestion.answer || '')
                        }}
                      />
                    </div>

                    {/* Display code_solution if available */}
                    {(selectedQuestion as any).code_solution && (
                      <div className="border-t pt-6">
                        <h3 className="text-base font-semibold mb-3 text-primary">Code Solution</h3>
                        <div
                          className="text-base text-foreground leading-relaxed prose prose-base max-w-none dark:prose-invert"
                          dangerouslySetInnerHTML={{
                            __html: formatAnswerMarkdown((selectedQuestion as any).code_solution)
                          }}
                        />
                      </div>
                    )}

                    {selectedQuestion.source && (
                      <div className="border-t pt-6">
                        <p className="text-sm text-muted-foreground">
                          Source: <span className="font-mono">{selectedQuestion.source}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </div>
  );
};