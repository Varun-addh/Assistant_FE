/**
 * Shown when the backend judges the user to be circling the same thing.
 *
 * The bar for interrupting someone is high, so this is built to be easy to
 * ignore: it sits below the answer rather than over the input, never blocks
 * typing, and one dismissal ends it for the session. The backend already caps
 * this at one offer per session; the dismiss here is the user's override of
 * that single offer.
 */

import { Button } from "@/components/ui/button";
import { Lightbulb, X } from "lucide-react";
import type { CopilotFeature } from "./CopilotFeatureNav";

const FEATURE_CTA: Record<string, string> = {
  mirror: "Try Mirror Mode",
  practice: "Open Practice Mode",
  "mock-interview": "Start a Mock Interview",
  intelligence: "Browse Question Bank",
  progress: "View Progress",
};

interface CopilotStuckNudgeProps {
  message: string;
  feature: string;
  onAccept: (feature: CopilotFeature) => void;
  onDismiss: () => void;
}

export function CopilotStuckNudge({
  message,
  feature,
  onAccept,
  onDismiss,
}: CopilotStuckNudgeProps) {
  const cta = FEATURE_CTA[feature];
  // An offer with no route out is just a remark - don't interrupt for it.
  if (!message || !cta) return null;

  return (
    <div
      className="mt-3 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"
      role="status"
      aria-live="polite"
    >
      <Lightbulb
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs leading-relaxed text-foreground/90">{message}</p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 rounded-lg border-amber-500/40 bg-amber-500/10 text-xs hover:bg-amber-500/20"
          onClick={() => onAccept(feature as CopilotFeature)}
        >
          {cta}
        </Button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss suggestion"
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
