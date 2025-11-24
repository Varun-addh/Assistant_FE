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
} from "lucide-react";
import { MonacoEditor } from "@/components/MonacoEditor";

type SessionPhase = "setup" | "interview" | "feedback" | "summary";

export const MockInterviewMode = () => {
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

  // Hint system state
  const [currentHint, setCurrentHint] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState<1 | 2 | 3>(1);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [isLoadingHint, setIsLoadingHint] = useState(false);
  const [wordCount, setWordCount] = useState(0);

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
            {/* Quick Start Presets */}
            <Card className="bg-gradient-to-br from-primary/5 to-blue-500/5 border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Play className="h-4 w-4 text-primary" />
                  Quick Start
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {quickPresets.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        console.log('Applying preset and starting:', preset);
                        applyPreset(preset);
                        // Start interview immediately after applying preset
                        setTimeout(() => handleStartInterview(), 100);
                      }}
                      className="h-auto py-2 px-3 flex items-center gap-2 rounded-md border border-border hover:bg-primary/10 hover:border-primary transition-all text-left group"
                    >
                      <Play className="h-3 w-3 text-muted-foreground group-hover:text-primary shrink-0" />
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-xs">{preset.name}</span>
                        <span className="text-[10px] text-muted-foreground capitalize">{preset.type.replace('_', ' ')} • {preset.difficulty}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or customize</span>
              </div>
            </div>

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

            {/* Configuration Grid */}
            <div className="grid md:grid-cols-3 gap-4">
              {/* Difficulty */}
              <div>
                <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-orange-400" />
                  Difficulty
                </h2>
                <div className="space-y-2">
                  {difficulties.map((diff) => (
                    <button
                      key={diff.id}
                      onClick={() => setDifficulty(diff.id as Difficulty)}
                      className={`w-full text-left rounded-lg p-2.5 border-2 transition-all ${
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
                <div className="space-y-2">
                  {[3, 5, 10].map((num) => (
                    <button
                      key={num}
                      onClick={() => setNumQuestions(num)}
                      className={`w-full text-left rounded-lg p-2.5 border-2 transition-all ${
                        numQuestions === num
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="text-sm font-semibold">{num}</div>
                      <div className="text-xs text-muted-foreground">~{num * 7} minutes</div>
                    </button>
                  ))}
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
            </CardContent>
          </Card>

          {/* Answer Panel */}
          <Card className="flex flex-col min-h-0 border-primary/20">
            <CardHeader className="flex-shrink-0 bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Your Answer</CardTitle>
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
                    <Badge variant="outline" className="text-xs font-mono">solution.{language === 'python' ? 'py' : language === 'cpp' ? 'cpp' : 'js'}</Badge>
                  </div>
                  <div className="flex-1 border rounded-md overflow-hidden min-h-[300px]">
                    <MonacoEditor
                      value={codeAnswer}
                      onChange={setCodeAnswer}
                      language={language}
                      height="100%"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => {
                      toast({
                        title: "Running Code...",
                        description: "Code execution feature coming soon!",
                      });
                    }}
                  >
                    <Play className="h-4 w-4" />
                    Run Code
                  </Button>
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

    return (
      <div className="h-full overflow-auto p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl">🎉 Interview Complete!</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Here's your comprehensive performance summary
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold text-primary">{summary.average_score.toFixed(1)}</div>
                  <Badge variant="secondary" className="mt-1">
                    {summary.average_score >= 8 ? "Excellent" : 
                     summary.average_score >= 6 ? "Good" : 
                     summary.average_score >= 4 ? "Fair" : "Needs Work"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg p-4 border border-primary/20">
                  <div className="text-2xl font-bold">{summary.questions_answered}</div>
                  <p className="text-xs text-muted-foreground">Questions Answered</p>
                </div>
                <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-lg p-4 border border-blue-500/20">
                  <div className="text-2xl font-bold capitalize">{summary.difficulty}</div>
                  <p className="text-xs text-muted-foreground">Difficulty Level</p>
                </div>
                <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-lg p-4 border border-green-500/20">
                  <div className="text-2xl font-bold">{consistencyScore.toFixed(1)}/10</div>
                  <p className="text-xs text-muted-foreground">Consistency</p>
                </div>
                <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 rounded-lg p-4 border border-yellow-500/20">
                  <div className="text-2xl font-bold capitalize">{summary.interview_type}</div>
                  <p className="text-xs text-muted-foreground">Interview Type</p>
                </div>
              </div>

              <Separator />

              {/* Performance Insights */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-green-500/5 rounded-lg p-5 border border-green-500/20">
                  <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    Strongest Performance
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Best Score</span>
                      <span className="text-lg font-bold text-green-500">{bestScore.toFixed(1)}</span>
                    </div>
                    {progressData && (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Total Time</span>
                          <span className="text-sm font-mono">{formatTime(progressData.total_time_seconds)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Hints Used</span>
                          <span className="text-sm">{progressData.hints_used_total}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="bg-orange-500/5 rounded-lg p-5 border border-orange-500/20">
                  <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <Target className="h-5 w-5 text-orange-500" />
                    Areas to Improve
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Lowest Score</span>
                      <span className="text-lg font-bold text-orange-500">{worstScore.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Score Range</span>
                      <span className="text-sm">{(bestScore - worstScore).toFixed(1)} points</span>
                    </div>
                    {progressData && progressData.hints_used_total > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Efficiency Rating</span>
                        <span className="text-sm">
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
                <h3 className="text-base font-semibold mb-4">Question Performance</h3>
                <div className="space-y-4">
                  {summary.evaluations.map((evaluation, idx) => (
                    <div key={idx} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-semibold text-muted-foreground">Question {idx + 1}</span>
                            <Badge variant={
                              evaluation.rating === "Excellent" ? "default" :
                              evaluation.rating === "Good" || evaluation.rating === "Strong" ? "secondary" :
                              evaluation.rating === "Fair" ? "outline" : "destructive"
                            }>
                              {evaluation.rating}
                            </Badge>
                          </div>
                          <p className="text-sm mb-2">{evaluation.question}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold">{evaluation.score.toFixed(1)}</div>
                          <p className="text-xs text-muted-foreground">Score</p>
                        </div>
                      </div>
                      {evaluation.summary && (
                        <p className="text-sm text-muted-foreground bg-muted/30 rounded p-3">
                          {evaluation.summary}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={handleRestart} size="lg" className="w-full mt-6">
                <RotateCcw className="mr-2 h-4 w-4" />
                Start New Interview
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return null;
};
