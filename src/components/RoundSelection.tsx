import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Code2,
  Layers,
  MessageCircle,
  Briefcase,
  Brain,
  Database,
  Smartphone,
  Server,
  Shield,
  Cloud,
  Target,
  Clock,
  TrendingUp,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Zap,
  Award,
  Loader2,
} from 'lucide-react';
import {
  InterviewRound,
  RoundConfig,
  getAvailableRounds,
  startRoundInterview,
  type UserProfile,
} from '@/lib/practiceModeApi';
import { useToast } from '@/hooks/use-toast';

interface RoundSelectionProps {
  onRoundStart: (sessionId: string, roundConfig: RoundConfig, firstQuestion: any, ttsAudioUrl?: string, totalQuestionsFromApi?: number) => void;
  userProfile?: UserProfile;
  ensureLiveMediaReady: () => Promise<{ screen_shared: boolean; camera_enabled: boolean }>;
}

// Icon mapping for each round type
const ROUND_ICONS: Record<InterviewRound, any> = {
  [InterviewRound.HR_SCREENING]: Users,
  [InterviewRound.TECHNICAL_ROUND_1]: Code2,
  [InterviewRound.TECHNICAL_ROUND_2]: Code2,
  [InterviewRound.SYSTEM_DESIGN]: Layers,
  [InterviewRound.BEHAVIORAL]: MessageCircle,
  [InterviewRound.MANAGERIAL]: Briefcase,
  [InterviewRound.MACHINE_LEARNING]: Brain,        // ✅ Fixed
  [InterviewRound.DATA_ENGINEERING]: Database,
  [InterviewRound.FRONTEND_SPECIALIST]: Smartphone,
  [InterviewRound.BACKEND_SPECIALIST]: Server,
  [InterviewRound.DEVOPS]: Cloud,                   // ✅ Fixed
  [InterviewRound.SECURITY]: Shield,
  [InterviewRound.FULL_INTERVIEW]: Award,
};

// Difficulty color mapping
const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  hard: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  mixed: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

// Round color gradients (fallback for backend data)
const ROUND_COLORS: Record<InterviewRound, string> = {
  [InterviewRound.HR_SCREENING]: 'from-blue-500 to-blue-600',
  [InterviewRound.TECHNICAL_ROUND_1]: 'from-purple-500 to-purple-600',
  [InterviewRound.TECHNICAL_ROUND_2]: 'from-purple-600 to-purple-700',
  [InterviewRound.SYSTEM_DESIGN]: 'from-orange-500 to-orange-600',
  [InterviewRound.BEHAVIORAL]: 'from-green-500 to-green-600',
  [InterviewRound.MANAGERIAL]: 'from-indigo-500 to-indigo-600',
  // Avoid pink-heavy accents to keep the Live Practice theme consistent.
  [InterviewRound.MACHINE_LEARNING]: 'from-indigo-500 to-indigo-600',
  [InterviewRound.DATA_ENGINEERING]: 'from-cyan-500 to-cyan-600',
  [InterviewRound.FRONTEND_SPECIALIST]: 'from-teal-500 to-teal-600',
  [InterviewRound.BACKEND_SPECIALIST]: 'from-violet-500 to-violet-600',
  [InterviewRound.DEVOPS]: 'from-sky-500 to-sky-600',                     // ✅ Fixed
  [InterviewRound.SECURITY]: 'from-red-500 to-red-600',
  [InterviewRound.FULL_INTERVIEW]: 'from-amber-500 to-amber-600',
};

// Domain keywords for smart filtering
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  backend: ['backend', 'python', 'java', 'node.js', 'node', 'go', 'c#', '.net', 'api', 'server'],
  frontend: ['frontend', 'react', 'vue', 'angular', 'javascript', 'typescript', 'ui', 'web'],
  ml: ['machine learning', 'ml', 'ai', 'data science', 'deep learning', 'neural'],
  data: ['data engineering', 'data engineer', 'etl', 'pipeline', 'spark', 'hadoop'],
  devops: ['devops', 'sre', 'cloud', 'aws', 'azure', 'gcp', 'kubernetes', 'docker'],
  security: ['security', 'cybersecurity', 'infosec', 'penetration', 'appsec'],
  mobile: ['mobile', 'ios', 'android', 'react native', 'flutter'],
  fullstack: ['full stack', 'fullstack', 'full-stack'],
};

