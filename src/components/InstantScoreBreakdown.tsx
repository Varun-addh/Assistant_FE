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
            <div className="flex items-center justify-center gap-3 mb-2">
              <span className={`text-7xl font-bold ${getScoreColor(score.overall_score)}`}>
                {score.overall_score.toFixed(0)}
              </span>
              <span className="text-3xl text-muted-foreground">/100</span>
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
          {score.why ? (
            <p className="text-sm text-muted-foreground leading-relaxed">{score.why}</p>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">No explanation available.</p>
          )}
        </CardContent>
      </Card>

      {/* Plans */}
      {(Array.isArray(score.improvement_plan) && score.improvement_plan.length > 0) ||
      (Array.isArray(score.next_session_plan) && score.next_session_plan.length > 0) ? (
        <div className="grid md:grid-cols-2 gap-4">
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

          {Array.isArray(score.next_session_plan) && score.next_session_plan.length > 0 && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-green-600 dark:text-green-400">
                  <TrendingUp className="w-5 h-5" />
                  Next Session Plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {score.next_session_plan.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-green-600 dark:text-green-400 shrink-0">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

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
