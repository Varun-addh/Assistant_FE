import {
  getPracticeSessionProctoringStatus,
  postPracticeProctoringEvent,
  postPracticeSessionProctoringEvent,
  postPracticeSessionProctoringHeartbeat,
  type PracticeProctoringApiResult,
  type PracticeProctoringSnapshot,
  type PracticeSessionProctoringEventType,
} from '@/lib/practiceModeApi';

type PracticeProctoringSnapshotSource = 'event' | 'heartbeat' | 'status';

export type PracticeProctoringController = {
  stop: () => void;
  isActive: () => boolean;
  getSnapshot: () => PracticeProctoringSnapshot | null;
};

export type StartPracticeProctoringOptions = {
  sessionId: string;
  onStatus?: (status: 'starting' | 'active' | 'inactive' | 'error', info?: string) => void;
  onSnapshot?: (snapshot: PracticeProctoringSnapshot, source: PracticeProctoringSnapshotSource) => void;
  onMultipleFaces?: (faceCount: number) => void;
  cameraStream?: MediaStream | null;
  screenStream?: MediaStream | null;
};

function isMediaPermissionError(err: unknown): boolean {
  const error = err as { name?: string } | null;
  const name = typeof error?.name === 'string' ? error.name : '';
  return (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    name === 'NotFoundError' ||
    name === 'NotReadableError'
  );
}

function getDisplaySurface(screenStream?: MediaStream | null): string | null {
  try {
    const track = screenStream?.getVideoTracks?.()?.[0] ?? null;
    const settings = (
      track as MediaStreamTrack & { getSettings?: () => Record<string, unknown> | undefined }
    )?.getSettings?.();
    return typeof settings?.displaySurface === 'string' ? settings.displaySurface : null;
  } catch {
    return null;
  }
}

function getSnapshotMessage(
  snapshot?: PracticeProctoringSnapshot | null,
  fallback?: string
): string | undefined {
  if (typeof snapshot?.message === 'string' && snapshot.message.trim()) return snapshot.message.trim();
  if (typeof snapshot?.terminated_reason === 'string' && snapshot.terminated_reason.trim()) {
    return snapshot.terminated_reason.trim();
  }
  if (fallback && fallback.trim()) return fallback.trim();
  return undefined;
}

function isTerminateSnapshot(snapshot?: PracticeProctoringSnapshot | null): boolean {
  if (!snapshot) return false;
  return snapshot.action === 'terminate' || snapshot.status === 'terminated';
}

