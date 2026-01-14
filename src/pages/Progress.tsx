import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress as ProgressBar } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Award,
  Target,
  Calendar,
  Loader2,
  BarChart3,
  Sparkles,
  Play,
  AlertCircle,
} from 'lucide-react';
import {
  getProgressSummary,
  getProgressHeatmap,
  getNextSessionPlan,
  type ProgressSummary,
  type HeatmapPoint,
  type NextSessionPlan,
} from '@/lib/progressApi';

export default function Progress() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const aliveRef = useRef(true);
  const retriedOnceRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapPoint[]>([]);
  const [nextPlan, setNextPlan] = useState<NextSessionPlan | null>(null);
  const [lookbackDays, setLookbackDays] = useState(30);

  useEffect(() => {
    return () => {
      aliveRef.current = false;
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Switching lookback should reset the one-time retry.
    retriedOnceRef.current = false;
    loadProgressData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookbackDays]);

  const loadProgressData = async () => {
    setLoading(true);
    try {
      const [summaryData, heatmapData, planData] = await Promise.all([
        getProgressSummary(lookbackDays),
        getProgressHeatmap(90), // Always use 90 days for heatmap
        getNextSessionPlan(),
      ]);

      if (!aliveRef.current) return;

      setSummary(summaryData);
      setHeatmap(heatmapData);
      setNextPlan(planData);

      // If we just completed a session and the DB write is async, retry ONCE after a short delay.
      // Use refs (not state) to avoid stale-closure infinite loops.
      if (summaryData.attempts === 0 && !retriedOnceRef.current) {
        retriedOnceRef.current = true;
        if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = window.setTimeout(() => {
          loadProgressData();
        }, 1500);
      }
    } catch (error) {
      console.error('Failed to load progress data:', error);
      if (!aliveRef.current) return;
      toast({
        title: 'Error loading progress',
        description: 'Failed to fetch your progress data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  };

  const handleStartTargetedSession = () => {
    if (!nextPlan) return;

    // Persist plan so PracticeMode/RoundSelection can auto-apply it.
    try {
      window.localStorage.setItem('practice_next_session_plan', JSON.stringify({ ...nextPlan, _autostart: true }));
    } catch {
      // Ignore storage failures; user can still start manually.
    }

    // Open the main app with the practice tab selected.
    navigate('/app', {
      state: {
        openTab: 'practice',
      },
    });
  };

  const getScoreColor = (score: number): string => {
    if (score >= 85) return 'text-green-600 dark:text-green-400';
    if (score >= 70) return 'text-blue-600 dark:text-blue-400';
    if (score >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBgColor = (score: number): string => {
    if (score >= 85) return 'bg-green-500/10 border-green-500/20';
    if (score >= 70) return 'bg-blue-500/10 border-blue-500/20';
    if (score >= 50) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-red-500/10 border-red-500/20';
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  // Group heatmap by dimension for line chart
  const groupHeatmapByDimension = () => {
    const grouped: Record<string, { week: string; score: number; attempts: number }[]> = {};
    heatmap.forEach((point) => {
      if (!grouped[point.dimension]) {
        grouped[point.dimension] = [];
      }
      grouped[point.dimension].push({
        week: point.week_start,
        score: point.avg_score,
        attempts: point.attempts,
      });
    });
    return grouped;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Empty state - no attempts yet
  if (!summary || summary.attempts === 0) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Your Progress</h1>
          <p className="text-muted-foreground">Track your practice journey and identify areas for improvement</p>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BarChart3 className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No attempts yet</h3>
            <p className="text-muted-foreground text-center mb-6">
              Start Practice Mode to begin tracking your progress and get personalized recommendations.
            </p>
            <Button size="lg" onClick={() => navigate('/app', { state: { openTab: 'practice' } })}>
              <Play className="mr-2" />
              Start Practice Mode
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const groupedHeatmap = groupHeatmapByDimension();

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold mb-2">Your Progress</h1>
          <p className="text-muted-foreground">Last {lookbackDays} days of practice</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={lookbackDays === 7 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLookbackDays(7)}
          >
            7 days
          </Button>
          <Button
            variant={lookbackDays === 30 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLookbackDays(30)}
          >
            30 days
          </Button>
          <Button
            variant={lookbackDays === 90 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLookbackDays(90)}
          >
            90 days
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-180px)]">
        <div className="space-y-6 pb-8">
          {/* Summary Card */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-6 h-6 text-primary" />
                Performance Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Average Score - Big Number */}
                <div className="md:col-span-2 flex flex-col justify-center items-center p-6 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5">
                  <p className="text-sm text-muted-foreground mb-2">Average Overall Score</p>
                  <p className={`text-6xl font-bold ${getScoreColor(summary.avg_overall_score)}`}>
                    {summary.avg_overall_score.toFixed(0)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {summary.attempts} attempt{summary.attempts !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Best & Worst Dimensions */}
                <div className="space-y-4">
                  {summary.best_dimension && (
                    <div className={`p-4 rounded-lg border ${getScoreBgColor(summary.best_dimension.score)}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                          BEST
                        </span>
                      </div>
                      <p className="font-semibold capitalize">{summary.best_dimension.name}</p>
                      <p className={`text-2xl font-bold ${getScoreColor(summary.best_dimension.score)}`}>
                        {summary.best_dimension.score.toFixed(0)}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {summary.worst_dimension && (
                    <div className={`p-4 rounded-lg border ${getScoreBgColor(summary.worst_dimension.score)}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                          WEAKEST
                        </span>
                      </div>
                      <p className="font-semibold capitalize">{summary.worst_dimension.name}</p>
                      <p className={`text-2xl font-bold ${getScoreColor(summary.worst_dimension.score)}`}>
                        {summary.worst_dimension.score.toFixed(0)}
                      </p>
                    </div>
                  )}

                  {/* Last Practiced */}
                  <div className="p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground">
                        LAST PRACTICED
                      </span>
                    </div>
                    <p className="text-sm font-medium">
                      {formatDate(summary.last_completed_at)}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Next Targeted Session CTA */}
          {nextPlan ? (
            <Card className="border-2 border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-6 h-6 text-primary" />
                  Next Targeted Session
                </CardTitle>
                <CardDescription>
                  Recommended based on your weaknesses
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-3 flex-1">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="capitalize">
                        Focus: {nextPlan.focus_dimension}
                      </Badge>
                      <Badge variant="outline">
                        {nextPlan.question_count} questions
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {nextPlan.difficulty}
                      </Badge>
                      <Badge variant="outline">
                        {nextPlan.recommended_round}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {nextPlan.reason}
                    </p>
                  </div>
                  <Button size="lg" onClick={handleStartTargetedSession} className="shrink-0">
                    <Sparkles className="mr-2" />
                    Start Session
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center">
                  <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Complete more practice sessions to get personalized recommendations
                  </p>
                  <Button className="mt-4" onClick={() => navigate('/app', { state: { openTab: 'practice' } })}>
                    <Play className="mr-2" />
                    Start Your First Session
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Weakness Heatmap */}
          {heatmap.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-6 h-6" />
                  Performance Over Time
                </CardTitle>
                <CardDescription>
                  Weekly average scores by dimension (last 90 days)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {Object.entries(groupedHeatmap).map(([dimension, data]) => (
                    <div key={dimension}>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold capitalize">{dimension}</h4>
                        <span className="text-xs text-muted-foreground">
                          {data.reduce((sum, d) => sum + d.attempts, 0)} attempts
                        </span>
                      </div>
                      <div className="space-y-2">
                        {data.map((point, idx) => {
                          const weekLabel = new Date(point.week).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          });
                          return (
                            <div key={idx} className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground w-16 shrink-0">
                                {weekLabel}
                              </span>
                              <div className="flex-1 flex items-center gap-2">
                                <ProgressBar
                                  value={point.score}
                                  className="h-3"
                                />
                                <span className={`text-sm font-semibold w-10 ${getScoreColor(point.score)}`}>
                                  {point.score.toFixed(0)}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground w-12 text-right">
                                {point.attempts} test{point.attempts !== 1 ? 's' : ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
