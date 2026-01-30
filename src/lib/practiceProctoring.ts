import {
  postPracticeProctoringEvent,
  postPracticeSessionProctoringEvent,
  type PracticeSessionProctoringEventType,
} from "@/lib/practiceModeApi";

export type PracticeProctoringController = {
  stop: () => void;
  isActive: () => boolean;
};

export type StartPracticeProctoringOptions = {
  sessionId: string;
  onStatus?: (status: "starting" | "active" | "inactive" | "error", info?: string) => void;
  cameraStream?: MediaStream | null;
};

function isMediaPermissionError(err: unknown): boolean {
  const e = err as any;
  const name = typeof e?.name === "string" ? e.name : "";
  return (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "NotFoundError" ||
    name === "NotReadableError"
  );
}

export async function startPracticeProctoring(
  options: StartPracticeProctoringOptions
): Promise<PracticeProctoringController> {
  const onStatus = options.onStatus;
  let active = false;

  const dispatchRateLimit = () => {
    try {
      // Reuse the existing DemoGateModal/PracticeMode listeners.
      window.dispatchEvent(
        new CustomEvent('demo:limit-reached', {
          detail: {
            error: 'DEMO_LIMIT_REACHED',
            message: 'Guest usage limit reached. Please sign in to continue.',
            source: 'practice_proctoring',
          },
        })
      );
    } catch {
      // ignore
    }
  };

  const safePost = async (
    eventType: PracticeSessionProctoringEventType,
    metadata: Record<string, unknown> = {}
  ): Promise<{ ok: boolean; status: number }> => {
    // Prefer new session-scoped endpoint; fall back to legacy ingest if needed.
    const res1 = await postPracticeSessionProctoringEvent({
      session_id: options.sessionId,
      event_type: eventType,
      metadata,
    });
    if (res1.status === 429) {
      dispatchRateLimit();
    }
    if (res1.ok || res1.status !== 404) return { ok: res1.ok, status: res1.status };

    // Legacy endpoint doesn't know about the new event types; still log a generic record.
    const legacy = await postPracticeProctoringEvent({
      session_id: options.sessionId,
      event_type: 'tab_switch',
      severity: 'info',
      metadata: { legacy: true, event_type: eventType, ...metadata },
    });
    return { ok: legacy.ok, status: legacy.status };
  };

  onStatus?.("starting");

  let stream: MediaStream | null = options.cameraStream ?? null;
  if (!stream) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (err) {
      onStatus?.(
        "error",
        isMediaPermissionError(err) ? "Camera permission denied or unavailable" : "Camera initialization failed"
      );
      throw err;
    }
  }

  const track = stream.getVideoTracks()[0] ?? null;

  // First event: if backend doesn't have the endpoint yet (404), disable proctoring events.
  const first = await safePost("SESSION_STARTED_WITH_PROCTORING", {
    track_label: track?.label || undefined,
    camera: true,
  });

  if (!first.ok && first.status === 429) {
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    onStatus?.("error", "Guest usage limit reached (rate limited)");
    return {
      stop: () => {
        // already stopped
      },
      isActive: () => false,
    };
  }

  if (!first.ok && first.status === 404) {
    // Backend not ready; keep camera local but stop immediately.
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    onStatus?.("error", "Proctoring endpoint not available (404)");
    return {
      stop: () => {
        // already stopped
      },
      isActive: () => false,
    };
  }

  active = true;
  onStatus?.("active");

  // Throttle noisy events
  let lastBlurAt = 0;
  let lastAnyAt = 0;
  const lastEventAt: Partial<Record<PracticeSessionProctoringEventType, number>> = {};

  const shouldSend = (eventType: PracticeSessionProctoringEventType, minIntervalMs: number): boolean => {
    const now = Date.now();
    const lastForType = lastEventAt[eventType] ?? 0;
    if (now - lastForType < minIntervalMs) return false;
    // Global guard to avoid double-fire from correlated browser events.
    if (now - lastAnyAt < 300) return false;
    lastEventAt[eventType] = now;
    lastAnyAt = now;
    return true;
  };

  const hardStopFor429 = () => {
    if (!active) return;
    dispatchRateLimit();
    stop();
    onStatus?.('error', 'Guest usage limit reached (rate limited)');
  };

  const onVisibility = () => {
    if (!active) return;
    if (document.hidden) {
      if (!shouldSend('TAB_SWITCH', 2000)) return;
      void safePost("TAB_SWITCH", { reason: "visibilitychange" }).then((r) => {
        if (r.status === 429) hardStopFor429();
      });
    }
  };

  const onBlur = () => {
    if (!active) return;
    const now = Date.now();
    if (now - lastBlurAt < 5000) return;
    lastBlurAt = now;
    if (!shouldSend('WINDOW_MINIMIZED', 5000)) return;
    void safePost("WINDOW_MINIMIZED", { reason: "blur" }).then((r) => {
      if (r.status === 429) hardStopFor429();
    });
  };

  const onTrackEnded = () => {
    if (!active) return;
    void safePost("CAMERA_STOPPED", { reason: "track_ended" }).then((r) => {
      if (r.status === 429) hardStopFor429();
    });
    stop();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", onBlur);
  track?.addEventListener("ended", onTrackEnded);

  const stop = () => {
    if (!active) return;
    active = false;

    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", onBlur);
    track?.removeEventListener("ended", onTrackEnded);

    try {
      stream?.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }

    void safePost("CAMERA_STOPPED", { reason: "user_stop" }).then((r) => {
      if (r.status === 429) dispatchRateLimit();
    });
    onStatus?.("inactive");
  };

  return {
    stop,
    isActive: () => active,
  };
}
