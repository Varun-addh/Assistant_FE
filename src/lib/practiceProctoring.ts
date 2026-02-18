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
  onMultipleFaces?: (faceCount: number) => void;
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

    // Stop face detection loop & clean up video element
    if (faceDetectionTimerId !== null) {
      clearInterval(faceDetectionTimerId);
      faceDetectionTimerId = null;
    }
    if (faceDetectionVideo) {
      faceDetectionVideo.srcObject = null;
      faceDetectionVideo.remove();
      faceDetectionVideo = null;
    }

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

  // ── Face Detection Loop ──────────────────────────────────────────────
  // Primary: browser's native FaceDetector API (Chrome/Edge with experimental flag).
  // Fallback: @vladmandic/face-api TinyFaceDetector — works in ALL browsers.
  let faceDetectionTimerId: ReturnType<typeof setInterval> | null = null;
  let faceDetectionVideo: HTMLVideoElement | null = null;

  const startFaceDetection = async () => {
    // Create a hidden video element with real dimensions so the face detector
    // can actually read pixel data (a 1x1 element yields no usable frames).
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.width = 320;
    video.height = 240;
    video.setAttribute('style', 'position:fixed;top:-9999px;left:-9999px;width:320px;height:240px;opacity:0;pointer-events:none;z-index:-1;');
    document.body.appendChild(video);
    faceDetectionVideo = video;

    try {
      video.srcObject = stream;
      await video.play();
      console.log('[Proctoring] Face detection video playing:', video.videoWidth, 'x', video.videoHeight);
    } catch (err) {
      console.warn('[Proctoring] Could not play video for face detection:', err);
      video.remove();
      faceDetectionVideo = null;
      return;
    }

    // ── Try native FaceDetector first ──
    const NativeFD = (globalThis as any).FaceDetector;
    let nativeDetector: any = null;
    if (NativeFD) {
      try {
        nativeDetector = new NativeFD({ maxDetectedFaces: 5, fastMode: true });
        console.log('[Proctoring] ✅ Using native FaceDetector API');
      } catch (e) {
        console.warn('[Proctoring] Native FaceDetector create failed, trying fallback:', e);
      }
    }

    // ── Fallback: face-api.js TinyFaceDetector ──
    let faceApiReady = false;
    let faceapi: any = null;
    if (!nativeDetector) {
      console.log('[Proctoring] Native FaceDetector not available — loading face-api.js fallback...');
      try {
        faceapi = await import('@vladmandic/face-api');

        // Load TinyFaceDetector model from local public path (bundled with app)
        const MODEL_URL = '/models';
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);

        faceApiReady = true;
        console.log('[Proctoring] ✅ face-api.js TinyFaceDetector loaded successfully');
      } catch (err) {
        console.warn('[Proctoring] Failed to load face-api.js fallback:', err);
      }
    }

    if (!nativeDetector && !faceApiReady) {
      console.warn('[Proctoring] ❌ No face detection method available — face detection disabled');
      video.remove();
      faceDetectionVideo = null;
      return;
    }

    // Wait for the video to have actual frame data before starting detection.
    // The video.play() promise resolves before frames are decoded in some browsers.
    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) { resolve(); return; }
      const onReady = () => { video.removeEventListener('loadeddata', onReady); resolve(); };
      video.addEventListener('loadeddata', onReady);
      // Safety timeout — don't block forever
      setTimeout(resolve, 3000);
    });

    console.log('[Proctoring] Face detection loop starting. Video readyState:', video.readyState, 'dimensions:', video.videoWidth, 'x', video.videoHeight);

    // ── Detection loop (every 2s) ──
    const INTERVAL_MS = 2000;
    let detecting = false;
    let consecutiveErrors = 0;

    faceDetectionTimerId = setInterval(async () => {
      if (!active || detecting) return;
      if (video.readyState < 2) return; // Not enough data yet

      detecting = true;
      try {
        let count = 0;

        if (nativeDetector) {
          // Native path
          const faces = await nativeDetector.detect(video);
          count = Array.isArray(faces) ? faces.length : 0;
        } else if (faceApiReady && faceapi) {
          // face-api.js path — use larger inputSize for better accuracy
          const detections = await faceapi.detectAllFaces(
            video,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 })
          );
          count = Array.isArray(detections) ? detections.length : 0;
        }

        consecutiveErrors = 0; // Reset on success

        if (count > 1) {
          console.warn(`[Proctoring] ⚠️ Multiple faces detected: ${count}`);
          options.onMultipleFaces?.(count);

          // Also report to backend
          void safePost('MULTIPLE_FACES_DETECTED' as PracticeSessionProctoringEventType, {
            face_count: count,
          });
        }
      } catch (err) {
        consecutiveErrors++;
        // Detection can fail if video is not ready or tab is backgrounded
        if (consecutiveErrors <= 3) {
          console.debug('[Proctoring] Face detection frame error:', err);
        }
        if (consecutiveErrors === 10) {
          console.warn('[Proctoring] Too many consecutive face detection errors — stopping loop');
          if (faceDetectionTimerId !== null) {
            clearInterval(faceDetectionTimerId);
            faceDetectionTimerId = null;
          }
        }
      } finally {
        detecting = false;
      }
    }, INTERVAL_MS);
  };

  void startFaceDetection();

  return {
    stop,
    isActive: () => active,
  };
}
