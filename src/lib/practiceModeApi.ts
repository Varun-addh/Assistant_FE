/**
 * Practice Mode API Integration
 * Real-time voice interview practice with AI evaluation
 */

import {
  STRATAX_API_BASE_URL,
  StrataxApiError,
  strataxFetch,
  strataxFetchJson,
} from './strataxClient';

export const API_BASE_URL = STRATAX_API_BASE_URL;

// ============================================================================
// TypeScript Types
// ============================================================================

// ============================================================================
// Round-Based Interview Types
// ============================================================================

export enum InterviewRound {
  HR_SCREENING = 'hr_screening',
  TECHNICAL_ROUND_1 = 'technical_round_1',
  TECHNICAL_ROUND_2 = 'technical_round_2',
  SYSTEM_DESIGN = 'system_design',
  BEHAVIORAL = 'behavioral',
  MANAGERIAL = 'managerial',
  MACHINE_LEARNING = 'machine_learning',        // ✅ Fixed: was 'ml_specialist'
  DATA_ENGINEERING = 'data_engineering',
  FRONTEND_SPECIALIST = 'frontend_specialist',
  BACKEND_SPECIALIST = 'backend_specialist',
  DEVOPS = 'devops',                            // ✅ Fixed: was 'devops_sre'
  SECURITY = 'security',
  FULL_INTERVIEW = 'full_interview',
}

export interface RoundConfig {
  round_type: InterviewRound;
  name: string;
  description: string;
  duration_minutes: number;
  question_count: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  focus_areas: string[];
  recommended_for: string[];
  icon: string;
  color: string;
}

export interface AvailableRoundsResponse {
  rounds?: RoundConfig[];  // Backend returns 'rounds'
  all_rounds?: RoundConfig[];  // Alternative field name
  recommended_rounds?: RoundConfig[];
  recommended_round?: RoundConfig | null;
  recommended_sequence?: RoundConfig[] | null;
}

export interface StartRoundRequest {
  round_type: InterviewRound;
  domain: string;                    // ✅ Top-level field (REQUIRED)
  experience_years: number;          // ✅ Top-level field (REQUIRED)
  company_specific?: string;         // Optional
  enable_tts?: boolean;              // Optional
  question_count?: number;           // Optional - Number of questions (1-15, backend default varies by round)
}

export interface StartRoundResponse {
  session_id: string;
  round_config: RoundConfig;
  first_question: Question;
  tts_audio_url?: string;
  message: string;
  total_questions: number;
  progress: string;
}

// ============================================================================
// Question Type Support (Voice, Coding, System Design)
// ============================================================================

export enum QuestionType {
  VOICE = 'VOICE',
  CODING = 'CODING',
  SYSTEM_DESIGN = 'SYSTEM_DESIGN',
}

export interface TestCase {
  input: string;
  expected_output: string;
  is_hidden?: boolean;
}

export interface Question {
  question_text: string;  // Changed from 'text' to 'question_text'
  category: 'behavioral' | 'technical' | 'system_design' | 'problem_solving';
  difficulty: 'easy' | 'medium' | 'hard';
  time_limit: number;
  model_answer?: string;
  rationale?: string;
  round_type?: InterviewRound;  // NEW - Round association

  // ✨ NEW - Coding Question Support
  question_type?: QuestionType;         // Determines UI (voice recorder vs code editor)
  programming_language?: string;        // e.g., "python", "javascript", "java"
  code_template?: string;               // Starter code for coding questions
  test_cases?: TestCase[];              // Input/output validation
  constraints?: string[];               // Time/space complexity requirements
  hints?: string[];                     // Progressive hints for users

  // Legacy field for backward compatibility
  id?: number;
  text?: string;
}

export interface SpeechMetrics {
  filler_count: number;
  wpm: number;
  longest_silence: number;
  confidence_score: number;  // 0-1 range
  overtalked: boolean;
  duration: number;
  filler_words?: string[];
  pause_count?: number;
  pitch_variance?: number;
  silence_removed?: number;  // NEW - Seconds of silence removed by VAD
  // Legacy fields for backward compatibility
  filler_words_used?: string[];
  total_words?: number;
  speaking_duration?: number;
  average_pause_duration?: number;
  significant_pauses?: number;
}

export interface MicroFeedback {
  // Existing fields - Delivery feedback
  delivery_tips: string[];
  pace_feedback: string;
  overall_note: string;
  speech_quality?: string;
  content_relevance?: string;  // Deprecated - use correctness_score
  timestamp?: string;

