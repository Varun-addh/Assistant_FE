/**
 * States what the search decided, instead of asking the user to configure it.
 *
 * Search Intelligence exposed eight controls — Enhanced, Limit, Verified, Cred,
 * Company, Refresh, Rerank, Query Exp. — rendered as 9px uppercase labels with
 * no explanation anywhere. They are pipeline stages, not user intents: "Cred
 * 0.6" has no meaning to someone preparing for an interview, so in practice the
 * settings were arbitrary.
 *
 * The backend now infers them from the query. This shows the result in one
 * sentence and keeps the controls one click away for anyone who wants them.
 */

import { Button } from "@/components/ui/button";
import { Sliders, Sparkles } from "lucide-react";
import type { SearchPlan } from "@/lib/api";

interface SearchPlanBarProps {
  plan: SearchPlan | null;
  refineOpen: boolean;
  onToggleRefine: () => void;
}

export function SearchPlanBar({ plan, refineOpen, onToggleRefine }: SearchPlanBarProps) {
  if (!plan) return null;

  const manual = plan.overridden.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-card/30 px-2.5 py-1.5">
      <Sparkles
        className={`h-3 w-3 shrink-0 ${manual ? "text-muted-foreground" : "text-primary"}`}
        aria-hidden="true"
      />

      <span className="text-[11px] text-foreground/80">{plan.summary}</span>

      {/* The reason is the part that makes the decision trustworthy rather than
          magic, so it is shown rather than tucked into a tooltip. */}
      {!manual && plan.reasoning && (
        <span className="hidden text-[11px] text-muted-foreground sm:inline">
          — {plan.reasoning}
        </span>
      )}

      {manual && (
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          manual
        </span>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onToggleRefine}
        className="ml-auto h-6 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        aria-expanded={refineOpen}
      >
        <Sliders className="h-3 w-3" aria-hidden="true" />
        {refineOpen ? "Hide filters" : "Refine"}
      </Button>
    </div>
  );
}
