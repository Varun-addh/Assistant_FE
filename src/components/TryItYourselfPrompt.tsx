/**
 * Offers Mirror Mode at the moment its value is most obvious.
 *
 * Reading a good answer is not the same as being able to give one, and that gap
 * is the whole reason Mirror exists. The best time to make that point is right
 * after the user has finished reading a solid explanation — they feel informed,
 * which is exactly when they are most likely to overestimate how well they could
 * say it out loud.
 *
 * Mirror is otherwise a toggle buried in the composer, so most users never find
 * the product's most differentiated feature.
 */

import { Button } from "@/components/ui/button";
import { Mic, X } from "lucide-react";

/** Short answers are not worth rehearsing; the offer would just be noise. */
const MIN_ANSWER_CHARS = 500;

/**
 * Questions about the product itself. Rehearsing "how do I open Practice Mode"
 * has no interview value, and offering it there makes the prompt look automatic
 * rather than considered.
 */
const PRODUCT_QUESTION =
  /\b(how do i (use|start|open|access|get)|where (is|do i find)|what can (you|this) do|sign ?in|log ?in|upgrade|my (plan|quota|account|limit)|practice mode|mock interview|question bank|mirror mode)\b/i;

/** Conversational turns that carry no rehearsable content. */
const NON_QUESTION = /^(hi|hey|hello|thanks|thank you|ok|okay|cool|nice|got it)\b/i;

export function shouldOfferRehearsal(question: string, answer: string): boolean {
  const q = (question || "").trim();
  const a = (answer || "").trim();

  if (!q || a.length < MIN_ANSWER_CHARS) return false;
  if (NON_QUESTION.test(q)) return false;
  if (PRODUCT_QUESTION.test(q)) return false;

  return true;
}

interface TryItYourselfPromptProps {
  question: string;
  answer: string;
  onAccept: () => void;
  onDismiss: () => void;
}

export function TryItYourselfPrompt({
  question,
  answer,
  onAccept,
  onDismiss,
}: TryItYourselfPromptProps) {
  if (!shouldOfferRehearsal(question, answer)) return null;

  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5">
      <Mic className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        Reading it is the easy part.{" "}
        <span className="text-foreground/80">Try saying it back</span> and I'll
        show you what an interviewer would pick up on.
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={onAccept}
        className="h-7 shrink-0 rounded-lg text-xs"
      >
        Try it
      </Button>
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
