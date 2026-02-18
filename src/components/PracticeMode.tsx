import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { InterviewCodeEditor } from './InterviewCodeEditor';
import InstantScoreBreakdown from './InstantScoreBreakdown';
import {
  AudioRecorder,
  startInterview,
  submitAnswer,
  submitCode,
  acknowledgeFeedback,
  ratePracticeFeedback,
  playQuestionAudio,
  checkPracticeModeStatus,
  quickStartInterview,
  getSessionEvaluation,
  getPracticeInsights,
  type PracticeInsightsResponse,
  type StartInterviewResponse,
  type SubmitAnswerResponse,
  type SubmitCodeResponse,
  type AcknowledgeFeedbackResponse,
  type InterviewRole,
  type InterviewDifficulty,
  type UserProfile,
  type Evaluation,
  type SpeechMetrics,
  type MicroFeedback,
  type EvaluationTrace,
  type Trajectory,
  type Pressure,
  type QuickStartResponse,
  type Question,
  type QuestionType,
  type CodeTestResult,
  type CodeEvaluationFeedback,
  type PerceivedDifficulty,
  QuestionType as QuestionTypeEnum,
  API_BASE_URL,
  submitSessionConfidence,
  uploadPracticeSessionMedia,
  postPracticeSessionProctoringEvent,
  endPracticeSession,
  type EndPracticeSessionResponse,
} from '@/lib/practiceModeApi';
import { startPracticeProctoring } from '@/lib/practiceProctoring';
import {
  Mic,
  MicOff,
  Play,
  Volume2,
  VolumeX,
  Loader2,
  CheckCircle2,
  TrendingUp,
  Award,
  Target,
  Clock,
  MessageSquare,
  Zap,
  BarChart3,
  Brain,
  Sparkles,
  ArrowRight,
  ChevronLeft,
  ChevronDown,
  RotateCcw,
  AlertCircle,
  Trophy,
  Star,
  Flame,
  Camera,
  Settings,
} from 'lucide-react';
import RoundSelection from './RoundSelection';
import ResumeUpload, { loadSavedResumeContext } from './ResumeUpload';
import type { ResumeContext } from '../types/resume';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import type { RoundConfig } from '@/lib/practiceModeApi';
import { StrataxApiError } from '@/lib/strataxClient';

type PracticePhase = 'welcome' | 'setup' | 'round-selection' | 'question' | 'recording' | 'processing' | 'feedback' | 'complete';

type FeedbackRatingDraft = {
  usefulnessRating?: number;
  perceivedDifficulty?: PerceivedDifficulty;
  comment?: string;
};

type GuestGateBanner =
  | { kind: 'limit'; message?: string; demo_remaining?: Record<string, unknown> }
  | { kind: 'unavailable'; message?: string }
  | null;

type SessionConfidenceStoredState = {
  value?: number;
  skipped?: boolean;
  disabled?: boolean;
  updatedAt?: number;
};