  // ✨ NEW - Answer Correctness Fields
  correctness_score?: number;              // 0-100 rating
  technical_accuracy?: string;             // Excellent/Good/Fair/Poor
  is_correct?: boolean;                    // true if score >= 70
  key_points_covered?: string[];           // What user got right
  key_points_missed?: string[];            // What user missed
  strengths?: string[];                    // Positive aspects
  improvement_areas?: string[];            // Areas to improve
  actionable_suggestions?: string[];       // Specific next steps
}

export interface Evaluation {
  overall_score?: number;  // Made optional since it might not always be present
  detailed_feedback?: string;  // Made optional
  strengths: {
    items: string[];
  };
  improvements: {
    items: string[];
  };
  metrics_summary: {
    total_fillers: number;
    avg_wpm: number;
    longest_pause: number;
    avg_confidence: number;
    total_duration: number;
    overtalked_count: number;
  };
  action_plan: {
    steps: string[];
  };
  practice_recommendation: string;
  generated_at: string;
  // Legacy fields for backward compatibility
  speech_summary?: {
    average_wpm: number;
    total_filler_count: number;
    average_confidence: number;
  };
  areas_for_improvement?: string[];
}

// ============================================================================
// Practice Insights (optional UI surface)
// ============================================================================

export interface PracticeInsightsResponse {
  recommended_focus?: string[];
  overall?: {
    correctness?: number;
    confidence?: number;
    filler?: number;
    wpm?: number;
    [key: string]: unknown;
  };
  by_category?: Record<string, unknown>;
  by_difficulty?: Record<string, unknown>;
  lookback_days?: number;
  lookback_sessions?: number;
  [key: string]: unknown;
}

// ============================================================================
// Feedback Rating (Phase 3)
// ============================================================================

export type PerceivedDifficulty = 'easy' | 'medium' | 'hard';

export interface RatePracticeFeedbackRequest {
  session_id: string;
  question_id: number;
  usefulness_rating: number; // 1-5
  perceived_difficulty?: PerceivedDifficulty;
  comment?: string;
}

export interface RatePracticeFeedbackResponse {
  ok: true;
}

export async function getPracticeInsights(params: { domain: string; lookback_days?: number }): Promise<PracticeInsightsResponse> {
  const domain = params.domain?.trim();
  if (!domain) throw new Error("Domain is required");

  const qs = new URLSearchParams();
  qs.set("domain", domain);
  qs.set("lookback_days", String(params.lookback_days ?? 30));

  return await strataxFetchJson(`${API_BASE_URL}/api/practice/insights?${qs.toString()}`, {
    method: "GET",
  });
}

