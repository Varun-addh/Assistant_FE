import { useMemo, useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress as ProgressBar } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
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
  RefreshCcw,
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
      const hasAnyProgressSignal =
        (summaryData.attempts ?? 0) > 0 ||
        Boolean(summaryData.last_completed_at) ||
        (summaryData.average_overall_score ?? 0) > 0 ||
        heatmapData.some((p) => (p.attempts ?? 0) > 0);

      if (!hasAnyProgressSignal && !retriedOnceRef.current) {
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

  const formatWeekShort = (isoDate: string): string => {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const normalizeKey = (value: string): string => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');

  const hasAnyProgressSignal =
    Boolean(summary?.last_completed_at) ||
    (summary?.attempts ?? 0) > 0 ||
    (summary?.average_overall_score ?? 0) > 0 ||
    heatmap.some((p) => (p.attempts ?? 0) > 0);

  const nextPlanFields = useMemo(() => {
    const plan = nextPlan ?? null;
    const getStr = (k: string): string | null => {
      const v = plan?.[k];
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    };
    const getNum = (k: string): number | null => {
      const v = plan?.[k];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    };

    return {
      focus_dimension: getStr('focus_dimension') ?? getStr('focus') ?? null,
      recommended_round: getStr('recommended_round') ?? getStr('round') ?? null,
      difficulty: getStr('difficulty') ?? null,
      reason: getStr('reason') ?? null,
      question_count: getNum('question_count') ?? getNum('questions') ?? null,
    };
  }, [nextPlan]);

  const { timeSeries, dimensionKeyToLabel, dimensionKeys } = useMemo(() => {
    const keyToLabel = new Map<string, string>();
    const byWeek = new Map<string, Record<string, unknown>>();

    for (const point of heatmap) {
      const key = normalizeKey(point.dimension);
      keyToLabel.set(key, point.dimension);

      const week = point.week_start;
      const row = byWeek.get(week) ?? { week_start: week };
      row[key] = point.avg_score;
      byWeek.set(week, row);
    }

    const series = Array.from(byWeek.values()).sort((a, b) => {
      const da = new Date(String(a.week_start)).getTime();
      const db = new Date(String(b.week_start)).getTime();
      return (Number.isNaN(da) ? 0 : da) - (Number.isNaN(db) ? 0 : db);
    });

    const keys = Array.from(keyToLabel.keys());

    return {
      timeSeries: series,
      dimensionKeyToLabel: Object.fromEntries(Array.from(keyToLabel.entries())),
      dimensionKeys: keys,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatmap]);

  const chartConfig: ChartConfig = useMemo(() => {
    const basePalette: Record<string, { light: string; dark: string }> = {
      correctness: { light: 'hsl(221 83% 53%)', dark: 'hsl(217 91% 60%)' },
      delivery: { light: 'hsl(142 71% 45%)', dark: 'hsl(142 70% 45%)' },
      clarity: { light: 'hsl(38 92% 50%)', dark: 'hsl(43 96% 56%)' },
      structure: { light: 'hsl(262 83% 58%)', dark: 'hsl(263 70% 64%)' },
    };

    const fallback = [
      { light: 'hsl(221 83% 53%)', dark: 'hsl(217 91% 60%)' },
      { light: 'hsl(142 71% 45%)', dark: 'hsl(142 70% 45%)' },
      { light: 'hsl(38 92% 50%)', dark: 'hsl(43 96% 56%)' },
      { light: 'hsl(262 83% 58%)', dark: 'hsl(263 70% 64%)' },
      { light: 'hsl(199 89% 48%)', dark: 'hsl(199 89% 48%)' },
      { light: 'hsl(0 84% 60%)', dark: 'hsl(0 84% 60%)' },
    ];

    const cfg: ChartConfig = {};
    dimensionKeys.forEach((key, idx) => {
      const palette = basePalette[key] ?? fallback[idx % fallback.length];
      cfg[key] = {
        label: dimensionKeyToLabel[key] ?? key,
        theme: { light: palette.light, dark: palette.dark },
      };
    });
    return cfg;
  }, [dimensionKeyToLabel, dimensionKeys]);

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


  const groupedHeatmap = groupHeatmapByDimension();

  const header = (
    <div className="border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Progress</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {loading ? 'Loading your analytics…' : `Last ${lookbackDays} days of practice`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border bg-card/50 p-1">
              <Button
                variant={lookbackDays === 7 ? 'default' : 'ghost'}
                size="sm"
                className="h-8 rounded-full px-3"
                onClick={() => setLookbackDays(7)}
              >
                7d
              </Button>
              <Button
                variant={lookbackDays === 30 ? 'default' : 'ghost'}
                size="sm"
                className="h-8 rounded-full px-3"
                onClick={() => setLookbackDays(30)}
              >
                30d
              </Button>
              <Button
                variant={lookbackDays === 90 ? 'default' : 'ghost'}
                size="sm"
                className="h-8 rounded-full px-3"
                onClick={() => setLookbackDays(90)}
              >
                90d
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => {
                retriedOnceRef.current = false;
                loadProgressData();
              }}
              aria-label="Refresh progress"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
              Refresh
            </Button>

            <Button
              size="sm"
              className="h-9"
              onClick={() => navigate('/app', { state: { openTab: 'practice' } })}
            >
              <Play className="w-4 h-4 mr-2" />
              Practice
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  const loadingView = (
    <div className="space-y-6 pb-10">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <Card className="md:col-span-7 border-2">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-6 w-20" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-12 w-32" />
                </div>
                <Skeleton className="h-10 w-28" />
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-5 border-2">
          <CardHeader className="pb-4">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>
    </div>
  );

  const emptyView = (
    <Card className="border-dashed">
      <CardContent className="py-14 sm:py-16">
        <div className="mx-auto max-w-lg text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl border bg-muted/30 flex items-center justify-center">
            <BarChart3 className="w-7 h-7 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">No attempts yet</h2>
            <p className="text-sm text-muted-foreground">
              Start a practice session to unlock analytics, trends, and personalized recommendations.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button size="lg" onClick={() => navigate('/app', { state: { openTab: 'practice' } })}>
              <Play className="mr-2" />
              Start Practice
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                retriedOnceRef.current = false;
                loadProgressData();
              }}
            >
              <RefreshCcw className="mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const dataView = summary ? (
    <div className="space-y-6 pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Overview */}
        <Card className="lg:col-span-7 border-2">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                Overview
              </CardTitle>
              <Badge variant="outline" className="font-medium">
                {summary.attempts} attempt{summary.attempts !== 1 ? 's' : ''}
              </Badge>
            </div>
            <CardDescription>
              A quick snapshot of your recent performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 rounded-xl border bg-gradient-to-br from-primary/10 to-primary/5 p-5">
                <div className="flex items-end justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Average Overall Score</div>
                    <div className="flex items-end gap-2">
                      <div
                        className={`text-5xl font-bold tracking-tight ${getScoreColor(summary.average_overall_score ?? 0)}`}
                      >
                        {typeof summary.average_overall_score === 'number'
                          ? summary.average_overall_score.toFixed(0)
                          : '—'}
                      </div>
                      <div className="text-muted-foreground pb-1">/100</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Last practiced</div>
                    <div className="text-sm font-medium">{formatDate(summary.last_completed_at)}</div>
                  </div>
                </div>
                <div className="mt-4">
                  <ProgressBar value={summary.average_overall_score ?? 0} className="h-3" />
                </div>
              </div>

              <div className="rounded-xl border bg-card/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">Best Dimension</div>
                  <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                {summary.best_dimension ? (
                  <div className="mt-2">
                    <div className="font-medium capitalize">{summary.best_dimension}</div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-muted-foreground">—</div>
                )}
              </div>

              <div className="rounded-xl border bg-card/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">Weakest Dimension</div>
                  <TrendingDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                {summary.worst_dimension ? (
                  <div className="mt-2">
                    <div className="font-medium capitalize">{summary.worst_dimension}</div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-muted-foreground">—</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Next Session */}
        <Card className={nextPlan ? 'lg:col-span-5 border-2 border-primary/40 bg-gradient-to-br from-primary/5 to-primary/10' : 'lg:col-span-5 border-dashed'}>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Next Session
            </CardTitle>
            <CardDescription>
              {nextPlan ? 'Recommended based on your recent performance' : 'Complete more sessions to unlock recommendations'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {nextPlan ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {nextPlanFields.focus_dimension ? (
                    <Badge variant="outline" className="capitalize">Focus: {nextPlanFields.focus_dimension}</Badge>
                  ) : null}
                  {typeof nextPlanFields.question_count === 'number' ? (
                    <Badge variant="outline">{nextPlanFields.question_count} questions</Badge>
                  ) : null}
                  {nextPlanFields.difficulty ? (
                    <Badge variant="outline" className="capitalize">{nextPlanFields.difficulty}</Badge>
                  ) : null}
                  {nextPlanFields.recommended_round ? (
                    <Badge variant="outline">{nextPlanFields.recommended_round}</Badge>
                  ) : null}
                </div>
                {nextPlanFields.reason ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">{nextPlanFields.reason}</p>
                ) : null}
                <Button size="lg" onClick={handleStartTargetedSession} className="w-full">
                  <Sparkles className="mr-2" />
                  Start Targeted Session
                </Button>
              </>
            ) : (
              <div className="text-center py-6">
                <div className="mx-auto w-12 h-12 rounded-2xl border bg-muted/30 flex items-center justify-center mb-3">
                  <AlertCircle className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Practice a bit more to unlock personalized focus areas.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      {heatmap.length > 0 && timeSeries.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Performance Trend
            </CardTitle>
            <CardDescription>Weekly average scores by dimension (last 90 days)</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={chartConfig}
              className="h-[280px] w-full"
            >
              <LineChart data={timeSeries} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="week_start"
                  tickMargin={8}
                  tickFormatter={(v) => formatWeekShort(String(v))}
                />
                <YAxis domain={[0, 100]} tickMargin={8} width={36} />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelKey="week_start"
                      labelFormatter={(label) => `Week of ${formatWeekShort(String(label))}`}
                      formatter={(value, name) => (
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="text-muted-foreground">{String(name)}</span>
                          <span className="font-mono font-medium tabular-nums">{Number(value).toFixed(0)}</span>
                        </div>
                      )}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                {dimensionKeys.map((key) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={dimensionKeyToLabel[key] ?? key}
                    stroke={`var(--color-${key})`}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}

      {/* Detailed breakdown (compact) */}
      {heatmap.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Weekly Breakdown</CardTitle>
            <CardDescription>Quick per-week score bars per dimension</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {Object.entries(groupedHeatmap).map(([dimension, data]) => (
                <div key={dimension}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="font-medium capitalize">{dimension}</div>
                    <div className="text-xs text-muted-foreground">
                      {data.reduce((sum, d) => sum + d.attempts, 0)} attempts
                    </div>
                  </div>
                  <div className="space-y-2">
                    {data.map((point, idx) => (
                      <div key={`${dimension}-${idx}`} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-14 shrink-0">
                          {formatWeekShort(point.week)}
                        </span>
                        <div className="flex-1 flex items-center gap-2">
                          <ProgressBar value={point.score} className="h-2.5" />
                          <span className={`text-sm font-semibold w-10 ${getScoreColor(point.score)}`}>
                            {point.score.toFixed(0)}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground w-14 text-right">
                          {point.attempts}x
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  ) : null;

  const content = loading
    ? loadingView
    : (!summary || !hasAnyProgressSignal)
      ? emptyView
      : dataView;

  return (
    <div className="h-[var(--app-height)] min-h-[var(--app-height)] flex flex-col overflow-hidden">
      {header}
      <ScrollArea className="flex-1">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-6">
          {content}
        </div>
      </ScrollArea>
    </div>
  );
}