export const PracticeMode = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const audioRecorder = useRef(new AudioRecorder());
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Stream question text word-by-word so it isn't shown all at once.
  const [streamedQuestionText, setStreamedQuestionText] = useState<string>('');
  const [isQuestionStreaming, setIsQuestionStreaming] = useState(false);
  const questionAudioDurationRef = useRef<number | null>(null);
  const questionStreamTimerRef = useRef<number | null>(null);
  const questionStreamRafRef = useRef<number | null>(null);
  const questionStreamKeyRef = useRef<string>('');
  const questionStreamRunIdRef = useRef(0);

  const cancelQuestionStreaming = () => {
    if (questionStreamTimerRef.current != null) {
      window.clearTimeout(questionStreamTimerRef.current);
      questionStreamTimerRef.current = null;
    }
    if (questionStreamRafRef.current != null) {
      try {
        cancelAnimationFrame(questionStreamRafRef.current);
      } catch {
        // ignore
      }
      questionStreamRafRef.current = null;
    }
    // Bump run id and clear key so any in-flight callbacks become no-ops.
    questionStreamRunIdRef.current += 1;
    questionStreamKeyRef.current = '';
    setIsQuestionStreaming(false);
  };

  const playTtsBestEffort = async (ttsAudioUrl?: string) => {
    if (!enableTTS) return;
    if (!ttsAudioUrl || typeof ttsAudioUrl !== 'string') return;

    // Best-effort stop existing playback.
    try {
      audioPlayerRef.current?.pause();
    } catch {
      // ignore
    }

    setIsAudioLoading(true);
    setIsPlayingAudio(false);
    questionAudioDurationRef.current = null;

    const absoluteUrl = ttsAudioUrl.startsWith('http://') || ttsAudioUrl.startsWith('https://')
      ? ttsAudioUrl
      : `${API_BASE_URL}${ttsAudioUrl}`;

    try {
      const audio = new Audio(absoluteUrl);
      audioPlayerRef.current = audio;

      audio.onloadedmetadata = () => {
        try {
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            questionAudioDurationRef.current = audio.duration;
          }
        } catch {
          // ignore
        }
      };

      audio.onloadeddata = () => {
        setIsAudioLoading(false);
      };

      audio.onplay = () => {
        setIsPlayingAudio(true);
      };

      audio.onended = () => {
        setIsPlayingAudio(false);
      };

      audio.onerror = () => {
        setIsAudioLoading(false);
        setIsPlayingAudio(false);
      };

      // Force a reload when reusing same filenames in rare cases.
      try { audio.load(); } catch { }

      await audio.play();
    } catch (err) {
      setIsAudioLoading(false);
      setIsPlayingAudio(false);
    }
  };

  const roundSelectionScrollRef = useRef<HTMLDivElement | null>(null);
  const lastRoundSelectionScrollTopRef = useRef(0);
  const [showRoundSelectionHeader, setShowRoundSelectionHeader] = useState(true);

  const viewProgressButton = (className?: string) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => navigate('/progress')}
      className={className}
    >
      <BarChart3 className="w-4 h-4 mr-2" />
      View Progress
    </Button>
  );

  const [guestGateBanner, setGuestGateBanner] = useState<GuestGateBanner>(null);

  // Show a friendly, professional in-flow message when guest quota/capacity is hit.
  useEffect(() => {
    const onLimitReached = (event: Event) => {
      const detail = (event as CustomEvent).detail as { message?: string; demo_remaining?: Record<string, unknown> };
      setGuestGateBanner({ kind: 'limit', message: detail?.message, demo_remaining: detail?.demo_remaining });
    };

    const onUnavailable = (event: Event) => {
      const detail = (event as CustomEvent).detail as { message?: string };
      setGuestGateBanner({ kind: 'unavailable', message: detail?.message });
    };

    window.addEventListener('demo:limit-reached', onLimitReached);
    window.addEventListener('demo:unavailable', onUnavailable);

    return () => {
      window.removeEventListener('demo:limit-reached', onLimitReached);
      window.removeEventListener('demo:unavailable', onUnavailable);
    };
  }, []);

  // If guest limit/unavailable triggers mid-session, stop proctoring to avoid spamming 429s.
  useEffect(() => {
    if (!guestGateBanner) return;
    stopProctoring();
    setEnableCameraProctoring(false);

    // Also stop local recorders/streams best-effort.
    try { screenRecorderRef.current?.stop(); } catch { }
    try { cameraRecorderRef.current?.stop(); } catch { }
    try { screenStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
    try { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
    screenRecorderRef.current = null;
    cameraRecorderRef.current = null;
    screenStreamRef.current = null;
    cameraStreamRef.current = null;
    setCameraPreviewStream(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestGateBanner?.kind]);

  const renderGuestGateBanner = () => {
    if (!guestGateBanner) return null;
    const remaining = guestGateBanner.kind === 'limit' ? guestGateBanner.demo_remaining : undefined;

    return (
      <Card className="border-2 border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold">
                {guestGateBanner.kind === 'limit'
                  ? 'Guest usage limit reached'
                  : 'Guest mode temporarily unavailable'}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {guestGateBanner.message?.trim()
                  ? guestGateBanner.message
                  : guestGateBanner.kind === 'limit'
                    ? 'You’ve used all guest credits for now. Sign in to continue, or connect your own API keys for unlimited usage.'
                    : 'Guest capacity is currently full right now. Please try again later, or sign in and use your own API keys.'}
              </p>

              {guestGateBanner.kind === 'limit' && remaining && typeof remaining === 'object' && (
                <div className="mt-3 rounded-xl border border-border/50 bg-muted/10 p-3 text-sm">
                  <div className="font-medium mb-2">Guest credits remaining</div>
                  <div className="space-y-1">
                    {Object.entries(remaining)
                      .filter(([_, v]) => typeof v === 'number')
                      .map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="font-medium">{String(v)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2 justify-end">
                <Button variant="outline" onClick={() => setGuestGateBanner(null)}>
                  Dismiss
                </Button>
                <Button
                  onClick={() => {
                    try {
                      window.location.assign('/login?mode=signin');
                    } catch {
                      window.location.href = '/login?mode=signin';
                    }
                  }}
                >
                  Sign in
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Optional insights (coach-like nudge)
  const [practiceInsights, setPracticeInsights] = useState<PracticeInsightsResponse | null>(null);
  const [practiceInsightsLoading, setPracticeInsightsLoading] = useState(false);

  // State
  const [phase, setPhase] = useState<PracticePhase>('welcome');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<StartInterviewResponse['first_question'] | null>(null);
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(1);
  const [currentRoundConfig, setCurrentRoundConfig] = useState<RoundConfig | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  // If a next-session plan exists (set from Progress screen), jump straight into round selection.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('practice_next_session_plan');
      if (raw) setPhase('round-selection');
    } catch { }
  }, []);

  // Auto-hide round-selection header while scrolling down; reveal on scroll up.
  useEffect(() => {
    if (phase !== 'round-selection') return;

    const el = roundSelectionScrollRef.current;
    if (!el) return;

    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const current = el.scrollTop;
        const prev = lastRoundSelectionScrollTopRef.current;
        const delta = current - prev;

        // Always show at the very top.
        if (current <= 8) {
          setShowRoundSelectionHeader(true);
        } else if (delta > 10) {
          // Scrolling down → hide
          setShowRoundSelectionHeader(false);
        } else if (delta < -6) {
          // Scrolling up → show
          setShowRoundSelectionHeader(true);
        }

        lastRoundSelectionScrollTopRef.current = current;
        ticking = false;
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll as any);
  }, [phase]);

  // Quick Start state
  const [useQuickStart, setUseQuickStart] = useState(false);
  const [welcomeStep, setWelcomeStep] = useState<'gateway' | 'configure'>('gateway');
  const [quickStartInput, setQuickStartInput] = useState('');
  const [quickStartLoading, setQuickStartLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [sessionSettingsOpen, setSessionSettingsOpen] = useState(false);

  // Setup state
  const [selectedRole, setSelectedRole] = useState<string>('Software Engineer');
  const [selectedDifficulty, setSelectedDifficulty] = useState<InterviewDifficulty>('easy');
  const [enableTTS, setEnableTTS] = useState(true);
  const [enableAdaptive, setEnableAdaptive] = useState(false);
  const [questionCount, setQuestionCount] = useState<number>(1);  // Default to 1 question

  // Privacy-safe camera proctoring (opt-in; event-only)
  const [enableCameraProctoring, setEnableCameraProctoring] = useState(false);

  // Resume-based interviewing — parsed resume context for claim-based probing
  const [resumeContext, setResumeContext] = useState<ResumeContext | null>(() => loadSavedResumeContext());
  const [proctoringStatus, setProctoringStatus] = useState<'inactive' | 'starting' | 'active' | 'error'>('inactive');
  const [proctoringInfo, setProctoringInfo] = useState<string>('');
  const proctoringStopRef = useRef<null | (() => void)>(null);
  const proctoringSessionIdRef = useRef<string | null>(null);

  // Multiple-face proctoring warnings (max 3 → auto-end)
  const MAX_FACE_WARNINGS = 3;
  const [faceWarningCount, setFaceWarningCount] = useState(0);
  const [faceWarningVisible, setFaceWarningVisible] = useState(false);
  const faceWarningCountRef = useRef(0);
  const faceWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lock to prevent parallel ensureCameraForProctoring() calls (race-condition guard)
  const cameraAcquiringRef = useRef(false);

  // Live Practice gate: screen share + camera required by backend.
  const [liveMediaStatus, setLiveMediaStatus] = useState<'inactive' | 'starting' | 'ready' | 'error'>('inactive');
  const [liveMediaInfo, setLiveMediaInfo] = useState<string>('');
  const [cameraPreviewStream, setCameraPreviewStream] = useState<MediaStream | null>(null);
  const facePreviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const screenChunksRef = useRef<BlobPart[]>([]);
  const cameraChunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const liveCaptureSessionIdRef = useRef<string | null>(null);

  const practiceScreenShareLockRef = useRef(false);

  type QuestionEvaluationItem = {
    questionNumber: number;
    questionId?: number;
    questionText?: string;
    kind: 'voice' | 'code';
    transcript?: string;
    metrics?: SpeechMetrics | null;
    microFeedback?: MicroFeedback | null;
    evaluationTrace?: EvaluationTrace | null;
    trajectory?: Trajectory | null;
    pressure?: Pressure | null;
    codeEvaluation?: CodeEvaluationFeedback | null;
    testResults?: CodeTestResult[] | null;
    createdAt: string;
  };

  const [questionEvaluations, setQuestionEvaluations] = useState<QuestionEvaluationItem[]>([]);
  const [endedEarlyData, setEndedEarlyData] = useState<EndPracticeSessionResponse | null>(null);

  const stopProctoring = () => {
    try {
      proctoringStopRef.current?.();
    } catch {
      // ignore
    }
    proctoringStopRef.current = null;
    proctoringSessionIdRef.current = null;
    setProctoringStatus('inactive');
    setProctoringInfo('');
  };

  const startProctoringBestEffort = async (practiceSessionId: string) => {
    if (!enableCameraProctoring) return;

    // Avoid duplicate listener setup for the same session.
    if (proctoringStopRef.current && proctoringSessionIdRef.current === practiceSessionId) {
      return;
    }

    stopProctoring();
    setProctoringStatus('starting');
    setProctoringInfo('');

    // Reset face warnings for new session
    faceWarningCountRef.current = 0;
    setFaceWarningCount(0);
    setFaceWarningVisible(false);

    try {
      const controller = await startPracticeProctoring({
        sessionId: practiceSessionId,
        cameraStream: cameraStreamRef.current,
        onStatus: (status, info) => {
          setProctoringStatus(status);
          setProctoringInfo(info ?? '');
        },
        onMultipleFaces: (faceCount: number) => {
          const newCount = faceWarningCountRef.current + 1;
          faceWarningCountRef.current = newCount;
          setFaceWarningCount(newCount);
          setFaceWarningVisible(true);

          // Clear any existing auto-hide timer
          if (faceWarningTimerRef.current) {
            clearTimeout(faceWarningTimerRef.current);
            faceWarningTimerRef.current = null;
          }

          if (newCount >= MAX_FACE_WARNINGS) {
            // Exceeded max warnings → auto-end interview
            console.warn(`[Proctoring] ${newCount} face warnings — auto-ending interview`);
            // Don't auto-hide; the overlay stays until the interview ends
            void handleEndPracticeForProctoring(faceCount, newCount);
          } else {
            // Show warning for 6 seconds then auto-hide
            faceWarningTimerRef.current = setTimeout(() => {
              setFaceWarningVisible(false);
              faceWarningTimerRef.current = null;
            }, 6000);
          }
        },
      });

      if (!controller.isActive()) {
        // Endpoint missing or controller disabled itself.
        setEnableCameraProctoring(false);
        toast({
          title: 'Proctoring unavailable',
          description: 'Backend proctoring endpoint is not available. Running unproctored.',
          variant: 'destructive',
        });
        return;
      }

      proctoringStopRef.current = controller.stop;
      proctoringSessionIdRef.current = practiceSessionId;
    } catch (err: any) {
      setEnableCameraProctoring(false);
      setProctoringStatus('error');
      setProctoringInfo(err?.message || 'Camera access failed');
      toast({
        title: 'Camera not enabled',
        description: 'Proctored mode requires camera permission. Continuing unproctored.',
        variant: 'destructive',
      });
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopProctoring();
      if (faceWarningTimerRef.current) {
        clearTimeout(faceWarningTimerRef.current);
        faceWarningTimerRef.current = null;
      }
      try { screenRecorderRef.current?.stop(); } catch { }
      try { cameraRecorderRef.current?.stop(); } catch { }
      try { screenStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
      try { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
      screenRecorderRef.current = null;
      cameraRecorderRef.current = null;
      screenStreamRef.current = null;
      cameraStreamRef.current = null;
      setCameraPreviewStream(null);
      liveCaptureSessionIdRef.current = null;
      recordingStartedAtRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = facePreviewVideoRef.current;
    if (!el) return;

    try {
      (el as any).srcObject = cameraPreviewStream ?? null;
    } catch {
      // ignore
    }

    if (cameraPreviewStream) {
      el.muted = true;
      el.playsInline = true;
      void el.play().catch(() => {
        // ignore
      });
    }
  }, [cameraPreviewStream, sessionId, phase]);

  const renderFacePreview = () => {
    const show = !!sessionId && !!cameraPreviewStream && phase !== 'welcome' && phase !== 'setup' && phase !== 'round-selection';
    if (!show) return null;

    const track = cameraPreviewStream?.getVideoTracks?.()?.[0];
    const trackLive = !!track && track.readyState === 'live';

    return (
      <div className="fixed top-4 left-4 z-[90]">
        <div className={`w-64 overflow-hidden rounded-2xl border bg-background/70 backdrop-blur shadow-lg ${
          faceWarningCount > 0
            ? faceWarningCount >= MAX_FACE_WARNINGS
              ? 'border-red-500/80'
              : 'border-amber-500/60'
            : 'border-border/60'
        }`}>
          <div className="px-3 py-2 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Camera</span>
            <div className="flex items-center gap-2">
              {faceWarningCount > 0 && (
                <span className={`text-[10px] font-medium ${
                  faceWarningCount >= MAX_FACE_WARNINGS ? 'text-red-400' : 'text-amber-500'
                }`}>
                  ⚠ {faceWarningCount}/{MAX_FACE_WARNINGS}
                </span>
              )}
              <span className="text-[10px]">{trackLive ? 'Live' : 'Starting…'}</span>
            </div>
          </div>
          <div className="relative w-64 h-64 bg-black">
            <video
              ref={facePreviewVideoRef}
              className="w-full h-full object-cover -scale-x-100"
              autoPlay
              muted
              playsInline
            />

            {!trackLive && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="px-3 py-2 rounded-md bg-black/50 text-white text-xs">
                  Camera not streaming
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderFaceWarningOverlay = () => {
    if (!faceWarningVisible || faceWarningCount === 0) return null;

    const isTerminal = faceWarningCount >= MAX_FACE_WARNINGS;

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
        <div className={`mx-4 max-w-md w-full rounded-2xl border-2 p-6 shadow-2xl ${
          isTerminal
            ? 'border-red-500 bg-red-950/95'
            : 'border-amber-500 bg-background/95'
        }`}>
          {/* Warning Icon */}
          <div className="flex justify-center mb-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              isTerminal ? 'bg-red-500/20' : 'bg-amber-500/20'
            }`}>
              <span className="text-4xl">{isTerminal ? '⛔' : '⚠️'}</span>
            </div>
          </div>

          {/* Title */}
          <h3 className={`text-xl font-bold text-center mb-2 ${
            isTerminal ? 'text-red-400' : 'text-amber-500'
          }`}>
            {isTerminal ? 'Interview Terminated' : 'Multiple People Detected'}
          </h3>

          {/* Message */}
          <p className={`text-sm text-center mb-4 leading-relaxed ${
            isTerminal ? 'text-red-300/80' : 'text-muted-foreground'
          }`}>
            {isTerminal
              ? 'Your interview has been automatically ended because multiple people were detected on camera 3 times. This is a proctoring violation.'
              : 'Our camera detected more than one person. Please ensure only you are visible on camera during the interview.'
            }
          </p>

          {/* Warning counter */}
          <div className="flex justify-center gap-2 mb-4">
            {Array.from({ length: MAX_FACE_WARNINGS }).map((_, idx) => (
              <div
                key={idx}
                className={`w-3 h-3 rounded-full transition-all ${
                  idx < faceWarningCount
                    ? isTerminal ? 'bg-red-500' : 'bg-amber-500'
                    : 'bg-muted-foreground/20'
                }`}
              />
            ))}
          </div>

          <p className={`text-xs text-center font-mono ${
            isTerminal ? 'text-red-400' : 'text-amber-600 dark:text-amber-400'
          }`}>
            {isTerminal
              ? `Warning ${faceWarningCount}/${MAX_FACE_WARNINGS} — Session ended`
              : `Warning ${faceWarningCount}/${MAX_FACE_WARNINGS} — ${MAX_FACE_WARNINGS - faceWarningCount} remaining before auto-termination`
            }
          </p>

          {/* Dismiss button (only for non-terminal) */}
          {!isTerminal && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                className="border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                onClick={() => setFaceWarningVisible(false)}
              >
                I understand, continue
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const pickMediaRecorderMime = (candidates: string[]): string => {
    try {
      const MR = (window as any).MediaRecorder as typeof MediaRecorder | undefined;
      if (!MR?.isTypeSupported) return '';
      return candidates.find((c) => MR.isTypeSupported(c)) || '';
    } catch {
      return '';
    }
  };

  const dispatchGuestLimitReached = (source: string) => {
    try {
      window.dispatchEvent(
        new CustomEvent('demo:limit-reached', {
          detail: {
            error: 'DEMO_LIMIT_REACHED',
            message: 'Guest usage limit reached. Please sign in to continue.',
            source,
          },
        })
      );
    } catch {
      // ignore
    }
  };

  const postSessionEventBestEffort = async (sid: string, event_type: any, metadata: Record<string, unknown> = {}) => {
    try {
      const res = await postPracticeSessionProctoringEvent({
        session_id: sid,
        event_type,
        metadata,
        client_timestamp: new Date().toISOString(),
      } as any);

      if (res.status === 429) {
        dispatchGuestLimitReached('practice_session_proctoring');
        stopProctoring();
        setEnableCameraProctoring(false);
      }
    } catch {
      // best effort
    }
  };

  /**
   * When camera-proctored mode is ON, ensure the camera is live before
   * allowing the interview to start. If the camera isn't ready, request
   * permission. Throws if the user denies or the camera is unavailable.
   */
  const ensureCameraForProctoring = async (): Promise<void> => {
    if (!enableCameraProctoring) return; // Not proctored — no gate

    // Race-condition lock: prevent parallel acquire attempts
    if (cameraAcquiringRef.current) {
      console.log('[Proctoring] Camera acquisition already in progress — skipping duplicate call');
      return;
    }

    const hasLiveVideo = (stream: MediaStream | null): boolean => {
      const t = stream?.getVideoTracks?.()?.[0];
      return !!t && t.readyState === 'live';
    };

    // Camera already live
    if (hasLiveVideo(cameraStreamRef.current)) {
      setCameraPreviewStream(cameraStreamRef.current);
      return;
    }

    // Try to acquire camera
    if (!navigator?.mediaDevices?.getUserMedia) {
      toast({
        title: 'Camera required',
        description: 'Your browser does not support camera access. Please use a modern browser.',
        variant: 'destructive',
      });
      throw new Error('Camera access is required for proctored mode.');
    }

    cameraAcquiringRef.current = true;
    try {
      try { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
      cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

      if (!hasLiveVideo(cameraStreamRef.current)) {
        throw new Error('Camera video track is not live');
      }

      setCameraPreviewStream(cameraStreamRef.current);

      // Listen for camera track ending — enforce compliance: auto-end mid-interview
      const cameraTrack = cameraStreamRef.current.getVideoTracks()[0];
      try {
        cameraTrack.addEventListener('ended', () => {
          console.warn('[Proctoring] Camera track ended — enforcing session termination if active');
          const activePhases = ['question', 'recording', 'feedback', 'processing'];
          // Use refs/state to check if an interview session is active
          if (sessionId && activePhases.includes(phase)) {
            // Camera died mid-interview → compliance enforcement → auto-end
            void handleEndPracticeForCameraLoss();
          } else {
            toast({
              title: 'Camera stopped',
              description: 'Camera was disconnected. Please reconnect before starting a proctored interview.',
              variant: 'destructive',
            });
          }
          // Clean up preview
          setCameraPreviewStream(null);
        }, { once: true });
      } catch { }
    } catch (err: any) {
      try { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
      cameraStreamRef.current = null;
      setCameraPreviewStream(null);

      toast({
        title: 'Camera required for proctored mode',
        description: 'Please allow camera access to start the interview. The camera must be on for proctored interviews.',
        variant: 'destructive',
      });
      throw new Error('Camera is required for proctored mode. Please allow camera access and try again.');
    } finally {
      cameraAcquiringRef.current = false;
    }
  };

  const ensureLiveMediaReady = async (): Promise<{ screen_shared: boolean; camera_enabled: boolean }> => {
    const hasLiveVideo = (stream: MediaStream | null): boolean => {
      const t = stream?.getVideoTracks?.()?.[0];
      return !!t && t.readyState === 'live';
    };

    if (hasLiveVideo(screenStreamRef.current) && hasLiveVideo(cameraStreamRef.current)) {
      setLiveMediaStatus('ready');
      setLiveMediaInfo('');
      setCameraPreviewStream(cameraStreamRef.current);
      return { screen_shared: true, camera_enabled: true };
    }

    setLiveMediaStatus('starting');
    setLiveMediaInfo('');

    if (!navigator?.mediaDevices?.getDisplayMedia || !navigator?.mediaDevices?.getUserMedia) {
      setLiveMediaStatus('error');
      setLiveMediaInfo('Browser does not support screen/camera capture');
      throw new Error('Screen share + camera are required to start (not supported in this browser).');
    }

    // Acquire screen share first (so user sees the purpose), then camera.
    try {
      if (!hasLiveVideo(screenStreamRef.current)) {
        try { screenStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
        screenStreamRef.current = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false } as any);
      }
      if (!hasLiveVideo(cameraStreamRef.current)) {
        try { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
        cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      if (!hasLiveVideo(screenStreamRef.current) || !hasLiveVideo(cameraStreamRef.current)) {
        throw new Error('Missing screen or camera video track');
      }

      setCameraPreviewStream(cameraStreamRef.current);

      // Track ended listeners → proctoring events (best-effort)
      const screenTrack = screenStreamRef.current.getVideoTracks()[0];
      const cameraTrack = cameraStreamRef.current.getVideoTracks()[0];

      const onScreenEnded = () => {
        const sid = liveCaptureSessionIdRef.current;
        if (!sid) return;
        void postSessionEventBestEffort(sid, 'SCREEN_STOPPED', { reason: 'track_ended' });

        setLiveMediaStatus('error');
        setLiveMediaInfo('Screen sharing stopped. Please re-share your entire screen to continue.');
        toast({
          title: 'Screen sharing stopped',
          description: 'Please re-share your entire screen to continue Live Practice.',
          variant: 'destructive',
        });
      };
      const onCameraEnded = () => {
        const sid = liveCaptureSessionIdRef.current;
        if (!sid) return;
        void postSessionEventBestEffort(sid, 'CAMERA_STOPPED', { reason: 'track_ended' });

        setLiveMediaStatus('error');
        setLiveMediaInfo('Camera stopped. Please re-enable camera to continue.');
        toast({
          title: 'Camera stopped',
          description: 'Please re-enable your camera to continue Live Practice.',
          variant: 'destructive',
        });
      };

      try { screenTrack.addEventListener('ended', onScreenEnded, { once: true } as any); } catch { }
      try { cameraTrack.addEventListener('ended', onCameraEnded, { once: true } as any); } catch { }

      setLiveMediaStatus('ready');
      setLiveMediaInfo('');
      return { screen_shared: true, camera_enabled: true };
    } catch (err: any) {
      setLiveMediaStatus('error');
      setLiveMediaInfo(err?.message || 'Could not start screen share + camera');
      try { screenStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
      try { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
      screenStreamRef.current = null;
      cameraStreamRef.current = null;
      setCameraPreviewStream(null);
      throw new Error('Screen share + camera are required to start. Please allow permissions and try again.');
    }
  };

  const startLiveCaptureForSession = async (sid: string) => {
    if (!sid) return;
    if (liveCaptureSessionIdRef.current === sid) return;

    // Only start recording if MediaRecorder exists.
    if (!(window as any).MediaRecorder) {
      liveCaptureSessionIdRef.current = sid;
      return;
    }

    const screen = screenStreamRef.current;
    const cam = cameraStreamRef.current;
    if (!screen || !cam) {
      liveCaptureSessionIdRef.current = sid;
      return;
    }

    liveCaptureSessionIdRef.current = sid;
    recordingStartedAtRef.current = Date.now();

    void postSessionEventBestEffort(sid, 'SESSION_STARTED_WITH_PROCTORING', {
      screen_track: screen.getVideoTracks()?.[0]?.label,
      camera_track: cam.getVideoTracks()?.[0]?.label,
    });

    const videoCandidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mime = pickMediaRecorderMime(videoCandidates);

    const startOne = (stream: MediaStream, kind: 'screen' | 'camera') => {
      const rec = new MediaRecorder(stream as any, mime ? ({ mimeType: mime } as any) : undefined);
      const chunksRef = kind === 'screen' ? screenChunksRef : cameraChunksRef;
      const recorderRef = kind === 'screen' ? screenRecorderRef : cameraRecorderRef;
      chunksRef.current = [];
      recorderRef.current = rec;

      rec.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      rec.onstop = async () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' });
        if (!blob.size) return;

        const durationSeconds = recordingStartedAtRef.current ? (Date.now() - recordingStartedAtRef.current) / 1000 : undefined;
        try {
          await uploadPracticeSessionMedia({
            sessionId: sid,
            media_type: kind,
            file: blob,
            filename: `${kind}.webm`,
            duration_seconds: durationSeconds,
          });
        } catch (err: any) {
          if (err instanceof StrataxApiError && err.status === 429) {
            dispatchGuestLimitReached('practice_session_media_upload');
            stopProctoring();
            setEnableCameraProctoring(false);
          }
        }
      };

      try {
        rec.start(1000);
      } catch {
        // ignore
      }
    };

    try { startOne(screen, 'screen'); } catch { }
    try { startOne(cam, 'camera'); } catch { }
  };

  useEffect(() => {
    const shouldTearDown =
      phase === 'welcome' ||
      phase === 'setup' ||
      phase === 'round-selection';

    if (!shouldTearDown) return;
    if (!liveCaptureSessionIdRef.current) return;

    try { screenRecorderRef.current?.stop(); } catch { }
    try { cameraRecorderRef.current?.stop(); } catch { }
    try { screenStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
    try { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
    screenRecorderRef.current = null;
    cameraRecorderRef.current = null;
    screenStreamRef.current = null;
    cameraStreamRef.current = null;
    liveCaptureSessionIdRef.current = null;
    recordingStartedAtRef.current = null;
    setCameraPreviewStream(null);
    setLiveMediaStatus('inactive');
    setLiveMediaInfo('');
  }, [phase]);

  // When the session ends, stop recorders and upload final chunks,
  // but keep the screen/camera streams alive so the user stays sharing on the complete screen.
  useEffect(() => {
    if (phase !== 'complete') return;
    if (!liveCaptureSessionIdRef.current) return;

    try { screenRecorderRef.current?.stop(); } catch { }
    try { cameraRecorderRef.current?.stop(); } catch { }
    screenRecorderRef.current = null;
    cameraRecorderRef.current = null;
    liveCaptureSessionIdRef.current = null;
    recordingStartedAtRef.current = null;
  }, [phase]);

  // Best-effort navigation lock while screen sharing is active.
  useEffect(() => {
    const getTrackLive = (stream: MediaStream | null): boolean => {
      const track = stream?.getVideoTracks?.()?.[0];
      return !!track && track.readyState === 'live';
    };

    const lockActive =
      !!sessionId &&
      getTrackLive(screenStreamRef.current) &&
      phase !== 'welcome' &&
      phase !== 'setup' &&
      phase !== 'round-selection';

    // Broadcast to parent container (InterviewAssistant) so it can disable tab switching/links.
    if (lockActive !== practiceScreenShareLockRef.current) {
      practiceScreenShareLockRef.current = lockActive;
      try {
        window.dispatchEvent(new CustomEvent('practice:screen-share-lock', { detail: { active: lockActive } }));
      } catch {
        // ignore
      }
    }

    if (!lockActive) return;

    let pushed = false;
    const pushLockState = () => {
      if (pushed) return;
      pushed = true;
      try {
        window.history.pushState({ practiceLock: true }, '', window.location.href);
      } catch {
        // ignore
      }
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome requires returnValue to be set.
      e.returnValue = '';
      return '';
    };

    const onPopState = () => {
      // Keep user on the current screen while sharing.
      try {
        window.history.pushState({ practiceLock: true }, '', window.location.href);
      } catch {
        // ignore
      }
      toast({
        title: 'Screen sharing is active',
        description: 'Finish Live Practice before navigating away.',
      });
    };

    const isEditableTarget = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = (el as any).tagName ? String((el as any).tagName).toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if ((el as any).isContentEditable) return true;
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Block common "back" shortcuts while sharing.
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'Left')) {
        e.preventDefault();
        return;
      }

      if (e.key === 'Backspace' && !isEditableTarget(e.target)) {
        e.preventDefault();
        return;
      }
    };

    pushLockState();
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('keydown', onKeyDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, phase, liveMediaStatus]);

  // Ensure we clear the lock flag on unmount.
  useEffect(() => {
    return () => {
      if (!practiceScreenShareLockRef.current) return;
      practiceScreenShareLockRef.current = false;
      try {
        window.dispatchEvent(new CustomEvent('practice:screen-share-lock', { detail: { active: false } }));
      } catch {
        // ignore
      }
    };
  }, []);

  // Adaptive Profile state
  const [profileDomain, setProfileDomain] = useState('');
  const [profileExperience, setProfileExperience] = useState<number>(0);
  const [profileSkills, setProfileSkills] = useState<string>('');
  const [profileJobRole, setProfileJobRole] = useState('');
  const [profileCompany, setProfileCompany] = useState('');
  const [profileFocus, setProfileFocus] = useState<string>('');

  // Persist the last domain so we can show insights on next visit even before setup.
  useEffect(() => {
    const d = profileDomain?.trim();
    if (!d) return;
    try { window.localStorage.setItem('practice_last_domain', d); } catch { }
  }, [profileDomain]);

  // When user toggles proctoring ON → immediately acquire camera (don't wait for Start).
  // When toggled OFF → tear down proctoring. If a session is active, also start the proctoring loop.
  useEffect(() => {
    if (!enableCameraProctoring) {
      stopProctoring();
      return;
    }

    // Eagerly acquire camera so the user sees preview instantly & we fail fast on denial
    void ensureCameraForProctoring().catch((err) => {
      console.warn('[Proctoring] Eager camera acquire failed on toggle ON:', err?.message);
      // Flip toggle back off — user denied camera
      setEnableCameraProctoring(false);
    });

    if (sessionId) {
      void startProctoringBestEffort(sessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableCameraProctoring, sessionId]);

  // Load insights (best-effort). Keep UI silent if endpoint isn't available.
  useEffect(() => {
    const domain = (profileDomain || (typeof window !== 'undefined' ? window.localStorage.getItem('practice_last_domain') : '') || '').trim();
    if (!domain) return;

    let cancelled = false;
    setPracticeInsightsLoading(true);
    getPracticeInsights({ domain, lookback_days: 30 })
      .then((data) => {
        if (cancelled) return;
        setPracticeInsights(data);
      })
      .catch(() => {
        // Intentionally silent: insights are optional.
      })
      .finally(() => {
        if (cancelled) return;
        setPracticeInsightsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profileDomain]);

  const renderPracticeInsights = () => {
    const focus = Array.isArray(practiceInsights?.recommended_focus)
      ? practiceInsights!.recommended_focus!.filter(Boolean).slice(0, 3)
      : [];

    if (focus.length === 0 && !practiceInsightsLoading) return null;

    const overall = (practiceInsights?.overall || {}) as Record<string, unknown>;
    const correctness = typeof overall.correctness === 'number' ? overall.correctness : null;
    const confidence = typeof overall.confidence === 'number' ? overall.confidence : null;
    const filler = typeof overall.filler === 'number' ? overall.filler : null;

    const labelFromScore = (value: number | null, thresholds: { needsWork: number; steady: number }) => {
      if (value == null || Number.isNaN(value)) return 'steady';
      if (value < thresholds.needsWork) return 'needs work';
      if (value < thresholds.steady) return 'steady';
      return 'steady';
    };

    // Avoid claiming trends; give a simple direction-like signal.
    const correctnessLabel = labelFromScore(correctness, { needsWork: 0.7, steady: 0.85 });
    const confidenceLabel = labelFromScore(confidence, { needsWork: 0.65, steady: 0.8 });
    // Filler is inverted (more filler is worse). Keep thresholds conservative.
    const deliveryLabel = filler != null && filler > 10 ? 'needs work' : 'steady';

    const basedOnLine = (() => {
      const n = typeof practiceInsights?.lookback_sessions === 'number' ? practiceInsights!.lookback_sessions : null;
      if (n && n > 0) return `Based on your last ${n} practice sessions.`;
      return 'Based on your recent practice sessions.';
    })();

    return (
      <div className="p-3 bg-muted/30 rounded-2xl border border-border/60">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Your focus for next session</div>
            <div className="text-[10px] text-muted-foreground mt-1">{basedOnLine}</div>
          </div>
          {practiceInsightsLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {focus.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {focus.map((x, idx) => (
              <div key={`${x}-${idx}`} className="flex items-start gap-2 text-[12px]">
                <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/70" />
                <div className="text-foreground/90 font-medium leading-snug">{x}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Recent performance</div>
          <div className="mt-2 grid grid-cols-1 gap-1 text-[12px] text-muted-foreground">
            <div className="flex items-center justify-between"><span>Correctness</span><span className="text-foreground/80">{correctnessLabel}</span></div>
            <div className="flex items-center justify-between"><span>Confidence</span><span className="text-foreground/80">{confidenceLabel}</span></div>
            <div className="flex items-center justify-between"><span>Delivery clarity</span><span className="text-foreground/80">{deliveryLabel}</span></div>
          </div>
        </div>
      </div>
    );
  };

  // Feedback state
  const [transcription, setTranscription] = useState<string>('');
  const [speechMetrics, setSpeechMetrics] = useState<SpeechMetrics | null>(null);
  const [microFeedback, setMicroFeedback] = useState<MicroFeedback | null>(null);
  const [evaluationTrace, setEvaluationTrace] = useState<EvaluationTrace | null>(null);
  const [trajectory, setTrajectory] = useState<Trajectory | null>(null);
  const [pressure, setPressure] = useState<Pressure | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [completionPending, setCompletionPending] = useState(false);

  // Phase 4: post-session self-reported confidence (1-5)
  const [sessionConfidenceDraft, setSessionConfidenceDraft] = useState<number | null>(null);
  const [sessionConfidenceStatus, setSessionConfidenceStatus] = useState<
    'idle' | 'submitting' | 'saved' | 'skipped' | 'disabled' | 'error'
  >('idle');

  const getSessionConfidenceStorageKey = (sid: string) => `practice_session_confidence_v1:${sid}`;

  const loadSessionConfidenceState = (sid: string): SessionConfidenceStoredState | null => {
    if (!sid || typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(getSessionConfidenceStorageKey(sid));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed as SessionConfidenceStoredState;
    } catch {
      return null;
    }
  };

  const persistSessionConfidenceState = (sid: string, state: SessionConfidenceStoredState) => {
    if (!sid || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        getSessionConfidenceStorageKey(sid),
        JSON.stringify({
          ...state,
          updatedAt: Date.now(),
        } satisfies SessionConfidenceStoredState)
      );
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (phase !== 'complete') return;
    if (!sessionId) return;

    const stored = loadSessionConfidenceState(sessionId);
    if (stored?.disabled) {
      setSessionConfidenceStatus('disabled');
      setSessionConfidenceDraft(typeof stored.value === 'number' ? stored.value : null);
      return;
    }

    if (stored?.skipped) {
      setSessionConfidenceStatus('skipped');
      setSessionConfidenceDraft(typeof stored.value === 'number' ? stored.value : null);
      return;
    }

    if (typeof stored?.value === 'number' && stored.value >= 1 && stored.value <= 5) {
      setSessionConfidenceDraft(stored.value);
      setSessionConfidenceStatus('saved');
      return;
    }

    setSessionConfidenceDraft(null);
    setSessionConfidenceStatus('idle');
  }, [phase, sessionId]);

  const submitSessionConfidenceBestEffort = async (sid: string, value: number) => {
    setSessionConfidenceDraft(value);
    setSessionConfidenceStatus('submitting');

    try {
      const result: any = await submitSessionConfidence(sid, value);

      if (result.ok) {
        setSessionConfidenceStatus('saved');
        persistSessionConfidenceState(sid, { value });
        return;
      }

      const disabled = (result as any)?.disabled === true;
      if (!result.ok && disabled) {
        setSessionConfidenceStatus('disabled');
        persistSessionConfidenceState(sid, { disabled: true });
        return;
      }

      setSessionConfidenceStatus('error');
      toast({
        title: 'Could not save confidence rating',
        description: 'Please try again (this won’t affect your report).',
        variant: 'destructive',
      });
    } catch (err: any) {
      setSessionConfidenceStatus('error');
      toast({
        title: 'Could not save confidence rating',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const skipSessionConfidencePrompt = (sid: string) => {
    setSessionConfidenceStatus('skipped');
    persistSessionConfidenceState(sid, { skipped: true });
  };

  // Phase 3: human feedback rating (best-effort)
  const [feedbackRatingDraftByQuestion, setFeedbackRatingDraftByQuestion] = useState<Record<number, FeedbackRatingDraft>>({});
  const [ratedByQuestion, setRatedByQuestion] = useState<Record<number, boolean>>({});
  const [ratingSubmittingByQuestion, setRatingSubmittingByQuestion] = useState<Record<number, boolean>>({});

  // Code submission state (for coding questions)
  const [codeTestResults, setCodeTestResults] = useState<CodeTestResult[] | null>(null);
  const [codeEvaluation, setCodeEvaluation] = useState<CodeEvaluationFeedback | null>(null);
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);

  // Recording timer
  const recordingTimerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const audioLevelIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
    };
  }, []);

  // Start countdown timer for coding questions
  useEffect(() => {
    // Only start timer for coding questions in question phase
    if (phase === 'question' && currentQuestion && isCodingQuestion(currentQuestion)) {
      console.log('⏱️ [Coding Timer] Starting countdown for coding question');

      // Clear any existing timer
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }

      // Start countdown
      countdownTimerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            // Time's up! Auto-submit code
            if (countdownTimerRef.current) {
              clearInterval(countdownTimerRef.current);
            }
            console.log('⏰ [Coding Timer] Time limit exceeded');

            toast({
              title: 'Time\'s up',
              description: 'Time limit reached for this coding question.',
              variant: 'warning',
            });

            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
        }
      };
    }
  }, [phase, currentQuestion]);

  // Reset and stream question text when a new question is shown.
  useEffect(() => {
    // NOTE: During answer submission we keep phase='question' for UX stability.
    // Without this guard, moving from 'recording' -> 'question' while submitting
    // would cause the SAME question to restart streaming.
    if (phase !== 'question' || !currentQuestion || isProcessing) {
      cancelQuestionStreaming();
      return;
    }

    cancelQuestionStreaming();

    const full = getQuestionPromptText(currentQuestion);
    setStreamedQuestionText('');

    if (!full) {
      setIsQuestionStreaming(false);
      return;
    }

    const key = `${sessionId ?? 'no-session'}:${(currentQuestion as any)?.id ?? currentQuestionNumber}`;
    questionStreamKeyRef.current = key;
    const runId = (questionStreamRunIdRef.current += 1);

    const words = full.split(/\s+/).filter(Boolean);
    if (words.length <= 1) {
      setStreamedQuestionText(full);
      setIsQuestionStreaming(false);
      return;
    }

    // Mark as streaming immediately so answer UI can be gated even while we wait for audio metadata.
    setIsQuestionStreaming(true);

    // Smooth fallback streamer (no TTS): reveal progressively over time.
    const startTimeBasedStreaming = (targetMsPerWord: number) => {
      const targetTotalMs = Math.round(Math.max(600, Math.min(120_000, targetMsPerWord * words.length)));
      const startAt = performance.now();
      let lastLen = -1;

      const tick = (now: number) => {
        if (questionStreamKeyRef.current !== key) return;
        if (questionStreamRunIdRef.current !== runId) return;

        const elapsed = now - startAt;
        const progress = Math.min(1, Math.max(0, elapsed / targetTotalMs));
        const len = Math.floor(progress * full.length);

        if (len !== lastLen) {
          lastLen = len;
          setStreamedQuestionText(full.slice(0, len));
        }

        if (progress >= 1) {
          setIsQuestionStreaming(false);
          setStreamedQuestionText(full);
          questionStreamRafRef.current = null;
          return;
        }

        questionStreamRafRef.current = requestAnimationFrame(tick);
      };

      questionStreamRafRef.current = requestAnimationFrame(tick);
    };

    // TTS-synced streamer: drive reveal directly off the audio playback position.
    const startTtsSyncedStreaming = () => {
      const audio = audioPlayerRef.current;
      const duration = audio?.duration;
      const hasDuration = Number.isFinite(duration) && (duration ?? 0) > 0;
      if (!audio || !hasDuration) return false;

      let lastLen = -1;

      const tick = () => {
        if (questionStreamKeyRef.current !== key) return;
        if (questionStreamRunIdRef.current !== runId) return;

        const d = audio.duration;
        const t = audio.currentTime;
        const progress = (Number.isFinite(d) && d > 0 && Number.isFinite(t) && t >= 0)
          ? Math.min(1, Math.max(0, t / d))
          : 0;

        const len = Math.floor(progress * full.length);
        if (len !== lastLen) {
          lastLen = len;
          setStreamedQuestionText(full.slice(0, len));
        }

        if (progress >= 1 || audio.ended) {
          setIsQuestionStreaming(false);
          setStreamedQuestionText(full);
          questionStreamRafRef.current = null;
          return;
        }

        questionStreamRafRef.current = requestAnimationFrame(tick);
      };

      questionStreamRafRef.current = requestAnimationFrame(tick);
      return true;
    };

    const computeMsPerWord = () => {
      const durationFromAudio = audioPlayerRef.current?.duration;
      const durationSeconds = (Number.isFinite(durationFromAudio) && (durationFromAudio ?? 0) > 0)
        ? (durationFromAudio as number)
        : (questionAudioDurationRef.current && questionAudioDurationRef.current > 0 ? questionAudioDurationRef.current : null);

      // If we have a known audio duration, roughly match it; otherwise default to a brisk but readable pace.
      // Slightly faster than before for a more "instant" feel.
      return durationSeconds
        ? Math.max(70, Math.min(500, Math.round((durationSeconds * 1000) / words.length)))
        : 160;
    };

    // If TTS is enabled, give metadata a brief moment so pacing can better match audio.
    let tries = 0;
    const maybeStart = () => {
      if (questionStreamKeyRef.current !== key) return;
      if (questionStreamRunIdRef.current !== runId) return;
      const duration = audioPlayerRef.current?.duration;
      const hasDuration = Number.isFinite(duration) && (duration ?? 0) > 0;
      if (enableTTS && hasDuration) {
        // Sync exactly to TTS playback (pauses/buffering will also pause text).
        if (startTtsSyncedStreaming()) return;
      }

      if (tries >= 60 || !enableTTS) {
        startTimeBasedStreaming(computeMsPerWord());
        return;
      }
      tries += 1;
      questionStreamTimerRef.current = window.setTimeout(maybeStart, 75);
    };

    maybeStart();

    return () => {
      cancelQuestionStreaming();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentQuestion, currentQuestionNumber, enableTTS, sessionId, isProcessing]);

  const handleStartInterview = async () => {
    cancelQuestionStreaming();
    setIsProcessing(true);
    try {
      // Gate: camera must be live if proctored mode is ON
      await ensureCameraForProctoring();
      setQuestionEvaluations([]);
      const gate = await ensureLiveMediaReady();

      // Build user profile if adaptive mode is enabled
      let userProfile: UserProfile | undefined = undefined;
      if (enableAdaptive && profileDomain && profileExperience > 0) {
        userProfile = {
          domain: profileDomain,
          experience_years: profileExperience,
          skills: profileSkills.split(',').map(s => s.trim()).filter(Boolean),
        };

        if (profileJobRole) userProfile.job_role = profileJobRole;
        if (profileCompany) userProfile.company_preference = profileCompany;
        if (profileFocus) {
          userProfile.interview_focus = profileFocus.split(',').map(s => s.trim()).filter(Boolean);
        }
      }

      const response = await startInterview(
        selectedRole,
        selectedDifficulty,
        enableTTS,
        undefined,  // category (optional)
        userProfile,  // adaptive profile
        questionCount,  // NEW - number of questions
        gate
      );
      console.log('🎯 [Practice Mode] Start Interview Response:', response);
      console.log('🔢 [Practice Mode] Total Questions from API:', response.total_questions);
      if (userProfile) {
        console.log('🧠 [Adaptive Mode] Using profile:', userProfile);
      }

      setSessionId(response.session_id);
      setCurrentQuestion(response.first_question);
      setCurrentQuestionNumber(1);
      setTotalQuestions(response.total_questions);  // Use total from API response
      setTimeRemaining(response.first_question.time_limit);
      setCompletionPending(false);
      setPhase('question');

      void startLiveCaptureForSession(response.session_id);
      // Proctoring is started by the enableCameraProctoring/sessionId effect.

      // DO NOT start countdown timer here - it starts when user clicks "Start Recording"

      // Play TTS audio if available
      if (response.tts_audio_url && enableTTS) {
        try {
          setIsAudioLoading(true);
          const audioUrl = `${API_BASE_URL}${response.tts_audio_url}`;
          console.log('🔊 [Practice Mode] Playing question audio:', audioUrl);

          const audio = new Audio(audioUrl);
          audioPlayerRef.current = audio;

          audio.onloadedmetadata = () => {
            try {
              if (Number.isFinite(audio.duration)) {
                questionAudioDurationRef.current = audio.duration;
              }
            } catch {
              // ignore
            }
          };

          audio.onloadeddata = () => {
            console.log('✅ Audio loaded successfully');
            setIsAudioLoading(false);
          };

          audio.onplay = () => {
            console.log('▶️ Audio playback started');
            setIsPlayingAudio(true);
          };

          audio.onended = () => {
            console.log('⏹️ Audio playback finished');
            setIsPlayingAudio(false);
          };

          audio.onerror = (e) => {
            console.error('❌ Audio playback error:', e);
            setIsAudioLoading(false);
            setIsPlayingAudio(false);
            toast({
              title: 'Audio unavailable',
              description: 'Could not play question audio. You can still read and answer.',
              variant: 'warning',
            });
          };

          await audio.play();
        } catch (err) {
          console.error('❌ Error playing audio:', err);
          setIsAudioLoading(false);
          setIsPlayingAudio(false);
          toast({
            title: 'Audio unavailable',
            description: 'Could not play question audio. You can still read and answer.',
            variant: 'warning',
          });
        }
      }

      toast({
        title: 'Interview started',
        description: `Question 1 of ${response.total_questions}`,
        variant: 'success',
      });
    } catch (error: any) {
      console.error('❌ [Practice Mode] Start Interview Error:', error);
      toast({
        title: 'Failed to start',
        description: 'Could not start the interview. Please check your connection and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickStart = async () => {
    cancelQuestionStreaming();
    if (!quickStartInput.trim()) {
      toast({
        title: 'Input Required',
        description: 'Please describe your interview preparation needs',
        variant: 'destructive',
      });
      return;
    }

    setQuickStartLoading(true);
    try {
      // Gate: camera must be live if proctored mode is ON
      await ensureCameraForProctoring();
      setQuestionEvaluations([]);
      const gate = await ensureLiveMediaReady();

      // Quick Start: AI decides EVERYTHING - no manual overrides
      const response = await quickStartInterview(
        quickStartInput,
        true,
        enableTTS,
        1,
        undefined,
        undefined,
        gate,
        resumeContext
      );
      console.log('🚀 [Quick Start] Response:', response);
      console.log('📊 [Quick Start] Inferred Profile:', response.inferred_profile);
      console.log('🔢 [Quick Start] Total Questions:', response.total_questions);
      console.log('📍 [Quick Start] Progress:', response.progress);

      setAiMessage(response.ai_message);
      setSessionId(response.session_id);
      setCurrentQuestion(response.first_question);
      setCurrentQuestionNumber(1);

      // Set question count from API response
      setTotalQuestions(response.total_questions);
      console.log('✅ [Quick Start] Total Questions Set:', response.total_questions);

      if (response.inferred_profile?.target_company) {
        console.log('🏢 [Quick Start] Target Company:', response.inferred_profile.target_company);
      }

      setTimeRemaining(response.first_question.time_limit);
      setCompletionPending(false);
      setPhase('question');

      void startLiveCaptureForSession(response.session_id);
      // Proctoring is started by the enableCameraProctoring/sessionId effect.

      // Play TTS audio if available
      if (response.tts_audio_url && enableTTS) {
        try {
          setIsAudioLoading(true);
          const audioUrl = `${API_BASE_URL}${response.tts_audio_url}`;
          console.log('🔊 [Quick Start] Playing question audio:', audioUrl);

          const audio = new Audio(audioUrl);
          audioPlayerRef.current = audio;

          audio.onloadedmetadata = () => {
            try {
              if (Number.isFinite(audio.duration)) {
                questionAudioDurationRef.current = audio.duration;
              }
            } catch {
              // ignore
            }
          };

          audio.onloadeddata = () => {
            setIsAudioLoading(false);
          };

          audio.onplay = () => {
            setIsPlayingAudio(true);
          };

          audio.onended = () => {
            setIsPlayingAudio(false);
          };

          audio.onerror = () => {
            setIsAudioLoading(false);
            setIsPlayingAudio(false);
          };

          await audio.play();
        } catch (err) {
          console.error('❌ Error playing audio:', err);
          setIsAudioLoading(false);
          setIsPlayingAudio(false);
        }
      }

      toast({
        title: 'Interview started',
        description: response.ai_message,
        variant: 'success',
      });
    } catch (error: any) {
      console.error('❌ [Quick Start] Error:', error);
      toast({
        title: 'Quick start failed',
        description: 'Could not start the interview. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setQuickStartLoading(false);
    }
  };

  const handleStartRecording = async () => {
    try {
      await audioRecorder.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      setPhase('recording');

      // Start recording timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      // Start countdown timer (starts when recording begins)
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }

      countdownTimerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            // Time's up! Auto-submit
            if (countdownTimerRef.current) {
              clearInterval(countdownTimerRef.current);
            }
            console.log('⏰ [Practice Mode] Time limit exceeded - auto-submitting');

            toast({
              title: 'Time\'s up',
              description: 'Auto-submitting your answer...',
              variant: 'warning',
            });

            // Trigger auto-submit
            setTimeout(() => {
              handleStopRecording();
            }, 100);

            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Get real-time audio level from microphone
      audioLevelIntervalRef.current = setInterval(() => {
        const level = audioRecorder.current.getAudioLevel();
        setAudioLevel(level);
      }, 50); // Update 20 times per second for smooth animation

      toast({
        title: 'Recording started',
        description: 'Speak your answer clearly',
        variant: 'success',
      });
    } catch (error: any) {
      console.error('❌ [Practice Mode] Microphone Error:', error);
      toast({
        title: 'Microphone error',
        description: 'Could not access your microphone. Please check browser permissions and try again.',
        variant: 'destructive',
      });
    }
  };

  const handleStopRecording = async () => {
    if (!isRecording || !sessionId) return;

    cancelQuestionStreaming();
    setIsProcessing(true);
    // Keep UX stable: do not show an explicit "Analyzing" screen.
    setPhase('question');

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }
    setAudioLevel(0);

    try {
      const audioBlob = await audioRecorder.current.stop();
      setIsRecording(false);
      console.log('🎤 [Practice Mode] Audio Blob Size:', audioBlob.size, 'bytes, Type:', audioBlob.type);

      const effectiveQuestionId = currentQuestion?.id ?? currentQuestionNumber;
      const response = await submitAnswer(sessionId, effectiveQuestionId, audioBlob);
      console.log('📊 [Practice Mode] Submit Answer Response:', response);
      console.log('🔍 [Practice Mode] evaluation_trace:', JSON.stringify(response.evaluation_trace, null, 2));
      console.log('🔍 [Practice Mode] trajectory:', JSON.stringify(response.trajectory, null, 2));

      // Populate the per-question feedback UI state
      setTranscription(response.transcript || '');
      setSpeechMetrics(response.metrics || null);
      setMicroFeedback(response.micro_feedback || null);
      setEvaluationTrace(response.evaluation_trace ?? null);
      setTrajectory(response.trajectory ?? null);
      setPressure(response.pressure ?? null);

      // Store per-question evaluation for the final report (do not render per-question feedback).
      setQuestionEvaluations((prev) => ([
        ...prev,
        {
          questionNumber: currentQuestionNumber,
          questionId: effectiveQuestionId,
          questionText: getQuestionPromptText(currentQuestion),
          kind: 'voice',
          transcript: response.transcript,
          metrics: response.metrics,
          microFeedback: response.micro_feedback,
          evaluationTrace: response.evaluation_trace ?? null,
          trajectory: response.trajectory ?? null,
          pressure: response.pressure ?? null,
          createdAt: new Date().toISOString(),
        },
      ]));

      setCompletionPending(!!response.complete);

      // If backend already included final report, keep it ready for the completion screen.
      if (response.complete && response.evaluation_report) {
        setEvaluation(response.evaluation_report);
      }

      // Show the existing post-answer feedback screen (micro-feedback + optional extensions).
      setPhase('feedback');
    } catch (error: any) {
      console.error('❌ [Practice Mode] Submit Answer Error:', error);
      console.error('❌ [Practice Mode] Error Details:', {
        message: error.message,
        stack: error.stack,
        sessionId,
        questionId: currentQuestion?.id,
        phase,
      });

      if (error instanceof StrataxApiError && error.status === 429) {
        dispatchGuestLimitReached('practice_submit_answer');
      }

      setIsRecording(false);
      toast({
        title: 'Submission failed',
        description: 'Could not submit your answer. Please try again.',
        variant: 'destructive',
      });
      setPhase('question');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmitCode = async (code: string, timeTaken: number) => {
    if (!sessionId || !currentQuestion) {
      console.error('❌ [Practice Mode] Cannot submit code: Missing session or question');
      return;
    }

    cancelQuestionStreaming();

    setIsSubmittingCode(true);
    // Keep UX stable: do not show an explicit "Analyzing" screen.

    try {
      console.log('💻 [Practice Mode] Submitting code for question:', currentQuestion.id);

      const response: SubmitCodeResponse = await submitCode(
        sessionId,
        currentQuestion.id || currentQuestionNumber,
        code,
        currentQuestion.programming_language || 'python',
        timeTaken
      );

      console.log('✅ [Practice Mode] Code submission response:', response);
      console.log('🔍 [Practice Mode] Code evaluation:', JSON.stringify(response.evaluation, null, 2));
      console.log('🔍 [Practice Mode] Test results:', JSON.stringify(response.test_results, null, 2));

      // Store per-question evaluation for the final report.
      setQuestionEvaluations((prev) => ([
        ...prev,
        {
          questionNumber: currentQuestionNumber,
          questionId: currentQuestion.id || currentQuestionNumber,
          questionText: getQuestionPromptText(currentQuestion),
          kind: 'code',
          codeEvaluation: response.evaluation,
          testResults: response.test_results,
          createdAt: new Date().toISOString(),
        },
      ]));

      // Store code evaluation in component state so the feedback phase can display it.
      setCodeTestResults(response.test_results ?? null);
      setCodeEvaluation(response.evaluation ?? null);

      setCompletionPending(!!response.complete);

      if (response.complete) {
        // Session is complete — show per-question code feedback first, then user clicks Finish → complete.
        console.log('🎉 [Practice Mode] Session complete; loading final report.');
        if (response.evaluation_report) {
          setEvaluation(response.evaluation_report);
        }
        // Show feedback phase so user can review code results before final summary.
        setPhase('feedback');
      } else {
        // Show code feedback before advancing to next question.
        setPhase('feedback');
      }
    } catch (error: any) {
      console.error('❌ [Practice Mode] Code submission error:', error);

      if (error instanceof StrataxApiError && error.status === 429) {
        dispatchGuestLimitReached('practice_submit_code');
      }

      setIsSubmittingCode(false);
      toast({
        title: 'Submission failed',
        description: 'Could not submit your code. Please try again.',
        variant: 'destructive',
      });
      setPhase('question');
    } finally {
      setIsSubmittingCode(false);
    }
  };

  const handleRestart = () => {
    stopProctoring();
    cancelQuestionStreaming();
    setPhase('welcome');
    setSessionId(null);
    setCurrentQuestion(null);
    setCurrentQuestionNumber(0);
    setQuestionEvaluations([]);
    setTranscription('');
    setSpeechMetrics(null);
    setMicroFeedback(null);
    setEvaluation(null);
    setCompletionPending(false);
    setRecordingTime(0);
    setEndedEarlyData(null);
    // Reset face warnings
    faceWarningCountRef.current = 0;
    setFaceWarningCount(0);
    setFaceWarningVisible(false);
    if (faceWarningTimerRef.current) {
      clearTimeout(faceWarningTimerRef.current);
      faceWarningTimerRef.current = null;
    }
  };

  const handleEndPractice = async () => {
    if (!sessionId) return;
    if (!confirm("End practice interview early? You'll receive feedback for questions answered so far.")) return;
    try {
      const result = await endPracticeSession(sessionId);
      setEndedEarlyData(result);
      stopProctoring();
      cancelQuestionStreaming();
      setPhase('complete');
      toast({
        title: "Interview Ended",
        description: `Results ready for ${result.questions_answered ?? currentQuestionNumber} answered question${(result.questions_answered ?? currentQuestionNumber) !== 1 ? 's' : ''}.`,
      });
    } catch (err) {
      console.error("Failed to end practice session:", err);
      toast({
        title: "Failed to end interview",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  // Auto-end triggered by proctoring (multiple faces detected too many times)
  const handleEndPracticeForProctoring = async (faceCount: number, warningNumber: number) => {
    if (!sessionId) return;
    try {
      const result = await endPracticeSession(sessionId);
      setEndedEarlyData(result);
      stopProctoring();
      cancelQuestionStreaming();
      setPhase('complete');
      toast({
        title: 'Interview terminated',
        description: `Multiple people detected on camera (${faceCount} faces). Session ended after ${warningNumber} warning${warningNumber !== 1 ? 's' : ''}.`,
        variant: 'destructive',
      });
    } catch (err) {
      console.error("Failed to auto-end practice session:", err);
      // Force end even if API fails
      stopProctoring();
      cancelQuestionStreaming();
      setPhase('complete');
      toast({
        title: 'Interview terminated',
        description: 'Multiple people detected. Session ended due to proctoring violation.',
        variant: 'destructive',
      });
    }
  };

  /**
   * Compliance enforcement: camera died/disconnected mid-interview.
   * Treated as a proctoring violation — auto-terminates the session.
   */
  const handleEndPracticeForCameraLoss = async () => {
    if (!sessionId) return;
    console.warn('[Proctoring] Camera lost mid-interview — enforcing session termination');
    try {
      const result = await endPracticeSession(sessionId);
      setEndedEarlyData(result);
      stopProctoring();
      cancelQuestionStreaming();
      setPhase('complete');
      toast({
        title: 'Interview terminated — Camera lost',
        description: 'Your camera was disconnected during a proctored interview. The session has been ended for compliance.',
        variant: 'destructive',
      });
    } catch (err) {
      console.error('[Proctoring] Failed to auto-end session after camera loss:', err);
      // Force end even if API call fails
      stopProctoring();
      cancelQuestionStreaming();
      setPhase('complete');
      toast({
        title: 'Interview terminated — Camera lost',
        description: 'Camera disconnected. Session ended due to proctoring policy.',
        variant: 'destructive',
      });
    }
  };

  const getQuestionPromptText = (question: any): string => {
    if (!question) return '';
    if (typeof question === 'string') return question.trim();

    const candidates = [
      question.question_text,
      question.text,
      question.question,
      question.prompt,
      question.questionText,
      question.question_prompt,
      question.prompt_text,
      question.body,
      question.statement,
      question.content,
      question?.question?.question_text,
      question?.question?.text,
      question?.question?.question,
      question?.question?.prompt,
      question?.question?.questionText,
      question?.question?.question_prompt,
      question?.question?.prompt_text,
      question?.question?.body,
      question?.question?.statement,
      question?.question?.content,
    ];

    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }

    // Last-resort: recursively scan for common prompt-ish keys.
    try {
      const seen = new Set<any>();
      const queue: Array<{ value: any; depth: number }> = [{ value: question, depth: 0 }];
      const keyRe = /^(question(_text)?|prompt(_text)?|questionText|question_prompt|text|statement|body|content)$/i;

      while (queue.length) {
        const { value, depth } = queue.shift()!;
        if (!value || typeof value !== 'object') continue;
        if (seen.has(value)) continue;
        seen.add(value);

        for (const [k, v] of Object.entries(value)) {
          if (typeof v === 'string' && keyRe.test(k) && v.trim()) return v.trim();
          if (depth < 3 && v && typeof v === 'object') queue.push({ value: v, depth: depth + 1 });
        }
      }
    } catch {
      // ignore
    }

    return '';
  };

  // Helper function to detect if question is a coding question
  const isCodingQuestion = (question: any): boolean => {
    if (!question) return false;

    // Check explicit question_type field (preferred)
    if (question.question_type?.toUpperCase() === 'CODING') {
      console.log('✅ [Coding Detection] Detected via question_type field');
      return true;
    }

    // Check for coding indicators as fallback
    const hasProgrammingLanguage = !!question.programming_language;
    const hasCodeTemplate = !!question.code_template;
    const hasLongTimeLimit = question.time_limit >= 300; // 5+ minutes

    // Check question text for coding keywords
    const questionText = getQuestionPromptText(question).toLowerCase();
    const codingKeywords = [
      'write the code', 'write code', 'write a function', 'write a program',
      'implement', 'code snippet', 'python code', 'javascript code', 'sql query',
      'write python', 'write javascript', 'write sql', 'create a function',
      'algorithm', 'data structure', 'pandas', 'dataframe'
    ];
    const hasCodeKeyword = codingKeywords.some(keyword => questionText.includes(keyword));

    // If has programming language OR code template, likely a coding question
    if (hasProgrammingLanguage || hasCodeTemplate) {
      console.log('✅ [Coding Detection] Detected via programming_language/code_template');
      return true;
    }

    // If has coding keyword AND longer time limit, likely a coding question
    if (hasCodeKeyword && hasLongTimeLimit) {
      console.log('✅ [Coding Detection] Detected via keywords + time limit');
      return true;
    }

    return false;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-orange-500';
  };

  const updateFeedbackRatingDraft = (questionId: number, patch: Partial<FeedbackRatingDraft>) => {
    setFeedbackRatingDraftByQuestion((prev) => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] ?? {}),
        ...patch,
      },
    }));
  };

  const submitFeedbackRatingBestEffort = (opts: {
    sessionId: string;
    questionId: number;
  }) => {
    const { sessionId, questionId } = opts;

    if (!sessionId || !questionId) return;
    if (ratedByQuestion[questionId]) return;
    if (ratingSubmittingByQuestion[questionId]) return;

    const draft = feedbackRatingDraftByQuestion[questionId];
    const usefulnessRating = draft?.usefulnessRating;
    if (!usefulnessRating) return; // optional; only send if user selected one

    setRatingSubmittingByQuestion((prev) => ({ ...prev, [questionId]: true }));

    ratePracticeFeedback({
      session_id: sessionId,
      question_id: questionId,
      usefulness_rating: usefulnessRating,
      perceived_difficulty: draft?.perceivedDifficulty,
      comment: draft?.comment?.trim() ? draft.comment.trim() : undefined,
    })
      .then(() => {
        setRatedByQuestion((prev) => ({ ...prev, [questionId]: true }));
      })
      .catch((err) => {
        console.warn('⚠️ [Practice Mode] Feedback rating submit failed (non-blocking):', err);
      })
      .finally(() => {
        setRatingSubmittingByQuestion((prev) => ({ ...prev, [questionId]: false }));
      });
  };

  const handleNextQuestion = async () => {
    if (!sessionId) {
      console.error('❌ [Practice Mode] No session ID available');
      return;
    }

    if (!currentQuestion) {
      console.error('❌ [Practice Mode] No current question available');
      return;
    }

    cancelQuestionStreaming();
    setIsProcessing(true);

    try {
      // Phase 3: best-effort rate feedback right before user advances.
      // Do not block Next Question if this fails.
      submitFeedbackRatingBestEffort({ sessionId, questionId: currentQuestion.id });

      console.log('🔄 [Practice Mode] Acknowledging feedback for session:', sessionId, 'question:', currentQuestion.id);
      console.log('📊 [Practice Mode] Current state:', {
        currentQuestionNumber,
        totalQuestions,
        phase,
      });

      const response = await acknowledgeFeedback(sessionId, currentQuestion.id);
      console.log('➡️ [Practice Mode] Next Question Response:', response);
      console.log('📋 [Practice Mode] Response details:', {
        hasNextQuestion: !!response.next_question,
        complete: response.complete,
        progress: response.progress,
        hasTtsAudio: !!response.tts_audio_url,
        hasEvaluation: !!response.evaluation_report,
      });

      if (response.complete) {
        // Interview complete - show evaluation
        console.log('🎉 [Practice Mode] Interview Complete!');

        if (response.evaluation_report) {
          setEvaluation(response.evaluation_report);
        }

        setPhase('complete');
  setCompletionPending(false);

        toast({
          title: 'Interview complete',
          description: `Completed all ${totalQuestions} questions successfully!`,
          variant: 'success',
        });
      } else {
        // Validate next_question exists
        if (!response.next_question) {
          throw new Error('No next question in response but complete=false');
        }

        console.log('📝 [Practice Mode] Moving to next question:', response.next_question.question_text?.substring(0, 50) + '...');
        console.log('🔍 [Question Type Debug]:', {
          question_type: response.next_question?.question_type,
          question_type_upper: response.next_question?.question_type?.toUpperCase(),
          has_programming_language: !!response.next_question?.programming_language,
          has_code_template: !!response.next_question?.code_template,
          time_limit: response.next_question?.time_limit,
        });

        // Move to next question
        setCurrentQuestion(response.next_question);
        setCurrentQuestionNumber(prev => prev + 1);
        setTimeRemaining(response.next_question.time_limit);
        setCompletionPending(false);
        setPhase('question');
        setTranscription('');
        setSpeechMetrics(null);
        setMicroFeedback(null);
        setEvaluationTrace(null);
        setTrajectory(null);
        setPressure(null);

        // Clear code submission state (for coding questions)
        setCodeTestResults(null);
        setCodeEvaluation(null);

        // Clear any existing timer
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }

        console.log('✅ [Practice Mode] State updated, now on question', currentQuestionNumber + 1);

        // Play next question audio if available
        if (response.tts_audio_url && enableTTS) {
          void playTtsBestEffort(response.tts_audio_url);
        }
      }
    } catch (error: any) {
      console.error('❌ [Practice Mode] Next Question Error:', error);
      console.error('❌ [Practice Mode] Error stack:', error.stack);
      console.error('❌ [Practice Mode] Error message:', error.message);

      // Guest gating: avoid scary red toasts; the global modal + inline banner handle this.
      if (error instanceof StrataxApiError) {
        const detail = error.detail as any;
        const code = detail?.error;

        if (error.status === 429 && code === 'DEMO_LIMIT_REACHED') {
          setGuestGateBanner({ kind: 'limit', message: detail?.message });
          return;
        }

        if (error.status === 503 && code === 'DEMO_UNAVAILABLE') {
          setGuestGateBanner({ kind: 'unavailable', message: detail?.message });
          return;
        }
      }

      toast({
        title: 'Failed to load question',
        description: 'Could not load the next question. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRoundStart = (sessionId: string, roundConfig: RoundConfig, firstQuestion: any, ttsAudioUrl?: string, totalQuestionsFromApi?: number) => {
    // Note: For round-based starts, camera is already ensured in RoundSelection
    // via ensureLiveMediaReady. But we also verify here as a safety net.
    if (enableCameraProctoring) {
      const track = cameraStreamRef.current?.getVideoTracks?.()?.[0];
      if (!track || track.readyState !== 'live') {
        toast({
          title: 'Camera required',
          description: 'Camera must be on for proctored interviews. Please enable your camera and try again.',
          variant: 'destructive',
        });
        return;
      }
    }

    console.log('🎯 [Round-Based] Round started:', roundConfig);
    console.log('📝 [Round-Based] First question structure:', firstQuestion);
    console.log('🔍 [Question Type Debug]:', {
      question_type: firstQuestion?.question_type,
      question_type_upper: firstQuestion?.question_type?.toUpperCase(),
      has_programming_language: !!firstQuestion?.programming_language,
      has_code_template: !!firstQuestion?.code_template,
      time_limit: firstQuestion?.time_limit,
    });
    console.log('🔊 [Round-Based] TTS Audio URL:', ttsAudioUrl);

    setQuestionEvaluations([]);
    setSessionId(sessionId);
    setCurrentRoundConfig(roundConfig);
    setCurrentQuestion(firstQuestion);
    setCurrentQuestionNumber(1);
    setCompletionPending(false);
    const resolvedTotal = typeof totalQuestionsFromApi === 'number' && totalQuestionsFromApi >= 1
      ? totalQuestionsFromApi
      : roundConfig.question_count;
    setTotalQuestions(resolvedTotal);
    setTimeRemaining(firstQuestion.time_limit);
    setPhase('question');

    void startLiveCaptureForSession(sessionId);
    // Proctoring is started by the enableCameraProctoring/sessionId effect.

    // Play TTS audio if available
    if (ttsAudioUrl && enableTTS) {
      try {
        setIsAudioLoading(true);
        const audioUrl = `${API_BASE_URL}${ttsAudioUrl}`;
        console.log('🔊 [Round-Based] Playing question audio:', audioUrl);

        const audio = new Audio(audioUrl);
        audioPlayerRef.current = audio;

        audio.onloadedmetadata = () => {
          try {
            if (Number.isFinite(audio.duration)) {
              questionAudioDurationRef.current = audio.duration;
            }
          } catch {
            // ignore
          }
        };

        audio.onloadeddata = () => {
          console.log('✅ [Round-Based] Audio loaded successfully');
          setIsAudioLoading(false);
        };

        // Also handle canplaythrough as backup for onloadeddata
        audio.oncanplaythrough = () => {
          setIsAudioLoading(false);
        };

        audio.onplay = () => {
          console.log('▶️ [Round-Based] Audio playback started');
          setIsAudioLoading(false); // Ensure loading is cleared when playback starts
          setIsPlayingAudio(true);
        };

        audio.onended = () => {
          console.log('⏹️ [Round-Based] Audio playback finished');
          setIsPlayingAudio(false);
          setIsAudioLoading(false);
        };

        // Also handle pause (in case audio is paused/interrupted)
        audio.onpause = () => {
          if (audio.ended || audio.currentTime >= (audio.duration || 0) - 0.1) {
            console.log('⏹️ [Round-Based] Audio ended via pause event');
            setIsPlayingAudio(false);
            setIsAudioLoading(false);
          }
        };

        audio.onerror = (e) => {
          console.error('❌ [Round-Based] Audio playback error:', e);
          setIsAudioLoading(false);
          setIsPlayingAudio(false);
          toast({
            title: 'Audio unavailable',
            description: 'Could not play question audio. You can still read and answer.',
            variant: 'warning',
          });
        };

        audio.play().catch((err) => {
          console.error('❌ [Round-Based] Audio play failed:', err);
          setIsAudioLoading(false);
          setIsPlayingAudio(false);
        });

        // Safety: force-clear audio states after a generous timeout to prevent stuck UI
        setTimeout(() => {
          setIsAudioLoading(false);
          // Only clear playing if audio has actually ended/errored
          if (audio.ended || audio.paused) {
            setIsPlayingAudio(false);
          }
        }, 30000);
      } catch (error) {
        console.error('❌ [Round-Based] TTS error:', error);
        setIsAudioLoading(false);
        setIsPlayingAudio(false);
      }
    }

    toast({
      title: `${roundConfig.name} started`,
      description: `${(typeof totalQuestionsFromApi === 'number' && totalQuestionsFromApi >= 1) ? totalQuestionsFromApi : roundConfig.question_count} questions • ${roundConfig.duration_minutes} minutes`,
      variant: 'success',
    });
  };

  const getScoreGrade = (score: number) => {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    return 'D';
  };

  // ============================================================================
  // Render Phases
  // ============================================================================

  if (phase === 'welcome') {
    return (
      <div className="max-w-4xl mx-auto w-full px-4">
        <div className="flex justify-end pt-2">
          {viewProgressButton("h-8 px-3 md:hidden")}
        </div>

        {/* ── GATEWAY: Choose your practice mode ── */}
        {welcomeStep === 'gateway' && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-500">
            {/* Header */}
            <div className="text-center space-y-2 pt-4">
              <div className="mx-auto w-12 h-12 md:w-14 md:h-14 bg-primary/15 border border-primary/20 rounded-2xl flex items-center justify-center shadow-lg shadow-black/30">
                <Mic className="w-6 h-6 md:w-7 md:h-7 text-white" />
              </div>
              <h1 className="text-xl md:text-2xl font-bold text-foreground">How do you want to practice?</h1>
              <p className="text-[11px] md:text-sm text-muted-foreground max-w-[300px] md:max-w-none mx-auto">
                Choose a path — you can always switch later
              </p>
            </div>

            {renderPracticeInsights()}

            {/* Three intent cards */}
            <div className="space-y-3">
              {/* Quick Practice */}
              <button
                onClick={() => { setUseQuickStart(false); setWelcomeStep('configure'); }}
                className="w-full group relative flex items-center gap-4 p-4 md:p-5 rounded-2xl border-2 border-border/50 bg-background/60 backdrop-blur-xl shadow-lg hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 text-left"
              >
                <div className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-primary/20 border border-primary/20 flex items-center justify-center shadow-md">
                  <Zap className="w-6 h-6 md:w-7 md:h-7 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-[15px] md:text-base text-foreground">Quick Practice</h3>
                  <p className="text-[11px] md:text-sm text-muted-foreground leading-snug mt-0.5">
                    Tell me the role — I'll pick questions, difficulty, and adapt as you go
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>

              {/* Full Interview Simulation */}
              <button
                onClick={() => setPhase('round-selection')}
                className="w-full group relative flex items-center gap-4 p-4 md:p-5 rounded-2xl border-2 border-border/50 bg-background/60 backdrop-blur-xl shadow-lg hover:border-purple-500/50 hover:shadow-xl hover:shadow-purple-500/10 transition-all duration-300 text-left"
              >
                <div className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-violet-500/20 border border-purple-500/20 flex items-center justify-center shadow-md">
                  <Target className="w-6 h-6 md:w-7 md:h-7 text-purple-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-[15px] md:text-base text-foreground">Full Interview Simulation</h3>
                  <p className="text-[11px] md:text-sm text-muted-foreground leading-snug mt-0.5">
                    Step through real interview rounds — HR, Technical, System Design
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground/50 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>

              {/* Custom Setup */}
              <button
                onClick={() => { setUseQuickStart(true); setWelcomeStep('configure'); }}
                className="w-full group relative flex items-center gap-4 p-4 md:p-5 rounded-2xl border-2 border-border/50 bg-background/60 backdrop-blur-xl shadow-lg hover:border-amber-500/50 hover:shadow-xl hover:shadow-amber-500/10 transition-all duration-300 text-left"
              >
                <div className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center shadow-md">
                  <Settings className="w-6 h-6 md:w-7 md:h-7 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-[15px] md:text-base text-foreground">Custom Setup</h3>
                  <p className="text-[11px] md:text-sm text-muted-foreground leading-snug mt-0.5">
                    Pick your role, difficulty, number of questions, and more
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground/50 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* ── CONFIGURE: Mode-specific setup ── */}
        {welcomeStep === 'configure' && (
          <Card className="w-full border border-border/50 bg-background/60 backdrop-blur-xl shadow-2xl shadow-black/40 animate-in fade-in slide-in-from-right-4 duration-400">
            <CardHeader className="pb-3 pt-5 px-4">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-full hover:bg-muted/50 shrink-0"
                  onClick={() => setWelcomeStep('gateway')}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex-1">
                  <CardTitle className="text-lg md:text-xl font-bold text-foreground">
                    {useQuickStart ? 'Custom Setup' : 'AI Interviewer'}
                  </CardTitle>
                  <CardDescription className="text-[10px] md:text-xs mt-0.5">
                    {useQuickStart
                      ? 'Configure your practice session exactly how you want it'
                      : "Tell me the role — I'll adapt questions and difficulty as you go"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pb-6">
              {!useQuickStart ? (
                /* ── Instant / AI Interviewer mode ── */
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/70">What are you preparing for?</Label>
                    </div>
                    <div className="relative group">
                      <Input
                        placeholder='e.g., "Senior React role at Google"'
                        value={quickStartInput}
                        onChange={(e) => setQuickStartInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !quickStartLoading) {
                            handleQuickStart();
                          }
                        }}
                        maxLength={512}
                        className="text-xs h-10 bg-background/50 border-muted-foreground/20 rounded-xl pl-3 pr-9 focus:ring-primary/20 transition-all"
                        autoFocus
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/30 group-focus-within:text-primary/50 transition-colors">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>

                  {aiMessage && (
                    <div className="p-2.5 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-2 shadow-sm animate-in zoom-in-95 duration-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-green-700 dark:text-green-400 font-medium leading-tight">
                        {aiMessage}
                      </p>
                    </div>
                  )}

                  {/* Resume Upload (optional) */}
                  <ResumeUpload
                    mode="practice"
                    onParsed={(ctx) => setResumeContext(ctx)}
                    onClear={() => setResumeContext(null)}
                    existing={resumeContext}
                  />

                  {/* Progress promise */}
                  <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 mb-1.5">This session helps you improve</p>
                    <div className="flex flex-wrap gap-2">
                      {['Answer clarity', 'Confidence', 'Interview structure'].map((item) => (
                        <span key={item} className="inline-flex items-center gap-1 text-[11px] text-foreground/80 font-medium">
                          <CheckCircle2 className="w-3 h-3 text-primary/60" />
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* CTA */}
                  <Button
                    size="lg"
                    className="w-full h-12 text-sm font-bold shadow-xl shadow-black/30 transition-all hover:scale-[1.01] active:scale-[0.98] rounded-2xl"
                    onClick={handleQuickStart}
                    disabled={quickStartLoading || !quickStartInput.trim()}
                  >
                    {quickStartLoading ? (
                      <>
                        <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                        Setting Up Interview...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 w-4 h-4" />
                        Start Interview
                      </>
                    )}
                  </Button>

                  {/* Deferred session settings */}
                  <Collapsible open={sessionSettingsOpen} onOpenChange={setSessionSettingsOpen}>
                    <CollapsibleTrigger asChild>
                      <button className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                        <Settings className="w-3 h-3" />
                        <span>Session Settings</span>
                        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${sessionSettingsOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
                      <div className="flex items-center justify-between p-2.5 bg-muted/40 rounded-xl border border-border/50">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-muted text-muted-foreground">
                            <Volume2 className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="font-bold text-[11px] text-foreground">Voice Assistant</p>
                            <p className="text-[9px] text-muted-foreground">Hear questions read aloud</p>
                          </div>
                        </div>
                        <Switch
                          checked={enableTTS}
                          onCheckedChange={setEnableTTS}
                          className="scale-[0.6] md:scale-75 origin-right data-[state=checked]:bg-primary"
                        />
                      </div>

                      <div className="flex items-center justify-between p-2.5 bg-muted/40 rounded-xl border border-border/50">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-muted text-muted-foreground">
                            <Camera className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="font-bold text-[11px] text-foreground">Camera-proctored mode</p>
                            <p className="text-[9px] text-muted-foreground">Opt-in · No recordings · Local-only</p>
                          </div>
                        </div>
                        <Switch
                          checked={enableCameraProctoring}
                          onCheckedChange={setEnableCameraProctoring}
                          className="scale-[0.6] md:scale-75 origin-right data-[state=checked]:bg-primary"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              ) : (
                /* ── Custom / Manual setup mode ── */
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-semibold mb-1 block text-muted-foreground">Interview Role</label>
                      <Input
                        placeholder="e.g., Software Engineer, Data Scientist, Product Manager, DevOps..."
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        maxLength={512}
                        className="text-sm bg-background/50 border-border/40"
                        list="role-suggestions"
                        autoFocus
                      />
                      <datalist id="role-suggestions">
                        <option value="Software Engineer" />
                        <option value="Data Scientist" />
                        <option value="Product Manager" />
                        <option value="DevOps Engineer" />
                        <option value="Frontend Developer" />
                        <option value="Backend Developer" />
                        <option value="Full Stack Developer" />
                        <option value="AI/ML Specialist" />
                        <option value="UX/UI Designer" />
                        <option value="AI Engineer" />
                        <option value="ML Engineer" />
                        <option value="QA Engineer" />
                        <option value="Security Engineer" />
                        <option value="Data Engineer" />
                      </datalist>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Type any role - not limited to the suggestions above
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-medium mb-1 block">Difficulty Level</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'easy', label: 'Easy', color: 'bg-green-500' },
                          { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
                          { value: 'hard', label: 'Hard', color: 'bg-red-500' },
                        ].map((diff) => (
                          <Button
                            key={diff.value}
                            variant={selectedDifficulty === diff.value ? 'default' : 'outline'}
                            className="relative text-xs h-8"
                            onClick={() => setSelectedDifficulty(diff.value as InterviewDifficulty)}
                          >
                            {selectedDifficulty === diff.value && (
                              <div className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${diff.color}`} />
                            )}
                            {diff.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-xs">Number of Questions</p>
                          <p className="text-[10px] text-muted-foreground">Choose 1-10 questions</p>
                        </div>
                      </div>
                      <Input
                        type="number"
                        min="1"
                        max="10"
                        value={questionCount}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (val >= 1 && val <= 10) {
                            setQuestionCount(val);
                          }
                        }}
                        maxLength={3}
                        className="w-16 h-7 text-xs text-center bg-background/50 border-border/40"
                      />
                    </div>
                  </div>

                  {/* Resume Upload (optional) */}
                  <ResumeUpload
                    mode="practice"
                    onParsed={(ctx) => setResumeContext(ctx)}
                    onClear={() => setResumeContext(null)}
                    existing={resumeContext}
                  />

                  {/* Progress promise */}
                  <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 mb-1.5">This session helps you improve</p>
                    <div className="flex flex-wrap gap-2">
                      {['Answer clarity', 'Confidence', 'Interview structure'].map((item) => (
                        <span key={item} className="inline-flex items-center gap-1 text-[11px] text-foreground/80 font-medium">
                          <CheckCircle2 className="w-3 h-3 text-primary/60" />
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* CTAs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Button
                      size="lg"
                      className="h-12"
                      onClick={() => setPhase('setup')}
                    >
                      <Sparkles className="mr-2 w-5 h-5" />
                      <div className="text-left">
                        <div className="font-semibold">Quick Practice</div>
                        <div className="text-xs opacity-90">AI-generated questions</div>
                      </div>
                    </Button>

                    <Button
                      size="lg"
                      variant="outline"
                      className="h-12 border-2 hover:bg-primary/5"
                      onClick={() => setPhase('round-selection')}
                    >
                      <Target className="mr-2 w-5 h-5" />
                      <div className="text-left">
                        <div className="font-semibold">Round-Based</div>
                        <div className="text-xs opacity-70">Specific interview rounds</div>
                      </div>
                    </Button>
                  </div>

                  {/* Deferred session settings */}
                  <Collapsible open={sessionSettingsOpen} onOpenChange={setSessionSettingsOpen}>
                    <CollapsibleTrigger asChild>
                      <button className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                        <Settings className="w-3 h-3" />
                        <span>Session Settings</span>
                        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${sessionSettingsOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
                      <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Volume2 className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-xs">Text-to-Speech</p>
                            <p className="text-[10px] text-muted-foreground">Hear questions read aloud</p>
                          </div>
                        </div>
                        <Button
                          variant={enableTTS ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setEnableTTS(!enableTTS)}
                        >
                          {enableTTS ? 'Enabled' : 'Disabled'}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Camera className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-xs">Camera-proctored mode</p>
                            <p className="text-[10px] text-muted-foreground">Opt-in · No recordings · Local-only</p>
                          </div>
                        </div>
                        <Switch
                          checked={enableCameraProctoring}
                          onCheckedChange={setEnableCameraProctoring}
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg border border-border/50">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-primary" />
                          <div>
                            <div className="font-medium text-xs flex items-center gap-1">
                              Adaptive Intelligence
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">NEW</Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground">AI-personalized questions</p>
                          </div>
                        </div>
                        <Switch
                          checked={enableAdaptive}
                          onCheckedChange={setEnableAdaptive}
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (phase === 'round-selection') {
    const userProfile = enableAdaptive && profileDomain && profileExperience > 0 ? {
      domain: profileDomain,
      experience_years: profileExperience,
      skills: profileSkills.split(',').map(s => s.trim()).filter(Boolean),
      job_role: profileJobRole || undefined,
      company_preference: profileCompany || undefined,
      interview_focus: profileFocus ? profileFocus.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    } : undefined;

    return (
      <div className="w-full h-full flex flex-col relative overflow-hidden">
        {/* Scrollable Content Container */}
        <div ref={roundSelectionScrollRef} className="flex-1 overflow-y-auto scrollbar-hide">
          {/* Sticky header: back + interview settings */}
          <div
            className={`sticky top-0 z-[60] bg-background border-b border-border/30 transition-all duration-300 ${
              showRoundSelectionHeader ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
            }`}
          >
            <div className="max-w-7xl mx-auto w-full px-4 py-2.5 flex items-center justify-between gap-3">
              {/* Left: Back */}
              <Button
                variant="ghost"
                onClick={() => { setWelcomeStep('gateway'); setPhase('welcome'); }}
                className="group h-9 px-3 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-4 h-4 mr-1 group-hover:-translate-x-0.5 transition-transform" />
                <span className="text-[13px] font-medium">Back</span>
              </Button>

              {/* Right: Camera toggle + Progress */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none px-3 py-1.5 rounded-lg hover:bg-muted/30 transition-colors">
                  <Camera className="w-4 h-4 text-muted-foreground/70" />
                  <span className="hidden sm:inline text-xs font-medium text-muted-foreground">Proctoring</span>
                  <Switch
                    checked={enableCameraProctoring}
                    onCheckedChange={setEnableCameraProctoring}
                    aria-label="Toggle camera-proctored mode"
                  />
                </label>

                {viewProgressButton(
                  "h-9 px-3 md:hidden rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                )}
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto w-full px-4 pt-4">
            <RoundSelection onRoundStart={handleRoundStart} userProfile={userProfile} ensureLiveMediaReady={ensureLiveMediaReady} ensureCameraForProctoring={ensureCameraForProctoring} resumeContext={resumeContext} onResumeChange={setResumeContext} />
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'setup') {
    return (
      <div className="max-w-4xl mx-auto w-full px-4">
        <div className="flex justify-end pt-2">
          {viewProgressButton("h-8 px-3 md:hidden")}
        </div>
        <Card className="w-full">
          <CardHeader className="text-center pb-3">
            <CardTitle className="text-xl">
              {enableAdaptive ? '🧠 Setup Your Profile' : '🎯 Ready to Start'}
            </CardTitle>
            <CardDescription className="text-sm">
              {enableAdaptive
                ? 'Help AI generate personalized questions'
                : 'Preparing your interview'
              }
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="font-medium text-xs">Camera-proctored mode</p>
                  <p className="text-[10px] text-muted-foreground">Opt-in · No recordings · Local-only</p>
                </div>
              </div>
              <Switch
                checked={enableCameraProctoring}
                onCheckedChange={setEnableCameraProctoring}
              />
            </div>

            {enableAdaptive && (
              <>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor="domain" className="text-xs">Domain / Specialization *</Label>
                    <Input
                      id="domain"
                      className="h-8 text-sm"
                      placeholder="e.g., Python Backend Development"
                      value={profileDomain}
                      onChange={(e) => setProfileDomain(e.target.value)}
                      maxLength={512}
                    />
                    <p className="text-[10px] text-muted-foreground">Your primary technical domain</p>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="experience" className="text-xs">Years of Experience *</Label>
                    <Input
                      id="experience"
                      type="number"
                      className="h-8 text-sm"
                      min="0"
                      max="50"
                      placeholder="e.g., 5"
                      value={profileExperience || ''}
                      onChange={(e) => setProfileExperience(parseInt(e.target.value) || 0)}
                      maxLength={3}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="skills" className="text-xs">Key Skills *</Label>
                    <Input
                      id="skills"
                      className="h-8 text-sm"
                      placeholder="e.g., Python, Django, AWS"
                      value={profileSkills}
                      onChange={(e) => setProfileSkills(e.target.value)}
                      maxLength={512}
                    />
                    <p className="text-[10px] text-muted-foreground">Comma-separated skills</p>
                  </div>

                  <Separator />
                  <p className="text-xs font-medium text-muted-foreground">Optional</p>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="jobRole" className="text-xs">Target Role</Label>
                      <Input
                        id="jobRole"
                        className="h-8 text-sm"
                        placeholder="Senior Engineer"
                        value={profileJobRole}
                        onChange={(e) => setProfileJobRole(e.target.value)}
                        maxLength={512}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="company" className="text-xs">Company Type</Label>
                      <Input
                        id="company"
                        className="h-8 text-sm"
                        placeholder="FAANG, Startup"
                        value={profileCompany}
                        onChange={(e) => setProfileCompany(e.target.value)}
                        maxLength={512}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="focus" className="text-xs">Focus Areas</Label>
                    <Input
                      id="focus"
                      className="h-8 text-sm"
                      placeholder="System Design, API Design"
                      value={profileFocus}
                      onChange={(e) => setProfileFocus(e.target.value)}
                      maxLength={512}
                    />
                    <p className="text-[10px] text-muted-foreground">Comma-separated topics</p>
                  </div>
                </div>

                {(!profileDomain || !profileExperience || !profileSkills) && (
                  <div className="flex items-center gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <AlertCircle className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                    <p className="text-xs text-yellow-600 dark:text-yellow-500">
                      Required fields (*) needed
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 h-9 text-sm"
                onClick={() => setPhase('welcome')}
              >
                <ArrowRight className="mr-1 w-3 h-3 rotate-180" />
                Back
              </Button>
              <Button
                className="flex-1 h-9 text-sm"
                onClick={handleStartInterview}
                disabled={isProcessing || (enableAdaptive && (!profileDomain || !profileExperience || !profileSkills))}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-1 w-3 h-3 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1 w-3 h-3" />
                    {enableAdaptive ? 'Generate Questions' : 'Begin Interview'}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === 'question' || phase === 'recording') {
    const fullQuestionText = getQuestionPromptText(currentQuestion);
    const deliveredQuestionText = streamedQuestionText || '';

    return (
      <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 flex flex-col space-y-4 pb-[env(safe-area-inset-bottom)]">
        {renderGuestGateBanner()}
        {renderFacePreview()}
        {renderFaceWarningOverlay()}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {currentRoundConfig && (
              <Badge variant="outline" className="text-[11px] sm:text-sm px-2.5 py-1 bg-muted/20 border-border/50">
                <Target className="w-3 h-3 mr-1" />
                {currentRoundConfig.name}
              </Badge>
            )}
            <Badge variant="outline" className="text-[11px] sm:text-sm px-2.5 py-1">
              Question {currentQuestionNumber} / {totalQuestions}
            </Badge>

            {enableCameraProctoring && (
              <Badge
                variant="outline"
                className={
                  proctoringStatus === 'active'
                    ? 'bg-green-500/10 border-green-500/50 text-green-700 dark:text-green-400'
                    : proctoringStatus === 'starting'
                      ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-700 dark:text-yellow-400'
                      : 'bg-orange-500/10 border-orange-500/50 text-orange-700 dark:text-orange-400'
                }
              >
                <Camera className="w-3 h-3 mr-1" />
                {proctoringStatus === 'active'
                  ? 'Proctored'
                  : proctoringStatus === 'starting'
                    ? 'Proctoring…'
                    : 'Proctoring off'}
              </Badge>
            )}

            {/* Debug Badge - Shows Question Type */}
            <Badge
              variant="outline"
              className={
                isCodingQuestion(currentQuestion)
                  ? "bg-blue-500/10 border-blue-500/50 text-blue-700 dark:text-blue-400"
                  : "bg-green-500/10 border-green-500/50 text-green-700 dark:text-green-400"
              }
            >
              {isCodingQuestion(currentQuestion) ? 'CODING' : 'VOICE'}
              {currentQuestion?.programming_language && ` (${currentQuestion.programming_language})`}
            </Badge>

            <Badge className="bg-primary text-primary-foreground text-[11px] sm:text-sm">
              {selectedDifficulty}
            </Badge>
            {phase === 'recording' ? (
              <Badge
                variant={timeRemaining <= 10 ? "destructive" : "secondary"}
                className={timeRemaining <= 10 ? "animate-pulse" : ""}
              >
                <Clock className="w-3 h-3 mr-1" />
                {formatTime(timeRemaining)}
              </Badge>
            ) : (
              <Badge variant="outline" className="opacity-60">
                <Clock className="w-3 h-3 mr-1" />
                {currentQuestion?.time_limit}s limit
              </Badge>
            )}

            {(isProcessing || isSubmittingCode) && (
              <Badge variant="secondary" className="animate-pulse text-[11px] sm:text-sm">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Submitting…
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Progress value={(currentQuestionNumber / totalQuestions) * 100} className="w-full sm:w-32" />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEndPractice}
              className="h-7 px-2 sm:px-3 text-[10px] sm:text-xs font-bold uppercase tracking-tight text-red-400/70 hover:text-white hover:bg-destructive transition-all duration-200 shrink-0"
            >
              End
            </Button>
          </div>
        </div>

        {/* Question Card */}
        <Card className="flex-1 flex flex-col">
          {/* Check question type and render appropriate UI */}
          {isCodingQuestion(currentQuestion) ? (
            /* Coding Question - Show Code Editor */
            <div className="p-3 sm:p-6">
              <InterviewCodeEditor
                question={{
                  ...(currentQuestion as Question),
                  question_text: deliveredQuestionText || (fullQuestionText ? '…' : ''),
                  text: deliveredQuestionText || (fullQuestionText ? '…' : ''),
                }}
                onSubmit={handleSubmitCode}
                isSubmitting={isSubmittingCode}
                testResults={codeTestResults || undefined}
                evaluation={codeEvaluation || undefined}
                timeRemaining={timeRemaining}
                onTimeUp={() => {
                  if (phase === 'question') {
                    toast({
                      title: 'Time\'s up',
                      description: 'Submitting your current code...',
                      variant: 'warning',
                    });
                    // Auto-submit current code
                    // handleSubmitCode will be called by the editor component
                  }
                }}
              />
            </div>
          ) : (
            /* Voice Question - Show Voice Recorder (Original UI) */
            <>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-2xl mb-2">
                      {deliveredQuestionText || (fullQuestionText ? '…' : 'No question text available')}
                    </CardTitle>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {currentQuestion?.time_limit}s time limit
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {currentQuestion?.category}
                      </Badge>
                    </div>
                  </div>

                  {enableTTS && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        if (currentQuestion && sessionId) {
                          // Replay audio logic here
                        }
                      }}
                      disabled={isPlayingAudio}
                    >
                      {isPlayingAudio ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col items-center justify-center gap-6">
                {phase === 'recording' ? (
                  <>
                    <div className="relative flex flex-col items-center">
                      {/* Animated Waveform Visualization */}
                      <div className="flex items-end gap-1 h-32 mb-8">
                        {[...Array(12)].map((_, i) => {
                          // Create varied heights based on audio level and position
                          const baseHeight = 20;
                          const maxHeight = 120;
                          const position = Math.abs(i - 5.5) / 5.5; // Center emphasis
                          const heightMultiplier = (1 - position * 0.5) * audioLevel;
                          const height = baseHeight + (maxHeight - baseHeight) * heightMultiplier;

                          return (
                            <div
                              key={i}
                              className="w-2 bg-gradient-to-t from-red-500 to-pink-500 rounded-full transition-all duration-100 ease-out"
                              style={{
                                height: `${height}px`,
                                opacity: 0.7 + audioLevel * 0.3,
                              }}
                            />
                          );
                        })}
                      </div>

                      {/* Recording Timer */}
                      <div className="mt-4">
                        <Badge className="bg-red-500 text-white px-4 py-1.5 text-base">
                          <div className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse" />
                          {formatTime(recordingTime)}
                        </Badge>
                      </div>
                    </div>

                    <div className="text-center space-y-2">
                      <h3 className="text-2xl font-semibold">Recording...</h3>
                      <p className="text-muted-foreground">
                        Speak clearly and naturally. Click stop when finished.
                      </p>
                    </div>

                    <Button
                      size="lg"
                      variant="destructive"
                      className="px-8"
                      onClick={handleStopRecording}
                      disabled={isProcessing}
                    >
                      <MicOff className="mr-2" />
                      Stop & Submit
                    </Button>
                  </>
                ) : (
                  <>
                    {(isPlayingAudio || isAudioLoading) ? (
                      <>
                        <div className="relative">
                          <div className="w-32 h-32 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center animate-pulse">
                            <Volume2 className="w-16 h-16 text-white" />
                          </div>
                          <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
                            <Badge className="bg-blue-500 text-white px-3 py-1">
                              AI Speaking
                            </Badge>
                          </div>
                        </div>

                        <div className="text-center space-y-2">
                          <h3 className="text-2xl font-semibold">Listen to the Question</h3>
                          <p className="text-muted-foreground max-w-md">
                            The AI interviewer is asking you the question. Please listen carefully.
                          </p>
                        </div>

                        <Button
                          size="lg"
                          variant="outline"
                          className="px-8"
                          disabled
                        >
                          <Loader2 className="mr-2 animate-spin" />
                          Please Wait...
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="w-32 h-32 bg-primary/15 border border-primary/20 rounded-full flex items-center justify-center">
                          <Mic className="w-16 h-16 text-white" />
                        </div>

                        <div className="text-center space-y-2">
                          <h3 className="text-2xl font-semibold">Ready to Answer</h3>
                          <p className="text-muted-foreground max-w-md">
                            Click the button below to start recording. Timer will begin when you start recording.
                          </p>
                          <div className="flex items-center justify-center gap-2 text-sm">
                            <Clock className="w-4 h-4 text-primary" />
                            <span className="font-medium text-primary">{currentQuestion?.time_limit}s time limit</span>
                          </div>
                        </div>

                        <Button
                          size="lg"
                          className="px-8"
                          onClick={handleStartRecording}
                          disabled={isProcessing}
                        >
                          <Mic className="mr-2" />
                          Start Recording
                        </Button>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    );
  }

  if (phase === 'processing') {
    // This phase is kept for backward compatibility, but we avoid showing a big "Analyzing" UI.
    return (
      <div className="max-w-4xl mx-auto w-full px-4 flex items-center justify-center">
        {renderFacePreview()}
        {renderFaceWarningOverlay()}
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Working…
        </div>
      </div>
    );
  }

  if (phase === 'feedback') {
    const questionId = currentQuestion?.id;
    const ratingDraft = questionId ? feedbackRatingDraftByQuestion[questionId] : undefined;
    const usefulnessRating = ratingDraft?.usefulnessRating;
    const perceivedDifficulty = ratingDraft?.perceivedDifficulty;
    const comment = ratingDraft?.comment ?? '';

    const ratingSubmitted = !!(questionId && ratedByQuestion[questionId]);
    const ratingSubmitting = !!(questionId && ratingSubmittingByQuestion[questionId]);

    const isCodeQ = currentQuestion ? isCodingQuestion(currentQuestion) : false;

    return (
      <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 flex flex-col space-y-3 sm:space-y-4 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-2xl font-bold">{isCodeQ ? 'Code Feedback' : 'Answer Feedback'}</h2>
            {completionPending && (
              <Badge className="bg-primary/10 text-primary border-primary/20" variant="outline">
                Final
              </Badge>
            )}
          </div>
          <Badge variant="outline" className="text-xs sm:text-sm">
            Question {currentQuestionNumber} / {totalQuestions}
          </Badge>
        </div>

        {/* ── CODE question feedback ── */}
        {isCodeQ && (
          <>
            {/* Code Evaluation Scores */}
            {codeEvaluation && (
              <Card className="border-2 bg-gradient-to-br from-blue-500/5 to-blue-500/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <Target className="w-5 h-5 text-blue-500" />
                    Code Evaluation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Overall + Pass/Fail */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-base px-3 py-1">
                      Overall: {codeEvaluation.overall_score}%
                    </Badge>
                    <Badge variant={codeEvaluation.is_correct ? 'default' : 'destructive'}>
                      {codeEvaluation.is_correct ? '✅ Accepted' : '❌ Not Accepted'}
                    </Badge>
                    {codeEvaluation.test_cases_total !== undefined && (
                      <Badge variant="outline">
                        Tests: {codeEvaluation.test_cases_passed ?? 0}/{codeEvaluation.test_cases_total}
                      </Badge>
                    )}
                  </div>

                  {/* Score breakdown bars */}
                  <div className="space-y-2">
                    {[
                      { label: 'Correctness', value: codeEvaluation.correctness_score },
                      { label: 'Code Quality', value: codeEvaluation.code_quality_score },
                      { label: 'Efficiency', value: codeEvaluation.efficiency_score },
                    ].map(({ label, value }) => (
                      <div key={label} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{label}</span>
                          <span className="font-bold">{value}%</span>
                        </div>
                        <Progress value={value} className="h-2" />
                      </div>
                    ))}
                  </div>

                  {/* Complexity */}
                  {(codeEvaluation.time_complexity || codeEvaluation.space_complexity) && (
                    <div className="flex flex-wrap gap-3 text-sm">
                      {codeEvaluation.time_complexity && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">Time:</span>
                          <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">{codeEvaluation.time_complexity}</code>
                        </div>
                      )}
                      {codeEvaluation.space_complexity && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">Space:</span>
                          <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">{codeEvaluation.space_complexity}</code>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Test Results Detail */}
            {codeTestResults && codeTestResults.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg">Test Results</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {codeTestResults.map((test, idx) => (
                    <div key={idx} className={`rounded-md border p-3 text-sm ${test.passed ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">Test Case {test.test_case_number}</span>
                        <Badge variant={test.passed ? 'default' : 'destructive'} className="text-xs">
                          {test.passed ? 'Passed' : 'Failed'}
                        </Badge>
                      </div>
                      {!test.passed && (
                        <div className="text-xs text-muted-foreground space-y-1 mt-2">
                          {test.expected_output && <div><span className="font-medium">Expected:</span> {test.expected_output}</div>}
                          {test.actual_output && <div><span className="font-medium">Got:</span> {test.actual_output}</div>}
                          {test.error_message && <div className="text-red-500"><span className="font-medium">Error:</span> {test.error_message}</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Approach Feedback */}
            {codeEvaluation?.approach_feedback && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg">Approach Feedback</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{codeEvaluation.approach_feedback}</p>
                </CardContent>
              </Card>
            )}

            {/* Edge cases & Suggestions */}
            {codeEvaluation && (
              <div className="grid md:grid-cols-2 gap-3">
                {codeEvaluation.edge_cases_handled && codeEvaluation.edge_cases_handled.length > 0 && (
                  <Card className="border-green-500/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-green-600 dark:text-green-400">✅ Edge Cases Handled</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="text-xs space-y-1">
                        {codeEvaluation.edge_cases_handled.map((ec, i) => (
                          <li key={i} className="flex items-start gap-1.5"><span className="text-green-500 shrink-0">✓</span> {ec}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
                {codeEvaluation.edge_cases_missed && codeEvaluation.edge_cases_missed.length > 0 && (
                  <Card className="border-red-500/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-red-600 dark:text-red-400">❌ Edge Cases Missed</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="text-xs space-y-1">
                        {codeEvaluation.edge_cases_missed.map((ec, i) => (
                          <li key={i} className="flex items-start gap-1.5"><span className="text-red-500 shrink-0">✗</span> {ec}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Optimization Suggestions */}
            {codeEvaluation?.optimization_suggestions && codeEvaluation.optimization_suggestions.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">💡 Optimization Suggestions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-xs space-y-1.5">
                    {codeEvaluation.optimization_suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-2"><span className="text-primary shrink-0">→</span> <span className="leading-relaxed">{s}</span></li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* No evaluation fallback */}
            {!codeEvaluation && (!codeTestResults || codeTestResults.length === 0) && (
              <Card className="border-amber-500/30">
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">Code evaluation is being processed. The results will appear in the final summary.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ── VOICE question feedback ── */}
        {!isCodeQ && (
          <>
        {/* Pressure / Mode indicator */}
        {pressure && (pressure.mode || pressure.reason) && (
          <Card className="border-muted">
            <CardContent className="pt-4 px-3 sm:px-6 pb-4 sm:pb-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Mode</div>
                  {pressure.reason ? (
                    <div className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
                      {pressure.reason}
                    </div>
                  ) : null}
                </div>
                {pressure.mode ? (
                  <Badge variant="outline" className="capitalize shrink-0">
                    {pressure.mode}
                  </Badge>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Speech Metrics - Compact Mobile Grid */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card className="border-muted overflow-hidden">
            <CardHeader className="pb-2 px-2 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-[10px] sm:text-sm font-medium text-muted-foreground uppercase tracking-wide truncate">
                Speed
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-6 pb-3 sm:pb-6">
              <div className="text-xl sm:text-3xl font-bold truncate">{speechMetrics?.wpm || 0}</div>
              <p className="text-[9px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 truncate">wpm</p>
            </CardContent>
          </Card>

          <Card className="border-muted overflow-hidden">
            <CardHeader className="pb-2 px-2 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-[10px] sm:text-sm font-medium text-muted-foreground uppercase tracking-wide truncate">
                Confidence
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-6 pb-3 sm:pb-6">
              <div className="text-xl sm:text-3xl font-bold truncate">
                {((speechMetrics?.confidence_score || 0) * 100).toFixed(0)}%
              </div>
              <p className="text-[9px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 truncate">score</p>
            </CardContent>
          </Card>

          <Card className="border-muted overflow-hidden">
            <CardHeader className="pb-2 px-2 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-[10px] sm:text-sm font-medium text-muted-foreground uppercase tracking-wide truncate">
                Fillers
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-6 pb-3 sm:pb-6">
              <div className="text-xl sm:text-3xl font-bold truncate">{speechMetrics?.filler_count || 0}</div>
              <p className="text-[9px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 truncate">um, uh</p>
            </CardContent>
          </Card>
        </div>

        {/* VAD Silence Removal - Compact Mobile Version */}
        {speechMetrics?.silence_removed && speechMetrics.silence_removed > 0 && (
          <Card className="border-yellow-500/30 bg-gradient-to-br from-yellow-50/50 to-orange-50/30 dark:from-yellow-950/20 dark:to-orange-950/10">
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6 pb-4 sm:pb-6">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-full shrink-0">
                  <Clock className="w-4 h-4 sm:w-6 sm:h-6 text-yellow-600 dark:text-yellow-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2 mb-2">
                    <span className="text-2xl sm:text-3xl font-bold text-yellow-700 dark:text-yellow-400">
                      {speechMetrics.silence_removed.toFixed(1)}s
                    </span>
                    <span className="text-xs sm:text-sm text-muted-foreground">of silence removed</span>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-3 leading-relaxed">
                    ⏸️ Long pauses were detected and removed by Voice Activity Detection (VAD). Practice speaking more continuously to reduce dead air.
                  </p>

                  {/* Compact Time Breakdown */}
                  <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-2 sm:p-3 space-y-1.5 sm:space-y-2 mb-2">
                    <div className="flex justify-between items-center text-xs sm:text-sm">
                      <span className="text-muted-foreground">Actual Speaking Time:</span>
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        {((speechMetrics.duration || 0) - speechMetrics.silence_removed).toFixed(1)}s
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs sm:text-sm">
                      <span className="text-muted-foreground">Silence Removed:</span>
                      <span className="font-semibold text-yellow-600 dark:text-yellow-400">
                        {speechMetrics.silence_removed.toFixed(1)}s
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs sm:text-sm border-t pt-1.5 sm:pt-2">
                      <span className="text-muted-foreground font-medium">Total Recording:</span>
                      <span className="font-semibold">
                        {(speechMetrics.duration || 0).toFixed(1)}s
                      </span>
                    </div>
                  </div>

                  <div className="mt-2">
                    <Progress
                      value={Math.min(100, (speechMetrics.silence_removed / (speechMetrics.duration || 1)) * 100)}
                      className="h-1.5 sm:h-2 bg-yellow-200 dark:bg-yellow-900/30"
                    />
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                      {((speechMetrics.silence_removed / (speechMetrics.duration || 1)) * 100).toFixed(1)}% of your recording was silence
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Your Answer & Feedback */}
        <Card className="flex-1">
          <CardHeader className="px-3 sm:px-6 pt-4 sm:pt-6 pb-3">
            <CardTitle className="text-base sm:text-lg">Your Answer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6 pb-4 sm:pb-6">
            <ScrollArea className="h-24 sm:h-32">
              <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground">{transcription}</p>
            </ScrollArea>

            <Separator />

            {/* Answer Correctness Section - NEW */}
            {microFeedback?.correctness_score !== undefined && (
              <>
                <div className="space-y-3 sm:space-y-4 p-3 sm:p-4 bg-muted/50 rounded-lg border">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                      <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Answer Correctness
                    </h4>
                    <div className="flex items-center gap-2 sm:gap-3">
                      {microFeedback.is_correct ? (
                        <span className="text-green-600 dark:text-green-400 text-lg sm:text-2xl">✅</span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400 text-lg sm:text-2xl">❌</span>
                      )}
                      <span className="text-xl sm:text-2xl font-bold text-primary">
                        {microFeedback.correctness_score}%
                      </span>
                      {microFeedback.technical_accuracy && (
                        <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium ${microFeedback.technical_accuracy === 'Excellent' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                          microFeedback.technical_accuracy === 'Good' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                            microFeedback.technical_accuracy === 'Fair' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                              'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                          {microFeedback.technical_accuracy}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Key Points Covered */}
                  {microFeedback.key_points_covered && microFeedback.key_points_covered.length > 0 && (
                    <div>
                      <h5 className="text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 text-green-600 dark:text-green-400">
                        ✅ Key Points Covered
                      </h5>
                      <ul className="text-xs sm:text-sm space-y-1">
                        {microFeedback.key_points_covered.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-green-600 dark:text-green-400 mt-0.5 shrink-0">✓</span>
                            <span className="leading-relaxed">{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Key Points Missed */}
                  {microFeedback.key_points_missed && microFeedback.key_points_missed.length > 0 && (
                    <div>
                      <h5 className="text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 text-red-600 dark:text-red-400">
                        ❌ Key Points Missed
                      </h5>
                      <ul className="text-xs sm:text-sm space-y-1">
                        {microFeedback.key_points_missed.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-red-600 dark:text-red-400 mt-0.5 shrink-0">✗</span>
                            <span className="leading-relaxed">{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Strengths */}
                  {microFeedback.strengths && microFeedback.strengths.length > 0 && (
                    <div>
                      <h5 className="text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 text-blue-600 dark:text-blue-400">
                        💪 Strengths
                      </h5>
                      <ul className="text-xs sm:text-sm space-y-1">
                        {microFeedback.strengths.map((strength, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0">•</span>
                            <span className="leading-relaxed">{strength}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Improvement Areas */}
                  {microFeedback.improvement_areas && microFeedback.improvement_areas.length > 0 && (
                    <div>
                      <h5 className="text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 text-orange-600 dark:text-orange-400">
                        📈 Areas to Improve
                      </h5>
                      <ul className="text-xs sm:text-sm space-y-1">
                        {microFeedback.improvement_areas.map((area, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-orange-600 dark:text-orange-400 mt-0.5 shrink-0">↗</span>
                            <span className="leading-relaxed">{area}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Actionable Suggestions */}
                  {microFeedback.actionable_suggestions && microFeedback.actionable_suggestions.length > 0 && (
                    <div>
                      <h5 className="text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 text-primary">
                        🎯 Next Steps
                      </h5>
                      <ul className="text-xs sm:text-sm space-y-1">
                        {microFeedback.actionable_suggestions.map((suggestion, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-primary mt-0.5 shrink-0">→</span>
                            <span className="leading-relaxed">{suggestion}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Model Answer */}
                  {microFeedback?.model_answer && (
                    <div className="mt-4 p-3 bg-green-500/5 rounded-lg">
                      <h4 className="font-semibold text-sm mb-1 text-green-600 dark:text-green-400">📖 Model Answer</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {microFeedback.model_answer}
                      </p>
                    </div>
                  )}
                </div>
                <Separator />
              </>
            )}

            {/* Why this score */}
            {evaluationTrace && (() => {
              // Normalize `why` to string[] — handle string, array, or object shapes
              let whyLines: string[] = [];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const raw: any = (evaluationTrace as any).why;
              if (Array.isArray(raw)) {
                whyLines = raw.map(String).filter(Boolean);
              } else if (typeof raw === 'string' && raw.trim()) {
                whyLines = raw.split(/\n|(?<=\.)\s+/).map((s: string) => s.trim()).filter(Boolean);
              }
              // Also check for alternative keys the backend might use
              if (whyLines.length === 0) {
                const alt = (evaluationTrace as any).reasons ?? (evaluationTrace as any).explanation ?? (evaluationTrace as any).reasoning;
                if (Array.isArray(alt)) {
                  whyLines = alt.map(String).filter(Boolean);
                } else if (typeof alt === 'string' && alt.trim()) {
                  whyLines = alt.split(/\n|(?<=\.)\s+/).map((s: string) => s.trim()).filter(Boolean);
                }
              }
              if (whyLines.length === 0) return null;
              return (
                <>
                  <div className="space-y-2 p-3 sm:p-4 bg-muted/50 rounded-lg border">
                    <div className="text-sm sm:text-base font-semibold flex items-center gap-2">
                      <span>🧠</span> Why this score
                    </div>
                    <ul className="text-xs sm:text-sm space-y-1.5">
                      {whyLines.map((line, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-primary mt-0.5 shrink-0">•</span>
                          <span className="text-muted-foreground leading-relaxed">{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Separator />
                </>
              );
            })()}

            {/* Session trajectory */}
            {trajectory && (trajectory.points || trajectory.overall || trajectory.dimensions || trajectory.note) && (
              <>
                <div className="space-y-3 p-3 sm:p-4 bg-muted/50 rounded-lg border">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm sm:text-base font-semibold flex items-center gap-2">
                      <span>📈</span> Session Trajectory
                    </div>
                    {typeof trajectory?.overall?.delta === 'number' && (
                      <Badge
                        variant="outline"
                        className={`font-mono text-xs ${
                          trajectory.overall.delta > 0
                            ? 'border-green-500/40 text-green-600 dark:text-green-400'
                            : trajectory.overall.delta < 0
                              ? 'border-red-500/40 text-red-600 dark:text-red-400'
                              : ''
                        }`}
                      >
                        Overall Δ {trajectory.overall.delta > 0 ? '+' : ''}{Math.round(trajectory.overall.delta * 100) / 100}
                      </Badge>
                    )}
                  </div>

                  {typeof trajectory.note === 'string' && trajectory.note.trim() && (
                    <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed italic">
                      {trajectory.note}
                    </div>
                  )}

                  {trajectory.dimensions && typeof trajectory.dimensions === 'object' && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {Object.entries(trajectory.dimensions as Record<string, any>).map(([dim, info]) => {
                        const delta = (info as any)?.delta;
                        if (typeof delta !== 'number') return null;
                        const rounded = Math.round(delta * 100) / 100;
                        return (
                          <Badge
                            key={dim}
                            variant="secondary"
                            className={`capitalize font-mono text-xs ${
                              rounded > 0
                                ? 'text-green-600 dark:text-green-400'
                                : rounded < 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {dim} {rounded > 0 ? '+' : ''}{rounded}
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {Array.isArray(trajectory.points) && trajectory.points.length > 0 && (
                    <div className="pt-1 space-y-1">
                      {trajectory.points.map((p: any, idx: number) => {
                        const qn = p?.question_number ?? p?.question ?? idx + 1;
                        const overall = p?.overall ?? p?.overall_score;
                        const dims = p?.dimensions ?? p?.dimension_scores;
                        const roundedOverall = typeof overall === 'number' ? Math.round(overall * 100) / 100 : null;
                        return (
                          <div key={idx} className="text-xs sm:text-sm text-muted-foreground flex flex-wrap items-center gap-2 py-1 border-b border-border/40 last:border-0">
                            <Badge variant="outline" className="text-xs font-mono">Q{qn}</Badge>
                            {roundedOverall !== null && (
                              <span>
                                Overall: <span className="font-semibold text-foreground">{roundedOverall}</span>
                              </span>
                            )}
                            {dims && typeof dims === 'object' && (
                              <span className="text-muted-foreground/80">
                                {Object.entries(dims as Record<string, any>)
                                  .filter(([, v]) => typeof v === 'number')
                                  .slice(0, 4)
                                  .map(([k, v]) => `${k}: ${Math.round((v as number) * 100) / 100}`)
                                  .join(' · ')}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <Separator />
              </>
            )}

            {/* Delivery Feedback - Compact Mobile Layout */}
            <div className="grid grid-cols-1 gap-3 sm:gap-4">
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm sm:text-base">
                  <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Delivery Tips
                </h4>
                <ul className="text-xs sm:text-sm space-y-1.5 sm:space-y-2">
                  {microFeedback?.delivery_tips && microFeedback.delivery_tips.length > 0 ? (
                    microFeedback.delivery_tips.map((tip, idx) => {
                      const isVadTip = tip.toLowerCase().includes('silence') ||
                        tip.toLowerCase().includes('pause') ||
                        tip.includes('⏸️');

                      return (
                        <li key={idx} className={`flex items-start gap-2 p-2 rounded leading-relaxed ${isVadTip ? 'bg-yellow-50 dark:bg-yellow-950/20 border-l-2 border-yellow-500' : ''
                          }`}>
                          <span className={`mt-0.5 shrink-0 ${isVadTip ? 'text-yellow-600 dark:text-yellow-500' : 'text-primary'}`}>
                            {isVadTip ? '⏸️' : '•'}
                          </span>
                          <span className={isVadTip ? 'text-yellow-700 dark:text-yellow-400 font-medium' : 'text-muted-foreground'}>
                            {tip}
                          </span>
                        </li>
                      );
                    })
                  ) : (
                    <li className="text-muted-foreground">{microFeedback?.speech_quality || 'N/A'}</li>
                  )}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm sm:text-base">
                  <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Overall Note
                </h4>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {microFeedback?.overall_note || microFeedback?.content_relevance || 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
          </>
        )}

        {/* Phase 3: Feedback usefulness rating (optional) */}
        {questionId && (
          <Card className="border-muted">
            <CardHeader className="px-3 sm:px-6 pt-4 sm:pt-6 pb-3">
              <CardTitle className="text-base sm:text-lg">Was this feedback useful?</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Optional — helps us improve the coach.</CardDescription>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-4 sm:pb-6 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((v) => {
                    const active = (usefulnessRating ?? 0) >= v;
                    return (
                      <Button
                        key={v}
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={ratingSubmitted || ratingSubmitting}
                        className="h-9 w-9"
                        onClick={() => updateFeedbackRatingDraft(questionId, { usefulnessRating: v })}
                        aria-label={`Rate usefulness ${v} out of 5`}
                      >
                        <Star className={active ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'} />
                      </Button>
                    );
                  })}
                </div>
                {ratingSubmitted ? (
                  <span className="text-xs text-muted-foreground">Thanks — saved.</span>
                ) : ratingSubmitting ? (
                  <span className="text-xs text-muted-foreground">Saving…</span>
                ) : usefulnessRating ? (
                  <span className="text-xs text-muted-foreground">{usefulnessRating}/5</span>
                ) : (
                  <span className="text-xs text-muted-foreground">(tap to rate)</span>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Felt difficulty (optional)</Label>
                <div className="flex gap-2">
                  {(['easy', 'medium', 'hard'] as const).map((d) => {
                    const selected = perceivedDifficulty === d;
                    return (
                      <Button
                        key={d}
                        type="button"
                        variant={selected ? 'secondary' : 'outline'}
                        size="sm"
                        disabled={ratingSubmitted || ratingSubmitting}
                        onClick={() => updateFeedbackRatingDraft(questionId, { perceivedDifficulty: d })}
                        className="capitalize"
                      >
                        {d}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Comment (optional)</Label>
                <Textarea
                  value={comment}
                  disabled={ratingSubmitted || ratingSubmitting}
                  onChange={(e) => updateFeedbackRatingDraft(questionId, { comment: e.target.value })}
                  placeholder="What helped? What was missing?"
                  className="min-h-[56px]"
                  maxLength={500}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {renderGuestGateBanner()}

        <div className="flex justify-center gap-4">
          <Button
            onClick={handleNextQuestion}
            disabled={isProcessing || !!guestGateBanner}
            size="lg"
            className="px-8"
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading...
              </>
            ) : (
              <>
                {completionPending ? 'Finish' : 'Next Question'}
                {completionPending ? (
                  <CheckCircle2 className="ml-2 w-4 h-4" />
                ) : (
                  <ArrowRight className="ml-2 w-4 h-4" />
                )}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === 'complete') {
    // Calculate score from metrics_summary instead of overall_score
    const avgConfidence = evaluation?.metrics_summary?.avg_confidence || 0;
    // Check if confidence is 0-1 scale or 0-10 scale
    const score = avgConfidence <= 1
      ? Math.round(avgConfidence * 100)  // 0-1 scale → multiply by 100
      : Math.round((avgConfidence / 10) * 100); // 0-10 scale → convert to percentage
    const grade = getScoreGrade(score);

    return (
      <div className="max-w-4xl mx-auto w-full px-4 overflow-auto">
        <ScrollArea className="h-full">
          <div className="space-y-6">
            {/* Header */}
            <Card className="border-2 bg-muted/20">
              <CardContent className="pt-8 pb-8">
                <div className="text-center space-y-4">
                  <div className="mx-auto w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                    <Trophy className="w-12 h-12 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-4xl font-bold mb-2">Interview Complete!</h1>
                    {endedEarlyData?.ended_early && (
                      <div className="inline-flex items-center px-3 py-1 mb-2 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-sm font-medium">
                        ⚠️ Ended early — {endedEarlyData.questions_answered ?? currentQuestionNumber}/{endedEarlyData.total_questions ?? totalQuestions} answered
                      </div>
                    )}
                    {currentRoundConfig ? (
                      <p className="text-muted-foreground text-lg">
                        Completed <span className="font-semibold text-primary">{currentRoundConfig.name}</span> • {totalQuestions} questions
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-lg">
                        Great job completing all {totalQuestions} questions!
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Instant Score Breakdown */}
            {sessionId && (
              <InstantScoreBreakdown 
                sessionId={sessionId} 
                onViewProgress={() => navigate('/progress')}
              />
            )}

            {/* All Questions Evaluation (shown only at end) */}
            {questionEvaluations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl sm:text-2xl">All Questions Evaluation</CardTitle>
                  <CardDescription>
                    Review feedback for each question in one place.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {questionEvaluations
                    .slice()
                    .sort((a, b) => a.questionNumber - b.questionNumber)
                    .map((item) => {
                      const voiceConfidencePct = item.metrics?.confidence_score !== undefined
                        ? Math.round((item.metrics.confidence_score || 0) * 100)
                        : undefined;
                      const testsTotal = item.testResults?.length ?? item.codeEvaluation?.test_cases_total;
                      const testsPassed = item.testResults
                        ? item.testResults.filter((t) => t.passed).length
                        : item.codeEvaluation?.test_cases_passed;

                      return (
                        <Card key={`${item.kind}-${item.questionNumber}-${item.createdAt}`} className="border-muted">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <CardTitle className="text-base sm:text-lg truncate">
                                  Question {item.questionNumber}
                                </CardTitle>
                                {item.questionText && (
                                  <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">
                                    {item.questionText}
                                  </p>
                                )}
                              </div>
                              <Badge variant="outline" className={item.kind === 'code' ? 'bg-blue-500/10 border-blue-500/50 text-blue-700 dark:text-blue-400' : 'bg-green-500/10 border-green-500/50 text-green-700 dark:text-green-400'}>
                                {item.kind === 'code' ? 'CODE' : 'VOICE'}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {item.kind === 'voice' && (
                              <>
                                {item.transcript && (
                                  <div className="space-y-2">
                                    <div className="text-sm font-medium">Transcript</div>
                                    <div className="rounded-md border bg-muted/30 p-3">
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.transcript}</p>
                                    </div>
                                  </div>
                                )}

                                {(item.metrics || item.microFeedback) && (
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <Card className="border-muted">
                                      <CardContent className="pt-4">
                                        <div className="text-xs text-muted-foreground">WPM</div>
                                        <div className="text-xl font-semibold">{item.metrics?.wpm ?? 0}</div>
                                      </CardContent>
                                    </Card>
                                    <Card className="border-muted">
                                      <CardContent className="pt-4">
                                        <div className="text-xs text-muted-foreground">Confidence</div>
                                        <div className="text-xl font-semibold">{voiceConfidencePct ?? 0}%</div>
                                      </CardContent>
                                    </Card>
                                    <Card className="border-muted">
                                      <CardContent className="pt-4">
                                        <div className="text-xs text-muted-foreground">Fillers</div>
                                        <div className="text-xl font-semibold">{item.metrics?.filler_count ?? 0}</div>
                                      </CardContent>
                                    </Card>
                                  </div>
                                )}

                                {item.microFeedback?.correctness_score !== undefined && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">
                                      Correctness: {item.microFeedback.correctness_score}%
                                    </Badge>
                                    {typeof item.microFeedback.is_correct === 'boolean' && (
                                      <Badge variant={item.microFeedback.is_correct ? 'default' : 'destructive'}>
                                        {item.microFeedback.is_correct ? 'Correct' : 'Needs Improvement'}
                                      </Badge>
                                    )}
                                    {item.microFeedback.technical_accuracy && (
                                      <Badge variant="outline">{item.microFeedback.technical_accuracy}</Badge>
                                    )}
                                  </div>
                                )}
                              </>
                            )}

                            {item.kind === 'code' && (
                              <>
                                {item.codeEvaluation && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">Overall: {item.codeEvaluation.overall_score}%</Badge>
                                    <Badge variant={item.codeEvaluation.is_correct ? 'default' : 'destructive'}>
                                      {item.codeEvaluation.is_correct ? 'Accepted' : 'Not Accepted'}
                                    </Badge>
                                    {testsTotal !== undefined && testsPassed !== undefined && (
                                      <Badge variant="outline">Tests: {testsPassed}/{testsTotal}</Badge>
                                    )}
                                  </div>
                                )}

                                {item.codeEvaluation?.approach_feedback && (
                                  <div className="space-y-2">
                                    <div className="text-sm font-medium">Approach Feedback</div>
                                    <div className="rounded-md border bg-muted/30 p-3">
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.codeEvaluation.approach_feedback}</p>
                                    </div>
                                  </div>
                                )}

                                {item.testResults && item.testResults.length > 0 && (
                                  <div className="space-y-2">
                                    <div className="text-sm font-medium">Test Results</div>
                                    <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                                      <div className="text-sm font-medium text-muted-foreground">
                                        {item.testResults.filter((t) => t.passed).length}/{item.testResults.length} passed
                                      </div>
                                      {item.testResults.map((tr, trIdx) => (
                                        <div key={trIdx} className={`text-xs flex items-center gap-2 ${tr.passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                          <span>{tr.passed ? '✅' : '❌'}</span>
                                          <span>Test {tr.test_case_number}</span>
                                          {!tr.passed && tr.error_message && (
                                            <span className="text-muted-foreground">— {tr.error_message}</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Fallback if no codeEvaluation */}
                                {!item.codeEvaluation && (!item.testResults || item.testResults.length === 0) && (
                                  <p className="text-sm text-muted-foreground italic">Code evaluation data not available from server. Check the Score Breakdown above for overall results.</p>
                                )}
                              </>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                </CardContent>
              </Card>
            )}

            {/* Fallback: Legacy Score Card (only if instant score fails) */}
            {!sessionId && (
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="text-2xl">Overall Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-4">
                    <div className="flex-1 w-full">
                      <div className="flex flex-wrap items-baseline gap-2 sm:gap-3 mb-2 justify-center sm:justify-start">
                        <span className={`text-4xl sm:text-6xl font-bold ${getScoreColor(score)}`}>
                          {score}
                        </span>
                        <span className="text-xl sm:text-3xl text-muted-foreground">/100</span>
                        <Badge className="text-base sm:text-xl px-3 sm:px-4 py-1 sm:py-2">{grade}</Badge>
                      </div>
                      <Progress value={score} className="h-3 mt-4" />
                      <p className="text-xs text-muted-foreground mt-2 text-center sm:text-left">
                        Based on average confidence score: {avgConfidence.toFixed(2)}{avgConfidence <= 1 ? ' (0-1 scale)' : '/10'}
                      </p>
                    </div>
                    <div className="flex flex-col items-center gap-2 sm:ml-8">
                      <div className="relative w-16 h-16">
                        <Star className="w-16 h-16 text-gray-300 absolute" />
                        <div
                          className="overflow-hidden absolute inset-0"
                          style={{ clipPath: `inset(0 ${100 - score}% 0 0)` }}
                        >
                          <Star className="w-16 h-16 text-yellow-500 fill-yellow-500" />
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">
                        {score >= 80 ? 'Excellent!' : score >= 60 ? 'Good!' : score >= 40 ? 'Fair' : 'Keep Practicing'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Strengths */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="w-5 h-5" />
                  Your Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {evaluation?.strengths?.items && Array.isArray(evaluation.strengths.items) && evaluation.strengths.items.length > 0 ? (
                    evaluation.strengths.items.map((strength, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{strength}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-muted-foreground">No strengths data available</li>
                  )}
                </ul>
              </CardContent>
            </Card>

            {/* Areas for Improvement */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-600">
                  <TrendingUp className="w-5 h-5" />
                  Areas for Improvement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {evaluation?.improvements?.items && Array.isArray(evaluation.improvements.items) && evaluation.improvements.items.length > 0 ? (
                    evaluation.improvements.items.map((area, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Flame className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{area}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-muted-foreground">No improvement areas data available</li>
                  )}
                </ul>
              </CardContent>
            </Card>

            {/* Speech Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Speech Analytics Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Average Speed</p>
                    <p className="text-2xl font-bold">
                      {evaluation?.metrics_summary?.avg_wpm || evaluation?.speech_summary?.average_wpm || 0}
                      <span className="text-sm text-muted-foreground ml-1">WPM</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total Fillers</p>
                    <p className="text-2xl font-bold">
                      {evaluation?.metrics_summary?.total_fillers || evaluation?.speech_summary?.total_filler_count || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Avg Confidence</p>
                    <p className="text-2xl font-bold">
                      {((evaluation?.metrics_summary?.avg_confidence || evaluation?.speech_summary?.average_confidence || 0) * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Longest Pause</p>
                    <p className="text-2xl font-bold">
                      {(evaluation?.metrics_summary?.longest_pause || 0).toFixed(1)}
                      <span className="text-sm text-muted-foreground ml-1">sec</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Duration</p>
                    <p className="text-2xl font-bold">
                      {formatTime(Math.floor(evaluation?.metrics_summary?.total_duration || 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Overtalk Count</p>
                    <p className="text-2xl font-bold">
                      {evaluation?.metrics_summary?.overtalked_count || 0}
                    </p>
                  </div>
                </div>

                {evaluation?.learning_insight ? (
                  <>
                    <Separator className="my-4" />
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm text-muted-foreground">Peer benchmark</div>
                      <div className="text-sm font-medium text-foreground text-right max-w-[75%]">
                        {evaluation.learning_insight}
                      </div>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>

            {/* Post-session confidence prompt (optional; disabled when backend feature flag is off) */}
            {sessionId && sessionConfidenceStatus !== 'disabled' ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">How confident do you feel?</CardTitle>
                  <CardDescription>Rate your overall confidence for this session (1–5).</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-2">
                    {[1, 2, 3, 4, 5].map((v) => {
                      const active = (sessionConfidenceDraft ?? 0) === v;
                      return (
                        <Button
                          key={v}
                          type="button"
                          size="sm"
                          variant={active ? 'default' : 'outline'}
                          disabled={sessionConfidenceStatus === 'submitting'}
                          onClick={() => submitSessionConfidenceBestEffort(sessionId, v)}
                          className="min-w-10"
                        >
                          {v}
                        </Button>
                      );
                    })}

                    <div className="flex-1" />

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={sessionConfidenceStatus === 'submitting'}
                      onClick={() => skipSessionConfidencePrompt(sessionId)}
                    >
                      Skip
                    </Button>
                  </div>

                  <div className="mt-2 text-xs text-muted-foreground">
                    {sessionConfidenceStatus === 'saved'
                      ? 'Thanks—saved.'
                      : sessionConfidenceStatus === 'skipped'
                        ? 'Skipped. You can still add a rating anytime.'
                        : sessionConfidenceStatus === 'submitting'
                          ? 'Saving…'
                          : sessionConfidenceStatus === 'error'
                            ? 'Not saved yet. Try again.'
                            : ''}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Action Plan */}
            {evaluation?.action_plan?.steps && Array.isArray(evaluation.action_plan.steps) && evaluation.action_plan.steps.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-600">
                    <Target className="w-5 h-5" />
                    Your Action Plan
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {evaluation.action_plan.steps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                          {idx + 1}
                        </div>
                        <span className="text-sm flex-1">{step}</span>
                      </li>
                    ))}
                  </ul>
                  {evaluation.practice_recommendation && (
                    <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        💡 {evaluation.practice_recommendation}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Skipped Questions */}
            {endedEarlyData?.skipped_questions && endedEarlyData.skipped_questions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                    Skipped Questions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {endedEarlyData.skipped_questions.map((q) => (
                    <div key={q.question_number} className="p-3 bg-muted/30 rounded-lg border border-dashed border-border/40">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground font-medium">Q{q.question_number}</span>
                        {q.category && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                            {q.category.replace('_', ' ')}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm">{q.question}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <div className="flex gap-4 justify-center pb-8">
              <Button
                size="lg"
                variant="outline"
                onClick={handleRestart}
                className="px-8"
              >
                <RotateCcw className="mr-2" />
                Practice Again
              </Button>
              <Button
                size="lg"
                className="px-8"
                onClick={handleRestart}
              >
                <Sparkles className="mr-2" />
                New Interview
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return null;
};
