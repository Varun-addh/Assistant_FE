/**
 * Mirror confidence per topic, across every session.
 *
 * The in-chat report already tells you how one attempt compared with the last
 * in that conversation. This is the span a returning user actually cares about:
 * am I getting better at system design than I was three weeks ago.
 *
 * Rendered as inline sparklines rather than a charting library — a dozen points
 * per topic does not justify the bundle, and these have to stay legible at the
 * size a summary card allows.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { getMirrorTrend, type MirrorTopicTrend, type MirrorTrend } from '@/lib/progressApi';

const DIRECTION_STYLE: Record<
  MirrorTopicTrend['direction'],
  { icon: typeof TrendingUp; className: string; label: string }
> = {
  improving: { icon: TrendingUp, className: 'text-emerald-500', label: 'Improving' },
  declining: { icon: TrendingDown, className: 'text-amber-500', label: 'Slipping' },
  steady: { icon: Minus, className: 'text-muted-foreground', label: 'Steady' },
  insufficient_data: { icon: Minus, className: 'text-muted-foreground', label: 'One attempt' },
};

function Sparkline({ points }: { points: number[] }) {
  // One point is a dot, not a line, and would divide by zero below.
  if (points.length < 2) return null;

  const width = 96;
  const height = 24;
  // Fixed 0–1 domain: confidence is already normalised, and auto-scaling would
  // make a 0.02 wobble look like a breakthrough.
  const step = width / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${((1 - p) * height).toFixed(1)}`)
    .join(' ');

  const rising = points[points.length - 1] >= points[0];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
      role="img"
      aria-label={`Confidence trend across ${points.length} attempts`}
    >
      <path
        d={path}
        fill="none"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={rising ? 'stroke-emerald-500' : 'stroke-amber-500'}
      />
      <circle
        cx={width}
        cy={(1 - points[points.length - 1]) * height}
        r={2.5}
        className={rising ? 'fill-emerald-500' : 'fill-amber-500'}
      />
    </svg>
  );
}

function TopicRow({ trend }: { trend: MirrorTopicTrend }) {
  const style = DIRECTION_STYLE[trend.direction] ?? DIRECTION_STYLE.steady;
  const Icon = style.icon;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const signed = `${trend.delta >= 0 ? '+' : ''}${Math.round(trend.delta * 100)}`;

  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{trend.topic}</div>
        <div className="text-xs text-muted-foreground">
          {trend.attempts} attempt{trend.attempts === 1 ? '' : 's'}
          {trend.direction !== 'insufficient_data' && (
            <>
              {' · '}
              {pct(trend.first_confidence)} → {pct(trend.latest_confidence)}
            </>
          )}
        </div>
      </div>

      <Sparkline points={trend.points.map((p) => p.confidence)} />

      <div className={`flex w-20 items-center justify-end gap-1 ${style.className}`}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium tabular-nums">
          {trend.direction === 'insufficient_data' ? style.label : `${signed} pts`}
        </span>
      </div>
    </div>
  );
}

export function MirrorTrendCard() {
  const [trend, setTrend] = useState<MirrorTrend | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getMirrorTrend();
      if (!cancelled) {
        setTrend(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mirror Confidence</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const summary = trend?.summary;
  const topics = trend?.topics ?? [];

  // Never-used feature: explain what it is rather than showing an empty chart.
  if (!summary || summary.total_attempts === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Mirror Confidence</CardTitle>
          <CardDescription>
            Answer a question in Mirror Mode and your confidence per topic will be
            tracked here across sessions — so you can see whether you are actually
            getting better, not just practising more.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Mirror Confidence</CardTitle>
        <CardDescription>
          {summary.total_attempts} attempt{summary.total_attempts === 1 ? '' : 's'} across{' '}
          {summary.topics_tracked} topic{summary.topics_tracked === 1 ? '' : 's'}
          {summary.weakest_topic && (
            <> · weakest right now: <span className="text-foreground/80">{summary.weakest_topic}</span></>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-border/60">
          {topics.map((t) => (
            <TopicRow key={t.topic} trend={t} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
