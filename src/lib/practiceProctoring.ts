import {
  postPracticeProctoringEvent,
  type ProctoringEventType,
  type ProctoringSeverity,
} from "@/lib/practiceModeApi";

export type PracticeProctoringController = {
  stop: () => void;
  isActive: () => boolean;
};

export type StartPracticeProctoringOptions = {
  sessionId: string;
  heartbeatMs?: number;
  onStatus?: (status: "starting" | "active" | "inactive" | "error", info?: string) => void;
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
  const heartbeatMs = Math.max(5000, options.heartbeatMs ?? 15000);
  const onStatus = options.onStatus;
  let active = false;

  const safePost = async (
    eventType: ProctoringEventType,
    severity: ProctoringSeverity,
    metadata: Record<string, unknown> = {}
  ): Promise<{ ok: boolean; status: number }> => {
    const res = await postPracticeProctoringEvent({
      session_id: options.sessionId,
      event_type: eventType,
      severity,
      metadata,
    });
    return { ok: res.ok, status: res.status };
  };

  onStatus?.("starting");

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch (err) {
    onStatus?.(
      "error",
      isMediaPermissionError(err) ? "Camera permission denied or unavailable" : "Camera initialization failed"
    );
    throw err;
  }

  const track = stream.getVideoTracks()[0] ?? null;

  // First event: if backend doesn't have the endpoint yet (404), disable proctoring events.
  const first = await safePost("camera_started", "info", {
    track_label: track?.label || undefined,
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

  const onVisibility = () => {
    if (!active) return;
    if (document.hidden) {
      void safePost("tab_switch", "violation", { reason: "visibilitychange" });
    }
  };

  const onBlur = () => {
    if (!active) return;
    void safePost("window_blur", "warning", { reason: "blur" });
  };

  const onTrackEnded = () => {
    if (!active) return;
    void safePost("camera_stopped", "violation", { reason: "track_ended" });
    stop();
  };

  const heartbeat = window.setInterval(() => {
    if (!active) return;
    const readyState = track?.readyState;
    void safePost("camera_heartbeat", readyState === "live" ? "info" : "violation", { readyState }).then((r) => {
      if (r.status === 429) {
        // Stop immediately to avoid spamming the backend.
        active = false;
        window.clearInterval(heartbeat);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("blur", onBlur);
        track?.removeEventListener("ended", onTrackEnded);
        try {
          stream?.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
        onStatus?.("error", "Guest usage limit reached (rate limited)");
      }
    });
  }, heartbeatMs);

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", onBlur);
  track?.addEventListener("ended", onTrackEnded);

  const stop = () => {
    if (!active) return;
    active = false;

    window.clearInterval(heartbeat);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", onBlur);
    track?.removeEventListener("ended", onTrackEnded);

    try {
      stream?.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }

    void safePost("camera_stopped", "info", { reason: "user_stop" });
    onStatus?.("inactive");
  };

  return {
    stop,
    isActive: () => active,
  };
}