export async function ratePracticeFeedback(
  payload: RatePracticeFeedbackRequest
): Promise<RatePracticeFeedbackResponse> {
  if (!payload?.session_id) throw new Error('session_id is required');
  if (payload?.question_id === undefined || payload?.question_id === null) throw new Error('question_id is required');
  if (!payload?.usefulness_rating || payload.usefulness_rating < 1 || payload.usefulness_rating > 5) {
    throw new Error('usefulness_rating must be between 1 and 5');
  }

  return await strataxFetchJson(`${API_BASE_URL}/api/practice/interview/rate-feedback`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ============================================================================
// Code Submission Types (For Coding Questions)
// ============================================================================

export interface SubmitCodeRequest {
  session_id: string;
  question_id: number;
  code: string;
  programming_language: string;
  time_taken?: number;  // seconds
}

export interface CodeTestResult {
  test_case_number: number;
  passed: boolean;
  input: string;
  expected_output: string;
  actual_output: string;
  error_message?: string;
  execution_time_ms?: number;
}

export interface CodeEvaluationFeedback {
  correctness_score: number;        // 0-100
  code_quality_score: number;       // 0-100
  efficiency_score: number;         // 0-100
  overall_score: number;            // Average of above

  // Detailed Analysis
  approach_feedback: string;        // AI analysis of algorithm choice
  code_quality_notes: string[];     // Readability, naming, structure
  time_complexity: string;          // e.g., "O(n log n)"
  space_complexity: string;         // e.g., "O(n)"
  edge_cases_handled: string[];     // What user handled well
  edge_cases_missed: string[];      // What user missed

  // Suggestions
  optimization_suggestions: string[];
  alternative_approaches: string[];
  best_practices_violated: string[];

  // Pass/Fail
  is_correct: boolean;              // All test cases passed + quality threshold met
  test_cases_passed: number;
  test_cases_total: number;
}

export interface SubmitCodeResponse {
  test_results: CodeTestResult[];
  evaluation: CodeEvaluationFeedback;
  tts_audio_url?: string;           // AI feedback audio
  next_question?: Question;         // If interview continues
  complete?: boolean;               // If interview is done
  evaluation_report?: Evaluation;   // Final report if complete
  progress?: string;                // e.g., "2/5"
}

export interface StartInterviewResponse {
  session_id: string;
  first_question: Question;
  tts_audio_url?: string;
  message: string;
  total_questions: number;  // NEW - Total number of questions in interview
  progress: string;  // NEW - e.g., "1/3", "1/5", "1/10"
}

export interface SubmitAnswerResponse {
  transcript: string;
  metrics: SpeechMetrics;
  micro_feedback: MicroFeedback;
  next_question?: Question;  // DEPRECATED - No longer returned, use acknowledgeFeedback()
  tts_audio_url?: string;
  complete?: boolean;
  evaluation_report?: Evaluation;
  progress?: string;  // e.g., "2/5", "3/5"
  requires_acknowledgment?: boolean;  // NEW - If true, user must click "Next Question" button
}

export interface AcknowledgeFeedbackResponse {
  next_question: Question;
  tts_audio_url?: string;
  progress: string;  // e.g., "3/5", "4/5"
  complete: boolean;  // If true, no more questions
  evaluation_report?: Evaluation;  // Final evaluation if complete=true
}

export interface PracticeModeStatus {
  enabled: boolean;
  tts_engine: string;
  stt_model: string;
  active_sessions: number;
  tts_info: {
    engine: string;
    initialized: boolean;
    available_engines: string[];
  };
  stt_info: {
    model_size: string;
    device: string;
  };
}

export interface QuickStartResponse {
  ai_message: string;
  ready_to_start: boolean;
  session_id: string;
  first_question: Question;
  tts_audio_url?: string;
  total_questions: number;  // NEW - Total number of questions in interview
  progress: string;  // NEW - e.g., "1/3", "1/5", "1/10"
  inferred_profile?: {
    domain: string;
    experience_years: number;
    difficulty: 'easy' | 'medium' | 'hard';
    question_count: number;
    target_company?: string;
  };
}

export type InterviewRole = 'software_engineer' | 'data_scientist' | 'product_manager';
export type InterviewDifficulty = 'easy' | 'medium' | 'hard';

// NEW - User Profile for Adaptive Intelligence
export interface UserProfile {
  domain: string;  // e.g., 'Python Backend Development'
  experience_years: number;
  skills: string[];  // e.g., ['Python', 'Django', 'AWS', 'Docker']
  job_role?: string;  // e.g., 'Senior Backend Engineer'
  company_preference?: string;  // e.g., 'FAANG'
  interview_focus?: string[];  // e.g., ['System Design', 'API Design']
  target_round?: InterviewRound;  // NEW - Target interview round
}

// ============================================================================
// Audio Recorder Class
// ============================================================================

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;

  async start(): Promise<void> {
    try {
      // Request microphone permission
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      // Determine the best MIME type available
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
      });

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start();

      // Set up audio analyzer for real-time level detection
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);

      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);

      console.log('[AudioRecorder] Recording started with', mimeType);
    } catch (error) {
      console.error('[AudioRecorder] Error starting recording:', error);
      throw error;
    }
  }

  async stop(): Promise<Blob> {
    return new Promise(async (resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder not initialized'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, {
          type: this.mediaRecorder!.mimeType,
        });

        // Stop all tracks
        this.stream?.getTracks().forEach((track) => track.stop());

        console.log('[AudioRecorder] Recording stopped, original blob size:', audioBlob.size, 'type:', audioBlob.type);

        // Convert to WAV format
        try {
          const wavBlob = await this.convertToWav(audioBlob);
          console.log('[AudioRecorder] Converted to WAV, size:', wavBlob.size);
          resolve(wavBlob);
        } catch (error) {
          console.error('[AudioRecorder] WAV conversion failed, using original:', error);
          resolve(audioBlob);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  getAudioLevel(): number {
    if (!this.analyser || !this.dataArray) {
      return 0;
    }

    // @ts-ignore - TypeScript has issues with Uint8Array type compatibility
    this.analyser.getByteFrequencyData(this.dataArray);

    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    const average = sum / this.dataArray.length;

    // Normalize to 0-1 range (0-255 -> 0-1)
    return Math.min(average / 128, 1);
  }

  private async convertToWav(blob: Blob): Promise<Blob> {
    // Create new audio context for conversion (separate from analyzer)
    const conversionContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Read blob as array buffer
    const arrayBuffer = await blob.arrayBuffer();

    // Decode audio
    const audioBuffer = await conversionContext.decodeAudioData(arrayBuffer);

    // Convert to WAV
    const wavBuffer = this.audioBufferToWav(audioBuffer);

    // Close the conversion context
    await conversionContext.close();

    return new Blob([wavBuffer], { type: 'audio/wav' });
  }

  private audioBufferToWav(audioBuffer: AudioBuffer): ArrayBuffer {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const length = audioBuffer.length * numChannels * 2;
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);

    // Write WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, (sampleRate * numChannels * bitDepth) / 8, true);
    view.setUint16(32, (numChannels * bitDepth) / 8, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, length, true);

    // Write audio data
    const channels: Float32Array[] = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        let sample = Math.max(-1, Math.min(1, channels[channel][i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    }

    return buffer;
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}

// ============================================================================
// API Functions
// ============================================================================

export async function checkPracticeModeStatus(): Promise<PracticeModeStatus> {
  return await strataxFetchJson(`${API_BASE_URL}/api/practice/status`, { method: 'GET' });
}

export async function startInterview(
  role: string = 'Software Engineer',
  difficulty: InterviewDifficulty = 'easy',
  enableTTS: boolean = false,
  category?: string,
  userProfile?: UserProfile,  // Optional adaptive intelligence
  questionCount?: number  // NEW - Number of questions (1-10, default 5)
): Promise<StartInterviewResponse> {
  const requestBody: any = {
    difficulty,
    enable_tts: enableTTS,
  };

  // Add optional fields
  if (category) {
    requestBody.category = category;
  } else {
    requestBody.category = 'behavioral';  // Default category
  }

  if (questionCount && questionCount >= 1 && questionCount <= 10) {
    requestBody.question_count = questionCount;
  }

  if (userProfile) {
    requestBody.user_profile = userProfile;
  }

  return await strataxFetchJson(`${API_BASE_URL}/api/practice/interview/start`, {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
}

export async function submitAnswer(
  sessionId: string,
  questionId: number,
  audioBlob: Blob
): Promise<SubmitAnswerResponse> {
  const formData = new FormData();
  formData.append('session_id', sessionId);
  formData.append('question_id', questionId.toString());
  formData.append('audio', audioBlob, 'answer.wav');

  const response = await strataxFetch(`${API_BASE_URL}/api/practice/interview/submit-answer`, {
    method: 'POST',
    body: formData,
    // Don't set Content-Type header - browser sets it automatically with boundary
  });

  return await response.json();
}

/**
 * Acknowledge feedback and get next question
 * NEW FLOW: Called after user reviews feedback and clicks "Next Question"
 */
export async function acknowledgeFeedback(
  sessionId: string,
  questionId: number
): Promise<AcknowledgeFeedbackResponse> {
  console.log('🔔 [API] Acknowledging feedback for session:', sessionId, 'question:', questionId);

  const requestBody = {
    sessionId: sessionId,
    questionId: questionId,
    feedbackRead: true
  };
  console.log('📤 [API] Request body:', JSON.stringify(requestBody));

  let data: any;
  try {
    const response = await strataxFetch(`${API_BASE_URL}/api/practice/interview/acknowledge-feedback`, {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    console.log('📡 [API] Acknowledge feedback response status:', response.status, response.statusText);
    data = await response.json();
  } catch (err) {
    console.error('❌ [API] Acknowledge feedback error:', err);

    if (err instanceof StrataxApiError && Array.isArray(err.detail)) {
      const validationErrors = err.detail
        .map((e: any) => `${e.loc?.join('.')}: ${e.msg} (input: ${JSON.stringify(e.input)})`)
        .join('; ');
      console.error('📋 [API] Validation errors:', validationErrors);
      throw new Error(`Validation error: ${validationErrors}`);
    }

    throw err;
  }

  console.log('✅ [API] Acknowledge feedback response data:', data);
  console.log('📊 [API] Response structure:', {
    hasNextQuestion: !!data.next_question,
    complete: data.complete,
    progress: data.progress,
    questionText: data.next_question?.question_text?.substring(0, 50),
  });

  return data;
}

/**
 * Submit code for evaluation (for CODING question types)
 * Backend evaluates code against test cases and provides AI feedback
 */
export async function submitCode(
  sessionId: string,
  questionId: number,
  code: string,
  programmingLanguage: string,
  timeTaken?: number
): Promise<SubmitCodeResponse> {
  console.log('💻 [API] Submitting code for session:', sessionId, 'question:', questionId);
  console.log('📝 [API] Code length:', code.length, 'Language:', programmingLanguage);

  const requestBody: SubmitCodeRequest = {
    session_id: sessionId,
    question_id: questionId,
    code: code,
    programming_language: programmingLanguage,
    time_taken: timeTaken,
  };

  let data: any;
  try {
    const response = await strataxFetch(`${API_BASE_URL}/api/practice/interview/submit-code`, {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    console.log('📡 [API] Submit code response status:', response.status);
    data = await response.json();
  } catch (err) {
    console.error('❌ [API] Code submission error:', err);

    if (err instanceof StrataxApiError && Array.isArray(err.detail)) {
      const validationErrors = err.detail
        .map((e: any) => `${e.loc?.join('.')}: ${e.msg} (input: ${JSON.stringify(e.input)})`)
        .join('; ');
      console.error('📋 [API] Validation errors:', validationErrors);
      throw new Error(`Validation error: ${validationErrors}`);
    }

    throw err;
  }

  console.log('✅ [API] Code submission response:', {
    testsPassed: data.test_results?.filter((t: CodeTestResult) => t.passed).length,
    testsTotal: data.test_results?.length,
    overallScore: data.evaluation?.overall_score,
    isCorrect: data.evaluation?.is_correct,
    complete: data.complete,
  });

  return data;
}

export function getAudioUrl(audioPath: string): string {
  return `${API_BASE_URL}/api/practice/audio/${audioPath}`;
}

export async function playQuestionAudio(audioPath: string): Promise<HTMLAudioElement> {
  const audioUrl = getAudioUrl(audioPath);
  const audio = new Audio(audioUrl);
  await audio.play();
  return audio;
}

export async function getSessionDetails(sessionId: string): Promise<any> {
  return await strataxFetchJson(`${API_BASE_URL}/api/practice/session/${sessionId}`, { method: 'GET' });
}

export async function getSessionEvaluation(sessionId: string): Promise<any> {
  console.log(`🔍 [Diagnostic] Fetching evaluation for session: ${sessionId}`);

  const data = await strataxFetchJson(`${API_BASE_URL}/api/practice/session/${sessionId}/evaluation`, { method: 'GET' });
  console.log('✅ [Diagnostic] Evaluation response:', data);
  return data;
}

export async function quickStartInterview(
  voiceInput: string,
  autoMode: boolean = true,
  enableTTS: boolean = true,
  questionCount?: number,
  targetCompany?: string,
  targetRound?: InterviewRound
): Promise<QuickStartResponse> {
  const requestBody: any = {
    voice_input: voiceInput,
    auto_mode: autoMode,
    enable_tts: enableTTS,
  };

  // Add optional parameters if provided
  if (questionCount !== undefined && questionCount >= 1 && questionCount <= 10) {
    requestBody.question_count = questionCount;
  }

  if (targetCompany) {
    requestBody.target_company = targetCompany;
  }

  if (targetRound) {
    requestBody.target_round = targetRound;
  }

  return await strataxFetchJson(`${API_BASE_URL}/api/practice/interview/quick-start`, {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
}

/**
 * Get available interview rounds with recommendations
 */
export async function getAvailableRounds(
  experienceYears?: number,
  domain?: string
): Promise<AvailableRoundsResponse> {
  const params = new URLSearchParams();
  if (experienceYears !== undefined) {
    params.append('experience_years', experienceYears.toString());
  }
  if (domain) {
    params.append('domain', domain);
  }

  const url = `${API_BASE_URL}/api/practice/rounds/available${params.toString() ? '?' + params.toString() : ''}`;
  console.log('🌐 [API] Fetching rounds from:', url);
  console.log('📊 [API] Parameters:', { experienceYears, domain });

  const data = await strataxFetchJson<AvailableRoundsResponse>(url, { method: 'GET' });
  console.log('📡 [API] Response status: 200 OK');
  console.log('✅ [API] Response data:', data);
  return data;
}

/**
 * Start round-based interview
 */
export async function startRoundInterview(
  request: StartRoundRequest
): Promise<StartRoundResponse> {
  console.log('🚀 [API] Starting round interview:', request);

  const data = await strataxFetchJson<StartRoundResponse>(`${API_BASE_URL}/api/practice/interview/start-round`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
  console.log('✅ [API] Start round response:', data);
  return data;
}
