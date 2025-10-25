import { useEffect, useState } from "react";
import { SearchBar } from "./SearchBar";
import { AnswerCard } from "./AnswerCard";
import { ThemeToggle } from "./ThemeToggle";
import { MessageSquare, MoreVertical, Trash2, Menu, X } from "lucide-react";
import { apiCreateSession, apiSubmitQuestion, apiGetHistory, apiGetSessions, apiDeleteHistoryItemByIndex, type AnswerStyle, type SessionSummary, type GetHistoryResponse } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { startEvaluationOverlay } from "@/overlayHost";

export const InterviewAssistant = () => {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
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
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  
  // Versioning for edit-and-compare flow
  const [originalQA, setOriginalQA] = useState<{ q: string; a: string } | null>(null);
  const [latestQA, setLatestQA] = useState<{ q: string; a: string } | null>(null);
  const [currentVersion, setCurrentVersion] = useState<0 | 1>(0); // 0 original, 1 latest
  const [isEditingFromAnswer, setIsEditingFromAnswer] = useState(false);
  const [pendingEditedQuestion, setPendingEditedQuestion] = useState<string | null>(null);
  const [isNavigatingVersion, setIsNavigatingVersion] = useState(false);

  // Removed teleprompter/overlay UI
  
  const handleDeleteHistory = async (idx: number) => {
    try {
      if (sessionId == null || sessionId === "") return;
      await apiDeleteHistoryItemByIndex({ session_id: sessionId, index: idx });
      // Refresh only current session history
      const h = await apiGetHistory(sessionId);
      setHistory(h);
      // If the deleted item was currently displayed, clear answer view
      const item = history?.items?.[idx];
      if (item && lastQuestion === item.question && answer === item.answer) {
        setShowAnswer(false);
        setAnswer("");
        setLastQuestion("");
        setViewingHistory(false);
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
    try { window.localStorage.setItem("ia_session_id", s.session_id); } catch {}
    return s.session_id;
  };

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

  // Load recent sessions for sidebar
  useEffect(() => {
    (async () => {
      try {
        const s = await apiGetSessions();
        setSessions(s);
        console.log("[api] GET /api/sessions ->", s);
      } catch (e) {
        console.error("[api] sessions error", e);
      }
    })();
  }, []);

  // Capture install prompt and surface an Install action
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      try {
        toast({
          title: "Install available",
          description: "Install Interview Assistant as an app for a better mobile experience.",
        });
      } catch {}
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [toast]);

  // Load history when sessionId available or reset token changes
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const h = await apiGetHistory(sessionId);
        setHistory(h);
        console.log(`[api] GET /api/history/${sessionId} ->`, h);
      } catch (e) {
        console.error("[api] history error", e);
      }
    })();
  }, [sessionId, resetToken]);

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
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
      // Clear previous UI and stop mic/input accumulation for the next turn
      // During inline edit, hide the previous card and show generating placeholder
      setAnswer("");
      setShowAnswer(true);
      if (!overrideQuestion) setQuestion("");
      setResetToken((t) => t + 1);
      setLastQuestion(currentQuestion);
      
      // Start response generation immediately for zero-latency experience
      const responsePromise = (async () => {
        // Ensure session exists
        const sid = await ensureSession();

        let res;
        try {
          res = await apiSubmitQuestion({ session_id: sid, question: currentQuestion, style });
        } catch (err: any) {
          const msg = String(err?.message || "");
          const looksLikeMissing = msg.includes("Session not found");
          if (looksLikeMissing) {
            try { window.localStorage.removeItem("ia_session_id"); } catch {}
            const newSid = await ensureSession({ forceNew: true });
            res = await apiSubmitQuestion({ session_id: newSid, question: currentQuestion, style });
          } else {
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
        setShowAnswer(true);
      } catch (err) {
        console.error("[question] error", err);
        setAnswer("I apologize, but I encountered an error while processing your question. Please try again.");
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
    } catch {}
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 transition-colors duration-300">
      {/* Mobile Header */}
      <div className="md:hidden sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/40">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="h-8 w-8 p-0 hover:bg-muted/50"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold text-foreground">InterviewPrep</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
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
                  } catch {}
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
        <div className="md:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setIsMobileSidebarOpen(false)}>
          <div 
            className="fixed left-0 top-0 bottom-0 w-72 max-w-[75vw] bg-background border-r border-border/40 shadow-xl"
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
                            className="w-full text-left px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
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
                            className="relative rounded-md bg-card/40 border border-border/30 hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => {
                              try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
                              setLastQuestion(it.question);
                              setAnswer(it.answer);
                              setShowAnswer(true);
                              setQuestion("");
                              setViewingHistory(true);
                              setIsMobileSidebarOpen(false);
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

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 border-r border-border/40 bg-background/70 backdrop-blur-sm z-40 flex-col">
        <div className="p-4 border-b border-border/40">
          <h1 className="text-xl font-bold text-foreground">InterviewPrep</h1>
        </div>
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
                      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
                      setLastQuestion(it.question);
                      setAnswer(it.answer);
                      setShowAnswer(true);
                      setQuestion("");
                      setViewingHistory(true);
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
      </aside>

      {/* Desktop Controls - only theme toggle remains */}
      <div className="hidden md:block fixed top-3 right-3 z-50">
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-col min-h-screen md:pl-64">
        {/* Response Section */}
        <div className="flex-1 px-0 py-2 md:px-6 md:py-6">
          <div className="max-w-4xl mx-auto w-full">
            {showAnswer ? (
              <div className="animate-in slide-in-from-top-4 duration-500">
              <AnswerCard 
                answer={answer}
                question={lastQuestion}
                streaming={!viewingHistory && !isNavigatingVersion}
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
      
        {/* Fixed Search Bar at Bottom */}
        <div className="sticky bottom-0 z-30 bg-background/95 backdrop-blur-sm border-t border-border/40 safe-area-inset-bottom">
          <div className="px-3 py-3 md:px-6 md:py-4">
            <div className="max-w-4xl mx-auto">
              <SearchBar 
                value={question}
                onChange={(v) => {
                  // Exiting history view as user starts typing/editing
                  if (viewingHistory) setViewingHistory(false);
                  setQuestion(v);
                }}
                placeholder="Ask your question..."
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
          </div>
        </div>
      </div>

      {/* Teleprompter/Overlay removed */}
    </div>
  );
};