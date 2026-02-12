/**
 * Centralized error-to-user-message sanitizer.
 *
 * NEVER expose raw Error objects, HTTP status codes, stack traces, pydantic
 * validation details, or environment-variable names to end users. Every catch
 * block should route through this module.
 */

import { StrataxApiError } from './strataxClient';

/* ────────────────────── types ────────────────────── */

export interface UserFriendlyError {
  /** Short, non-technical headline (max ~50 chars). */
  title: string;
  /** 1–2 sentence explanation in plain English. */
  description: string;
  /** Suggested call-to-action when it makes sense. */
  suggestion?: string;
}

/* ────────────────── status → message map ────────────────── */

const STATUS_MAP: Record<number, UserFriendlyError> = {
  400: {
    title: 'Invalid request',
    description: 'Something in the request wasn\'t right. Please check your input and try again.',
  },
  401: {
    title: 'Session expired',
    description: 'Your login session has expired. Please sign in again to continue.',
    suggestion: 'Sign in again',
  },
  403: {
    title: 'Access denied',
    description: 'You don\'t have permission to perform this action.',
  },
  404: {
    title: 'Not found',
    description: 'The resource you\'re looking for couldn\'t be found. It may have been removed.',
  },
  409: {
    title: 'Conflict',
    description: 'This action conflicts with the current state. Please refresh and try again.',
  },
  422: {
    title: 'Couldn\'t process request',
    description: 'Some of the information provided was invalid. Please check your input.',
  },
  429: {
    title: 'Too many requests',
    description: 'You\'ve made too many requests in a short period. Please wait a moment and try again.',
    suggestion: 'Wait a few seconds',
  },
  500: {
    title: 'Server error',
    description: 'Something went wrong on our end. Our team has been notified. Please try again shortly.',
  },
  502: {
    title: 'Service temporarily unavailable',
    description: 'Our servers are briefly unreachable. Please try again in a few moments.',
  },
  503: {
    title: 'Service unavailable',
    description: 'The service is temporarily down for maintenance. Please try again shortly.',
  },
  504: {
    title: 'Request timed out',
    description: 'The server took too long to respond. Please check your connection and try again.',
  },
};

/* ──────────────── network error detection ──────────────── */

const NETWORK_ERROR_PATTERNS = [
  'failed to fetch',
  'networkerror',
  'network request failed',
  'load failed',
  'err_internet_disconnected',
  'err_network',
  'net::err',
  'aborted',
  'econnrefused',
  'econnreset',
  'etimedout',
  'dns',
];

function isNetworkError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((p) => lower.includes(p));
}

/* ──────────────── permission error detection ──────────────── */

const PERMISSION_PATTERNS = [
  { test: /camera|video|getUserMedia/i, title: 'Camera access required', description: 'Please allow camera access in your browser settings and try again.' },
  { test: /microphone|audio|mediarecorder/i, title: 'Microphone access required', description: 'Please allow microphone access in your browser settings and try again.' },
  { test: /screen.*share|getDisplayMedia/i, title: 'Screen sharing required', description: 'Please allow screen sharing to continue with the interview.' },
  { test: /notification/i, title: 'Notification permission needed', description: 'Please enable notifications in your browser settings.' },
];

/* ──────────────── main sanitizer ──────────────── */

/**
 * Converts any thrown value into a safe, user-friendly error message.
 *
 * Usage:
 * ```ts
 * catch (err) {
 *   const friendly = toUserError(err);
 *   toast({ title: friendly.title, description: friendly.description, variant: 'destructive' });
 * }
 * ```
 */
export function toUserError(
  error: unknown,
  /** Fallback context — shown when we truly can't classify the error. */
  context?: string,
): UserFriendlyError {
  // ── 1. StrataxApiError (our typed API errors) ──
  if (error instanceof StrataxApiError) {
    // Use our status map first
    const mapped = STATUS_MAP[error.status];
    if (mapped) return { ...mapped };

    // Fallback for unknown status codes
    return {
      title: 'Request failed',
      description: 'Something went wrong while communicating with the server. Please try again.',
    };
  }

  // ── 2. Standard Error ──
  if (error instanceof Error) {
    const msg = error.message || '';

    // Network errors
    if (isNetworkError(msg)) {
      return {
        title: 'Connection problem',
        description: 'Unable to reach the server. Please check your internet connection and try again.',
        suggestion: 'Check your connection',
      };
    }

    // Permission errors (camera, mic, screen)
    for (const p of PERMISSION_PATTERNS) {
      if (p.test.test(msg)) {
        return { title: p.title, description: p.description };
      }
    }

    // Timeout
    if (/timeout|timed?\s*out/i.test(msg)) {
      return {
        title: 'Request timed out',
        description: 'The operation took too long. Please try again.',
      };
    }

    // Generic — don't leak raw message
    // Log internally for debugging
    if (import.meta.env.DEV) {
      console.debug('[toUserError] Raw error:', msg);
    }
  }

  // ── 3. String thrown directly ──
  if (typeof error === 'string') {
    // Never show raw strings to user — could be anything
    if (import.meta.env.DEV) {
      console.debug('[toUserError] String error:', error);
    }
  }

  // ── 4. Fallback ──
  return {
    title: context || 'Something went wrong',
    description: 'An unexpected error occurred. Please try again. If the problem persists, try refreshing the page.',
  };
}

/**
 * Quick helper: extracts a safe description string for inline error display
 * (e.g. Login / Register pages). Falls back to the provided context if possible.
 */
export function toUserErrorMessage(error: unknown, context?: string): string {
  const { description } = toUserError(error, context);
  return description;
}

/**
 * Produces a short, safe description from an HTTP status code alone.
 */
export function descriptionForStatus(status: number): string {
  return STATUS_MAP[status]?.description ?? 'An unexpected error occurred. Please try again.';
}