export async function startPracticeProctoring(
  options: StartPracticeProctoringOptions
): Promise<PracticeProctoringController> {
  const onStatus = options.onStatus;
  let active = false;
  let lastSnapshot: PracticeProctoringSnapshot | null = null;

  const ownsCameraStream = !options.cameraStream;
  let stream: MediaStream | null = options.cameraStream ?? null;

  let heartbeatTimerId: ReturnType<typeof setInterval> | null = null;
  let statusTimerId: ReturnType<typeof setInterval> | null = null;
  let faceDetectionTimerId: ReturnType<typeof setInterval> | null = null;
  let faceDetectionVideo: HTMLVideoElement | null = null;
  let detectionActive = false;
  let tabActive = !document.hidden;
  let windowFocused = !document.hidden;

  let lastAnyAt = 0;
  const lastEventAt: Partial<Record<PracticeSessionProctoringEventType, number>> = {};
  let eventQueue: Promise<PracticeProctoringApiResult | null> = Promise.resolve(null);

  const dispatchRateLimit = () => {
    try {
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

  const emitSnapshot = (
    snapshot: PracticeProctoringSnapshot,
    source: PracticeProctoringSnapshotSource
  ) => {
    lastSnapshot = snapshot;
    options.onSnapshot?.(snapshot, source);
  };

  const clearFaceDetection = () => {
    detectionActive = false;
    if (faceDetectionTimerId !== null) {
      clearInterval(faceDetectionTimerId);
      faceDetectionTimerId = null;
    }
    if (faceDetectionVideo) {
      faceDetectionVideo.srcObject = null;
      faceDetectionVideo.remove();
      faceDetectionVideo = null;
    }
  };

  const stopInternal = (opts?: {
    postCameraStopped?: boolean;
    emitInactiveStatus?: boolean;
    stopManagedStream?: boolean;
  }) => {
    const postCameraStopped = opts?.postCameraStopped ?? true;
    const emitInactiveStatus = opts?.emitInactiveStatus ?? true;
    const stopManagedStream = opts?.stopManagedStream ?? true;
    const wasActive = active;

    active = false;

    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onFocus);
    stream?.getVideoTracks?.()?.[0]?.removeEventListener('ended', onTrackEnded);

    if (heartbeatTimerId !== null) {
      clearInterval(heartbeatTimerId);
      heartbeatTimerId = null;
    }
    if (statusTimerId !== null) {
      clearInterval(statusTimerId);
      statusTimerId = null;
    }

    clearFaceDetection();

    if (stopManagedStream && ownsCameraStream) {
      try {
        stream?.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore
      }
    }

    if (wasActive && postCameraStopped) {
      void safePost('CAMERA_STOPPED', { reason: 'user_stop' }).catch(() => {
        // ignore
      });
    }

    if (emitInactiveStatus) {
      onStatus?.('inactive');
    }
  };

  const hardStopFor429 = () => {
    if (!active) return;
    dispatchRateLimit();
    stopInternal({ postCameraStopped: false, emitInactiveStatus: false, stopManagedStream: false });
    onStatus?.('error', 'Guest usage limit reached (rate limited)');
  };

  const applyResult = (
    result: PracticeProctoringApiResult,
    source: PracticeProctoringSnapshotSource
  ): PracticeProctoringApiResult => {
    if (result.status === 429) {
      hardStopFor429();
      return result;
    }

    if (result.snapshot) {
      emitSnapshot(result.snapshot, source);

      if (isTerminateSnapshot(result.snapshot)) {
        onStatus?.('error', getSnapshotMessage(result.snapshot, 'Interview terminated by proctoring policy'));
        stopInternal({ postCameraStopped: false, emitInactiveStatus: false, stopManagedStream: false });
        return result;
      }

      if (active) {
        onStatus?.('active', getSnapshotMessage(result.snapshot));
      }
    }

    return result;
  };

  const safePost = async (
    eventType: PracticeSessionProctoringEventType,
    metadata: Record<string, unknown> = {}
  ): Promise<PracticeProctoringApiResult> => {
    const res1 = await postPracticeSessionProctoringEvent({
      session_id: options.sessionId,
      event_type: eventType,
      metadata,
    });

    if (res1.status === 429) {
      dispatchRateLimit();
    }

    if (res1.ok || res1.status !== 404) {
      return applyResult(res1, 'event');
    }

    const legacy = await postPracticeProctoringEvent({
      session_id: options.sessionId,
      event_type: 'tab_switch',
      severity: 'info',
      metadata: { legacy: true, event_type: eventType, ...metadata },
    });
    return applyResult(legacy, 'event');
  };

  const enqueueEvent = (
    eventType: PracticeSessionProctoringEventType,
    metadata: Record<string, unknown> = {}
  ): Promise<PracticeProctoringApiResult> => {
    eventQueue = eventQueue
      .catch(() => null)
      .then(async () => {
        if (!active) return null;
        try {
          return await safePost(eventType, metadata);
        } catch (err) {
          console.warn('[Proctoring] Failed to post event', eventType, err);
          return null;
        }
      });

    return eventQueue.then(
      (result) =>
        result ?? {
          ok: false,
          status: 0,
          snapshot: lastSnapshot,
          raw: null,
        }
    );
  };

  const shouldSend = (eventType: PracticeSessionProctoringEventType, minIntervalMs: number): boolean => {
    const now = Date.now();
    const lastForType = lastEventAt[eventType] ?? 0;
    if (now - lastForType < minIntervalMs) return false;
    if (now - lastAnyAt < 300) return false;
    lastEventAt[eventType] = now;
    lastAnyAt = now;
    return true;
  };

  const pollStatus = async () => {
    if (!active) return;
    try {
      const result = await getPracticeSessionProctoringStatus(options.sessionId);
      if (result.status === 404) return;
      applyResult(result, 'status');
    } catch (err) {
      console.warn('[Proctoring] Status poll failed:', err);
    }
  };

  const sendHeartbeat = async () => {
    if (!active) return;
    try {
      tabActive = !document.hidden;
      windowFocused = !document.hidden;

      const cameraTrack = stream?.getVideoTracks?.()?.[0] ?? null;
      const screenTrack = options.screenStream?.getVideoTracks?.()?.[0] ?? null;
      const result = await postPracticeSessionProctoringHeartbeat({
        session_id: options.sessionId,
        camera_active: !!cameraTrack && cameraTrack.readyState === 'live',
        screen_active: !!screenTrack && screenTrack.readyState === 'live',
        tab_active: tabActive,
        window_focused: windowFocused,
        detection_active: detectionActive,
        display_surface: getDisplaySurface(options.screenStream),
        client_timestamp: new Date().toISOString(),
      });

      if (result.status === 404) return;
      applyResult(result, 'heartbeat');
    } catch (err) {
      console.warn('[Proctoring] Heartbeat failed:', err);
    }
  };

  const onVisibility = () => {
    tabActive = !document.hidden;
    windowFocused = !document.hidden;
    if (!active) return;

    if (document.hidden) {
      if (!shouldSend('TAB_SWITCH', 2000)) return;
      void enqueueEvent('TAB_SWITCH', { reason: 'visibilitychange' });
      return;
    }

    void pollStatus();
  };

  const onFocus = () => {
    windowFocused = !document.hidden;
    if (!active) return;
    void pollStatus();
  };

  const onTrackEnded = () => {
    if (!active) return;
    void enqueueEvent('CAMERA_STOPPED', { reason: 'track_ended' });
    stopInternal({ postCameraStopped: false, emitInactiveStatus: false, stopManagedStream: false });
  };

  onStatus?.('starting');

  if (!stream) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (err) {
      onStatus?.(
        'error',
        isMediaPermissionError(err) ? 'Camera permission denied or unavailable' : 'Camera initialization failed'
      );
      throw err;
    }
  }

  const track = stream.getVideoTracks()[0] ?? null;
  const first = await safePost('SESSION_STARTED_WITH_PROCTORING', {
    track_label: track?.label || undefined,
    camera: true,
    display_surface: getDisplaySurface(options.screenStream),
  });

  if (!first.ok && first.status === 429) {
    if (ownsCameraStream) {
      try {
        stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
      } catch {
        // ignore
      }
    }
    onStatus?.('error', 'Guest usage limit reached (rate limited)');
    return {
      stop: () => {
        // already stopped
      },
      isActive: () => false,
      getSnapshot: () => lastSnapshot,
    };
  }

  if (!first.ok && first.status === 404) {
    if (ownsCameraStream) {
      try {
        stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
      } catch {
        // ignore
      }
    }
    onStatus?.('error', 'Proctoring endpoint not available (404)');
    return {
      stop: () => {
        // already stopped
      },
      isActive: () => false,
      getSnapshot: () => lastSnapshot,
    };
  }

  if (!first.ok && !first.snapshot) {
    if (ownsCameraStream) {
      try {
        stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
      } catch {
        // ignore
      }
    }
    onStatus?.('error', `Proctoring unavailable (${first.status})`);
    return {
      stop: () => {
        // already stopped
      },
      isActive: () => false,
      getSnapshot: () => lastSnapshot,
    };
  }

  active = true;
  onStatus?.('active', getSnapshotMessage(first.snapshot));

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onFocus);
  track?.addEventListener('ended', onTrackEnded);

  void pollStatus();
  void sendHeartbeat();
  heartbeatTimerId = setInterval(() => {
    void sendHeartbeat();
  }, 5000);
  statusTimerId = setInterval(() => {
    void pollStatus();
  }, 12000);

  const startFaceDetection = async () => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.width = 320;
    video.height = 240;
    video.setAttribute(
      'style',
      'position:fixed;top:-9999px;left:-9999px;width:320px;height:240px;opacity:0;pointer-events:none;z-index:-1;'
    );
    document.body.appendChild(video);
    faceDetectionVideo = video;

    try {
      video.srcObject = stream;
      await video.play();
    } catch (err) {
      console.warn('[Proctoring] Could not play video for face detection:', err);
      video.remove();
      faceDetectionVideo = null;
      return;
    }

    const NativeFaceDetector = (globalThis as {
      FaceDetector?: new (options?: Record<string, unknown>) => {
        detect: (input: HTMLVideoElement) => Promise<unknown[]>;
      };
    }).FaceDetector;
    let nativeDetector: { detect: (input: HTMLVideoElement) => Promise<unknown[]> } | null = null;
    if (NativeFaceDetector) {
      try {
        nativeDetector = new NativeFaceDetector({ maxDetectedFaces: 5, fastMode: true });
      } catch (err) {
        console.warn('[Proctoring] Native FaceDetector unavailable, falling back:', err);
      }
    }

    let faceApiReady = false;
    let faceapi: any = null;
    if (!nativeDetector) {
      try {
        faceapi = await import('@vladmandic/face-api');
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        faceApiReady = true;
      } catch (err) {
        console.warn('[Proctoring] Failed to load face-api fallback:', err);
      }
    }

    if (!nativeDetector && !faceApiReady) {
      clearFaceDetection();
      return;
    }

    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) {
        resolve();
        return;
      }

      const onReady = () => {
        video.removeEventListener('loadeddata', onReady);
        resolve();
      };
      video.addEventListener('loadeddata', onReady);
      setTimeout(resolve, 3000);
    });

    const intervalMs = 2000;
    let detecting = false;
    let consecutiveErrors = 0;
    detectionActive = true;

    faceDetectionTimerId = setInterval(async () => {
      if (!active || detecting) return;
      if (video.readyState < 2) return;

      detecting = true;
      try {
        let count = 0;

        if (nativeDetector) {
          const faces = await nativeDetector.detect(video);
          count = Array.isArray(faces) ? faces.length : 0;
        } else if (faceApiReady && faceapi) {
          const detections = await faceapi.detectAllFaces(
            video,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 })
          );
          count = Array.isArray(detections) ? detections.length : 0;
        }

        consecutiveErrors = 0;

        if (count > 1) {
          options.onMultipleFaces?.(count);
          void enqueueEvent('MULTIPLE_FACES_DETECTED', { face_count: count });
        }
      } catch (err) {
        consecutiveErrors += 1;
        if (consecutiveErrors <= 3) {
          console.debug('[Proctoring] Face detection frame error:', err);
        }
        if (consecutiveErrors >= 10) {
          detectionActive = false;
          if (faceDetectionTimerId !== null) {
            clearInterval(faceDetectionTimerId);
            faceDetectionTimerId = null;
          }
        }
      } finally {
        detecting = false;
      }
    }, intervalMs);
  };

  void startFaceDetection();

  return {
    stop: () => stopInternal({ postCameraStopped: true, emitInactiveStatus: true, stopManagedStream: true }),
    isActive: () => active,
    getSnapshot: () => lastSnapshot,
  };
}
