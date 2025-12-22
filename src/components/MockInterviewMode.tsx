import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import {
  apiStartMockInterview,
  apiSubmitMockAnswer,
  apiGetSessionSummary,
  apiEndSession,
  apiGetHint,
  apiGetProgress,
  type InterviewType,
  type Difficulty,
  type StartSessionResponse,
  type SubmitAnswerResponse,
  type SessionSummaryResponse,
  type HintResponse,
  type ProgressResponse,
} from "@/lib/mockInterviewApi";
import { submitRun, pollResult, type RunResult } from "@/lib/runner";
import {
  Play,
  Mic,
  MicOff,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Award,
  Target,
  Lightbulb,
  ArrowRight,
  RotateCcw,
  Loader2,
  AlertCircle,
  X,
  ChevronLeft,
  Maximize2,
} from "lucide-react";
import { MonacoEditor } from "@/components/MonacoEditor";

type SessionPhase = "setup" | "interview" | "feedback" | "summary" | "history";

interface MockInterviewModeProps {
  selectedHistorySession?: any;
  onHistoryUpdate?: () => void;
}

export const MockInterviewMode = ({ selectedHistorySession, onHistoryUpdate }: MockInterviewModeProps) => {
  const { toast } = useToast();
  const {
    isListening,
    transcript,
    isSupported: isSpeechSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  // Session state
  const [phase, setPhase] = useState<SessionPhase>("setup");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId] = useState(() => {
    const stored = localStorage.getItem("mock_interview_user_id");
    if (stored) return stored;
    const newId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem("mock_interview_user_id", newId);
    return newId;
  });

  // Setup form state
  const [interviewType, setInterviewType] = useState<InterviewType>("coding");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [numQuestions, setNumQuestions] = useState(5);
  const [topic, setTopic] = useState("");

  // Interview state
  const [currentQuestion, setCurrentQuestion] = useState<StartSessionResponse["first_question"] | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [codeAnswer, setCodeAnswer] = useState("");
  const [language, setLanguage] = useState("python");
  const [questionNumber, setQuestionNumber] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Feedback state
  const [currentFeedback, setCurrentFeedback] = useState<SubmitAnswerResponse["evaluation"] | null>(null);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);

  // Summary state
  const [summary, setSummary] = useState<SessionSummaryResponse | null>(null);

  // History state for previous questions
  const [questionHistory, setQuestionHistory] = useState<Array<{
    question: StartSessionResponse["first_question"];
    answer: string;
    feedback: SubmitAnswerResponse["evaluation"];
    followUps: string[];
  }>>([]);
  
  // Selected question for side-by-side comparison in summary
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number | null>(null);
  const [isAnswerExpanded, setIsAnswerExpanded] = useState<boolean>(false);
  // History expanded view (show larger side-by-side answers in history tab)
  const [historyExpanded, setHistoryExpanded] = useState<boolean>(false);

  // Hint system state
  const [currentHint, setCurrentHint] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState<1 | 2 | 3>(1);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [isLoadingHint, setIsLoadingHint] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [codeOutput, setCodeOutput] = useState<string>("");
  const [isRunningCode, setIsRunningCode] = useState(false);

  // Progress tracking state
  const [progressData, setProgressData] = useState<ProgressResponse | null>(null);
  const [questionStartTime, setQuestionStartTime] = useState<number | null>(null);

  // Timer
  const timerRef = useRef<number | null>(null);

  // Save session state to localStorage
  useEffect(() => {
    if (sessionId && phase !== "setup") {
      const sessionState = {
        phase,
        sessionId,
        interviewType,
        difficulty,
        numQuestions,
        topic,
        currentQuestion,
        questionNumber,
        totalQuestions,
        startTime,
        elapsedTime,
        currentFeedback,
        followUpQuestions,
        summary,
        questionHistory,
        hintsUsed,
        progressData,
      };
      localStorage.setItem("mock_interview_session", JSON.stringify(sessionState));
    }
  }, [phase, sessionId, currentQuestion, questionNumber, currentFeedback, summary, questionHistory, elapsedTime]);

  // Restore session state on mount
  useEffect(() => {
    const savedSession = localStorage.getItem("mock_interview_session");
    if (savedSession) {
      try {
        const state = JSON.parse(savedSession);
        // Only restore if session is not completed
        if (state.phase !== "setup" && state.sessionId) {
          setPhase(state.phase);
          setSessionId(state.sessionId);
          setInterviewType(state.interviewType);
          setDifficulty(state.difficulty);
          setNumQuestions(state.numQuestions);
          setTopic(state.topic || "");
          setCurrentQuestion(state.currentQuestion);
          setQuestionNumber(state.questionNumber);
          setTotalQuestions(state.totalQuestions);
          setStartTime(state.startTime);
          setElapsedTime(state.elapsedTime || 0);
          setCurrentFeedback(state.currentFeedback);
          setFollowUpQuestions(state.followUpQuestions || []);
          setSummary(state.summary);
          setQuestionHistory(state.questionHistory || []);
          setHintsUsed(state.hintsUsed || 0);
          setProgressData(state.progressData);
          
          toast({
            title: "Session restored",
            description: "Continuing from where you left off",
          });
        }
      } catch (error) {
        console.error("Failed to restore session:", error);
        localStorage.removeItem("mock_interview_session");
      }
    }
  }, []);

  // Handle selected history session from sidebar
  useEffect(() => {
    if (selectedHistorySession) {
      // Only switch to history if the session has evaluations
      if (selectedHistorySession.evaluations && selectedHistorySession.evaluations.length > 0) {
        setPhase("history");
        setSelectedQuestionIndex(0); // Start with first question
      } else {
        // If no evaluations, show error and stay in setup
        toast({
          title: "No Questions Found",
          description: "This session doesn't have recorded questions. Starting a new interview instead.",
          variant: "destructive",
        });
        // Don't change phase, stay in setup
      }
    } else {
      // No session selected, make sure we're in setup phase
      if (phase === "history") {
        setPhase("setup");
      }
    }
  }, [selectedHistorySession]);

  useEffect(() => {
    if (startTime && phase === "interview") {
      timerRef.current = window.setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTime, phase]);

  // Load progress data when interview phase starts
  useEffect(() => {
    if (phase === "interview" && sessionId && questionNumber > 1) {
      loadProgress();
    }
  }, [phase, questionNumber]);

  // Update answer when voice transcript changes
  useEffect(() => {
    if (transcript) {
      setUserAnswer((prev) => {
        const trimmedPrev = prev.trim();
        const trimmedTranscript = transcript.trim();
        if (trimmedPrev && !trimmedPrev.endsWith(" ")) {
          return trimmedPrev + " " + trimmedTranscript;
        }
        return trimmedPrev + trimmedTranscript;
      });
    }
  }, [transcript]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStartInterview = async () => {
    try {
      setIsSubmitting(true);
      
      // Clear any previous session
      localStorage.removeItem("mock_interview_session");
      
      console.log("[MockInterview] Starting interview with config:", {
        user_id: userId,
        interview_type: interviewType,
        difficulty,
        num_questions: numQuestions,
        topic: topic || undefined,
      });
      
      const response = await apiStartMockInterview({
        user_id: userId,
        interview_type: interviewType,
        difficulty,
        num_questions: numQuestions,
        topic: topic || undefined,
      });

      console.log("[MockInterview] Start response:", response);
      console.log("[MockInterview] First question:", response.first_question);
      console.log("[MockInterview] Setting phase to 'interview'");

      setSessionId(response.session_id);
      setCurrentQuestion(response.first_question);
      setTotalQuestions(response.total_questions);
      setQuestionNumber(1);
      setPhase("interview");
      setStartTime(Date.now());
      setQuestionStartTime(Date.now());
      setElapsedTime(0);
      setCurrentHint(null);
      setHintLevel(1);
      setHintsUsed(0);

      console.log("[MockInterview] State updated - phase:", "interview", "sessionId:", response.session_id);

      toast({
        title: "Interview Started",
        description: `Get ready for ${response.total_questions} ${interviewType} questions!`,
      });
    } catch (error: any) {
      console.error("[MockInterview] Failed to start:", error);
      toast({
        title: "Failed to start interview",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!sessionId || !currentQuestion) return;

    const answerText = interviewType === "coding" && codeAnswer ? codeAnswer : userAnswer;
    if (!answerText.trim()) {
      toast({
        title: "Empty answer",
        description: "Please provide an answer before submitting",
        variant: "destructive",
      });
      return;
    }

    await submitAnswer(answerText);
  };

  const handleSkipQuestion = async () => {
    if (!sessionId || !currentQuestion) return;
    
    const skipText = "[Skipped]";
    await submitAnswer(skipText);
  };

  const submitAnswer = async (answerText: string) => {
    if (!sessionId || !currentQuestion) return;

    try {
      setIsSubmitting(true);
      const timeSpent = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

      console.log("[MockInterview] Submitting answer:", {
        session_id: sessionId,
        answer_length: answerText.length,
        time_taken: timeSpent,
      });

      const response = await apiSubmitMockAnswer({
        session_id: sessionId,
        answer_text: answerText,
        time_taken_seconds: timeSpent,
        input_method: isListening || transcript ? "voice" : "text",
        code_solution: interviewType === "coding" ? codeAnswer : undefined,
        language: interviewType === "coding" ? language : undefined,
      });

      console.log("[MockInterview] Submit response:", response);
      console.log("[MockInterview] Evaluation:", response.evaluation);
      console.log("[MockInterview] Is last question:", response.is_last_question);
      console.log("[MockInterview] Next question:", response.next_question);
      console.log("[MockInterview] Follow-up questions:", response.follow_up_questions);

      // Save current question and feedback to history
      if (currentQuestion && response.evaluation) {
        setQuestionHistory(prev => [...prev, {
          question: currentQuestion,
          answer: answerText,
          feedback: response.evaluation,
          followUps: response.follow_up_questions || [],
        }]);
      }

      setCurrentFeedback(response.evaluation);
      setFollowUpQuestions(response.follow_up_questions || []);
      setPhase("feedback");

      if (response.is_last_question) {
        console.log("[MockInterview] Interview complete, loading summary...");
        // Interview complete, load summary
        const summaryData = await apiGetSessionSummary(sessionId);
        console.log("[MockInterview] Summary data:", summaryData);
        setSummary(summaryData);
        
        // Save completed session to history cache
        try {
          console.log("[MockInterview] Saving to history - questionHistory:", questionHistory);
          const historySession = {
            session_id: sessionId,
            user_id: userId,
            interview_type: interviewType,
            difficulty: difficulty,
            status: "completed",
            started_at: summaryData.started_at,
            completed_at: summaryData.completed_at,
            average_score: summaryData.average_score,
            questions_answered: summaryData.questions_answered,
            total_questions: summaryData.total_questions,
            is_complete: true,
            evaluations: summaryData.evaluations.map((evaluation: any, idx: number) => {
              const historyItem = questionHistory[idx];
              console.log(`[MockInterview] Mapping evaluation ${idx}:`, {
                question: evaluation.question,
                userAnswer: historyItem?.answer?.substring(0, 50),
                modelAnswer: historyItem?.feedback?.model_answer?.substring(0, 50),
              });
              return {
                question: evaluation.question,
                user_answer: historyItem?.answer || "",
                model_answer: historyItem?.feedback?.model_answer || "",
                score: evaluation.score,
                rating: evaluation.rating,
                feedback: evaluation.summary,
              };
            }),
          };
          console.log("[MockInterview] History session to save:", historySession);
          
          // Add to localStorage history cache
          const cached = localStorage.getItem(`mock_interview_history_${userId}`);
          const sessions = cached ? JSON.parse(cached) : [];
          sessions.unshift(historySession);
          localStorage.setItem(`mock_interview_history_${userId}`, JSON.stringify(sessions.slice(0, 50))); // Keep last 50
          
          // Notify parent to refresh history
          if (onHistoryUpdate) {
            onHistoryUpdate();
          }
        } catch (error) {
          console.error("[MockInterview] Failed to save to history:", error);
        }
      } else if (response.next_question) {
        console.log("[MockInterview] Setting next question");
        setCurrentQuestion(response.next_question);
        setQuestionNumber((prev) => prev + 1);
      }

      // Reset for next question
      setUserAnswer("");
      setCodeAnswer("");
      resetTranscript();
      setStartTime(Date.now());
    } catch (error: any) {
      console.error("[MockInterview] Failed to submit answer:", error);
      toast({
        title: "Failed to submit answer",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinueToNextQuestion = () => {
    if (summary) {
      setPhase("summary");
    } else {
      setPhase("interview");
      setCurrentFeedback(null);
      setCurrentHint(null);
      setHintLevel(1);
      setQuestionStartTime(Date.now());
    }
  };

  const handleRestart = () => {
    // Clear saved session
    localStorage.removeItem("mock_interview_session");
    
    setPhase("setup");
    setSessionId(null);
    setCurrentQuestion(null);
    setCurrentFeedback(null);
    setSummary(null);
    setUserAnswer("");
    setCodeAnswer("");
    setQuestionNumber(1);
    setStartTime(null);
    setElapsedTime(0);
    setQuestionHistory([]);
    setCurrentHint(null);
    setHintLevel(1);
    setHintsUsed(0);
    setProgressData(null);
    resetTranscript();
  };

  const handleRequestHint = async () => {
    if (!sessionId) return;

    try {
      setIsLoadingHint(true);
      const hintResponse = await apiGetHint(sessionId, hintLevel);
      
      setCurrentHint(hintResponse.hint);
      setHintsUsed(hintResponse.hints_used_count);
      
      // Auto-advance hint level for next hint (max 3)
      if (hintLevel < 3) {
        setHintLevel((prev) => (prev + 1) as 1 | 2 | 3);
      }

      toast({
        title: `Hint Level ${hintResponse.hint_level}`,
        description: hintResponse.hint_description,
      });
    } catch (error: any) {
      console.error("[MockInterview] Failed to get hint:", error);
      toast({
        title: "Failed to get hint",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoadingHint(false);
    }
  };

  const loadProgress = async () => {
    if (!sessionId) return;

    try {
      const progress = await apiGetProgress(sessionId);
      setProgressData(progress);
    } catch (error: any) {
      console.error("[MockInterview] Failed to load progress:", error);
    }
  };

  const toggleRecording = () => {
    if (!isSpeechSupported) {
      toast({
        title: "Voice input not supported",
        description: "Your browser doesn't support voice recognition",
        variant: "destructive",
      });
      return;
    }

    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      startListening();
    }
  };

  const handleRunCode = async () => {
    if (!codeAnswer.trim()) {
      toast({
        title: "No code to run",
        description: "Please write some code first",
        variant: "destructive",
      });
      return;
    }

    setIsRunningCode(true);
    setCodeOutput("");

    try {
      // Map language to Judge0 language IDs
      const languageMap: Record<string, number> = {
        python: 71,      // Python 3
        javascript: 63,  // Node.js
        typescript: 74,  // TypeScript
        java: 62,        // Java
        cpp: 54,         // C++
      };

      const languageId = languageMap[language] || 71;

      toast({
        title: "Running code...",
        description: "Compiling and executing your code",
      });

      const { token } = await submitRun({
        languageId,
        source: codeAnswer,
        stdin: "",
      });

      const result = await pollResult(token);

      if (result.status.id === 3) {
        // Success
        const output = result.stdout || "(no output)";
        setCodeOutput(output);
        toast({
          title: "Code executed successfully",
          description: "Check the output below",
        });
      } else if (result.status.id === 6) {
        // Compilation error
        const error = result.compile_output || "Compilation failed";
        setCodeOutput(`Compilation Error:\n${error}`);
        toast({
          title: "Compilation failed",
          description: "Check the output for errors",
          variant: "destructive",
        });
      } else if (result.status.id === 11 || result.status.id === 12) {
        // Runtime error
        const error = result.stderr || "Runtime error occurred";
        setCodeOutput(`Runtime Error:\n${error}`);
        toast({
          title: "Runtime error",
          description: "Your code encountered an error",
          variant: "destructive",
        });
      } else {
        // Other status
        const output = result.stderr || result.stdout || result.status.description;
        setCodeOutput(`Status: ${result.status.description}\n${output}`);
      }
    } catch (error: any) {
      console.error("[MockInterview] Code execution failed:", error);
      setCodeOutput(`Error: ${error.message || "Failed to execute code"}`);
      toast({
        title: "Execution failed",
        description: error.message || "Could not run your code",
        variant: "destructive",
      });
    } finally {
      setIsRunningCode(false);
    }
  };

  // Debug: Log state changes
  useEffect(() => {
    console.log("[MockInterview] State changed - phase:", phase, "question:", currentQuestion?.question_text?.substring(0, 50), "sessionId:", sessionId);
  }, [phase, currentQuestion, sessionId]);

  // Setup Phase
  if (phase === "setup") {
    const interviewTypes = [
      { id: 'coding', name: 'Coding', description: 'Algorithms & Data Structures' },
      { id: 'behavioral', name: 'Behavioral', description: 'Leadership & Communication' },
      { id: 'system_design', name: 'System Design', description: 'Architecture & Scalability' },
      { id: 'technical', name: 'Technical', description: 'Concepts & Theory' }
    ];

    const difficulties = [
      { id: 'easy', name: 'Easy', description: 'Beginner friendly' },
      { id: 'medium', name: 'Medium', description: 'Standard level' },
      { id: 'hard', name: 'Hard', description: 'Advanced level' }
    ];

    // Quick Start Presets
    const quickPresets = [
      { name: 'FAANG Prep', type: 'coding' as InterviewType, difficulty: 'hard' as Difficulty, questions: 5, topic: 'Arrays' },
      { name: 'Startup Interview', type: 'system_design' as InterviewType, difficulty: 'medium' as Difficulty, questions: 3, topic: '' },
      { name: 'Quick Practice', type: 'coding' as InterviewType, difficulty: 'easy' as Difficulty, questions: 3, topic: '' },
      { name: 'Behavioral Prep', type: 'behavioral' as InterviewType, difficulty: 'medium' as Difficulty, questions: 5, topic: 'Leadership' }
    ];

    const applyPreset = (preset: typeof quickPresets[0]) => {
      setInterviewType(preset.type);
      setDifficulty(preset.difficulty);
      setNumQuestions(preset.questions);
      setTopic(preset.topic);
    };

    const resetToDefaults = () => {
      setInterviewType('coding');
      setDifficulty('medium');
      setNumQuestions(5);
      setTopic('');
    };

    // Get user stats from localStorage
    const getUserStats = () => {
      const stats = localStorage.getItem('mock_interview_stats');
      if (!stats) return null;
      try {
        return JSON.parse(stats);
      } catch {
        return null;
      }
    };

    const userStats = getUserStats();

    return (
      <div className="h-full overflow-y-auto p-4 scrollbar-hide scroll-smooth">
        <div className="max-w-5xl mx-auto pb-20">
          <div className="space-y-5">
            {/* Interview Type Selection */}
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-yellow-400" />
                Interview Type
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {interviewTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setInterviewType(type.id as InterviewType)}
                    className={`p-3 rounded-lg border-2 transition-all text-center ${
                      interviewType === type.id
                        ? 'border-primary bg-primary/10 shadow-lg'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="text-sm font-semibold mb-0.5">{type.name}</div>
                    <div className="text-xs text-muted-foreground">{type.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-400" />
                Difficulty
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {difficulties.map((diff) => (
                  <button
                    key={diff.id}
                    onClick={() => setDifficulty(diff.id as Difficulty)}
                    className={`text-left rounded-lg p-2.5 border-2 transition-all ${
                      difficulty === diff.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold">{diff.name}</div>
                      <div className="text-xs text-muted-foreground">{diff.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Questions */}
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-green-400" />
                Questions
              </h2>
              <Input
                type="number"
                min="1"
                max="50"
                value={numQuestions}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setNumQuestions(1);
                    return;
                  }
                  const num = parseInt(value, 10);
                  if (!isNaN(num) && num >= 1 && num <= 50) {
                    setNumQuestions(num);
                  }
                }}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (value === '' || parseInt(value, 10) < 1) {
                    setNumQuestions(1);
                  } else if (parseInt(value, 10) > 50) {
                    setNumQuestions(50);
                  }
                }}
                className="mb-2 text-sm h-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="1-50"
              />
              <div className="text-xs text-muted-foreground">
                ~{numQuestions * 7} minutes
              </div>
            </div>

            {/* Session Summary */}
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-purple-400" />
                Summary
              </h2>
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-3 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Type</span>
                    <Badge variant="outline" className="capitalize">{interviewType.replace('_', ' ')}</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Difficulty</span>
                    <Badge variant="outline" className="capitalize">{difficulty}</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Questions</span>
                    <Badge variant="outline">{numQuestions}</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Duration</span>
                    <Badge variant="outline">{numQuestions * 7} min</Badge>
                  </div>
                  {userStats && (
                    <>
                      <Separator />
                      <div className="pt-2 border-t">
                        <div className="text-xs font-semibold text-muted-foreground mb-2">Your Stats</div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Sessions</span>
                            <span className="font-medium">{userStats.totalSessions || 0}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Avg Score</span>
                            <span className="font-medium">{userStats.avgScore?.toFixed(1) || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Topic Input */}
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-400" />
                Focus Topic (Optional)
              </h2>
              <Input
                placeholder="e.g., Arrays, Dynamic Programming, Leadership..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="mb-2 text-sm h-9"
              />
              <div className="flex flex-wrap gap-2">
                {['Arrays', 'Trees', 'Graphs', 'DP', 'System Design', 'Leadership'].map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => setTopic(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button 
                onClick={resetToDefaults}
                variant="outline"
                size="default"
                className="flex-shrink-0"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
              <Button 
                onClick={handleStartInterview} 
                disabled={isSubmitting} 
                size="default"
                className="flex-1 h-11 text-base font-semibold bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 shadow-lg shadow-primary/20"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting Interview...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Start Interview
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Interview Phase
  if (phase === "interview" && currentQuestion) {
    const showCodeEditor = interviewType === "coding";

    const handleStopInterview = () => {
      // Reset to setup phase
      setPhase("setup");
      // Clear current interview state
      setSessionId(null);
      setCurrentQuestion(null);
      setQuestionHistory([]);
      setQuestionNumber(1);
      setTotalQuestions(0);
      setElapsedTime(0);
      setStartTime(null);
      setUserAnswer("");
      setCodeAnswer("");
      setCurrentFeedback(null);
      setFollowUpQuestions([]);
      setCurrentHint(null);
      setHintLevel(1);
      setHintsUsed(0);
      setProgressData(null);
      setSummary(null);
      
      // Clear localStorage to prevent restoration
      localStorage.removeItem("mock_interview_session");
      
      toast({
        title: "Interview Stopped",
        description: "You can start a new interview anytime",
      });
    };

    return (
      <div className="h-full flex flex-col p-4 gap-4">
        {/* Header */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="text-sm">
                  Question {questionNumber} of {totalQuestions}
                </Badge>
                <Badge variant="secondary">{currentQuestion.difficulty}</Badge>
                {currentQuestion.topic && <Badge variant="outline">{currentQuestion.topic}</Badge>}
              </div>
              <div className="flex items-center gap-4">
                {hintsUsed > 0 && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Lightbulb className="h-4 w-4 text-yellow-500" />
                    <span>{hintsUsed} hint{hintsUsed > 1 ? 's' : ''} used</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Clock className={`h-4 w-4 ${
                    elapsedTime < 180 ? 'text-green-400' : 
                    elapsedTime < 300 ? 'text-yellow-400' : 
                    'text-red-400'
                  }`} />
                  <span className={`font-mono ${
                    elapsedTime < 180 ? 'text-green-400' : 
                    elapsedTime < 300 ? 'text-yellow-400' : 
                    'text-red-400'
                  }`}>{formatTime(elapsedTime)}</span>
                </div>
                {questionHistory.length > 0 && (
                  <Select onValueChange={(value) => {
                    const index = parseInt(value);
                    const previous = questionHistory[index];
                    if (previous && previous.feedback) {
                      setCurrentFeedback(previous.feedback);
                      setFollowUpQuestions(previous.followUps);
                      setPhase("feedback");
                    }
                  }}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="View Feedback" />
                    </SelectTrigger>
                    <SelectContent>
                      {questionHistory.map((item, idx) => (
                        <SelectItem key={idx} value={idx.toString()}>
                          Question {idx + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleStopInterview}
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  Stop Interview
                </Button>
              </div>
            </div>
            <Progress value={(questionNumber / totalQuestions) * 100} className="mt-2" />
            {progressData && (
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span>Average Score: {progressData.average_score.toFixed(1)}/10</span>
                <span>•</span>
                <span>Total Time: {progressData.total_time_seconds ? formatTime(progressData.total_time_seconds) : '0:00'}</span>
                <span>•</span>
                <span>Total Hints: {progressData.hints_used_total || 0}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
          {/* Question Panel */}
          <Card className="flex flex-col border-primary/20">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Question</CardTitle>
                {showCodeEditor && (
                  <Badge variant="secondary" className="text-xs">
                    Coding Challenge
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
              <div className="space-y-4 pr-4">
                <div className="space-y-3">
                  <p className="text-base leading-relaxed font-medium">{currentQuestion.question_text}</p>
                  
                  {showCodeEditor && (
                    <>
                      <Separator className="my-3" />
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-muted-foreground">Example:</h4>
                        <div className="bg-muted/50 rounded-md p-3 text-sm font-mono">
                          <div className="text-green-600">Input: nums = [1,2,3,1]</div>
                          <div className="text-blue-600">Output: true</div>
                          <div className="text-muted-foreground mt-1">Explanation: The value 1 appears at indices 0 and 3.</div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-muted-foreground">Constraints:</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          <li className="flex gap-2">
                            <span className="text-primary">•</span>
                            <span>1 ≤ array.length ≤ 10⁵</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-primary">•</span>
                            <span>Follow up: Could you solve it in O(1) time?</span>
                          </li>
                        </ul>
                      </div>
                    </>
                  )}
                </div>
                
                {currentQuestion.hints && currentQuestion.hints.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <Separator className="my-3" />
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      <span>Available Hints ({currentQuestion.hints.length})</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Click the Hint button above to reveal hints when needed</p>
                  </div>
                )}
              </div>

              {/* Expanded history dialog -- moved to history block so currentEval is available */}
            </CardContent>
          </Card>

          {/* Answer Panel */}
          <Card className="flex flex-col min-h-0 border-primary/20">
            <CardHeader className="flex-shrink-0 bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Your Answer</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setIsAnswerExpanded(true)}
                    title="Expand answer"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  {!showCodeEditor && isSpeechSupported && (
                    <Button
                      variant={isListening ? "destructive" : "outline"}
                      size="sm"
                      onClick={toggleRecording}
                    >
                      {isListening ? (
                        <>
                          <MicOff className="h-4 w-4 mr-2" />
                          Stop
                        </>
                      ) : (
                        <>
                          <Mic className="h-4 w-4 mr-2" />
                          Voice
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRequestHint}
                    disabled={isLoadingHint || hintLevel > 3}
                    className="gap-2"
                  >
                    {isLoadingHint ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Lightbulb className="h-4 w-4" />
                        Hint {hintLevel > 3 ? '(Max)' : `(${hintLevel}/3)`}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col gap-3 p-6 overflow-y-auto scrollbar-hide">
              {currentHint && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex-shrink-0">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold mb-1">Hint Level {hintLevel - 1}</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">{currentHint}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={() => setCurrentHint(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {isListening && transcript && (
                <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3 text-sm flex-shrink-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-xs text-gray-400">Recording...</span>
                  </div>
                  <p className="text-gray-300">{transcript}</p>
                </div>
              )}

              {showCodeEditor ? (
                <div className="flex flex-col gap-3 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Language:</Label>
                      <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger className="w-32 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="python">Python</SelectItem>
                          <SelectItem value="javascript">JavaScript</SelectItem>
                          <SelectItem value="typescript">TypeScript</SelectItem>
                          <SelectItem value="java">Java</SelectItem>
                          <SelectItem value="cpp">C++</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs font-mono">solution.{language === 'python' ? 'py' : language === 'cpp' ? 'cpp' : 'js'}</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={handleRunCode}
                        disabled={isRunningCode}
                      >
                        {isRunningCode ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4" />
                            Run Code
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 border rounded-md overflow-hidden min-h-[300px]">
                    <MonacoEditor
                      value={codeAnswer}
                      onChange={setCodeAnswer}
                      language={language}
                      height="100%"
                    />
                  </div>
                  {codeOutput && (
                    <div className="border rounded-md p-3 bg-muted/50">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold">Output:</h4>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => setCodeOutput("")}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-[150px] overflow-y-auto scrollbar-hide">
                        {codeOutput}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col gap-2">
                  {interviewType === 'behavioral' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const starTemplate = "Situation: [Describe the context]\n\nTask: [Explain what needed to be done]\n\nAction: [Detail the steps you took]\n\nResult: [Share the outcome and impact]";
                        setUserAnswer(starTemplate);
                        setWordCount(starTemplate.split(/\s+/).filter(w => w.length > 0).length);
                      }}
                      className="self-start"
                    >
                      <Lightbulb className="h-4 w-4 mr-2" />
                      STAR Template
                    </Button>
                  )}
                  <Textarea
                    placeholder="Type your answer here..."
                    value={userAnswer}
                    onChange={(e) => {
                      const val = e.target.value;
                      setUserAnswer(val);
                      const words = val.trim().split(/\s+/).filter(w => w.length > 0).length;
                      setWordCount(val.trim() === '' ? 0 : words);
                    }}
                    onKeyDown={(e) => {
                      if (e.ctrlKey && e.key === 'Enter') {
                        e.preventDefault();
                        if (userAnswer.trim()) {
                          handleSubmitAnswer();
                        }
                      }
                    }}
                    className="min-h-[300px] resize-none font-sans flex-1"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
                    <span className="text-xs">Press Ctrl+Enter to submit</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1 gap-2"
                  onClick={handleSkipQuestion}
                  disabled={isSubmitting}
                >
                  <ArrowRight className="h-4 w-4" />
                  Skip
                </Button>
                <Button
                  onClick={handleSubmitAnswer}
                  disabled={isSubmitting || (!userAnswer.trim() && !codeAnswer.trim())}
                  size="lg"
                  className="flex-[2] gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Submit Answer
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Expanded Answer Dialog */}
        <Dialog open={isAnswerExpanded} onOpenChange={setIsAnswerExpanded}>
          <DialogContent className="max-w-6xl max-h-[95vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <div className="flex items-center justify-between pr-8">
                <DialogTitle className="text-lg font-semibold">Question & Answer - Expanded View</DialogTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{questionNumber} of {totalQuestions}</Badge>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className={`h-4 w-4 ${
                      elapsedTime < 180 ? 'text-green-400' : 
                      elapsedTime < 300 ? 'text-yellow-400' : 
                      'text-red-400'
                    }`} />
                    <span className={`font-mono ${
                      elapsedTime < 180 ? 'text-green-400' : 
                      elapsedTime < 300 ? 'text-yellow-400' : 
                      'text-red-400'
                    }`}>{formatTime(elapsedTime)}</span>
                  </div>
                </div>
              </div>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide">
              <div className="grid grid-cols-2 gap-6 h-full">
                {/* Question Panel */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold mb-3 text-primary flex items-center gap-2">
                      Question
                      {currentQuestion?.difficulty && (
                        <Badge variant="secondary">{currentQuestion.difficulty}</Badge>
                      )}
                      {currentQuestion?.topic && (
                        <Badge variant="outline">{currentQuestion.topic}</Badge>
                      )}
                    </h3>
                    <p className="text-base text-foreground leading-relaxed">{currentQuestion?.question_text}</p>
                  </div>
                  
                  {currentHint && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <Lightbulb className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold mb-1">Hint Level {hintLevel - 1}</h4>
                          <p className="text-sm text-muted-foreground leading-relaxed">{currentHint}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 flex-shrink-0"
                          onClick={() => setCurrentHint(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {showCodeEditor && (
                    <div className="space-y-2 text-sm">
                      <h4 className="font-semibold text-muted-foreground">Example:</h4>
                      <div className="bg-muted/50 rounded-md p-3 font-mono text-xs">
                        <div className="text-green-600">Input: nums = [1,2,3,1]</div>
                        <div className="text-blue-600">Output: true</div>
                        <div className="text-muted-foreground mt-1">Explanation: The value 1 appears at indices 0 and 3.</div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Answer Panel */}
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-primary">Your Answer</h3>
                    <div className="flex items-center gap-2">
                      {!showCodeEditor && isSpeechSupported && (
                        <Button
                          variant={isListening ? "destructive" : "outline"}
                          size="sm"
                          onClick={toggleRecording}
                        >
                          {isListening ? (
                            <>
                              <MicOff className="h-4 w-4 mr-2" />
                              Stop
                            </>
                          ) : (
                            <>
                              <Mic className="h-4 w-4 mr-2" />
                              Voice
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRequestHint}
                        disabled={isLoadingHint || hintLevel > 3}
                        className="gap-2"
                      >
                        {isLoadingHint ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <Lightbulb className="h-4 w-4" />
                            Hint {hintLevel > 3 ? '(Max)' : `(${hintLevel}/3)`}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {isListening && transcript && (
                    <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-xs text-gray-400">Recording...</span>
                      </div>
                      <p className="text-gray-300">{transcript}</p>
                    </div>
                  )}
                  
                  {showCodeEditor ? (
                    <div className="flex flex-col gap-3 flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Language:</Label>
                          <Select value={language} onValueChange={setLanguage}>
                            <SelectTrigger className="w-32 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="python">Python</SelectItem>
                              <SelectItem value="javascript">JavaScript</SelectItem>
                              <SelectItem value="typescript">TypeScript</SelectItem>
                              <SelectItem value="java">Java</SelectItem>
                              <SelectItem value="cpp">C++</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-mono">
                            solution.{language === 'python' ? 'py' : language === 'cpp' ? 'cpp' : 'js'}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={handleRunCode}
                            disabled={isRunningCode}
                          >
                            {isRunningCode ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Running...
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4" />
                                Run Code
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 border rounded-md overflow-hidden min-h-[400px]">
                        <MonacoEditor
                          value={codeAnswer}
                          onChange={setCodeAnswer}
                          language={language}
                          height="100%"
                        />
                      </div>
                      {codeOutput && (
                        <div className="border rounded-md p-3 bg-muted/50">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold">Output:</h4>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => setCodeOutput("")}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-[200px] overflow-y-auto scrollbar-hide">
                            {codeOutput}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col gap-2">
                      {interviewType === 'behavioral' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const starTemplate = "Situation: [Describe the context]\n\nTask: [Explain what needed to be done]\n\nAction: [Detail the steps you took]\n\nResult: [Share the outcome and impact]";
                            setUserAnswer(starTemplate);
                            setWordCount(starTemplate.split(/\s+/).filter(w => w.length > 0).length);
                          }}
                          className="self-start"
                        >
                          <Lightbulb className="h-4 w-4 mr-2" />
                          STAR Template
                        </Button>
                      )}
                      <Textarea
                        placeholder="Type your answer here..."
                        value={userAnswer}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUserAnswer(val);
                          const words = val.trim().split(/\s+/).filter(w => w.length > 0).length;
                          setWordCount(val.trim() === '' ? 0 : words);
                        }}
                        onKeyDown={(e) => {
                          if (e.ctrlKey && e.key === 'Enter') {
                            e.preventDefault();
                            if (userAnswer.trim()) {
                              handleSubmitAnswer();
                            }
                          }
                        }}
                        className="min-h-[400px] resize-none font-sans flex-1"
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
                        <span className="text-xs">Press Ctrl+Enter to submit</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="px-6 py-4 border-t flex gap-2">
              <Button
                variant="outline"
                size="lg"
                className="flex-1 gap-2"
                onClick={handleSkipQuestion}
                disabled={isSubmitting}
              >
                <ArrowRight className="h-4 w-4" />
                Skip
              </Button>
              <Button
                onClick={() => {
                  handleSubmitAnswer();
                  setIsAnswerExpanded(false);
                }}
                disabled={isSubmitting || (!userAnswer.trim() && !codeAnswer.trim())}
                size="lg"
                className="flex-[2] gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit Answer
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const handleCloseFeedback = () => {
    setPhase("interview");
  };

  const handleViewPreviousQuestion = (index: number) => {
    if (questionHistory.length > index) {
      const previous = questionHistory[index];
      setCurrentFeedback(previous.feedback);
      setFollowUpQuestions(previous.followUps);
      setCurrentQuestion(previous.question);
    }
  };

  // Feedback Phase
  if (phase === "feedback" && currentFeedback) {
    return (
      <div className="h-full overflow-auto p-6">
        <Card className="w-full max-w-4xl mx-auto mb-6">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {questionHistory.length > 0 && (
                  <Select onValueChange={(value) => handleViewPreviousQuestion(parseInt(value))}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="View Previous" />
                    </SelectTrigger>
                    <SelectContent>
                      {questionHistory.map((item, idx) => (
                        <SelectItem key={idx} value={idx.toString()}>
                          Question {idx + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div>
                  <CardTitle className="text-2xl">Answer Evaluation</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Question {questionNumber} of {totalQuestions}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary">{currentFeedback.overall_score.toFixed(1)}</div>
                  <Badge variant="secondary" className="mt-1">{currentFeedback.rating_category}</Badge>
                </div>
                <Award className="h-8 w-8 text-yellow-500" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCloseFeedback}
                  className="ml-2"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-6">
              {/* Performance Summary */}
              <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg p-5 border border-primary/20">
                <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Performance Summary
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{currentFeedback.performance_summary}</p>
              </div>

              {/* Criteria Scores */}
              <div>
                <h3 className="text-base font-semibold mb-4">Evaluation Criteria</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="bg-muted/50 rounded-lg p-4 text-center border">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Correctness</div>
                    <div className="text-2xl font-bold">{currentFeedback.criteria_scores.correctness}</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-center border">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Completeness</div>
                    <div className="text-2xl font-bold">{currentFeedback.criteria_scores.completeness}</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-center border">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Clarity</div>
                    <div className="text-2xl font-bold">{currentFeedback.criteria_scores.clarity}</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-center border">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Confidence</div>
                    <div className="text-2xl font-bold">{currentFeedback.criteria_scores.confidence}</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-center border">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Technical Depth</div>
                    <div className="text-2xl font-bold">{currentFeedback.criteria_scores.technical_depth}</div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Strengths and Weaknesses Grid */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Strengths
                  </h3>
                  <ul className="space-y-2">
                    {currentFeedback.strengths.map((strength, idx) => (
                      <li key={idx} className="flex gap-2 items-start text-sm bg-green-500/5 p-3 rounded border border-green-500/20">
                        <span className="text-green-500 font-bold mt-0.5">✓</span>
                        <span className="text-muted-foreground flex-1">{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-500" />
                    Weaknesses
                  </h3>
                  <ul className="space-y-2">
                    {currentFeedback.weaknesses.map((weakness, idx) => (
                      <li key={idx} className="flex gap-2 items-start text-sm bg-red-500/5 p-3 rounded border border-red-500/20">
                        <span className="text-red-500 font-bold mt-0.5">×</span>
                        <span className="text-muted-foreground flex-1">{weakness}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <Separator />

              <Separator />

              {/* Model Answer */}
              {currentFeedback.model_answer && (
                <>
                  <div className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 rounded-lg p-5 border border-blue-500/20">
                    <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-blue-500" />
                      Model Answer
                    </h3>
                    <div className="bg-background/50 rounded-lg p-4 border">
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {currentFeedback.model_answer}
                      </p>
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Improvement Suggestions */}
              <div>
                <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-orange-500" />
                  Improvement Suggestions
                </h3>
                <ul className="space-y-2">
                  {currentFeedback.improvement_suggestions.map((suggestion, idx) => (
                    <li key={idx} className="flex gap-3 items-start text-sm bg-orange-500/5 p-3 rounded border border-orange-500/20">
                      <span className="text-orange-500 font-bold mt-0.5">→</span>
                      <span className="text-muted-foreground flex-1">{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {currentFeedback.missing_points && currentFeedback.missing_points.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                      Missing Points
                    </h3>
                    <ul className="space-y-2">
                      {currentFeedback.missing_points.map((point, idx) => (
                        <li key={idx} className="flex gap-3 items-start text-sm bg-yellow-500/5 p-3 rounded border border-yellow-500/20">
                          <span className="text-yellow-500 font-bold mt-0.5">!</span>
                          <span className="text-muted-foreground flex-1">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              <Separator />

              {/* Detailed Feedback */}
              <div>
                <h3 className="text-base font-semibold mb-3">Detailed Feedback</h3>
                <div className="bg-muted/30 rounded-lg p-4 border">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {currentFeedback.detailed_feedback}
                  </p>
                </div>
              </div>

              {followUpQuestions && followUpQuestions.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-blue-500" />
                      Follow-up Questions
                    </h3>
                    <ul className="space-y-3">
                      {followUpQuestions.map((question, idx) => (
                        <li key={idx} className="flex gap-3 items-start bg-blue-500/5 p-4 rounded-lg border border-blue-500/20">
                          <span className="text-blue-500 font-bold text-base">{idx + 1}.</span>
                          <span className="text-sm text-muted-foreground flex-1">{question}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>

            {/* Action Button */}
            <div className="pt-4 border-t mt-6">
              <Button onClick={handleContinueToNextQuestion} size="lg" className="w-full">
                {summary ? (
                  <>
                    View Summary
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                ) : (
                  <>
                    Next Question
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Summary Phase
  if (phase === "summary" && summary) {
    // Calculate performance insights
    const scores = summary.evaluations.map(e => e.score);
    const bestScore = Math.max(...scores);
    const worstScore = Math.min(...scores);
    const scoreVariance = scores.length > 1 
      ? Math.sqrt(scores.reduce((sum, score) => sum + Math.pow(score - summary.average_score, 2), 0) / scores.length)
      : 0;
    const consistencyScore = Math.max(0, 10 - scoreVariance);

    // If a question is selected, show side-by-side comparison
    if (selectedQuestionIndex !== null && questionHistory[selectedQuestionIndex]) {
      const selected = questionHistory[selectedQuestionIndex];
      const evaluation = summary.evaluations[selectedQuestionIndex];
      
      return (
        <div className="h-full overflow-auto p-4">
          <div className="max-w-7xl mx-auto space-y-4">
            {/* Back button */}
            <Button 
              variant="outline" 
              onClick={() => setSelectedQuestionIndex(null)}
              className="mb-2"
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back to Summary
            </Button>
            
            {/* Question Header */}
            <Card>
              <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-transparent">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">Question {selectedQuestionIndex + 1}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selected.question.question_text}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-primary">{evaluation.score.toFixed(1)}</div>
                    <Badge variant="secondary" className="mt-1">{evaluation.rating}</Badge>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Side-by-Side Comparison */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Your Answer */}
              <Card className="border-blue-500/30">
                <CardHeader className="bg-gradient-to-r from-blue-500/10 to-transparent border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    Your Answer
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="prose prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap text-sm bg-muted/30 rounded-lg p-4 leading-relaxed">
                        {selected.answer === "[Skipped]" ? (
                          <span className="text-muted-foreground italic">Question was skipped</span>
                        ) : (
                          selected.answer
                        )}
                      </pre>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Model Answer */}
              <Card className="border-green-500/30">
                <CardHeader className="bg-gradient-to-r from-green-500/10 to-transparent border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Model Answer
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="prose prose-sm max-w-none">
                      {selected.feedback.model_answer ? (
                        <pre className="whitespace-pre-wrap text-sm bg-muted/30 rounded-lg p-4 leading-relaxed">
                          {selected.feedback.model_answer}
                        </pre>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No model answer available</p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Feedback */}
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-base">Detailed Feedback</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {/* Criteria Scores */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">Evaluation Criteria</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="bg-muted/50 rounded-lg p-3 text-center border">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Correctness</div>
                      <div className="text-xl font-bold">{selected.feedback.criteria_scores.correctness}</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center border">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Completeness</div>
                      <div className="text-xl font-bold">{selected.feedback.criteria_scores.completeness}</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center border">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Clarity</div>
                      <div className="text-xl font-bold">{selected.feedback.criteria_scores.clarity}</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center border">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Confidence</div>
                      <div className="text-xl font-bold">{selected.feedback.criteria_scores.confidence}</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center border">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Technical Depth</div>
                      <div className="text-xl font-bold">{selected.feedback.criteria_scores.technical_depth}</div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Strengths and Weaknesses */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Strengths
                    </h4>
                    <ul className="space-y-2">
                      {selected.feedback.strengths.map((strength, idx) => (
                        <li key={idx} className="flex gap-2 items-start text-sm bg-green-500/5 p-2 rounded border border-green-500/20">
                          <span className="text-green-500 font-bold mt-0.5">✓</span>
                          <span className="text-muted-foreground flex-1">{strength}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      Weaknesses
                    </h4>
                    <ul className="space-y-2">
                      {selected.feedback.weaknesses.map((weakness, idx) => (
                        <li key={idx} className="flex gap-2 items-start text-sm bg-red-500/5 p-2 rounded border border-red-500/20">
                          <span className="text-red-500 font-bold mt-0.5">×</span>
                          <span className="text-muted-foreground flex-1">{weakness}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <Separator />

                {/* Improvement Suggestions */}
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-orange-500" />
                    Improvement Suggestions
                  </h4>
                  <ul className="space-y-2">
                    {selected.feedback.improvement_suggestions.map((suggestion, idx) => (
                      <li key={idx} className="flex gap-2 items-start text-sm bg-orange-500/5 p-2 rounded border border-orange-500/20">
                        <span className="text-orange-500 font-bold mt-0.5">→</span>
                        <span className="text-muted-foreground flex-1">{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4 pb-6">
          <Card>
            <CardHeader className="border-b py-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">🎉 Interview Complete!</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Here's your performance summary
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary">{summary.average_score.toFixed(1)}</div>
                  <Badge variant="secondary" className="mt-1 text-xs">
                    {summary.average_score >= 8 ? "Excellent" : 
                     summary.average_score >= 6 ? "Good" : 
                     summary.average_score >= 4 ? "Fair" : "Needs Work"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg p-3 border border-primary/20">
                  <div className="text-xl font-bold">{summary.questions_answered}</div>
                  <p className="text-[10px] text-muted-foreground">Questions Answered</p>
                </div>
                <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-lg p-3 border border-blue-500/20">
                  <div className="text-xl font-bold capitalize">{summary.difficulty}</div>
                  <p className="text-[10px] text-muted-foreground">Difficulty Level</p>
                </div>
                <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-lg p-3 border border-green-500/20">
                  <div className="text-xl font-bold">{consistencyScore.toFixed(1)}/10</div>
                  <p className="text-[10px] text-muted-foreground">Consistency</p>
                </div>
                <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 rounded-lg p-3 border border-yellow-500/20">
                  <div className="text-xl font-bold capitalize">{summary.interview_type}</div>
                  <p className="text-[10px] text-muted-foreground">Interview Type</p>
                </div>
              </div>

              <Separator />

              {/* Performance Insights */}
              <div className="grid md:grid-cols-2 gap-3">
                <div className="bg-green-500/5 rounded-lg p-3 border border-green-500/20">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    Strongest Performance
                  </h3>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Best Score</span>
                      <span className="text-base font-bold text-green-500">{bestScore.toFixed(1)}</span>
                    </div>
                    {progressData && (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Total Time</span>
                          <span className="text-xs font-mono">{formatTime(progressData.total_time_seconds)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Hints Used</span>
                          <span className="text-xs">{progressData.hints_used_total}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="bg-orange-500/5 rounded-lg p-3 border border-orange-500/20">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Target className="h-4 w-4 text-orange-500" />
                    Areas to Improve
                  </h3>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Lowest Score</span>
                      <span className="text-base font-bold text-orange-500">{worstScore.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Score Range</span>
                      <span className="text-xs">{(bestScore - worstScore).toFixed(1)} points</span>
                    </div>
                    {progressData && progressData.hints_used_total > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Efficiency Rating</span>
                        <span className="text-xs">
                          {progressData.hints_used_total < 3 ? "Excellent" : 
                           progressData.hints_used_total < 6 ? "Good" : "Needs Work"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-3">Question Performance - Click to Compare Answers</h3>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
                  {summary.evaluations.map((evaluation, idx) => (
                    <div 
                      key={idx} 
                      className="border rounded-lg p-3 space-y-2 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
                      onClick={() => setSelectedQuestionIndex(idx)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-semibold text-muted-foreground">Question {idx + 1}</span>
                            <Badge variant={
                              evaluation.rating === "Excellent" ? "default" :
                              evaluation.rating === "Good" || evaluation.rating === "Strong" ? "secondary" :
                              evaluation.rating === "Fair" ? "outline" : "destructive"
                            } className="text-[10px] px-1.5 py-0">
                              {evaluation.rating}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              Click to compare
                            </Badge>
                          </div>
                          <p className="text-xs mb-1.5 line-clamp-2">{evaluation.question}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xl font-bold">{evaluation.score.toFixed(1)}</div>
                          <p className="text-[10px] text-muted-foreground">Score</p>
                        </div>
                      </div>
                      {evaluation.summary && (
                        <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2 line-clamp-2">
                          {evaluation.summary}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={handleRestart} size="lg" className="w-full mt-4">
                <RotateCcw className="mr-2 h-4 w-4" />
                Start New Interview
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // History View Phase - Show past interview session with question comparison
  if (phase === "history" && selectedHistorySession) {
    const currentEval = selectedQuestionIndex !== null && selectedHistorySession.evaluations?.[selectedQuestionIndex] 
      ? selectedHistorySession.evaluations[selectedQuestionIndex] 
      : null;
    
    const handleBackToSetup = () => {
      setPhase("setup");
      setSelectedQuestionIndex(null);
    };

    // Safety check: if no evaluations, show error message
    if (!selectedHistorySession.evaluations || selectedHistorySession.evaluations.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-4 gap-4">
          <Card className="max-w-md">
            <CardContent className="py-6 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Questions Found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                This interview session doesn't have any recorded questions and answers.
              </p>
              <Button onClick={handleBackToSetup} variant="outline">
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back to Setup
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col">
        {/* Fixed Header */}
        <div className="flex-shrink-0 p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToSetup}
                className="gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to Setup
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {selectedHistorySession.interview_type?.replace('_', ' ') || 'Interview'}
                </Badge>
                <Badge variant="secondary" className="capitalize">{selectedHistorySession.difficulty || 'Unknown'}</Badge>
                {selectedHistorySession.average_score != null && (
                  <Badge className="bg-primary/10 text-primary border-primary/20">
                    ⭐ {selectedHistorySession.average_score.toFixed(1)}/10
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm text-muted-foreground">
                {selectedHistorySession.started_at 
                ? new Date(selectedHistorySession.started_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : 'Unknown date'
              }
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setHistoryExpanded(true)}
                title="Expand answers"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Question Navigation Pills */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Questions:</span>
            <div className="flex flex-wrap gap-2">
              {selectedHistorySession.evaluations?.map((evaluation, idx) => (
                <Button
                  key={idx}
                  variant={selectedQuestionIndex === idx ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedQuestionIndex(idx)}
                  className="min-w-[50px] h-8"
                >
                  {idx + 1}
                  {evaluation.score != null && (
                    <span className="ml-1 text-xs opacity-70">
                      ({evaluation.score.toFixed(1)})
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        {currentEval && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-7xl mx-auto">
              {/* Question Card */}
              <Card className="mb-4">
                <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-2">
                        Question {(selectedQuestionIndex ?? 0) + 1} of {selectedHistorySession.evaluations?.length || 0}
                      </CardTitle>
                      <p className="text-sm leading-relaxed">{currentEval.question}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-primary">{currentEval.score.toFixed(1)}</span>
                        <span className="text-sm text-muted-foreground">/ 10</span>
                      </div>
                      <Badge variant={
                        currentEval.rating === "Excellent" || currentEval.rating === "excellent" ? "default" :
                        currentEval.rating === "Good" || currentEval.rating === "good" || 
                        currentEval.rating === "Strong" || currentEval.rating === "strong" ? "secondary" :
                        "outline"
                      } className="capitalize">
                        {currentEval.rating}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Side-by-Side Answer Comparison */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                {/* Your Answer */}
                <Card className="border-l-4 border-l-orange-500">
                  <CardHeader className="bg-gradient-to-r from-orange-500/10 to-transparent pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-orange-500"></div>
                      Your Answer
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="prose prose-sm max-w-none">
                        {currentEval.user_answer ? (
                          <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-lg p-4 leading-relaxed font-sans">
{currentEval.user_answer}
                          </pre>
                        ) : (
                          <div className="flex items-center justify-center h-32 text-muted-foreground italic text-sm">
                            No answer provided
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Model Answer */}
                <Card className="border-l-4 border-l-green-500">
                  <CardHeader className="bg-gradient-to-r from-green-500/10 to-transparent pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Model Answer
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="prose prose-sm max-w-none">
                        {currentEval.model_answer ? (
                          <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-lg p-4 leading-relaxed font-sans">
{currentEval.model_answer}
                          </pre>
                        ) : (
                          <div className="flex items-center justify-center h-32 text-muted-foreground italic text-sm">
                            Model answer not available
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {/* Expanded history dialog (both answers) */}
              {currentEval && (
                <Dialog open={historyExpanded} onOpenChange={setHistoryExpanded}>
                  <DialogContent className="max-w-7xl max-h-[95vh] flex flex-col p-0">
                    <DialogHeader className="px-6 pt-6 pb-4 border-b">
                        <div className="flex items-center justify-between pr-8">
                          <DialogTitle className="text-lg font-semibold">Expanded Answers</DialogTitle>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
                        <div className="flex flex-col">
                          <h3 className="text-base font-semibold mb-3">Your Answer</h3>
                          <ScrollArea className="h-[70vh] pr-4">
                            <div className="prose prose-lg max-w-none">
                              {currentEval.user_answer ? (
                                <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-lg p-6 leading-relaxed font-sans">
{currentEval.user_answer}
                                </pre>
                              ) : (
                                <div className="flex items-center justify-center h-32 text-muted-foreground italic text-sm">
                                  No answer provided
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </div>

                        <div className="flex flex-col">
                          <h3 className="text-base font-semibold mb-3">Model Answer</h3>
                          <ScrollArea className="h-[70vh] pr-4">
                            <div className="prose prose-lg max-w-none">
                              {currentEval.model_answer ? (
                                <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-lg p-6 leading-relaxed font-sans">
{currentEval.model_answer}
                                </pre>
                              ) : (
                                <div className="flex items-center justify-center h-32 text-muted-foreground italic text-sm">
                                  Model answer not available
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              {/* Feedback Card */}
              {currentEval.feedback && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      Detailed Feedback
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {currentEval.feedback}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};