// Core rounds shown to everyone
const CORE_ROUNDS = [
  InterviewRound.HR_SCREENING,
  InterviewRound.TECHNICAL_ROUND_1,
  InterviewRound.BEHAVIORAL,
];

// Advanced rounds for senior/experienced roles
const ADVANCED_ROUNDS = [
  InterviewRound.TECHNICAL_ROUND_2,
  InterviewRound.SYSTEM_DESIGN,
  InterviewRound.MANAGERIAL,
  InterviewRound.FULL_INTERVIEW,
];

// Detect domain category from domain string
const detectDomainCategory = (domain: string): string => {
  if (!domain) return 'general';

  const lowerDomain = domain.toLowerCase();

  for (const [category, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some(keyword => lowerDomain.includes(keyword))) {
      return category;
    }
  }

  return 'general';
};

// Get friendly name for domain category
const getDomainCategoryName = (category: string): string => {
  const names: Record<string, string> = {
    backend: 'Backend Development',
    frontend: 'Frontend Development',
    ml: 'Machine Learning',
    data: 'Data Engineering',
    devops: 'DevOps/SRE',
    security: 'Security Engineering',
    mobile: 'Mobile Development',
    fullstack: 'Full Stack Development',
    general: 'General Software Engineering',
  };

  return names[category] || 'General';
};

// Filter rounds based on domain
const filterRoundsByDomain = (rounds: RoundConfig[], domain: string): RoundConfig[] => {
  const domainCategory = detectDomainCategory(domain);

  console.log('🔧 [Filter] Filtering rounds for domain:', domain, '→ category:', domainCategory);

  const filtered = rounds.filter(round => {
    // Always show core rounds
    if (CORE_ROUNDS.includes(round.round_type)) {
      console.log('✅ [Filter] Core round:', round.round_type);
      return true;
    }

    // Always show advanced rounds
    if (ADVANCED_ROUNDS.includes(round.round_type)) {
      console.log('✅ [Filter] Advanced round:', round.round_type);
      return true;
    }

    // Filter specialist rounds based on domain
    let include = false;
    switch (domainCategory) {
      case 'backend':
        include = round.round_type === InterviewRound.BACKEND_SPECIALIST;
        break;
      case 'frontend':
        include = round.round_type === InterviewRound.FRONTEND_SPECIALIST;
        break;
      case 'ml':
        include = round.round_type === InterviewRound.MACHINE_LEARNING;
        break;
      case 'data':
        include = round.round_type === InterviewRound.DATA_ENGINEERING;
        break;
      case 'devops':
        include = round.round_type === InterviewRound.DEVOPS;
        break;
      case 'security':
        include = round.round_type === InterviewRound.SECURITY;
        break;
      case 'fullstack':
        // Show both frontend and backend for fullstack
        include = round.round_type === InterviewRound.BACKEND_SPECIALIST ||
          round.round_type === InterviewRound.FRONTEND_SPECIALIST;
        break;
      default:
        // For general/unknown domains, hide all specialist rounds
        include = ![
          InterviewRound.BACKEND_SPECIALIST,
          InterviewRound.FRONTEND_SPECIALIST,
          InterviewRound.MACHINE_LEARNING,
          InterviewRound.DATA_ENGINEERING,
          InterviewRound.DEVOPS,
          InterviewRound.SECURITY,
        ].includes(round.round_type);
    }

    console.log(`${include ? '✅' : '❌'} [Filter] Specialist round:`, round.round_type, '→', include);
    return include;
  });

  console.log('🎯 [Filter] Result:', filtered.length, 'of', rounds.length, 'rounds');
  return filtered;
};

