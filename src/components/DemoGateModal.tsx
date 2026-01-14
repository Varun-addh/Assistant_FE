import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import type { DemoGateDetail, DemoUnavailableDetail } from "@/lib/strataxClient";

type DemoGateState =
  | { kind: "limit"; detail: DemoGateDetail & { rate_limit_reset?: number; rate_limit_remaining?: number } }
  | { kind: "unavailable"; detail: DemoUnavailableDetail }
  | null;

export function DemoGateModal() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DemoGateState>(null);

  useEffect(() => {
    const onLimitReached = (event: Event) => {
      const detail = (event as CustomEvent).detail as DemoGateDetail & {
        rate_limit_reset?: number;
        rate_limit_remaining?: number;
      };
      setState({ kind: "limit", detail });
      setOpen(true);
    };

    const onUnavailable = (event: Event) => {
      const detail = (event as CustomEvent).detail as DemoUnavailableDetail;
      setState({ kind: "unavailable", detail });
      setOpen(true);
    };

    window.addEventListener("demo:limit-reached", onLimitReached);
    window.addEventListener("demo:unavailable", onUnavailable);

    return () => {
      window.removeEventListener("demo:limit-reached", onLimitReached);
      window.removeEventListener("demo:unavailable", onUnavailable);
    };
  }, []);

  const title = useMemo(() => {
    if (!state) return "";
    return state.kind === "limit" ? "Guest usage limit reached" : "Guest mode temporarily unavailable";
  }, [state]);

  const description = useMemo(() => {
    if (!state) return "";
    const msg = state.detail?.message;
    if (msg && typeof msg === "string") return msg;
    return state.kind === "limit"
      ? "You’ve used all guest credits for now. Sign in to continue, or connect your own API keys for unlimited usage."
      : "Guest capacity is currently full right now. Please try again later, or sign in and use your own API keys.";
  }, [state]);

  const demoRemaining = state?.kind === "limit" ? state.detail?.demo_remaining : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {state?.kind === "limit" && demoRemaining && typeof demoRemaining === "object" && (
          <div className="mt-2 rounded-md border border-border/50 bg-muted/20 p-3 text-sm">
            <div className="font-medium mb-2">Guest credits remaining</div>
            <ul className="space-y-1">
              {Object.entries(demoRemaining)
                .filter(([_, v]) => typeof v === "number")
                .map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium">{String(v)}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Dismiss
          </Button>
          <Button
            onClick={() => {
              try {
                window.location.assign("/login");
              } catch {
                window.location.href = "/login";
              }
            }}
          >
            Sign in
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
