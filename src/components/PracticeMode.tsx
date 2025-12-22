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
import { useToast } from '@/hooks/use-toast';
import { InterviewCodeEditor } from './InterviewCodeEditor';
import {
  AudioRecorder,
  startInterview,
  submitAnswer,
  submitCode,
  acknowledgeFeedback,
  playQuestionAudio,
  checkPracticeModeStatus,
  quickStartInterview,
  getSessionEvaluation,
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
  type QuickStartResponse,
  type Question,
  type QuestionType,
  type CodeTestResult,
  type CodeEvaluationFeedback,
  QuestionType as QuestionTypeEnum,
  API_BASE_URL,
} from '@/lib/practiceModeApi';
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
  RotateCcw,
  AlertCircle,
  Trophy,
  Star,
  Flame,
} from 'lucide-react';
import RoundSelection from './RoundSelection';
import type { RoundConfig } from '@/lib/practiceModeApi';

type PracticePhase = 'welcome' | 'setup' | 'round-selection' | 'question' | 'recording' | 'processing' | 'feedback' | 'complete';

export const PracticeMode = () => {
  const { toast } = useToast();
  const audioRecorder = useRef(new AudioRecorder());
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // State
  const [phase, setPhase] = useState<PracticePhase>('welcome');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<StartInterviewResponse['first_question'] | null>(null);
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [currentRoundConfig, setCurrentRoundConfig] = useState<RoundConfig | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  // Quick Start state
  const [useQuickStart, setUseQuickStart] = useState(false);
  const [quickStartInput, setQuickStartInput] = useState('');
  const [quickStartLoading, setQuickStartLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState('');

  // Setup state
  const [selectedRole, setSelectedRole] = useState<string>('Software Engineer');
  const [selectedDifficulty, setSelectedDifficulty] = useState<InterviewDifficulty>('easy');
  const [enableTTS, setEnableTTS] = useState(true);
  const [enableAdaptive, setEnableAdaptive] = useState(false);
  const [questionCount, setQuestionCount] = useState<number>(5);  // NEW - Number of questions

  // Adaptive Profile state
  const [profileDomain, setProfileDomain] = useState('');
  const [profileExperience, setProfileExperience] = useState<number>(0);
  const [profileSkills, setProfileSkills] = useState<string>('');
  const [profileJobRole, setProfileJobRole] = useState('');
  const [profileCompany, setProfileCompany] = useState('');
  const [profileFocus, setProfileFocus] = useState<string>('');

  // Feedback state
  const [transcription, setTranscription] = useState<string>('');
  const [speechMetrics, setSpeechMetrics] = useState<SpeechMetrics | null>(null);
  const [microFeedback, setMicroFeedback] = useState<MicroFeedback | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);

  // Code submission state (for coding questions)
  const [codeTestResults, setCodeTestResults] = useState<CodeTestResult[] | null>(null);
  const [codeEvaluation, setCodeEvaluation] = useState<CodeEvaluationFeedback | null>(null);
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);

  // Recording timer
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
              title: '⏰ Time\'s Up!',
              description: 'Time limit reached for this coding question.',
              variant: 'destructive',
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

  const handleStartInterview = async () => {
    setIsProcessing(true);
    try {
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
        questionCount  // NEW - number of questions
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
      setPhase('question');

      // DO NOT start countdown timer here - it starts when user clicks "Start Recording"

      // Play TTS audio if available
      if (response.tts_audio_url && enableTTS) {
        try {
          setIsAudioLoading(true);
          const audioUrl = `${API_BASE_URL}${response.tts_audio_url}`;
          console.log('🔊 [Practice Mode] Playing question audio:', audioUrl);

          const audio = new Audio(audioUrl);
          audioPlayerRef.current = audio;

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
              title: '⚠️ Audio Error',
              description: 'Could not play question audio. You can still read and answer.',
              variant: 'destructive',
            });
          };

          await audio.play();
        } catch (err) {
          console.error('❌ Error playing audio:', err);
          setIsAudioLoading(false);
          setIsPlayingAudio(false);
          toast({
            title: '⚠️ Audio Error',
            description: 'Could not play question audio. You can still read and answer.',
            variant: 'destructive',
          });
        }
      }

      toast({
        title: '🎯 Interview Started!',
        description: `Question 1 of 5`,
      });
    } catch (error: any) {
      console.error('❌ [Practice Mode] Start Interview Error:', error);
      toast({
        title: '❌ Failed to Start',
        description: error.message || 'Could not start the interview',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickStart = async () => {
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
      // Quick Start: AI decides EVERYTHING - no manual overrides
      const response = await quickStartInterview(
        quickStartInput,
        true,
        enableTTS
        // NO questionCount or targetCompany - AI extracts from voice input
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
      setPhase('question');

      // Play TTS audio if available
      if (response.tts_audio_url && enableTTS) {
        try {
          setIsAudioLoading(true);
          const audioUrl = `${API_BASE_URL}${response.tts_audio_url}`;
          console.log('🔊 [Quick Start] Playing question audio:', audioUrl);

          const audio = new Audio(audioUrl);
          audioPlayerRef.current = audio;

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
        title: '🎯 Quick Start Success!',
        description: response.ai_message,
      });
    } catch (error: any) {
      console.error('❌ [Quick Start] Error:', error);
      toast({
        title: '❌ Quick Start Failed',
        description: error.message || 'Could not start quick interview',
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
              title: '⏰ Time\'s Up!',
              description: 'Auto-submitting your answer...',
              variant: 'default',
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
        title: '🎤 Recording Started',
        description: 'Speak your answer clearly',
      });
    } catch (error: any) {
      console.error('❌ [Practice Mode] Microphone Error:', error);
      toast({
        title: '❌ Microphone Error',
        description: error.message || 'Could not access microphone',
        variant: 'destructive',
      });
    }
  };

  const handleStopRecording = async () => {
    if (!isRecording || !sessionId) return;

    setIsProcessing(true);
    setPhase('processing');

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

      const response = await submitAnswer(sessionId, currentQuestionNumber, audioBlob);
      console.log('📊 [Practice Mode] Submit Answer Response:', response);

      // Set transcription and metrics
      setTranscription(response.transcript);  // Changed from 'transcription' to 'transcript'
      setSpeechMetrics(response.metrics);  // Changed from 'speech_metrics' to 'metrics'
      setMicroFeedback(response.micro_feedback);

      if (response.complete) {
        // Interview complete - show evaluation
        console.log('🎉 [Practice Mode] Interview Complete! Final Evaluation:', response.evaluation_report);

        if (!response.evaluation_report) {
          console.warn('⚠️ [Practice Mode] No evaluation_report in response, attempting diagnostic fetch...');

          // Try to fetch evaluation using diagnostic endpoint
          try {
            const diagnosticData = await getSessionEvaluation(sessionId!);
            console.log('📊 [Diagnostic] Evaluation data:', diagnosticData);

            if (diagnosticData.evaluation) {
              setEvaluation(diagnosticData.evaluation);
              console.log('✅ [Diagnostic] Evaluation loaded successfully');
            } else if (diagnosticData.error) {
              console.error('❌ [Diagnostic] Evaluation error:', diagnosticData.error);
              toast({
                title: '⚠️ Evaluation Error',
                description: diagnosticData.error,
                variant: 'destructive',
              });
            }
          } catch (diagError) {
            console.error('❌ [Diagnostic] Failed to fetch evaluation:', diagError);
          }
        } else {
          setEvaluation(response.evaluation_report);
        }

        setPhase('complete');

        toast({
          title: '🎉 Interview Complete!',
          description: `Completed all ${totalQuestions} questions successfully!`,
        });
      } else {
        // Show feedback - user must click "Next Question" to continue
        console.log('✅ [Practice Mode] Answer submitted, showing feedback');
        console.log('🔄 [Practice Mode] Requires acknowledgment:', response.requires_acknowledgment);
        setPhase('feedback');

        // No auto-advance - wait for user to click "Next Question" button
      }
    } catch (error: any) {
      console.error('❌ [Practice Mode] Submit Answer Error:', error);
      console.error('❌ [Practice Mode] Error Details:', {
        message: error.message,
        stack: error.stack,
        sessionId,
        questionId: currentQuestion?.id,
        phase,
      });

      setIsRecording(false);
      toast({
        title: '❌ Submission Failed',
        description: error.message || 'Could not submit your answer. Please try again.',
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

    setIsSubmittingCode(true);
    setPhase('processing');

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

      // Store test results and evaluation
      setCodeTestResults(response.test_results);
      setCodeEvaluation(response.evaluation);

      if (response.complete) {
        // Interview complete
        console.log('🎉 [Practice Mode] Interview Complete!');
        if (response.evaluation_report) {
          setEvaluation(response.evaluation_report);
        }
        setPhase('complete');

        toast({
          title: '🎉 Interview Complete!',
          description: `Completed all ${totalQuestions} questions successfully!`,
        });
      } else {
        // Show code feedback - user must review results and click "Next Question"
        console.log('✅ [Practice Mode] Code evaluated, showing results');
        setPhase('feedback');

        // Play TTS feedback if available
        if (response.tts_audio_url && enableTTS) {
          const audioUrl = `${API_BASE_URL}${response.tts_audio_url}`;
          console.log('🔊 [Practice Mode] Playing code feedback audio:', audioUrl);
          setIsAudioLoading(true);

          const audio = new Audio(audioUrl);
          audioPlayerRef.current = audio;

          audio.addEventListener('loadeddata', () => {
            setIsAudioLoading(false);
            setIsPlayingAudio(true);
          });

          audio.addEventListener('ended', () => {
            setIsPlayingAudio(false);
          });

          audio.addEventListener('error', (e) => {
            console.error('❌ [Practice Mode] Audio playback error:', e);
            setIsAudioLoading(false);
            setIsPlayingAudio(false);
          });

          audio.play().catch(err => {
            console.error('❌ [Practice Mode] Audio play failed:', err);
            setIsAudioLoading(false);
            setIsPlayingAudio(false);
          });
        }

        toast({
          title: response.evaluation.is_correct ? '✅ Code Accepted!' : '📝 Code Evaluated',
          description: `Score: ${response.evaluation.overall_score}% | Tests Passed: ${response.evaluation.test_cases_passed}/${response.evaluation.test_cases_total}`,
        });
      }
    } catch (error: any) {
      console.error('❌ [Practice Mode] Code submission error:', error);
      setIsSubmittingCode(false);
      toast({
        title: '❌ Submission Failed',
        description: error.message || 'Could not submit your code. Please try again.',
        variant: 'destructive',
      });
      setPhase('question');
    } finally {
      setIsSubmittingCode(false);
    }
  };

  const handleRestart = () => {
    setPhase('welcome');
    setSessionId(null);
    setCurrentQuestion(null);
    setCurrentQuestionNumber(0);
    setTranscription('');
    setSpeechMetrics(null);
    setMicroFeedback(null);
    setEvaluation(null);
    setRecordingTime(0);
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
    const questionText = (question.question_text || question.text || '').toLowerCase();
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

  const handleNextQuestion = async () => {
    if (!sessionId) {
      console.error('❌ [Practice Mode] No session ID available');
      return;
    }

    if (!currentQuestion) {
      console.error('❌ [Practice Mode] No current question available');
      return;
    }

    setIsProcessing(true);

    try {
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

        toast({
          title: '🎉 Interview Complete!',
          description: `Completed all ${totalQuestions} questions successfully!`,
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
        setPhase('question');
        setTranscription('');
        setSpeechMetrics(null);
        setMicroFeedback(null);

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
          setIsAudioLoading(true);
          const audioUrl = `${API_BASE_URL}${response.tts_audio_url}`;
          console.log('🔊 [Practice Mode] Playing next question audio:', audioUrl);

          const audio = new Audio(audioUrl);
          audioPlayerRef.current = audio;

          audio.onloadeddata = () => {
            console.log('✅ Next question audio loaded');
            setIsAudioLoading(false);
          };

          audio.onplay = () => {
            console.log('▶️ Next question audio playing');
            setIsPlayingAudio(true);
          };

          audio.onended = () => {
            console.log('⏹️ Next question audio finished');
            setIsPlayingAudio(false);
          };

          audio.onerror = (e) => {
            console.error('❌ Next question audio error:', e);
            setIsAudioLoading(false);
            setIsPlayingAudio(false);
          };

          audio.play().catch((err) => {
            console.error('❌ Error playing next question audio:', err);
            setIsAudioLoading(false);
            setIsPlayingAudio(false);
          });
        }
      }
    } catch (error: any) {
      console.error('❌ [Practice Mode] Next Question Error:', error);
      console.error('❌ [Practice Mode] Error stack:', error.stack);
      console.error('❌ [Practice Mode] Error message:', error.message);

      toast({
        title: '❌ Failed to Load Next Question',
        description: error.message || 'Could not load the next question. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRoundStart = (sessionId: string, roundConfig: RoundConfig, firstQuestion: any, ttsAudioUrl?: string) => {
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

    setSessionId(sessionId);
    setCurrentRoundConfig(roundConfig);
    setCurrentQuestion(firstQuestion);
    setCurrentQuestionNumber(1);
    setTotalQuestions(roundConfig.question_count);
    setTimeRemaining(firstQuestion.time_limit);
    setPhase('question');

    // Play TTS audio if available
    if (ttsAudioUrl && enableTTS) {
      try {
        setIsAudioLoading(true);
        const audioUrl = `${API_BASE_URL}${ttsAudioUrl}`;
        console.log('🔊 [Round-Based] Playing question audio:', audioUrl);

        const audio = new Audio(audioUrl);
        audioPlayerRef.current = audio;

        audio.onloadeddata = () => {
          console.log('✅ [Round-Based] Audio loaded successfully');
          setIsAudioLoading(false);
        };

        audio.onplay = () => {
          console.log('▶️ [Round-Based] Audio playback started');
          setIsPlayingAudio(true);
        };

        audio.onended = () => {
          console.log('⏹️ [Round-Based] Audio playback finished');
          setIsPlayingAudio(false);
        };

        audio.onerror = (e) => {
          console.error('❌ [Round-Based] Audio playback error:', e);
          setIsAudioLoading(false);
          setIsPlayingAudio(false);
          toast({
            title: '⚠️ Audio Error',
            description: 'Could not play question audio',
            variant: 'destructive',
          });
        };

        audio.play().catch((err) => {
          console.error('❌ [Round-Based] Audio play failed:', err);
          setIsAudioLoading(false);
          setIsPlayingAudio(false);
        });
      } catch (error) {
        console.error('❌ [Round-Based] TTS error:', error);
        setIsAudioLoading(false);
        setIsPlayingAudio(false);
      }
    }

    toast({
      title: `🎯 ${roundConfig.name} Started!`,
      description: `${roundConfig.question_count} questions • ${roundConfig.duration_minutes} minutes`,
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
        <Card className="w-full border-2 shadow-lg">
          <CardHeader className="text-center space-y-2 pb-3">
            <div className="mx-auto w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center">
              <Mic className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                AI Interview Practice
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Practice real interview questions with AI-powered voice analysis
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 pb-4">
            {/* Quick Start / Full Control / Round-Based Toggle */}
            <div className="flex gap-2 p-1 bg-muted rounded-lg">
              <Button
                variant={!useQuickStart && phase === 'welcome' ? 'default' : 'ghost'}
                className="flex-1 text-xs h-8"
                onClick={() => setUseQuickStart(false)}
              >
                <Zap className="w-3 h-3 mr-1" />
                Quick Start
              </Button>
              <Button
                variant="ghost"
                className="flex-1 text-xs h-8"
                onClick={() => setPhase('round-selection')}
              >
                <Target className="w-3 h-3 mr-1" />
                Round-Based
              </Button>
              <Button
                variant={useQuickStart ? 'default' : 'ghost'}
                className="flex-1 text-xs h-8"
                onClick={() => setUseQuickStart(true)}
              >
                🎛️ Full Control
              </Button>
            </div>

            {!useQuickStart ? (
              // Quick Start Mode - ONE FIELD ONLY, AI decides everything
              <>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/20">
                    <Sparkles className="w-5 h-5 text-purple-500 flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm">🚀 AI-Powered Quick Start</h3>
                      <p className="text-xs text-muted-foreground">
                        Tell me your role, company, and experience - AI decides difficulty, question count, and everything else!
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">What are you preparing for?</Label>
                    <Input
                      placeholder='e.g., "5 questions for Senior SWE at Netflix" or "8 hard questions at Google, system design"'
                      value={quickStartInput}
                      onChange={(e) => setQuickStartInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !quickStartLoading) {
                          handleQuickStart();
                        }
                      }}
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      💡 Specify company, question count, difficulty - AI understands it all! Works with ANY company worldwide.
                    </p>
                  </div>

                  {aiMessage && (
                    <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <p className="text-sm text-green-700 dark:text-green-400">
                        🤖 {aiMessage}
                      </p>
                    </div>
                  )}
                </div>

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

                <Button
                  size="lg"
                  className="w-full h-10 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-sm"
                  onClick={handleQuickStart}
                  disabled={quickStartLoading || !quickStartInput.trim()}
                >
                  {quickStartLoading ? (
                    <>
                      <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                      AI is Setting Up...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 w-4 h-4" />
                      Start Interview Now
                    </>
                  )}
                </Button>
              </>
            ) : (
              // Traditional Setup Mode
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="flex flex-col items-center p-2 bg-muted/50 rounded-lg">
                    <Brain className="w-6 h-6 text-purple-500 mb-1" />
                    <h3 className="font-semibold text-xs">Smart Questions</h3>
                    <p className="text-[10px] text-muted-foreground text-center">
                      AI-generated questions
                    </p>
                  </div>
                  <div className="flex flex-col items-center p-2 bg-muted/50 rounded-lg">
                    <BarChart3 className="w-6 h-6 text-blue-500 mb-1" />
                    <h3 className="font-semibold text-xs">Speech Analysis</h3>
                    <p className="text-[10px] text-muted-foreground text-center">
                      Real-time metrics
                    </p>
                  </div>
                  <div className="flex flex-col items-center p-2 bg-muted/50 rounded-lg">
                    <Trophy className="w-6 h-6 text-yellow-500 mb-1" />
                    <h3 className="font-semibold text-xs">Instant Feedback</h3>
                    <p className="text-[10px] text-muted-foreground text-center">
                      Performance review
                    </p>
                  </div>
                </div>

                <Separator className="my-2" />

                <div className="space-y-2">
                  <div>
                    <label className="text-xs font-medium mb-1 block">Interview Role</label>
                    <Input
                      placeholder="e.g., Software Engineer, Data Scientist, Product Manager, DevOps..."
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="text-sm"
                      list="role-suggestions"
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
                      className="w-16 h-7 text-xs text-center"
                    />
                  </div>

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

                  <div className="flex items-center justify-between p-2 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border-2 border-purple-500/20">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-500" />
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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button
                    size="lg"
                    className="h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
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
              </>
            )}
          </CardContent>
        </Card>
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
      <div className="max-w-7xl mx-auto w-full px-4">
        <div className="mb-4">
          <Button
            variant="ghost"
            onClick={() => setPhase('welcome')}
            className="gap-2"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            Back
          </Button>
        </div>
        <RoundSelection
          onRoundStart={handleRoundStart}
          userProfile={userProfile}
        />
      </div>
    );
  }

  if (phase === 'setup') {
    return (
      <div className="max-w-4xl mx-auto w-full px-4">
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
                className="flex-1 h-9 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-sm"
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
    return (
      <div className="max-w-4xl mx-auto w-full px-4 flex flex-col space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {currentRoundConfig && (
              <Badge variant="outline" className="text-sm px-3 py-1 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/20">
                <Target className="w-3 h-3 mr-1" />
                {currentRoundConfig.name}
              </Badge>
            )}
            <Badge variant="outline" className="text-sm px-3 py-1">
              Question {currentQuestionNumber} / {totalQuestions}
            </Badge>

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

            <Badge className="bg-gradient-to-r from-purple-500 to-pink-500">
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
          </div>
          <Progress value={(currentQuestionNumber / totalQuestions) * 100} className="w-32" />
        </div>

        {/* Question Card */}
        <Card className="flex-1 flex flex-col">
          {/* Check question type and render appropriate UI */}
          {isCodingQuestion(currentQuestion) ? (
            /* Coding Question - Show Code Editor */
            <div className="p-6">
              <InterviewCodeEditor
                question={currentQuestion as Question}
                onSubmit={handleSubmitCode}
                isSubmitting={isSubmittingCode}
                testResults={codeTestResults || undefined}
                evaluation={codeEvaluation || undefined}
                timeRemaining={timeRemaining}
                onTimeUp={() => {
                  if (phase === 'question') {
                    toast({
                      title: '⏰ Time\'s Up!',
                      description: 'Submitting your current code...',
                      variant: 'destructive',
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
                      {currentQuestion?.question_text || currentQuestion?.text}
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
                        <div className="w-32 h-32 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                          <Mic className="w-16 h-16 text-white" />
                        </div>

                        <div className="text-center space-y-2">
                          <h3 className="text-2xl font-semibold">Ready to Answer</h3>
                          <p className="text-muted-foreground max-w-md">
                            Click the button below to start recording. Timer will begin when you start recording.
                          </p>
                          <div className="flex items-center justify-center gap-2 text-sm">
                            <Clock className="w-4 h-4 text-purple-500" />
                            <span className="font-medium text-purple-500">{currentQuestion?.time_limit}s time limit</span>
                          </div>
                        </div>

                        <Button
                          size="lg"
                          className="px-8 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                          onClick={handleStartRecording}
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
    return (
      <div className="max-w-4xl mx-auto w-full px-4 flex items-center justify-center">
        <Card className="w-full">
          <CardContent className="flex flex-col items-center gap-6 py-12">
            <div className="relative">
              <Loader2 className="w-20 h-20 animate-spin text-primary" />
              <Sparkles className="w-8 h-8 text-yellow-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-semibold">Analyzing Your Answer...</h3>
              <p className="text-muted-foreground">
                Our AI is evaluating your speech, content, and delivery
              </p>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline">Transcribing</Badge>
              <Badge variant="outline">Speech Analysis</Badge>
              <Badge variant="outline">Content Evaluation</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === 'feedback') {
    return (
      <div className="max-w-4xl mx-auto w-full px-4 flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Answer Feedback</h2>
          <Badge variant="outline">
            Question {currentQuestionNumber} / {totalQuestions}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Speaking Speed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{speechMetrics?.wpm || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">words per minute</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Confidence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {((speechMetrics?.confidence_score || 0) * 100).toFixed(0)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">confidence score</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Filler Words
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{speechMetrics?.filler_count || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">um, uh, like, etc.</p>
            </CardContent>
          </Card>
        </div>

        {/* VAD Silence Removal Metric - NEW */}
        {speechMetrics?.silence_removed && speechMetrics.silence_removed > 0 && (
          <Card className="border-yellow-200 dark:border-yellow-900 bg-yellow-50/50 dark:bg-yellow-950/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
                  <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-3xl font-bold text-yellow-700 dark:text-yellow-400">
                      {speechMetrics.silence_removed.toFixed(1)}s
                    </span>
                    <span className="text-sm text-muted-foreground">of silence removed</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    ⏸️ Long pauses were detected and removed by Voice Activity Detection (VAD).
                    Practice speaking more continuously to reduce dead air.
                  </p>

                  {/* Speaking Time Breakdown */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 space-y-2 mb-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Actual Speaking Time:</span>
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        {((speechMetrics.duration || 0) - speechMetrics.silence_removed).toFixed(1)}s
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Silence Removed:</span>
                      <span className="font-semibold text-yellow-600 dark:text-yellow-400">
                        {speechMetrics.silence_removed.toFixed(1)}s
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-t pt-2">
                      <span className="text-muted-foreground font-medium">Total Recording:</span>
                      <span className="font-semibold">
                        {(speechMetrics.duration || 0).toFixed(1)}s
                      </span>
                    </div>
                  </div>

                  <div className="mt-2">
                    <Progress
                      value={Math.min(100, (speechMetrics.silence_removed / (speechMetrics.duration || 1)) * 100)}
                      className="h-2 bg-yellow-200 dark:bg-yellow-900/30"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {((speechMetrics.silence_removed / (speechMetrics.duration || 1)) * 100).toFixed(1)}% of your recording was silence
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Your Answer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ScrollArea className="h-32">
              <p className="text-sm leading-relaxed">{transcription}</p>
            </ScrollArea>

            <Separator />

            {/* Answer Correctness Section - NEW */}
            {microFeedback?.correctness_score !== undefined && (
              <>
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Answer Correctness
                    </h4>
                    <div className="flex items-center gap-3">
                      {microFeedback.is_correct ? (
                        <span className="text-green-600 dark:text-green-400 text-2xl">✅</span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400 text-2xl">❌</span>
                      )}
                      <span className="text-2xl font-bold text-primary">
                        {microFeedback.correctness_score}%
                      </span>
                      {microFeedback.technical_accuracy && (
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${microFeedback.technical_accuracy === 'Excellent' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
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
                      <h5 className="text-sm font-semibold mb-2 text-green-600 dark:text-green-400">
                        ✅ Key Points Covered
                      </h5>
                      <ul className="text-sm space-y-1">
                        {microFeedback.key_points_covered.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Key Points Missed */}
                  {microFeedback.key_points_missed && microFeedback.key_points_missed.length > 0 && (
                    <div>
                      <h5 className="text-sm font-semibold mb-2 text-red-600 dark:text-red-400">
                        ❌ Key Points Missed
                      </h5>
                      <ul className="text-sm space-y-1">
                        {microFeedback.key_points_missed.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-red-600 dark:text-red-400 mt-0.5">✗</span>
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Strengths */}
                  {microFeedback.strengths && microFeedback.strengths.length > 0 && (
                    <div>
                      <h5 className="text-sm font-semibold mb-2 text-blue-600 dark:text-blue-400">
                        💪 Strengths
                      </h5>
                      <ul className="text-sm space-y-1">
                        {microFeedback.strengths.map((strength, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-blue-600 dark:text-blue-400 mt-0.5">•</span>
                            <span>{strength}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Improvement Areas */}
                  {microFeedback.improvement_areas && microFeedback.improvement_areas.length > 0 && (
                    <div>
                      <h5 className="text-sm font-semibold mb-2 text-orange-600 dark:text-orange-400">
                        📈 Areas to Improve
                      </h5>
                      <ul className="text-sm space-y-1">
                        {microFeedback.improvement_areas.map((area, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-orange-600 dark:text-orange-400 mt-0.5">↗</span>
                            <span>{area}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Actionable Suggestions */}
                  {microFeedback.actionable_suggestions && microFeedback.actionable_suggestions.length > 0 && (
                    <div>
                      <h5 className="text-sm font-semibold mb-2 text-purple-600 dark:text-purple-400">
                        🎯 Next Steps
                      </h5>
                      <ul className="text-sm space-y-1">
                        {microFeedback.actionable_suggestions.map((suggestion, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-purple-600 dark:text-purple-400 mt-0.5">→</span>
                            <span>{suggestion}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <Separator />
              </>
            )}

            {/* Delivery Feedback Section - ENHANCED with VAD highlighting */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Delivery Tips
                </h4>
                <ul className="text-sm space-y-2">
                  {microFeedback?.delivery_tips && microFeedback.delivery_tips.length > 0 ? (
                    microFeedback.delivery_tips.map((tip, idx) => {
                      // Check if this is a VAD-related tip (mentions silence/pauses)
                      const isVadTip = tip.toLowerCase().includes('silence') ||
                        tip.toLowerCase().includes('pause') ||
                        tip.includes('⏸️');

                      return (
                        <li key={idx} className={`flex items-start gap-2 p-2 rounded ${isVadTip ? 'bg-yellow-50 dark:bg-yellow-950/20 border-l-2 border-yellow-500' : ''
                          }`}>
                          <span className={`mt-0.5 ${isVadTip ? 'text-yellow-600 dark:text-yellow-500' : 'text-primary'}`}>
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
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Overall Note
                </h4>
                <p className="text-sm text-muted-foreground">
                  {microFeedback?.overall_note || microFeedback?.content_relevance || 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center gap-4">
          <Button
            onClick={handleNextQuestion}
            disabled={isProcessing}
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
                Next Question
                <ArrowRight className="ml-2 w-4 h-4" />
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
            <Card className="border-2 bg-gradient-to-br from-purple-500/10 to-pink-500/10">
              <CardContent className="pt-8 pb-8">
                <div className="text-center space-y-4">
                  <div className="mx-auto w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                    <Trophy className="w-12 h-12 text-white" />
                  </div>
                  <div>
                    <h1 className="text-4xl font-bold mb-2">Interview Complete! 🎉</h1>
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

            {/* Score Card */}
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-2xl">Overall Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-baseline gap-3 mb-2">
                      <span className={`text-6xl font-bold ${getScoreColor(score)}`}>
                        {score}
                      </span>
                      <span className="text-3xl text-muted-foreground">/100</span>
                      <Badge className="text-xl px-4 py-2 ml-4">{grade}</Badge>
                    </div>
                    <Progress value={score} className="h-3 mt-4" />
                    <p className="text-xs text-muted-foreground mt-2">
                      Based on average confidence score: {avgConfidence.toFixed(2)}{avgConfidence <= 1 ? ' (0-1 scale)' : '/10'}
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-2 ml-8">
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
              </CardContent>
            </Card>

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
                className="px-8 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
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
