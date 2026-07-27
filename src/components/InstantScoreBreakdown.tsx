import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, Award, Target, TrendingUp } from 'lucide-react';
import { getSessionScore, type SessionScore } from '@/lib/progressApi';
import { StrataxApiError } from '@/lib/strataxClient';

interface InstantScoreBreakdownProps {
  sessionId: string;
  onViewProgress?: () => void;
}

export default function InstantScoreBreakdown({ sessionId, onViewProgress }: InstantScoreBreakdownProps) {
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<SessionScore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadScore();
  }, [sessionId]);

  const loadScore = async () => {
    setLoading(true);
    setError(null);
    try {
      const scoreData = await getSessionScore(sessionId);
      setScore(scoreData);
    } catch (err) {
      console.error('Failed to load session score:', err);
      if (err instanceof StrataxApiError) {
        if (err.status === 404) {
          setError('Score breakdown not available yet (endpoint not deployed)');
        } else {
          setError(`Could not load score breakdown (${err.status})`);
        }
      } else {
        setError('Could not load score breakdown');
      }
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (value: number): string => {
    if (value >= 85) return 'text-green-600 dark:text-green-400';
    if (value >= 70) return 'text-blue-600 dark:text-blue-400';
    if (value >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBgColor = (value: number): string => {
    if (value >= 85) return 'bg-green-500/10';
    if (value >= 70) return 'bg-blue-500/10';
    if (value >= 50) return 'bg-amber-500/10';
    return 'bg-red-500/10';
  };

  if (loading) {
    return (
      <Card className="border-2">
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading your score breakdown...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !score) {
    return (
      <Card className="border-2 border-amber-500/30">
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">{error || 'Score not available'}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={loadScore}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const dimensions = Object.entries(score.dimension_scores).sort((a, b) => b[1] - a[1]);

  const whyItems = Array.isArray(score.why)
    ? score.why.filter((item) => typeof item === 'string' && item.trim())
    : [];

  const nextSessionPlan = score.next_session_plan && typeof score.next_session_plan === 'object'
    ? score.next_session_plan
    : null;
  const nextSessionFocus = Array.isArray(nextSessionPlan?.focus)
    ? nextSessionPlan.focus.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const nextSessionFocusDimension = typeof nextSessionPlan?.focus_dimension === 'string' ? nextSessionPlan.focus_dimension : null;
  const nextSessionRound = typeof nextSessionPlan?.recommended_round === 'string' ? nextSessionPlan.recommended_round : null;
  const nextSessionDifficulty = typeof nextSessionPlan?.difficulty === 'string' ? nextSessionPlan.difficulty : null;
  const nextSessionQuestionCount = typeof nextSessionPlan?.question_count === 'number' ? nextSessionPlan.question_count : null;

  const screenUrl =
    (typeof score.screen_recording_url === 'string' ? score.screen_recording_url : '') ||
    (typeof score.media?.screen_recording_url === 'string' ? score.media.screen_recording_url : '');
  const cameraUrl =
    (typeof score.camera_recording_url === 'string' ? score.camera_recording_url : '') ||
    (typeof score.media?.camera_recording_url === 'string' ? score.media.camera_recording_url : '');
  const proctoringStatus = typeof score.proctoring_summary?.status === 'string' ? score.proctoring_summary.status : '';
  const riskLevel = typeof score.risk_level === 'string'
    ? score.risk_level
    : typeof score.proctoring_summary?.risk_level === 'string'
      ? score.proctoring_summary.risk_level
      : '';
  const terminatedReason = typeof score.terminated_reason === 'string'
    ? score.terminated_reason
    : typeof score.proctoring_summary?.terminated_reason === 'string'
      ? score.proctoring_summary.terminated_reason
      : '';
  const violationCount = typeof score.total_violation_count === 'number'
    ? score.total_violation_count
    : typeof score.violation_count === 'number'
      ? score.violation_count
      : typeof score.proctoring_summary?.total_violations === 'number'
        ? score.proctoring_summary.total_violations
        : typeof score.proctoring_summary?.violation_count === 'number'
          ? score.proctoring_summary.violation_count
          : null;
  const seriousViolationCount = typeof score.serious_violation_count === 'number'
    ? score.serious_violation_count
    : typeof score.proctoring_summary?.serious_violations === 'number'
      ? score.proctoring_summary.serious_violations
      : null;
  const eventCounts = score.event_counts
    ? Object.entries(score.event_counts)
    : score.proctoring_summary?.event_counts && typeof score.proctoring_summary.event_counts === 'object'
      ? Object.entries(score.proctoring_summary.event_counts as Record<string, number>)
      : [];
  const proctoringEvents = Array.isArray(score.recent_events)
    ? score.recent_events
    : Array.isArray(score.events)
      ? score.events
      : Array.isArray(score.proctoring_summary?.recent_events)
        ? score.proctoring_summary.recent_events
        : Array.isArray(score.proctoring_summary?.events)
          ? score.proctoring_summary.events
          : [];

  return (
    <div className="space-y-6">
      {/* Overall Score Card */}
      <Card className="border-2 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="w-6 h-6 text-primary" />
            Your Score Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 sm:gap-3 mb-2">
              <span className={`text-5xl sm:text-7xl font-bold ${getScoreColor(score.overall_score)}`}>
                {score.overall_score.toFixed(0)}
              </span>
              <span className="text-xl sm:text-3xl text-muted-foreground">/100</span>
            </div>
            <Progress value={score.overall_score} className="h-3 max-w-md mx-auto" />
          </div>

          {/* Dimension Bars */}
          <div className="space-y-3 mt-6">
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Dimension Scores</h4>
            {dimensions.map(([dimension, value]) => (
              <div key={dimension} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="capitalize font-medium">{dimension}</span>
                  <span className={`font-bold ${getScoreColor(value)}`}>
                    {value.toFixed(0)}
                  </span>
                </div>
                <div className="relative">
                  <Progress value={value} className="h-2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Why You Got This Score */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Why You Got This Score</CardTitle>
        </CardHeader>
        <CardContent>
          {whyItems.length > 0 ? (
            <ul className="space-y-2">
              {whyItems.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                  <span className="text-primary mt-0.5 shrink-0">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">No explanation available.</p>
          )}
        </CardContent>
      </Card>

      {/* Plans */}
      {(Array.isArray(score.improvement_plan) && score.improvement_plan.length > 0) ||
      (Array.isArray(score.next_session_plan) && score.next_session_plan.length > 0) ? (
        <div className={`grid gap-4 ${
          (Array.isArray(score.improvement_plan) && score.improvement_plan.length > 0) &&
          (Array.isArray(score.next_session_plan) && score.next_session_plan.length > 0)
            ? 'md:grid-cols-2'
            : 'grid-cols-1'
        }`}>
          {Array.isArray(score.improvement_plan) && score.improvement_plan.length > 0 && (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  Improvement Plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {score.improvement_plan.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                        {idx + 1}
                      </div>
                      <span className="text-sm flex-1">{step}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {nextSessionPlan && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-green-600 dark:text-green-400">
                  <TrendingUp className="w-5 h-5" />
                  Next Session Plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {nextSessionFocusDimension && <Badge variant="outline">Focus: {nextSessionFocusDimension}</Badge>}
                    {nextSessionRound && <Badge variant="outline">Round: {nextSessionRound}</Badge>}
                    {nextSessionDifficulty && <Badge variant="outline" className="capitalize">Difficulty: {nextSessionDifficulty}</Badge>}
                    {typeof nextSessionQuestionCount === 'number' && <Badge variant="outline">Questions: {nextSessionQuestionCount}</Badge>}
                  </div>

                  {nextSessionFocus.length > 0 && (
                    <ul className="space-y-2">
                      {nextSessionFocus.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <span className="text-green-600 dark:text-green-400 shrink-0">✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {nextSessionFocus.length === 0 && (
                    <p className="text-sm text-muted-foreground">Structured next-session guidance is available for this attempt.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      {/* Live Practice: Recordings */}
      {(!!screenUrl || !!cameraUrl) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recordings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {!!screenUrl && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Screen recording</span>
                  <a className="text-primary underline underline-offset-4" href={screenUrl} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </div>
              )}
              {!!cameraUrl && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Camera recording</span>
                  <a className="text-primary underline underline-offset-4" href={cameraUrl} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live Practice: Proctoring summary */}
      {(proctoringStatus || violationCount !== null || seriousViolationCount !== null || proctoringEvents.length > 0 || terminatedReason) && (
        <Card className={violationCount && violationCount > 0 ? 'border-amber-500/30 bg-amber-500/5' : ''}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              Proctoring Summary
              <div className="flex items-center gap-2">
                {riskLevel && (
                  <Badge variant={riskLevel === 'warning' || riskLevel === 'serious' ? 'destructive' : 'secondary'}>
                    {riskLevel}
                  </Badge>
                )}
                {violationCount !== null && (
                  <Badge variant={violationCount > 0 ? 'destructive' : 'secondary'}>
                    {violationCount} violation{violationCount === 1 ? '' : 's'}
                  </Badge>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(proctoringStatus || seriousViolationCount !== null || terminatedReason || eventCounts.length > 0) && (
              <div className="mb-4 space-y-3">
                {(proctoringStatus || riskLevel) && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {proctoringStatus && (
                      <Badge variant="outline">
                        Status: {proctoringStatus.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Badge>
                    )}
                    {seriousViolationCount !== null && (
                      <Badge variant="outline">Serious violations: {seriousViolationCount}</Badge>
                    )}
                  </div>
                )}

                {terminatedReason && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Termination reason:</span> {terminatedReason}
                  </div>
                )}

                {eventCounts.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {eventCounts.map(([eventType, count]) => (
                      <div key={eventType} className="rounded-md border border-border/50 bg-card/50 px-3 py-2 text-sm flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          {eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                        <span className="font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {proctoringEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No proctoring events recorded.</p>
            ) : (
              <div className="space-y-2">
                {proctoringEvents.slice(0, 20).map((evt, idx) => {
                  const e = evt as Record<string, unknown>;
                  // Format event type: WINDOW_MINIMIZED → Window Minimized
                  const rawType = String(e.event_type ?? e.type ?? e.event ?? e.name ?? JSON.stringify(evt));
                  const label = rawType
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (c) => c.toUpperCase());
                  const ts = e.timestamp ?? e.created_at ?? e.time;
                  const detail = e.detail ?? e.details ?? e.message ?? e.description;
                  const timeStr = typeof ts === 'string'
                    ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : null;

                  return (
                    <div key={idx} className="flex items-center gap-3 text-sm rounded-md border border-border/50 bg-card/50 px-3 py-2">
                      <span className="text-amber-500 shrink-0">⚠️</span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{label}</span>
                        {typeof detail === 'string' && detail && (
                          <span className="text-muted-foreground ml-1.5">— {detail}</span>
                        )}
                      </div>
                      {timeStr && (
                        <span className="text-xs text-muted-foreground shrink-0">{timeStr}</span>
                      )}
                    </div>
                  );
                })}
                {proctoringEvents.length > 20 && (
                  <p className="text-xs text-muted-foreground">Showing first 20 events.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Next Session Button */}
      {onViewProgress && (
        <div className="flex justify-center">
          <Button size="lg" onClick={onViewProgress} className="px-8">
            <Award className="mr-2" />
            View Full Progress
          </Button>
        </div>
      )}
    </div>
  );
}
