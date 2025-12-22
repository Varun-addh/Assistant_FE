import { useEffect, useState, useRef } from "react";
import { SearchBar } from "./SearchBar";
import { AnswerCard } from "./AnswerCard";
import { MockInterviewMode } from "./MockInterviewMode";
import { PracticeMode } from "./PracticeMode";
import { InterviewIntelligence } from "./InterviewIntelligence";
import { ThemeToggle } from "./ThemeToggle";
import { MessageSquare, MoreVertical, Trash2, Menu, X, History as HistoryIcon, RefreshCw, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { apiCreateSession, apiSubmitQuestion, apiGetHistory, apiGetSessions, apiDeleteHistoryItemByIndex, apiGetHistoryTabs, apiDeleteHistoryTab, apiDeleteAllHistory, type AnswerStyle, type SessionSummary, type GetHistoryResponse, type HistoryTabSummary, type HistoryItem } from "@/lib/api";
import { apiGetMockInterviewHistory, apiDeleteMockInterviewSession, apiDeleteAllMockInterviewSessions, type MockInterviewHistorySession } from "@/lib/mockInterviewApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { startEvaluationOverlay } from "@/overlayHost";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BYOKOnboarding } from "./BYOKOnboarding";
import { ApiKeySettings } from "./ApiKeySettings";
import { AnimatePresence } from "framer-motion";
import { Key, Settings } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InterviewAssistant = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [evaluationAllowed, setEvaluationAllowed] = useState<boolean | null>(null);
  const [evaluationReason, setEvaluationReason] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [style, setStyle] = useState<AnswerStyle>("detailed");
  const [resetToken, setResetToken] = useState(0);
  const [lastQuestion, setLastQuestion] = useState("");
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [history, setHistory] = useState<GetHistoryResponse | null>(null);
  const [viewingHistory, setViewingHistory] = useState(false);
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<"answer" | "intelligence" | "mock-interview" | "practice">("answer");

  // Intelligence history state (only for intelligence tab)
  const [intelligenceHistoryTabs, setIntelligenceHistoryTabs] = useState<HistoryTabSummary[]>(() => {
    try {
      const cached = window.localStorage.getItem('intelligence_history_cache');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [intelligenceHistoryLoading, setIntelligenceHistoryLoading] = useState<boolean>(false);
  const [intelligenceHistoryRefreshing, setIntelligenceHistoryRefreshing] = useState<boolean>(false);
  const [intelligenceHistoryError, setIntelligenceHistoryError] = useState<string | null>(null);
  const [intelligenceHistoryDeletingTabId, setIntelligenceHistoryDeletingTabId] = useState<string | null>(null);
  const [intelligenceHistoryClearingAll, setIntelligenceHistoryClearingAll] = useState<boolean>(false);
  const [selectedIntelligenceHistoryTabId, setSelectedIntelligenceHistoryTabId] = useState<string | null>(null);
  const [pendingIntelligenceHistorySelection, setPendingIntelligenceHistorySelection] = useState<{ tab?: HistoryTabSummary; type?: 'select' | 'clear'; ts: number } | null>(null);

  // Mock Interview history state (only for mock interview tab)
  const [mockInterviewSessions, setMockInterviewSessions] = useState<MockInterviewHistorySession[]>([]);
  const [mockInterviewHistoryLoading, setMockInterviewHistoryLoading] = useState<boolean>(false);
  const [mockInterviewHistoryError, setMockInterviewHistoryError] = useState<string | null>(null);
  const [selectedMockSession, setSelectedMockSession] = useState<MockInterviewHistorySession | null>(null);
  const [mockInterviewDeletingSessionId, setMockInterviewDeletingSessionId] = useState<string | null>(null);
  const [mockInterviewClearingAll, setMockInterviewClearingAll] = useState<boolean>(false);

  // Versioning for edit-and-compare flow
  const [originalQA, setOriginalQA] = useState<{ q: string; a: string } | null>(null);
  const [latestQA, setLatestQA] = useState<{ q: string; a: string } | null>(null);
  const [currentVersion, setCurrentVersion] = useState<0 | 1>(0); // 0 original, 1 latest
  const [isEditingFromAnswer, setIsEditingFromAnswer] = useState(false);
  const [pendingEditedQuestion, setPendingEditedQuestion] = useState<string | null>(null);
  const [isNavigatingVersion, setIsNavigatingVersion] = useState(false);

  const [showKeyOnboarding, setShowKeyOnboarding] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    const key = localStorage.getItem("user_api_key");
    const isDev = import.meta.env.DEV;

    if (!key && !isDev) {
      // Always redirect to landing page if no API key is found
      window.location.href = "/";
      return;
    }

    setHasApiKey(!!key || isDev);
  }, []);

  const handleDeleteHistory = async (idx: number) => {
    try {
      if (sessionId == null || sessionId === "") return;
      // Get the item before deleting so we can remove it from archive
      const item = history?.items?.[idx];
      if (!item) return;

      // Optimistically remove from UI immediately (better UX)
      setHistory((prev) => {
        const items = prev?.items || [];
        const filtered = items.filter((_, i) => i !== idx);
        return { session_id: sessionId, items: filtered } as any;
      });

      // Remove from archive immediately (remove ALL matches for this question to handle duplicates)
      try {
        const archiveKey = `ia_history_archive_${sessionId}`;
        const raw = window.localStorage.getItem(archiveKey);
        if (raw) {
          const items = JSON.parse(raw) as Array<{ question: string; answer: string; ts: number }>;
          // Remove ALL entries with matching question (handles duplicates and incomplete entries)
          const cleaned = items.filter(x => x.question !== item.question);
          window.localStorage.setItem(archiveKey, JSON.stringify(cleaned));
        }
      } catch {
        // Ignore localStorage errors
      }

      // If the deleted item was currently displayed, clear answer view
      if (lastQuestion === item.question && answer === item.answer) {
        setShowAnswer(false);
        setAnswer("");
        setLastQuestion("");
        setViewingHistory(false);
        try {
          window.localStorage.removeItem('ia_last_question');
          window.localStorage.removeItem('ia_last_answer');
          window.localStorage.setItem('ia_show_answer', 'false');
        } catch {
          // Ignore localStorage errors
        }
      }

      // Then delete from server (non-blocking)
      try {
        await apiDeleteHistoryItemByIndex({ session_id: sessionId, index: idx });
        // Reliance on optimistic update is sufficient and avoids "flash of empty content"
        // if the backend returns incomplete data immediately after delete.
      } catch (e) {
        console.error('[api] delete history error', e);
        // On error, keep optimistic UI update (already removed above)
      }
    } catch (e) {
      console.error('[api] delete history error', e);
    } finally {
      setOpenMenuIndex(null);
      setMenuPos(null);
    }
  };

  const ensureSession = async (opts?: { forceNew?: boolean }): Promise<string> => {
    const forceNew = !!opts?.forceNew;
    if (!forceNew && sessionId) return sessionId;
    const stored = !forceNew && typeof window !== 'undefined' ? window.localStorage.getItem("ia_session_id") : null;
    if (!forceNew && stored) {
      setSessionId(stored);
      return stored;
    }
    const s = await apiCreateSession();
    setSessionId(s.session_id);
    try { window.localStorage.setItem("ia_session_id", s.session_id); } catch {
      // Ignore localStorage errors
    }
    return s.session_id;
  };

  // Intelligence history handlers
  const loadIntelligenceHistoryTabs = async (opts?: { silent?: boolean }) => {
    setIntelligenceHistoryError(null);
    if (opts?.silent) {
      setIntelligenceHistoryRefreshing(true);
    } else {
      setIntelligenceHistoryLoading(true);
    }
    try {
      const data = await apiGetHistoryTabs({
        limit: 50,
        sort_by: "created_at",
        ascending: false,
      });
      if (Array.isArray(data?.tabs)) {
        console.log('[InterviewAssistant] History tabs loaded:', data.tabs.map(t => ({
          tab_id: t.tab_id,
          query: t.query,
          question_count: t.question_count,
          metadata: t.metadata,
          enhanced: t.metadata?.enhanced
        })));
        console.log('[InterviewAssistant] Total tabs loaded:', data.tabs.length);
        setIntelligenceHistoryTabs(data.tabs);
        // Persist to localStorage
        try {
          window.localStorage.setItem('intelligence_history_cache', JSON.stringify(data.tabs));
        } catch (e) {
          console.warn("[InterviewAssistant] Failed to cache intelligence history", e);
        }
      } else {
        setIntelligenceHistoryTabs([]);
      }
    } catch (err: unknown) {
      const message = (err as Error)?.message || "Failed to load search history.";
      if (!message.includes("404") && !opts?.silent) {
        setIntelligenceHistoryError(message);
      } else {
        setIntelligenceHistoryTabs([]);
      }
    } finally {
      setIntelligenceHistoryLoading(false);
      setIntelligenceHistoryRefreshing(false);
    }
  };

  const handleDeleteIntelligenceHistoryTab = async (tabId: string) => {
    const confirmed = window.confirm("Delete this search history entry?");
    if (!confirmed) return;
    setIntelligenceHistoryDeletingTabId(tabId);
    try {
      await apiDeleteHistoryTab(tabId);
      setIntelligenceHistoryTabs((prev) => {
        const filtered = prev.filter((tab) => tab.tab_id !== tabId);
        // If the deleted tab was selected, select the first remaining tab or clear selection
        if (selectedIntelligenceHistoryTabId === tabId) {
          if (filtered.length > 0) {
            setSelectedIntelligenceHistoryTabId(filtered[0].tab_id);
            // Navigate to the next available tab
            setPendingIntelligenceHistorySelection({ tab: filtered[0], type: 'select', ts: Date.now() });
          } else {
            setSelectedIntelligenceHistoryTabId(null);
            // Clear the view since no tabs remain
            setPendingIntelligenceHistorySelection({ type: 'clear', ts: Date.now() });
          }
        }
        return filtered;
      });
      toast({
        title: "History entry deleted",
        description: "The saved search has been removed.",
      });
    } catch (err: unknown) {
      toast({
        title: "Failed to delete history",
        description: (err as Error)?.message || "Could not remove saved search.",
        variant: "destructive",
      });
    } finally {
      setIntelligenceHistoryDeletingTabId(null);
    }
  };

  const handleDeleteAllIntelligenceHistory = async () => {
    const confirmed = window.confirm("Delete ALL saved searches? This cannot be undone.");
    if (!confirmed) return;
    const doubleConfirmed = window.confirm("Are you absolutely sure? This action is permanent.");
    if (!doubleConfirmed) return;
    setIntelligenceHistoryClearingAll(true);
    try {
      const result = await apiDeleteAllHistory();
      setIntelligenceHistoryTabs([]);
      setSelectedIntelligenceHistoryTabId(null);
      toast({
        title: "History cleared",
        description: result?.message || "All saved searches were deleted.",
      });
    } catch (err: unknown) {
      toast({
        title: "Failed to clear history",
        description: (err as Error)?.message || "Could not delete saved searches.",
        variant: "destructive",
      });
    } finally {
      setIntelligenceHistoryClearingAll(false);
    }
  };

  const handleSelectIntelligenceHistoryTab = (tab: HistoryTabSummary) => {
    setSelectedIntelligenceHistoryTabId(tab.tab_id);
    setPendingIntelligenceHistorySelection({ tab, type: 'select', ts: Date.now() });
  };

  // Mock Interview history handlers
  const loadMockInterviewHistory = async () => {
    setMockInterviewHistoryError(null);
    setMockInterviewHistoryLoading(true);
    try {
      // Get userId from localStorage
      const userId = localStorage.getItem("mock_interview_user_id");
      console.log("[MockHistory] Loading history for userId:", userId);
      if (!userId) {
        setMockInterviewSessions([]);
        return;
      }

      // Try to load from localStorage first (for offline access and evaluations)
      let cachedSessions: MockInterviewHistorySession[] = [];
      try {
        const cached = localStorage.getItem(`mock_interview_history_${userId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            console.log("[MockHistory] Loaded from cache:", parsed);
            cachedSessions = parsed;
            setMockInterviewSessions(parsed);
          }
        }
      } catch {
        // Ignore cache errors
      }

      // Then fetch from API to get latest sessions
      console.log("[MockHistory] Fetching from API...");
      const data = await apiGetMockInterviewHistory(userId);
      console.log("[MockHistory] API response:", data);

      if (Array.isArray(data?.sessions)) {
        console.log("[MockHistory] Merging API sessions with cached evaluations...");
        console.log("[MockHistory] Cached sessions count:", cachedSessions.length);
        console.log("[MockHistory] API sessions count:", data.sessions.length);

        // Merge: Use API data but preserve evaluations from cache if API doesn't have them
        const mergedSessions = data.sessions.map((apiSession: MockInterviewHistorySession) => {
          // Find matching session in cache
          const cachedSession = cachedSessions.find(c => c.session_id === apiSession.session_id);

          console.log(`[MockHistory] Processing session ${apiSession.session_id}:`);
          console.log(`  - API has evaluations:`, apiSession.evaluations?.length || 0);
          console.log(`  - Cache found:`, !!cachedSession);
          console.log(`  - Cache has evaluations:`, cachedSession?.evaluations?.length || 0);

          // If API session lacks evaluations but cache has them, use cache evaluations
          if ((!apiSession.evaluations || apiSession.evaluations.length === 0) &&
            cachedSession?.evaluations && cachedSession.evaluations.length > 0) {
            console.log(`  ✅ Using cached evaluations (${cachedSession.evaluations.length} items)`);
            return { ...apiSession, evaluations: cachedSession.evaluations };
          }

          console.log(`  ❌ No cached evaluations to merge`);
          return apiSession;
        });

        console.log("[MockHistory] Merged sessions:", mergedSessions);
        console.log("[MockHistory] Setting merged sessions (count):", mergedSessions.length);
        setMockInterviewSessions(mergedSessions);

        // Cache merged data to localStorage
        try {
          localStorage.setItem(`mock_interview_history_${userId}`, JSON.stringify(mergedSessions));
        } catch {
          // Ignore localStorage errors
        }
      } else if (cachedSessions.length > 0) {
        // If API fails but we have cache, use cache
        console.log("[MockHistory] API returned no sessions, using cache only");
        setMockInterviewSessions(cachedSessions);
      } else {
        console.log("[MockHistory] No sessions found");
        setMockInterviewSessions([]);
      }
    } catch (err: unknown) {
      console.error("[MockHistory] Error loading history:", err);
      const message = (err as Error)?.message || "Failed to load mock interview history.";
      if (!message.includes("404")) {
        setMockInterviewHistoryError(message);
      } else {
        setMockInterviewSessions([]);
      }
    } finally {
      setMockInterviewHistoryLoading(false);
    }
  };

  const handleDeleteMockInterviewSession = async (sessionId: string) => {
    const confirmed = window.confirm("Delete this interview session?");
    if (!confirmed) return;
    setMockInterviewDeletingSessionId(sessionId);
    try {
      const userId = localStorage.getItem("mock_interview_user_id");
      if (!userId) {
        throw new Error("User ID not found");
      }
      await apiDeleteMockInterviewSession(userId, sessionId);
      setMockInterviewSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      if (selectedMockSession?.session_id === sessionId) {
        setSelectedMockSession(null);
      }
      // Update localStorage cache
      try {
        const updated = (mockInterviewSessions as MockInterviewHistorySession[]).filter((s) => s.session_id !== sessionId);
        localStorage.setItem(`mock_interview_history_${userId}`, JSON.stringify(updated));
      } catch {
        // Ignore localStorage errors
      }
      toast({
        title: "Session deleted",
        description: "The interview session has been removed.",
      });
    } catch (err: unknown) {
      toast({
        title: "Failed to delete session",
        description: (err as Error)?.message || "Could not remove interview session.",
        variant: "destructive",
      });
    } finally {
      setMockInterviewDeletingSessionId(null);
    }
  };

  const handleDeleteAllMockInterviewSessions = async () => {
    const confirmed = window.confirm("Delete ALL interview sessions? This cannot be undone.");
    if (!confirmed) return;
    const doubleConfirmed = window.confirm("Are you absolutely sure? This action is permanent.");
    if (!doubleConfirmed) return;
    setMockInterviewClearingAll(true);
    try {
      const userId = localStorage.getItem("mock_interview_user_id");
      if (!userId) {
        throw new Error("User ID not found");
      }
      const result = await apiDeleteAllMockInterviewSessions(userId);
      setMockInterviewSessions([]);
      setSelectedMockSession(null);
      // Clear localStorage cache
      try {
        localStorage.removeItem(`mock_interview_history_${userId}`);
      } catch {
        // Ignore localStorage errors
      }
      toast({
        title: "History cleared",
        description: result?.message || `Deleted ${result?.deleted_count || 0} sessions.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Failed to clear history",
        description: (err as Error)?.message || "Could not delete all sessions.",
        variant: "destructive",
      });
    } finally {
      setMockInterviewClearingAll(false);
    }
  };

  const handleSelectMockSession = (session: MockInterviewHistorySession) => {
    console.log("[MockHistory] Selecting session:", session.session_id);
    setSelectedMockSession(session);
    setActiveMainTab("mock-interview"); // Switch to Mock Interview tab
  };

  // Load intelligence history on initial mount and when switching to the tab
  useEffect(() => {
    // On mount, load if empty (even if not on intelligence tab yet, to populate sidebar)
    if (intelligenceHistoryTabs.length === 0 && !intelligenceHistoryLoading) {
      loadIntelligenceHistoryTabs({ silent: true });
    }
    // and also load when switching to the tab to ensure fresh data
    else if (activeMainTab === "intelligence" && !intelligenceHistoryRefreshing) {
      loadIntelligenceHistoryTabs({ silent: true });
    }
  }, [activeMainTab]); // Run when tab changes

  // Load mock interview history when mock interview tab is active
  useEffect(() => {
    if (activeMainTab === "mock-interview") {
      loadMockInterviewHistory();
    }
  }, [activeMainTab]);

  // Debug: Log when mockInterviewSessions changes
  useEffect(() => {
    console.log("[MockHistory] State updated - sessions count:", mockInterviewSessions.length);
    console.log("[MockHistory] State updated - sessions:", mockInterviewSessions);
  }, [mockInterviewSessions]);

  // Initialize session on mount to avoid race conditions
  useEffect(() => {
    (async () => {
      try {
        await ensureSession();
      } catch (e) {
        console.error("[session] init failed", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore last visible answer immediately on mount (UX: "return where you left off")
  useEffect(() => {
    try {
      const cachedQ = window.localStorage.getItem('ia_last_question') || '';
      const cachedA = window.localStorage.getItem('ia_last_answer') || '';
      const cachedShow = window.localStorage.getItem('ia_show_answer') === 'true';
      const cachedViewing = window.localStorage.getItem('ia_viewing_history') === 'true';
      // Only restore if we have a complete Q&A (not just question with empty answer)
      if (cachedShow && cachedQ && cachedA && cachedA.trim()) {
        setLastQuestion(cachedQ);
        // Ensure we mark this as a history view BEFORE setting the answer/show
        // so any mounted `AnswerCard` receives `streaming={false}` immediately
        // and won't start the typewriter animation due to render-order races.
        setViewingHistory(true);
        setAnswer(cachedA);
        setShowAnswer(true);
        setIsNavigatingVersion(false);
        // Also ensure restored Q&A appears in history sidebar
        const ensureInHistory = () => {
          setHistory((prev) => {
            const items = prev?.items || [];
            const exists = items.some(it => it.question === cachedQ && it.answer === cachedA);
            if (!exists && cachedQ && cachedA) {
              return {
                session_id: sessionId || '',
                items: [{
                  question: cachedQ,
                  answer: cachedA,
                  style: 'detailed' as AnswerStyle,
                  created_at: new Date().toISOString()
                }, ...items]
              } as GetHistoryResponse;
            }
            return prev;
          });
          // Also add to durable archive
          if (sessionId && cachedQ && cachedA) {
            try {
              const archiveKey = `ia_history_archive_${sessionId}`;
              const raw = window.localStorage.getItem(archiveKey);
              const list = raw ? (JSON.parse(raw) as Array<{ question: string; answer: string; ts: number }>) : [];
              const exists = list.some(x => x.question === cachedQ && x.answer === cachedA);
              if (!exists) {
                list.unshift({ question: cachedQ, answer: cachedA, ts: Date.now() });
                const CUTOFF = 1000;
                window.localStorage.setItem(archiveKey, JSON.stringify(list.slice(0, CUTOFF)));
              }
            } catch {
              // Ignore localStorage errors
            }
          }
        };
        ensureInHistory();
      }
    } catch {
      // Ignore errors in sidebar hydration
    }
  }, [sessionId]);

  // Load recent sessions for sidebar
  useEffect(() => {
    (async () => {
      try {
        // Restore cached sessions immediately for instant UI on return
        try {
          const raw = window.localStorage.getItem('ia_sessions_cache');
          if (raw) {
            const cached = JSON.parse(raw);
            if (Array.isArray(cached)) setSessions(cached);
          }
        } catch { }
        const s = await apiGetSessions();
        setSessions(s);
        console.log("[api] GET /api/sessions ->", s);
        try { window.localStorage.setItem('ia_sessions_cache', JSON.stringify(s)); } catch {
          // Ignore localStorage errors
        }
      } catch (e) {
        console.error("[api] sessions error", e);
      }
    })();
  }, []);

  // Capture install prompt and surface an Install action
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      try {
        toast({
          title: "Install available",
          description: "Install Interview Assistant as an app for a better mobile experience.",
        });
      } catch {
        // Ignore toast errors
      }
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [toast]);

  // Load history when sessionId available or reset token changes
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        // 0) Immediately hydrate from durable local archive so the sidebar isn't empty on return
        try {
          const archiveKey = `ia_history_archive_${sessionId}`;
          const rawArch = window.localStorage.getItem(archiveKey);
          if (rawArch) {
            const archived = JSON.parse(rawArch) as Array<{ question: string; answer: string; ts: number }>;
            if (Array.isArray(archived) && archived.length > 0) {
              // Filter out incomplete entries (empty answer) - these are failed optimistic inserts
              const complete = archived.filter(it => it.answer && it.answer.trim());
              if (complete.length > 0) {
                const items = complete.map(it => ({ question: it.question, answer: it.answer })) as any;
                setHistory({ session_id: sessionId, items } as any);
                // Update archive to remove incomplete entries
                if (complete.length !== archived.length) {
                  window.localStorage.setItem(archiveKey, JSON.stringify(complete));
                }
              }
            }
          }
        } catch { }

        // Preload history from cache while network fetch happens
        try {
          const rawCached = window.localStorage.getItem('ia_history_cache');
          if (rawCached) {
            const cached = JSON.parse(rawCached);
            if (cached?.sessionId === sessionId && cached?.data) setHistory(cached.data);
          }
        } catch { }
        const h = await apiGetHistory(sessionId);
        // Merge with durable local archive to ensure persistence even across outages
        let merged = h;
        try {
          const archiveKey = `ia_history_archive_${sessionId}`;
          const raw = window.localStorage.getItem(archiveKey);
          if (raw) {
            const archived = JSON.parse(raw) as Array<{ question: string; answer: string; ts: number }>;
            const serverItems = (h?.items || []).map(it => ({ question: it.question, answer: it.answer, ts: Date.now() }));
            const combined = [...archived, ...serverItems];
            // De-duplicate by question+answer
            const seen = new Set<string>();
            // Filter out incomplete entries (empty answer) and de-duplicate
            const unique = combined.filter(it => {
              // Skip incomplete entries (optimistic inserts that never got responses)
              if (!it.answer || !it.answer.trim()) return false;
              const key = `${it.question}\u0000${it.answer}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            // Sort by timestamp descending if available
            unique.sort((a, b) => (b.ts || 0) - (a.ts || 0));
            merged = { session_id: sessionId, items: unique.map(it => ({ question: it.question, answer: it.answer })) } as any;
            // Write back merged archive for durability
            window.localStorage.setItem(archiveKey, JSON.stringify(unique));
          }
        } catch { }
        setHistory(merged);
        console.log(`[api] GET /api/history/${sessionId} ->`, h);
        // Cache to survive transient reloads or quick route switches
        try { window.localStorage.setItem('ia_history_cache', JSON.stringify({ sessionId, data: h })); } catch {
          // Ignore localStorage errors
        }
      } catch (e) {
        console.error("[api] history error", e);
        // Fallback to cached history if network fails or session temporarily missing
        try {
          const raw = window.localStorage.getItem('ia_history_cache');
          if (raw) {
            const cached = JSON.parse(raw);
            if (cached?.sessionId) setHistory(cached.data);
          }
        } catch { }
      }
    })();
  }, [sessionId, resetToken]);

  // Persist the currently displayed card so navigating away and back restores it
  useEffect(() => {
    try {
      window.localStorage.setItem('ia_last_question', lastQuestion || '');
      window.localStorage.setItem('ia_last_answer', answer || '');
      window.localStorage.setItem('ia_show_answer', String(!!showAnswer));
      window.localStorage.setItem('ia_viewing_history', String(!!viewingHistory));
    } catch { }
  }, [lastQuestion, answer, showAnswer, viewingHistory]);

  // Fetch evaluation allowance when the lastQuestion or sessionId changes.
  useEffect(() => {
    let mounted = true;
    const localClassifier = (text: string) => {
      if (!text || !text.trim()) return { allowed: false, reason: 'No question provided.' };
      const low = text.toLowerCase();
      // conservative allow-list of technical keywords
      const techKeywords = ['implement', 'algorithm', 'time complexity', 'space complexity', 'optimize', 'data structure', 'dijkstra', 'two sum', 'leetcode', 'code', 'function', 'class', 'system design', 'architecture', 'design a', 'api', 'endpoint', 'sql', 'database', 'graph', 'tree', 'binary', 'search', 'sorting', 'merge', 'quick sort', 'dynamic programming'];
      const found = techKeywords.some(k => low.includes(k));
      if (found) return { allowed: true, reason: '' };
      return { allowed: false, reason: 'Evaluation is reserved for technical coding, algorithm, or system-design questions.' };
    };

    const check = async () => {
      if (!lastQuestion || !lastQuestion.trim()) {
        if (!mounted) return;
        setEvaluationAllowed(false);
        setEvaluationReason('No question to evaluate.');
        return;
      }

      // Try server-side check first
      try {
        const sid = sessionId || '';
        const q = encodeURIComponent(lastQuestion);
        const url = `/api/evaluate/allowed?session_id=${encodeURIComponent(sid)}&problem=${q}`;
        const res = await fetch(url, { method: 'GET' });
        if (!mounted) return;
        if (res.ok) {
          const body = await res.json();
          setEvaluationAllowed(Boolean(body?.allowed));
          setEvaluationReason(body?.reason || null);
          return;
        }
        // Non-OK: fall back to local classifier
      } catch (err) {
        // network or server error -> fallback
      }

      // Fallback local classifier
      try {
        const out = localClassifier(lastQuestion);
        if (!mounted) return;
        setEvaluationAllowed(Boolean(out.allowed));
        setEvaluationReason(out.reason || null);
      } catch (err) {
        if (!mounted) return;
        setEvaluationAllowed(false);
        setEvaluationReason('Could not determine evaluation allowance.');
      }
    };

    check();
    return () => { mounted = false; };
  }, [lastQuestion, sessionId]);

  // Close any open menu on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-history-item]') && !target.closest('[data-right-popover]')) {
        setOpenMenuIndex(null);
        setMenuPos(null);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // Close on resize (layout changes). Keep popover during scroll for stability
  useEffect(() => {
    const onResize = () => {
      if (openMenuIndex !== null && menuPos) {
        setOpenMenuIndex(null);
        setMenuPos(null);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [openMenuIndex, menuPos]);

  // Removed aggressive auto-scroll behavior to allow free scrolling

  const handleGenerateAnswer = async (overrideQuestion?: string) => {
    setIsNavigatingVersion(false);
    setViewingHistory(false);
    // Do not generate if user is viewing a saved history item
    if (viewingHistory) {
      console.log('[ui] Generation blocked while viewing history');
      return;
    }
    const currentQuestion = (overrideQuestion ?? question).trim();
    if (!currentQuestion) return;

    try {
      setIsGenerating(true);
      // Avoid jumping to the composer when editing inline
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { }
      // Clear previous UI and stop mic/input accumulation for the next turn
      // During inline edit, hide the previous card and show generating placeholder
      setAnswer("");
      setShowAnswer(true);
      if (!overrideQuestion) setQuestion("");
      setResetToken((t) => t + 1);
      setLastQuestion(currentQuestion);
      // Ensure session up-front so we can optimistically insert into history
      const sid = await ensureSession();
      // Optimistic history insert (empty answer until completion)
      setHistory((prev) => {
        const nowIso = new Date().toISOString();
        const items = prev?.items || [];
        const hasPending = items.some(it => it.question === currentQuestion && it.answer === '');
        const hasAnswered = items.some(it => it.question === currentQuestion && it.answer && it.answer.trim());

        const next: HistoryItem[] = hasPending || hasAnswered
          ? [...items]
          : [{ question: currentQuestion, answer: '', style, created_at: nowIso }];

        if (!hasPending && !hasAnswered) {
          next.push(...items);
        }

        return { session_id: sid, items: next } as GetHistoryResponse;
      });
      try {
        const archiveKey = `ia_history_archive_${sid}`;
        const raw = window.localStorage.getItem(archiveKey);
        const list = raw ? (JSON.parse(raw) as Array<{ question: string; answer: string; ts: number }>) : [];
        const hasPending = list.some(x => x.question === currentQuestion && x.answer === '');
        const hasAnswered = list.some(x => x.question === currentQuestion && x.answer && x.answer.trim());
        if (!hasPending && !hasAnswered) {
          list.unshift({ question: currentQuestion, answer: '', ts: Date.now() });
          const CUTOFF = 1000;
          window.localStorage.setItem(archiveKey, JSON.stringify(list.slice(0, CUTOFF)));
        }
      } catch { }

      // Start response generation immediately for zero-latency experience
      const responsePromise = (async () => {
        let res;
        try {
          // Debug: log outgoing payload so we can inspect it in network/console
          console.log('[api] POST /api/question payload', { session_id: sid, question: currentQuestion, style });
          res = await apiSubmitQuestion({ session_id: sid, question: currentQuestion, style });
        } catch (err: any) {
          const msg = String(err?.message || "");
          const looksLikeMissing = msg.includes("Session not found");
          if (looksLikeMissing) {
            try { window.localStorage.removeItem("ia_session_id"); } catch { }
            const newSid = await ensureSession({ forceNew: true });
            res = await apiSubmitQuestion({ session_id: newSid, question: currentQuestion, style });
          } else {
            // Surface backend diagnostics in dev: show a toast with error body if available
            console.error('[question] submit error details', err);
            try {
              (toast as any) && toast({ title: 'Request failed', description: String(err?.body ?? err?.message ?? 'Unknown error'), variant: 'destructive' });
            } catch { }
            throw err;
          }
        }
        return res;
      })();

      // Versioning: decide whether this is a fresh question or an edit of existing response
      if (!isEditingFromAnswer) {
        // New question flow: reset versions
        setOriginalQA(null);
        setLatestQA(null);
        setCurrentVersion(0);
      }

      // Show immediate feedback only when not inline-editing existing response
      if (!(isEditingFromAnswer && originalQA)) {
        setAnswer("Analyzing your question and generating a comprehensive response...");
      }

      try {
        const res = await responsePromise;
        console.log("[question] response", res);
        if (isEditingFromAnswer && originalQA) {
          // Save as latest and show latest
          const latest = { q: currentQuestion, a: res.answer };
          setLatestQA(latest);
          setCurrentVersion(1);
          setLastQuestion(latest.q);
          setAnswer(latest.a);
          setIsEditingFromAnswer(false);
          setPendingEditedQuestion(null);
        } else {
          // First response in this space
          const orig = { q: currentQuestion, a: res.answer };
          setOriginalQA(orig);
          setLatestQA(null);
          setCurrentVersion(0);
          setLastQuestion(orig.q);
          setAnswer(orig.a);
        }
        setHistory((prev) => {
          const base = prev?.items ? [...prev.items] : [];
          const pendingIdx = base.findIndex(it => it.question === currentQuestion && it.answer === '');
          let next: HistoryItem[];
          if (pendingIdx >= 0) {
            next = base.map((it, i) => i === pendingIdx ? ({
              question: currentQuestion,
              answer: res.answer,
              style: res.style,
              created_at: base[pendingIdx].created_at
            }) : it);
          } else {
            next = [{
              question: currentQuestion,
              answer: res.answer,
              style: res.style,
              created_at: new Date().toISOString()
            }, ...base];
          }
          // Remove any other duplicates of the same question (both answered and pending), keeping the first occurrence
          const seenQ = new Set<string>();
          const dedup = next.filter(it => {
            if (it.question !== currentQuestion) return true;
            if (seenQ.has(currentQuestion)) return false;
            seenQ.add(currentQuestion);
            return true;
          });
          return { session_id: sid, items: dedup } as GetHistoryResponse;
        });
        // Persist to local durable archive (replace pending entry if present)
        try {
          const archiveKey = `ia_history_archive_${sid}`;
          const raw = window.localStorage.getItem(archiveKey);
          const list = raw ? (JSON.parse(raw) as Array<{ question: string; answer: string; ts: number }>) : [];
          const pendingIndex = list.findIndex(x => x.question === currentQuestion && x.answer === '');
          if (pendingIndex >= 0) list[pendingIndex] = { question: currentQuestion, answer: res.answer, ts: Date.now() };
          else list.unshift({ question: currentQuestion, answer: res.answer, ts: Date.now() });
          const CUTOFF = 1000;
          window.localStorage.setItem(archiveKey, JSON.stringify(list.slice(0, CUTOFF)));
        } catch { }
        setShowAnswer(true);
      } catch (err) {
        console.error("[question] error", err);
        setAnswer("I apologize, but I encountered an error while processing your question. Please try again.");
        // Remove the optimistic insert with empty answer since response failed
        setHistory((prev) => {
          const items = prev?.items || [];
          const filtered = items.filter(it => !(it.question === currentQuestion && (!it.answer || !it.answer.trim())));
          return { session_id: sid, items: filtered } as any;
        });
        // Also remove from archive
        try {
          const archiveKey = `ia_history_archive_${sid}`;
          const raw = window.localStorage.getItem(archiveKey);
          if (raw) {
            const list = JSON.parse(raw) as Array<{ question: string; answer: string; ts: number }>;
            const cleaned = list.filter(x => !(x.question === currentQuestion && (!x.answer || !x.answer.trim())));
            window.localStorage.setItem(archiveKey, JSON.stringify(cleaned));
          }
        } catch { }
      }
    } catch (err) {
      console.error("[question] error", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Example Evaluate button handler (streams evaluation overlay)
  const handleEvaluateCode = async () => {
    // This is a sample hook-up. Replace `code` and `problem` with your current editor/problem state.
    const code = `def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        d = target - n\n        if d in seen:\n            return [seen[d], i]\n        seen[n] = i\n    return []`;
    const problem = "Implement two_sum. Return indices of two numbers adding to target.";
    try {
      await startEvaluationOverlay({ code, problem, language: "python", title: "Running Evaluation" });
    } catch { }
  };

  // Generate specifically for an edited question inline, preserving current view until response arrives
  const handleSubmitInlineEdit = async (newQuestion: string) => {
    // Keep current response visible; generate latest in background
    setIsEditingFromAnswer(true);
    setPendingEditedQuestion(newQuestion);
    // Hide current card and show generating placeholder similar to new query flow
    setShowAnswer(false);
    setViewingHistory(false);
    await handleGenerateAnswer(newQuestion);
  };

  // Handlers for edit and version navigation
  const handleEditCurrent = () => {
    // Mark inline editing without hiding the current response
    setIsEditingFromAnswer(true);
  };

  const handlePrevVersion = () => {
    if (latestQA && originalQA && currentVersion === 1) {
      setIsNavigatingVersion(true);
      setCurrentVersion(0);
      setLastQuestion(originalQA.q);
      setAnswer(originalQA.a);
    }
  };

  const handleNextVersion = () => {
    if (latestQA && currentVersion === 0) {
      setIsNavigatingVersion(true);
      setCurrentVersion(1);
      setLastQuestion(latestQA.q);
      setAnswer(latestQA.a);
    }
  };

  const generateMockAnswer = (q: string): string => {
    // Simple mock response generation based on common interview questions
    const lowerQ = q.toLowerCase();

    if (lowerQ.includes("tell me about yourself") || lowerQ.includes("introduce yourself")) {
      return "I'm a passionate software developer with over 3 years of experience in full-stack development. I've worked extensively with React, Node.js, and modern web technologies. What excites me most is solving complex problems and creating user-friendly applications. In my previous role, I led a team that improved application performance by 40% and delivered key features that increased user engagement significantly.";
    }

    if (lowerQ.includes("weakness") || lowerQ.includes("weaknesses")) {
      return "I'd say my biggest area for growth is public speaking. While I'm comfortable in small team settings, I used to feel nervous presenting to large groups. I've been actively working on this by volunteering to give more presentations and joining a local Toastmasters group. I've already seen improvement - last month I successfully presented our project roadmap to a 50-person audience.";
    }

    if (lowerQ.includes("strength") || lowerQ.includes("strengths")) {
      return "One of my key strengths is my ability to break down complex problems into manageable pieces. I approach challenges systematically, which helps me find efficient solutions quickly. For example, when our team faced a critical performance issue last quarter, I methodically analyzed the bottlenecks, identified the root cause, and implemented a solution that improved response times by 60%.";
    }

    if (lowerQ.includes("why") && (lowerQ.includes("company") || lowerQ.includes("job") || lowerQ.includes("role"))) {
      return "I'm excited about this opportunity because it aligns perfectly with my career goals and values. Your company's commitment to innovation and user-centric design really resonates with me. I've been following your recent product launches, and I'm impressed by how you balance technical excellence with real user needs. I believe my background in scalable web applications and my passion for creating meaningful user experiences would allow me to contribute significantly to your team's success.";
    }

    // Default response for other questions
    return "That's a great question. Let me think about this systematically. Based on my experience, I would approach this by first understanding the core requirements and constraints. I'd then evaluate different solutions, considering factors like scalability, maintainability, and user impact. I believe in data-driven decision making, so I'd also look at relevant metrics and feedback to guide the best path forward.";
  };

  // Animated background effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
    }> = [];

    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 1.5 + 0.5,
      });
    }

    let animationFrameId: number;

    const animate = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(139, 92, 246, 0.4)';
        ctx.fill();

        particles.slice(i + 1).forEach((p2) => {
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 100) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(139, 92, 246, ${0.15 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        });
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Animated Background - Only visible in dark mode */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 hidden dark:block dark:opacity-20"
      />

      {/* Gradient Overlays - Only visible in dark mode */}
      <div className="absolute inset-0 hidden dark:block bg-gradient-to-br dark:from-purple-900/20 dark:via-black dark:to-blue-900/20 pointer-events-none" />
      <div className="absolute top-0 left-1/4 w-96 h-96 hidden dark:block dark:bg-purple-500/20 rounded-full blur-[120px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 hidden dark:block dark:bg-blue-500/20 rounded-full blur-[120px] animate-pulse delay-1000 pointer-events-none" />

      {/* Key Status Badge - Only shown when key is missing */}
      {!hasApiKey && (
        <div className="fixed top-20 left-4 md:left-72 z-40">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-md transition-all duration-500 bg-amber-500/10 border-amber-500/20 text-amber-500 shadow-[0_0_158px_-5px_rgba(245,158,11,0.3)]">
            <Key className="w-3 h-3 animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-[0.1em]">
              Key Entry Required
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">
        {/* Mobile Header */}
        <div className="md:hidden sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="h-8 w-8 p-0 hover:bg-white/10"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Stratax AI</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className={`h-9 px-3 flex items-center gap-2 hover:bg-white/10 ${!hasApiKey ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : ''}`}>
                    <Settings className="h-4 w-4" />
                    {!hasApiKey && <span className="text-xs font-bold">Connect Bridge</span>}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[450px] p-0 border-none bg-transparent">
                  <ApiKeySettings />
                </DialogContent>
              </Dialog>
              <Link to="/run">
                <Button variant="outline" size="sm" className="hidden md:inline-flex">Run Code</Button>
              </Link>
              {deferredPrompt && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const prompt = deferredPrompt;
                    setDeferredPrompt(null);
                    try {
                      await prompt.prompt();
                      await prompt.userChoice;
                    } catch { }
                  }}
                >
                  Install
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Sidebar Overlay */}
        {isMobileSidebarOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-gray-900/30 dark:bg-black/50" onClick={() => setIsMobileSidebarOpen(false)}>
            <div
              className="fixed left-0 top-0 bottom-0 w-72 max-w-[75vw] bg-background/95 backdrop-blur-xl border-r border-border shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Mobile Sidebar Header */}
              <div className="flex items-center justify-between p-4 border-b border-border/40">
                <h2 className="text-lg font-bold text-foreground">History</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="h-8 w-8 p-0 hover:bg-muted/50"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Mobile Sidebar Content */}
              <div className="flex flex-col h-full">
                {/* Sessions */}
                <div className="px-2 py-2 overflow-y-auto">
                  {sessions?.length ? (
                    <div className="mb-4">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2">Sessions</h3>
                      <ul className="space-y-1">
                        {sessions.map((s) => (
                          <li key={s.session_id} className="group">
                            <button
                              className="w-full text-left px-3 py-2 rounded-md hover:bg-white/10 transition-colors"
                              onClick={async () => {
                                try {
                                  setSessionId(s.session_id);
                                  const h = await apiGetHistory(s.session_id);
                                  setHistory(h);
                                  setIsMobileSidebarOpen(false);
                                  console.log(`[api] GET /api/history/${s.session_id} ->`, h);
                                } catch (e) {
                                  console.error("[api] history error", e);
                                }
                              }}
                            >
                              <div className="text-sm font-medium truncate">{s.session_id}</div>
                              <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                                <span>{new Date(s.last_update).toLocaleString()}</span>
                                <span>•</span>
                                <span>{s.qna_count} QnA</span>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* Current History */}
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2">Current History</h3>
                    {history?.items?.length ? (
                      <ul className="space-y-1">
                        {history.items.map((it, idx) => (
                          <li key={idx} className="group" data-history-item>
                            <div
                              className="relative rounded-md bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer"
                              onClick={() => {
                                try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { }
                                setLastQuestion(it.question);
                                // Mark this as a history view first so `AnswerCard` will
                                // receive `streaming={false}`. Use a microtask to avoid
                                // React's batching merging these updates into one render.
                                setViewingHistory(true);
                                setTimeout(() => {
                                  setAnswer(it.answer);
                                  setShowAnswer(true);
                                  setQuestion("");
                                  setIsMobileSidebarOpen(false);
                                }, 0);
                                console.log('[ui] Opened history item', { index: idx, question: it.question });
                              }}
                            >
                              {/* Content */}
                              <div className="px-3 py-2 pr-10">
                                <div className="text-xs font-medium line-clamp-2 leading-relaxed">Q: {it.question}</div>
                              </div>

                              {/* Three-dots menu - better positioned */}
                              <button
                                className="absolute right-2 top-2 p-1 rounded hover:bg-muted/60 transition-colors"
                                title="Delete"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteHistory(idx);
                                }}
                              >
                                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="px-2 text-xs text-muted-foreground">No history yet</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Desktop Sidebar - Hidden in Practice Mode */}
        <aside className={`hidden md:flex fixed left-0 top-0 bottom-0 w-64 border-r border-border bg-background/50 backdrop-blur-xl z-40 flex-col ${activeMainTab === "practice" ? "md:hidden" : ""
          }`}>
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Stratax AI</h1>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            {activeMainTab === "intelligence" ? (
              <Card className="h-full flex flex-col rounded-none border-0 shadow-none bg-transparent">
                <CardContent className="flex-1 min-h-0 p-0 overflow-hidden flex flex-col">
                  <ScrollArea className="flex-1">
                    {intelligenceHistoryLoading && !intelligenceHistoryTabs.length ? (
                      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading history...
                      </div>
                    ) : intelligenceHistoryTabs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground px-4">
                        <AlertCircle className="h-5 w-5 mb-2" />
                        <p>No saved searches yet. Run a query and it will appear here automatically.</p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {intelligenceHistoryTabs
                          .filter(tab => tab.query)
                          .map((tab) => (
                            <div
                              key={tab.tab_id}
                              className={`px-4 py-3 space-y-2 border-l-2 transition-colors cursor-pointer ${selectedIntelligenceHistoryTabId === tab.tab_id ? "border-l-primary bg-primary/5" : "border-l-transparent"
                                }`}
                              onClick={() => handleSelectIntelligenceHistoryTab(tab)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium line-clamp-1">{tab.query}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(tab.created_at).toLocaleDateString("en-US", {
                                      year: "numeric",
                                      month: "short",
                                      day: "numeric",
                                    })} · {tab.question_count} questions
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-red-500 hover:text-red-600"
                                    onClick={() => handleDeleteIntelligenceHistoryTab(tab.tab_id)}
                                    disabled={intelligenceHistoryDeletingTabId === tab.tab_id}
                                  >
                                    {intelligenceHistoryDeletingTabId === tab.tab_id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                              {tab.metadata && (
                                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                  {typeof tab.metadata.enhanced === "boolean" && (
                                    <span className={`rounded-full border px-2 py-0.5 ${tab.metadata.enhanced ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-500 text-gray-600 bg-gray-50'}`}>
                                      {tab.metadata.enhanced ? "Enhanced" : "Basic"}
                                    </span>
                                  )}
                                  {typeof tab.metadata.limit === "number" && (
                                    <span className="rounded-full border px-2 py-0.5">limit {tab.metadata.limit}</span>
                                  )}
                                  {typeof tab.metadata.refresh === "boolean" && (
                                    <span className="rounded-full border px-2 py-0.5">
                                      {tab.metadata.refresh ? "refresh" : "cached"}
                                    </span>
                                  )}
                                </div>
                              )}
                              {/* Quality indicator for search results */}
                              {(() => {
                                if (!tab.questions || tab.questions.length === 0) return null;

                                const questions = tab.questions as any[];
                                const total = questions.length;
                                const verifiedCount = questions.filter(q =>
                                  q.verification_status === "verified" || q.source_type === "verified"
                                ).length;
                                const verifiedRatio = total > 0 ? verifiedCount / total : 0;

                                // For enhanced searches, show stats if available
                                if (tab.metadata?.enhanced) {
                                  const avgCredibility = questions
                                    .filter(q => typeof q.credibility_score === "number")
                                    .reduce((sum, q) => sum + q.credibility_score, 0) /
                                    (questions.filter(q => typeof q.credibility_score === "number").length || 1);

                                  return (
                                    <div className="text-[10px] text-muted-foreground space-y-1">
                                      {verifiedCount > 0 && (
                                        <div className="flex items-center gap-1">
                                          <span className="text-green-600">✓ {verifiedCount}/{total} verified</span>
                                          <span>({(verifiedRatio * 100).toFixed(0)}%)</span>
                                        </div>
                                      )}
                                      {!isNaN(avgCredibility) && avgCredibility > 0 && (
                                        <div>Avg credibility: {avgCredibility.toFixed(2)}</div>
                                      )}
                                    </div>
                                  );
                                }

                                // For basic searches, show warning if verified ratio is low
                                if (verifiedRatio < 0.5) {
                                  return (
                                    <div className="text-[10px] text-amber-600 flex items-center gap-1">
                                      ⚠️ Low verified ratio ({(verifiedRatio * 100).toFixed(0)}%)
                                    </div>
                                  );
                                }

                                return null;
                              })()}
                            </div>
                          ))}
                      </div>
                    )}
                    {intelligenceHistoryError && (
                      <div className="px-4 py-3 text-xs text-red-500">{intelligenceHistoryError}</div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : activeMainTab === "mock-interview" ? (
              <Card className="h-full flex flex-col rounded-none border-0 shadow-none bg-transparent">
                <CardHeader className="px-4 py-3 border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Interview History</CardTitle>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={loadMockInterviewHistory}
                        disabled={mockInterviewHistoryLoading}
                        title="Refresh history"
                      >
                        <RefreshCw className={`h-4 w-4 ${mockInterviewHistoryLoading ? 'animate-spin' : ''}`} />
                      </Button>
                      {mockInterviewSessions.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-600"
                          onClick={handleDeleteAllMockInterviewSessions}
                          disabled={mockInterviewClearingAll}
                          title="Clear all history"
                        >
                          {mockInterviewClearingAll ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 p-0 overflow-hidden flex flex-col">
                  <ScrollArea className="flex-1">
                    {mockInterviewHistoryLoading && !mockInterviewSessions.length ? (
                      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading history...
                      </div>
                    ) : mockInterviewSessions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground px-4">
                        <AlertCircle className="h-5 w-5 mb-2" />
                        <p>No completed interviews yet. Start your first interview!</p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {(() => {
                          console.log("[MockHistory] Rendering sessions, count:", mockInterviewSessions.length);
                          console.log("[MockHistory] Sessions to render:", mockInterviewSessions);
                          return mockInterviewSessions.map((session, idx) => {
                            console.log(`[MockHistory] Rendering session ${idx}:`, session);
                            return (
                              <div
                                key={session.session_id}
                                className={`px-4 py-3 space-y-2 border-l-2 transition-colors cursor-pointer ${selectedMockSession?.session_id === session.session_id ? "border-l-primary bg-primary/5" : "border-l-transparent"
                                  }`}
                                onClick={() => handleSelectMockSession(session)}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium capitalize">
                                      {session.interview_type?.replace('_', ' ') || 'Interview'} • {session.difficulty || 'Unknown'}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {session.started_at ? new Date(session.started_at).toLocaleDateString("en-US", {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                      }) : 'Unknown date'} · {session.questions_answered || 0}/{session.total_questions || 0} questions
                                    </p>
                                    {session.average_score != null && (
                                      <p className="text-xs text-primary font-medium mt-1">
                                        Avg Score: {session.average_score.toFixed(1)}/10
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-red-500 hover:text-red-600 h-7 w-7"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteMockInterviewSession(session.session_id);
                                      }}
                                      disabled={mockInterviewDeletingSessionId === session.session_id}
                                    >
                                      {mockInterviewDeletingSessionId === session.session_id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                    {mockInterviewHistoryError && (
                      <div className="px-4 py-3 text-xs text-red-500">{mockInterviewHistoryError}</div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Sessions */}
                <div className="px-2 overflow-y-auto">
                  {sessions?.length ? (
                    <ul className="space-y-1 pr-2">
                      {sessions.map((s) => (
                        <li key={s.session_id} className="group">
                          <button
                            className="w-full text-left px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
                            onClick={async () => {
                              try {
                                setSessionId(s.session_id);
                                const h = await apiGetHistory(s.session_id);
                                setHistory(h);
                                console.log(`[api] GET /api/history/${s.session_id} ->`, h);
                              } catch (e) {
                                console.error("[api] history error", e);
                              }
                            }}
                          >
                            <div className="text-sm font-medium truncate">{s.session_id}</div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                              <span>{new Date(s.last_update).toLocaleString()}</span>
                              <span>•</span>
                              <span>{s.qna_count} QnA</span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {/* Current History */}
                <div className="px-4 pt-4 pb-2">
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current History</h2>
                </div>
                <div className="px-2 overflow-y-auto mb-2">
                  {history?.items?.length ? (
                    <ul className="space-y-1 pr-2">
                      {history.items.map((it, idx) => (
                        <li key={idx} className="group" data-history-item>
                          <div
                            className="relative rounded-md bg-card/40 border border-border/30 hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => {
                              try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { }
                              setLastQuestion(it.question);
                              // Ensure we flip the viewingHistory flag BEFORE updating the
                              // answer/showAnswer. Use a microtask so React renders with
                              // `viewingHistory=true` before mounting the AnswerCard.
                              setViewingHistory(true);
                              setTimeout(() => {
                                setAnswer(it.answer);
                                setShowAnswer(true);
                                setQuestion("");
                              }, 0);
                              console.log('[ui] Opened history item', { index: idx, question: it.question });
                            }}
                          >
                            {/* Three-dots hover menu INSIDE the box (top-right) */}
                            <button
                              className="absolute right-1 top-1 transition-opacity px-2 py-1 rounded hover:bg-muted/60"
                              title="More"
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const nextIndex = openMenuIndex === idx ? null : idx;
                                setOpenMenuIndex(nextIndex);
                                if (nextIndex !== null) {
                                  // Use viewport coordinates directly for fixed positioning
                                  setMenuPos({ top: rect.top, left: rect.right + 8 });
                                } else {
                                  setMenuPos(null);
                                }
                              }}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>

                            {/* Content */}
                            <div className="px-3 py-2">
                              <div className="text-xs font-medium truncate">Q: {it.question}</div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="px-4 text-xs text-muted-foreground">No history yet</div>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>

        {/* Desktop Controls - theme toggle and settings */}
        <div className="hidden md:block fixed top-3 right-3 z-50">
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-9 flex items-center gap-2 transition-all duration-300 ${!hasApiKey
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/50 hover:bg-amber-500/20 shadow-[0_0_15px_-5px_rgba(245,158,11,0.3)]'
                    : 'hover:bg-accent'
                    }`}
                >
                  <Settings className="h-4 w-4" />
                  <span className="font-semibold">{hasApiKey ? 'Bridge Settings' : 'Connect AI Bridge'}</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[450px] p-0 border-none bg-transparent">
                <ApiKeySettings />
              </DialogContent>
            </Dialog>
            <Link to="/run">
              <Button variant="outline" size="sm">Run Code</Button>
            </Link>
          </div>
        </div>

        {/* Main content area */}
        <div className={`flex flex-col h-screen overflow-hidden ${activeMainTab === "practice" ? "md:pl-0" : "md:pl-64"
          }`}>
          {/* Response Section */}
          <div className={`flex-1 overflow-y-auto px-0 py-2 md:px-6 md:py-6 ${activeMainTab === "answer" ? "pb-40 md:pb-44" : ""
            }`}>
            <div className="max-w-4xl mx-auto w-full">
              <Tabs value={activeMainTab} onValueChange={(v) => setActiveMainTab(v as "answer" | "intelligence" | "mock-interview" | "practice")} className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="answer">Answer</TabsTrigger>
                  <TabsTrigger value="intelligence">Interview Intelligence</TabsTrigger>
                  <TabsTrigger value="mock-interview">Mock Interview</TabsTrigger>
                  <TabsTrigger value="practice">Real Time Practice Mode</TabsTrigger>
                </TabsList>

                <TabsContent value="answer" className="mt-0">
                  {showAnswer ? (
                    <div className="animate-in slide-in-from-top-4 duration-500">
                      <AnswerCard
                        answer={answer}
                        question={lastQuestion}
                        streaming={!viewingHistory && !isNavigatingVersion}
                        evaluationAllowed={evaluationAllowed}
                        evaluationReason={evaluationReason}
                        onEdit={handleEditCurrent}
                        onSubmitEdit={handleSubmitInlineEdit}
                        canPrev={!!(originalQA && latestQA) && currentVersion === 1}
                        canNext={!!latestQA && currentVersion === 0}
                        onPrev={handlePrevVersion}
                        onNext={handleNextVersion}
                        versionLabel={latestQA ? (currentVersion === 1 ? 'Latest' : 'Original') : undefined}
                        isGenerating={isGenerating}
                        versionIndex={latestQA ? (currentVersion === 1 ? 2 : 1) : 1}
                        versionTotal={latestQA ? 2 : 1}
                      />
                    </div>
                  ) : isGenerating ? (
                    <div className="flex flex-col items-center justify-center py-12 md:py-16 bg-card/30 backdrop-blur-sm rounded-xl mx-2 md:mx-0">
                      <div className="relative">
                        <div className="w-10 h-10 md:w-12 md:h-12 border-3 border-primary/20 rounded-full"></div>
                        <div className="absolute top-0 left-0 w-10 h-10 md:w-12 md:h-12 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
                      </div>
                      <div className="mt-4 text-center px-4">
                        <h3 className="text-lg md:text-xl font-semibold mb-2">Crafting Your Response</h3>
                        <p className="text-sm md:text-base text-muted-foreground">Analyzing your question and generating a response...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 md:py-16 text-center bg-card/30 backdrop-blur-sm rounded-xl mx-2 md:mx-0">
                      <div className="relative mb-6">
                        <div className="w-14 h-14 md:w-16 md:h-16 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl flex items-center justify-center">
                          <MessageSquare className="h-7 w-7 md:h-8 md:w-8 text-primary" />
                        </div>
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                          <div className="w-2 h-2 bg-primary-foreground rounded-full animate-pulse"></div>
                        </div>
                      </div>
                      <h3 className="text-lg md:text-xl font-semibold mb-2">Ready to Help</h3>
                      <p className="text-sm md:text-base text-muted-foreground max-w-md px-4 mb-4">
                        Ask your interview question and I'll provide a comprehensive response with examples and explanations.
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center px-4">
                        <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">Code Examples</span>
                        <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">Best Practices</span>
                        <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">Real Examples</span>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="intelligence" className="mt-0">
                  <div className="h-[calc(100vh-200px)] min-h-[600px]">
                    <InterviewIntelligence
                      onHistoryRefresh={() => loadIntelligenceHistoryTabs({ silent: true })}
                      historyTabs={intelligenceHistoryTabs}
                      externalHistorySelection={pendingIntelligenceHistorySelection}
                      onExternalHistorySelectionConsumed={() => setPendingIntelligenceHistorySelection(null)}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="mock-interview" className="mt-0">
                  <div className="h-[calc(100vh-200px)] min-h-[600px]">
                    <MockInterviewMode
                      selectedHistorySession={selectedMockSession}
                      onHistoryUpdate={loadMockInterviewHistory}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="practice" className="mt-0 h-[calc(100vh-120px)]">
                  <PracticeMode />
                </TabsContent>
              </Tabs>

              {/* Right-side popover for history item actions */}
              {openMenuIndex !== null && menuPos && (
                <div
                  data-right-popover
                  className="fixed w-40 bg-popover border border-border rounded-md shadow-lg z-50"
                  style={{ top: menuPos.top, left: menuPos.left }}
                >
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-destructive/10 text-destructive flex items-center gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (openMenuIndex !== null) handleDeleteHistory(openMenuIndex);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Fixed Search Bar at Bottom - Only show on Answer tab */}
          {activeMainTab === "answer" && (
            <div className="fixed bottom-0 left-0 right-0 z-30 md:left-64">
              {/* Gradient fade to hide content behind */}
              <div className="h-40 md:h-48 bg-gradient-to-t from-background from-40% via-background/95 via-70% to-transparent" />
              <div className="px-4 pb-2 md:px-6 md:pb-3 -mt-28 md:-mt-32">
                <div className="max-w-4xl mx-auto">
                  <SearchBar
                    value={question}
                    onChange={(v) => {
                      if (viewingHistory) setViewingHistory(false);
                      setQuestion(v);
                    }}
                    placeholder="Ask Stratax AI..."
                    resetToken={resetToken}
                    ensureSession={ensureSession}
                    onUploaded={({ characters, fileName }) => {
                      toast({ title: "Profile uploaded", description: `${fileName} • ${characters.toLocaleString()} characters indexed.` });
                    }}
                    onGenerate={handleGenerateAnswer}
                    isGenerating={isGenerating}
                    canGenerate={!viewingHistory}
                  />
                </div>
                <p className="text-center text-[10px] text-white/60 mt-1.5 pb-1">
                  Stratax AI can make mistakes. Verify important information and use as a learning aid.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showKeyOnboarding && (
          <BYOKOnboarding
            onComplete={() => {
              setShowKeyOnboarding(false);
              setHasApiKey(true);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