export default function RoundSelection({ onRoundStart, userProfile, ensureLiveMediaReady }: RoundSelectionProps) {
  const { toast } = useToast();

  // If the user clicks "Start next targeted session" from Progress, we store a plan in localStorage.
  // RoundSelection will best-effort apply it (select round, set question count, set domain) and can auto-start.
  const [nextSessionPrefill] = useState<any | null>(() => {
    try {
      const raw = window.localStorage.getItem('practice_next_session_plan');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
  const [prefillApplied, setPrefillApplied] = useState(false);

  const [loading, setLoading] = useState(true);
  const [allRounds, setAllRounds] = useState<RoundConfig[]>([]);
  const [recommendedRounds, setRecommendedRounds] = useState<RoundConfig[]>([]);
  const [recommendedSequence, setRecommendedSequence] = useState<RoundConfig[]>([]);
  const [selectedRound, setSelectedRound] = useState<RoundConfig | null>(null);
  const [companySpecific, setCompanySpecific] = useState('');
  const [domain, setDomain] = useState(
    userProfile?.domain ||
    (typeof window !== 'undefined' ? window.localStorage.getItem('practice_last_domain') : '') ||
    nextSessionPrefill?.domain ||
    ''
  );
  const [experienceYears, setExperienceYears] = useState(userProfile?.experience_years || 0);
  const [questionCount, setQuestionCount] = useState<number>(
    typeof nextSessionPrefill?.question_count === 'number' && nextSessionPrefill.question_count >= 1
      ? nextSessionPrefill.question_count
      : 1
  );
  const [starting, setStarting] = useState(false);
  const [view, setView] = useState<'recommended' | 'all'>('recommended');

  const normalizeRoundType = (value: unknown): string => {
    if (!value) return '';
    return String(value).trim().toLowerCase().replace(/\s+/g, '_').replace(/-+/g, '_');
  };

  // Apply any stored next-session plan once rounds are loaded.
  useEffect(() => {
    if (loading) return;
    if (!nextSessionPrefill || prefillApplied) return;

    if (typeof nextSessionPrefill?.domain === 'string' && nextSessionPrefill.domain.trim() && !domain.trim()) {
      setDomain(nextSessionPrefill.domain.trim());
    }
    if (typeof nextSessionPrefill?.question_count === 'number' && nextSessionPrefill.question_count >= 1) {
      setQuestionCount(nextSessionPrefill.question_count);
    }

    const desired = normalizeRoundType(nextSessionPrefill?.recommended_round);
    if (desired) {
      const candidates = [...recommendedRounds, ...recommendedSequence, ...allRounds];
      const match = candidates.find((r) => normalizeRoundType(r.round_type) === desired);
      if (match) {
        setSelectedRound(match);
        setView('recommended');
      }
    }

    setPrefillApplied(true);
  }, [loading, nextSessionPrefill, prefillApplied, allRounds, recommendedRounds, recommendedSequence, domain]);

  useEffect(() => {
    loadRounds();
  }, [userProfile]);

  // Reload rounds when domain changes
  useEffect(() => {
    if (domain) {
      loadRounds();
    }
  }, [domain, experienceYears]);

  const loadRounds = async () => {
    setLoading(true);
    try {
      console.log('🔍 [Round Selection] Fetching rounds...');
      console.log('📊 [Round Selection] User Profile:', userProfile);

      const response = await getAvailableRounds(
        experienceYears || userProfile?.experience_years,
        domain || userProfile?.domain
      );

      console.log('✅ [Round Selection] API Response:', response);
      console.log('📋 [Round Selection] All Rounds:', response.all_rounds);
      console.log('⭐ [Round Selection] Recommended Rounds:', response.recommended_rounds);
      console.log('📈 [Round Selection] Recommended Sequence:', response.recommended_sequence);

      // Backend returns 'rounds' instead of 'all_rounds'
      const allRoundsData = response.all_rounds || response.rounds || [];
      const recommendedRoundsData = response.recommended_rounds || response.rounds || [];

      // Apply smart domain filtering
      const currentDomain = domain || userProfile?.domain || '';

      console.log('🎯 [Round Selection] Current domain:', currentDomain);
      console.log('🔍 [Round Selection] Domain category:', detectDomainCategory(currentDomain));
      console.log('📊 [Round Selection] Before filtering:', {
        allRounds: allRoundsData.length,
        recommended: recommendedRoundsData.length,
        allRoundTypes: allRoundsData.map(r => r.round_type),
      });

      const filteredAllRounds = currentDomain
        ? filterRoundsByDomain(allRoundsData, currentDomain)
        : allRoundsData;
      const filteredRecommendedRounds = currentDomain
        ? filterRoundsByDomain(recommendedRoundsData, currentDomain)
        : recommendedRoundsData;
      const filteredSequence = response.recommended_sequence && currentDomain
        ? filterRoundsByDomain(response.recommended_sequence, currentDomain)
        : (response.recommended_sequence || []);

      console.log('✂️ [Round Selection] After filtering:', {
        allRounds: filteredAllRounds.length,
        recommended: filteredRecommendedRounds.length,
        filteredRoundTypes: filteredAllRounds.map(r => r.round_type),
      });

      setAllRounds(filteredAllRounds);
      setRecommendedRounds(filteredRecommendedRounds);
      if (filteredSequence.length > 0) {
        setRecommendedSequence(filteredSequence);
      }

      console.log('✅ [Round Selection] State updated successfully');
      console.log('📊 [Round Selection] Setting allRounds:', filteredAllRounds.length, 'rounds');
      console.log('⭐ [Round Selection] Setting recommendedRounds:', filteredRecommendedRounds.length, 'rounds');
    } catch (error: any) {
      console.error('❌ [Round Selection] Failed to load rounds:', error);
      console.error('❌ [Round Selection] Error details:', {
        message: error.message,
        stack: error.stack,
      });
      toast({
        title: '❌ Failed to Load Rounds',
        description: error.message || 'Could not load interview rounds',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartRound = async () => {
    if (!selectedRound) return;

    // Validate domain is selected (CRITICAL)
    if (!domain && !userProfile?.domain) {
      toast({
        title: '⚠️ Domain Required',
        description: 'Please select your domain/specialization to get relevant questions',
        variant: 'destructive',
      });
      return;
    }

    setStarting(true);
    try {
      const gate = await ensureLiveMediaReady();

      const requestData: any = {
        round_type: selectedRound.round_type,
        domain: domain || userProfile?.domain || '',
        experience_years: parseInt(String(experienceYears || userProfile?.experience_years || 0)), // Ensure integer
        company_specific: companySpecific || undefined,
        enable_tts: true,
        screen_shared: !!gate.screen_shared,
        camera_enabled: !!gate.camera_enabled,
      };

      // Add question_count if user customized it (not using default)
      if (questionCount > 0 && questionCount >= 1 && questionCount <= 15) {
        requestData.question_count = questionCount;
      }

      console.log('🚀 [Round Selection] Starting round with:', requestData);
      console.log('📊 [Round Selection] Request validation:', {
        round_type_is_lowercase: requestData.round_type === requestData.round_type.toLowerCase(),
        domain_is_string: typeof requestData.domain === 'string',
        experience_is_number: typeof requestData.experience_years === 'number',
      });

      const response = await startRoundInterview(requestData);

      console.log('✅ [Round Selection] Response:', response);
      console.log('🔊 [Round Selection] TTS Audio URL:', response.tts_audio_url);

      toast({
        title: '🎯 Round Started!',
        description: `${selectedRound.name} interview has begun`,
      });

      // Clear the prefill so we don't auto-apply it on future visits.
      try {
        window.localStorage.removeItem('practice_next_session_plan');
      } catch { }

      // Use round_config from response, or fallback to selectedRound
      const roundConfig = response.round_config || selectedRound;

      // Pass TTS audio URL to parent component
      onRoundStart(
        response.session_id,
        roundConfig,
        response.first_question,
        response.tts_audio_url,
        response.total_questions
      );
    } catch (error: any) {
      console.error('❌ [Round Selection] Failed to start round:', error);

      // Try to parse detailed error information
      let errorMessage = 'Could not start the interview round';

      if (error.message) {
        try {
          // Check if it's a validation error with details
          const errorObj = JSON.parse(error.message);
          if (Array.isArray(errorObj.detail)) {
            errorMessage = errorObj.detail.map((e: any) =>
              `${e.loc?.join('.')}: ${e.msg}`
            ).join('; ');
          } else if (errorObj.detail) {
            errorMessage = errorObj.detail;
          }
        } catch {
          errorMessage = error.message;
        }
      }

      console.error('📋 [Round Selection] Error details:', errorMessage);

      toast({
        title: '❌ Failed to Start Round',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setStarting(false);
    }
  };

  // If the progress CTA requested auto-start, start once prefill is applied and we have a selected round.
  useEffect(() => {
    const autostart = !!nextSessionPrefill?._autostart;
    if (!autostart) return;
    if (!prefillApplied) return;
    if (starting) return;
    if (!selectedRound) return;

    const effectiveDomain = (domain || userProfile?.domain || '').trim();
    if (!effectiveDomain) return;

    // Fire once; handleStartRound sets `starting`.
    handleStartRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextSessionPrefill, prefillApplied, selectedRound, domain]);

  const RoundCard = ({ round, isRecommended = false }: { round: RoundConfig; isRecommended?: boolean }) => {
    const Icon = ROUND_ICONS[round.round_type] || Target;
    const colorGradient = round.color || ROUND_COLORS[round.round_type] || 'from-gray-500 to-gray-600';
    const isSelected = selectedRound?.round_type === round.round_type;
    const isDomainMissing = !domain && !userProfile?.domain;

    return (
      <Card
        className={`group cursor-pointer transition-all duration-300 hover:shadow-2xl hover:scale-[1.03] ${isSelected
          ? 'ring-2 ring-primary shadow-2xl scale-[1.02] border-primary/50'
          : 'hover:border-primary/30'
          } ${isDomainMissing ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => {
          if (isDomainMissing) {
            toast({
              title: '⚠️ Domain Required',
              description: 'Please select your domain first to choose a round',
              variant: 'destructive',
            });
            return;
          }
          setSelectedRound(round);
        }}
      >
        <CardHeader className="pb-3 sm:pb-4 px-4 sm:px-6">
          <div className="flex items-start justify-between gap-2 sm:gap-3">
            <div className="flex items-start gap-2 sm:gap-3 flex-1">
              <div className={`p-2 sm:p-3 rounded-xl bg-gradient-to-br ${colorGradient} shadow-lg group-hover:shadow-xl transition-shadow`}>
                <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base sm:text-lg mb-0.5 sm:mb-1 line-clamp-2">{round.name}</CardTitle>
                {isRecommended && (
                  <Badge variant="outline" className="text-[10px] sm:text-xs border-primary/30 bg-primary/5 px-1.5 py-0 sm:px-2 sm:py-0.5">
                    <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
                    Recommended
                  </Badge>
                )}
              </div>
            </div>
            {isSelected && (
              <div className="flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              </div>
            )}
          </div>
          <CardDescription className="mt-2 sm:mt-3 text-xs sm:text-sm leading-relaxed line-clamp-2 sm:line-clamp-3">
            {round.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Metrics */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-xs gap-1 px-2.5 py-1">
              <Clock className="w-3 h-3" />
              {round.duration_minutes} min
            </Badge>
            <Badge variant="secondary" className="text-xs gap-1 px-2.5 py-1">
              <Target className="w-3 h-3" />
              {round.question_count} Qs
            </Badge>
            <Badge className={`text-xs px-2.5 py-1 ${DIFFICULTY_COLORS[round.difficulty]}`}>
              {round.difficulty.charAt(0).toUpperCase() + round.difficulty.slice(1)}
            </Badge>
          </div>

          <Separator className="my-3" />

          {/* Focus Areas */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Focus Areas
            </p>
            <div className="flex flex-wrap gap-1.5">
              {round.focus_areas?.slice(0, 3).map((area, idx) => (
                <Badge key={idx} variant="outline" className="text-xs px-2 py-0.5 font-normal">
                  {area}
                </Badge>
              ))}
              {round.focus_areas && round.focus_areas.length > 3 && (
                <Badge variant="outline" className="text-xs px-2 py-0.5 font-medium bg-muted">
                  +{round.focus_areas.length - 3}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading interview rounds...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="w-full">
        <div className="container max-w-7xl mx-auto px-2 sm:px-4 pb-8 pt-10 sm:pt-4 space-y-4 sm:space-y-8">
          {!selectedRound ? (
            <>
              {/* Header - Only Main Title, No Icon, No Subtitle, No Black BG */}
              <div className="text-center py-2 sm:py-4">
                <h1 className="text-2xl sm:text-3xl md:text-5xl font-extrabold tracking-tight text-foreground/90 px-4">
                  Choose Your Interview Round
                </h1>
              </div>

              {/* Profile Setup Card - Redesigned */}
              <Card className="max-w-4xl mx-auto border border-border/50 bg-background/60 backdrop-blur-xl shadow-2xl shadow-black/40">
                <CardHeader className="pb-3 sm:pb-4 border-b border-border/50 px-4 sm:px-6">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
                      <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg sm:text-xl">Profile Setup (Required)</CardTitle>
                      <CardDescription className="mt-0.5 sm:mt-1 text-[10px] sm:text-sm">
                        Domain is <strong>MANDATORY</strong> for relevant questions.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Domain Selection - MANDATORY */}
                    <div className="space-y-2 sm:space-y-3">
                      <Label htmlFor="domain" className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
                        <span>Domain / Specialization</span>
                        <span className="text-red-500 text-base">*</span>
                      </Label>
                      <Select value={domain} onValueChange={setDomain}>
                        <SelectTrigger
                          id="domain"
                          className={`h-11 bg-background/40 ${!domain ? 'border-destructive/60 focus:ring-destructive/20' : 'border-border/50 focus:ring-primary/20'}`}
                        >
                          <SelectValue placeholder="Select your domain..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          <SelectItem value="Python Backend Development">Python Backend Development</SelectItem>
                          <SelectItem value="Java Backend Development">Java Backend Development</SelectItem>
                          <SelectItem value="JavaScript/Node.js Backend">JavaScript/Node.js Backend</SelectItem>
                          <SelectItem value="Go Backend Development">Go Backend Development</SelectItem>
                          <SelectItem value="C# .NET Development">C# .NET Development</SelectItem>
                          <SelectItem value="Frontend Development (React)">Frontend Development (React)</SelectItem>
                          <SelectItem value="Frontend Development (Vue)">Frontend Development (Vue)</SelectItem>
                          <SelectItem value="Frontend Development (Angular)">Frontend Development (Angular)</SelectItem>
                          <SelectItem value="Full Stack Development">Full Stack Development</SelectItem>
                          <SelectItem value="Mobile Development (iOS)">Mobile Development (iOS)</SelectItem>
                          <SelectItem value="Mobile Development (Android)">Mobile Development (Android)</SelectItem>
                          <SelectItem value="Mobile Development (React Native)">Mobile Development (React Native)</SelectItem>
                          <SelectItem value="Data Engineering">Data Engineering</SelectItem>
                          <SelectItem value="Machine Learning Engineering">Machine Learning Engineering</SelectItem>
                          <SelectItem value="Data Science">Data Science</SelectItem>
                          <SelectItem value="DevOps Engineering">DevOps Engineering</SelectItem>
                          <SelectItem value="Site Reliability Engineering (SRE)">Site Reliability Engineering (SRE)</SelectItem>
                          <SelectItem value="Cloud Engineering (AWS)">Cloud Engineering (AWS)</SelectItem>
                          <SelectItem value="Cloud Engineering (Azure)">Cloud Engineering (Azure)</SelectItem>
                          <SelectItem value="Cloud Engineering (GCP)">Cloud Engineering (GCP)</SelectItem>
                          <SelectItem value="Security Engineering">Security Engineering</SelectItem>
                          <SelectItem value="System Design & Architecture">System Design & Architecture</SelectItem>
                          <SelectItem value="Database Administration">Database Administration</SelectItem>
                          <SelectItem value="Product Management">Product Management</SelectItem>
                        </SelectContent>
                      </Select>
                      {!domain && (
                        <p className="text-xs text-red-500 flex items-center gap-1.5 font-medium">
                          <Target className="w-3.5 h-3.5" />
                          Domain is required for relevant questions
                        </p>
                      )}
                    </div>

                    {/* Experience Years */}
                    <div className="space-y-3">
                      <Label htmlFor="experience" className="text-xs sm:text-sm font-semibold">
                        Years of Experience
                      </Label>
                      <Input
                        id="experience"
                        type="number"
                        min="0"
                        max="30"
                        value={experienceYears || ''}
                        onChange={(e) => setExperienceYears(parseInt(e.target.value) || 0)}
                        placeholder="0-30 years"
                        className="h-11 bg-background/40 border-border/50 focus:ring-primary/20"
                        maxLength={3}
                      />
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        Helps personalize question difficulty
                      </p>
                    </div>

                    {/* Update Button */}
                    {(domain !== (userProfile?.domain || '') || experienceYears !== (userProfile?.experience_years || 0)) && (
                      <div className="md:col-span-2 pt-2">
                        <Button
                          onClick={loadRounds}
                          variant="outline"
                          className="w-full h-10 sm:h-11 border-primary/30 hover:bg-primary/10 text-xs sm:text-sm"
                          disabled={loading || !domain}
                        >
                          <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
                          Update Recommendations
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Domain Detection Info Banner */}
              {domain && (
                <Card className="max-w-4xl mx-auto border border-border/50 bg-muted/20 shadow-md">
                  <CardContent className="py-4">
                    <div className="flex flex-col md:flex-row items-center justify-center gap-3 text-center md:text-left">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-primary/20">
                          <Sparkles className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-semibold text-lg">
                          {getDomainCategoryName(detectDomainCategory(domain))}
                        </span>
                      </div>
                      <Separator className="hidden md:block h-6" orientation="vertical" />
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Target className="w-4 h-4" />
                        <span className="text-sm">{allRounds.length} specialized rounds available</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-3 px-4">
                <Button
                  variant={view === 'recommended' ? 'default' : 'outline'}
                  onClick={() => setView('recommended')}
                  className={`gap-2 px-4 sm:px-6 h-10 sm:h-11 transition-all text-xs sm:text-sm ${view === 'recommended'
                    ? 'shadow-lg shadow-primary/20'
                    : 'hover:border-primary/50'
                    }`}
                >
                  <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Recommended
                </Button>
                <Button
                  variant={view === 'all' ? 'default' : 'outline'}
                  onClick={() => setView('all')}
                  className={`gap-2 px-4 sm:px-6 h-10 sm:h-11 transition-all text-xs sm:text-sm ${view === 'all'
                    ? 'shadow-lg shadow-primary/20'
                    : 'hover:border-primary/50'
                    }`}
                >
                  <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  All Rounds
                </Button>
              </div>

              {/* Recommended Sequence Banner - Enhanced */}
              {view === 'recommended' && recommendedSequence && recommendedSequence.length > 0 && (
                <Card className="max-w-5xl mx-auto border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-primary/5 shadow-lg">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <TrendingUp className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">Recommended Interview Sequence</CardTitle>
                        <CardDescription className="mt-1">
                          Based on your experience level ({experienceYears} years), follow this sequence for optimal preparation
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="w-full">
                      <div className="flex items-center gap-3 pb-4">
                        {recommendedSequence?.map((round, idx) => {
                          const Icon = ROUND_ICONS[round.round_type];
                          return (
                            <div key={round.round_type} className="flex items-center gap-3 flex-shrink-0">
                              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border-2 border-primary/20 hover:border-primary/40 transition-all hover:shadow-md min-w-[200px]">
                                <div className="p-2 rounded-lg bg-primary/10">
                                  <Icon className="w-5 h-5 text-primary" />
                                </div>
                                <div className="flex-1">
                                  <span className="text-sm font-semibold block">{round.name}</span>
                                  <span className="text-xs text-muted-foreground">{round.question_count} questions</span>
                                </div>
                              </div>
                              {idx < recommendedSequence.length - 1 && (
                                <ArrowRight className="w-5 h-5 text-primary flex-shrink-0" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Rounds Grid - Enhanced Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-8">
                {(view === 'recommended' ? recommendedRounds : allRounds)?.map((round) => (
                  <RoundCard
                    key={round.round_type}
                    round={round}
                    isRecommended={view === 'recommended'}
                  />
                ))}
              </div>

              {/* No Rounds Message */}
              {(view === 'recommended' ? recommendedRounds : allRounds)?.length === 0 && (
                <Card className="max-w-2xl mx-auto border-2 border-dashed border-muted-foreground/30">
                  <CardContent className="py-12 text-center">
                    <Target className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium text-muted-foreground mb-2">
                      No rounds available
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {!domain
                        ? 'Please select a domain to see available interview rounds'
                        : 'Try selecting a different domain or view all rounds'}
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            /* Selection Confirmation Panel - Redesigned */
            <div className="max-w-3xl mx-auto pt-8">
              <Card className="border-2 border-primary/30 shadow-2xl bg-gradient-to-br from-card to-muted/5">
                <CardHeader className="border-b pb-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`p-3 rounded-xl bg-gradient-to-br ${ROUND_COLORS[selectedRound.round_type]} shadow-lg`}>
                        {(() => {
                          const Icon = ROUND_ICONS[selectedRound.round_type];
                          return <Icon className="w-7 h-7 text-white" />;
                        })()}
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-2xl flex items-center gap-2 mb-2">
                          {selectedRound.name}
                        </CardTitle>
                        <CardDescription className="text-base leading-relaxed">
                          {selectedRound.description}
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedRound(null)}
                      disabled={starting}
                      className="flex-shrink-0"
                    >
                      Change
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {/* Round Metrics - Dynamic based on question count */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-muted/50 border">
                      <Clock className="w-5 h-5 text-primary mb-2" />
                      <span className="text-2xl font-bold">
                        {questionCount > 0
                          ? Math.round((questionCount / selectedRound.question_count) * selectedRound.duration_minutes)
                          : selectedRound.duration_minutes
                        }
                      </span>
                      <span className="text-xs text-muted-foreground mt-1">Minutes</span>
                    </div>
                    <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-muted/50 border">
                      <Target className="w-5 h-5 text-primary mb-2" />
                      <span className="text-2xl font-bold">
                        {questionCount > 0 ? questionCount : selectedRound.question_count}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1">Questions</span>
                    </div>
                    <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-muted/50 border">
                      <TrendingUp className="w-5 h-5 text-primary mb-2" />
                      <span className="text-lg font-bold capitalize">{selectedRound.difficulty}</span>
                      <span className="text-xs text-muted-foreground mt-1">Difficulty</span>
                    </div>
                  </div>

                  <Separator />

                  {/* Profile Summary */}
                  <div className="space-y-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 rounded-md bg-primary/10">
                        <Sparkles className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-semibold">Your Profile</span>
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-background/80">
                        <span className="text-sm text-muted-foreground">Domain:</span>
                        <span className="text-sm font-semibold">{domain || userProfile?.domain || '❌ Not Selected'}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-background/80">
                        <span className="text-sm text-muted-foreground">Experience:</span>
                        <span className="text-sm font-semibold">{experienceYears || userProfile?.experience_years || 0} years</span>
                      </div>
                    </div>
                    {(!domain && !userProfile?.domain) && (
                      <div className="flex items-center gap-2 p-3 mt-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
                        <Target className="w-4 h-4 text-red-500" />
                        <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                          Go back and select your domain to start
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Company-Specific Input */}
                  <div className="space-y-3">
                    <Label htmlFor="company" className="text-sm font-semibold flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      Company-Specific Preparation (Optional)
                    </Label>
                    <Input
                      id="company"
                      placeholder="e.g., Google, Meta, Amazon, Netflix, Microsoft..."
                      value={companySpecific}
                      onChange={(e) => setCompanySpecific(e.target.value)}
                      className="h-11"
                    />
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Get questions tailored to specific companies' interview styles
                    </p>
                  </div>

                  {/* Question Count Selector - NEW */}
                  <div className="space-y-3">
                    <Label htmlFor="questionCount" className="text-sm font-semibold flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Number of Questions
                    </Label>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {questionCount === 0 ? `Default (${selectedRound.question_count})` : questionCount}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          1-15 questions
                        </span>
                      </div>
                      <input
                        id="questionCount"
                        type="range"
                        min="0"
                        max="15"
                        value={questionCount}
                        onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        {questionCount === 0
                          ? 'Using default count for this round type'
                          : `Custom: ${questionCount} question${questionCount !== 1 ? 's' : ''}`
                        }
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedRound(null)}
                      disabled={starting}
                      size="lg"
                      className="sm:flex-1 h-12"
                    >
                      <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
                      Back to Selection
                    </Button>
                    <Button
                      onClick={handleStartRound}
                      disabled={starting || (!domain && !userProfile?.domain)}
                      className="sm:flex-1 h-12 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg shadow-primary/20"
                      size="lg"
                    >
                      {starting ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Starting Interview...
                        </>
                      ) : (!domain && !userProfile?.domain) ? (
                        <>
                          <Target className="w-5 h-5 mr-2" />
                          Select Domain First
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5 mr-2" />
                          Start Interview Round
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
