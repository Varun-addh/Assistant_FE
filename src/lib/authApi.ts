import { STRATAX_API_BASE_URL, STRATAX_CLIENT_ID_HEADER, STRATAX_GUEST_ID_HEADER, getOrCreateStrataxGuestId } from "./strataxClient";

// Keep VITE_AUTH_API_URL as an explicit override, but default to STRATAX_API_BASE_URL.
// If auth points to a different backend than /api/*, the JWT won't validate and backend logs auth=false.
const API_BASE_URL = (import.meta as any).env?.VITE_AUTH_API_URL || STRATAX_API_BASE_URL;

export interface RateLimitInfo {
  message: string;
  current_usage: number;
  limit: number;
  tier: string;
}

export interface ApiError {
  detail: string | RateLimitInfo;
}

async function safeReadJson(res: Response): Promise<any> {
  return await res.json().catch(() => null);
}

async function safeReadText(res: Response): Promise<string> {
  return await res.text().catch(() => "");
}

function isLikelyJwtAuthFailure(endpoint: string, responseBody: any): boolean {
  const ep = (endpoint || '').toLowerCase();
  if (ep.startsWith('/auth/')) return true;
  if (ep === '/auth/me') return true;

  const detail = responseBody?.detail ?? responseBody;
  const msg = (typeof detail === 'string' ? detail : (detail?.message || detail?.error || '')).toString().toLowerCase();
  if (msg.includes('token') || msg.includes('jwt') || msg.includes('expired') || msg.includes('signature')) return true;
  if (msg.includes('api key') || msg.includes('invalid api key') || msg.includes('invalid_key')) return false;
  return false;
}

/**
 * Makes an authenticated API call with JWT token
 * Handles 401 (unauthorized) and 429 (rate limit) errors automatically
 */
export async function apiCall<T = any>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body: any = null
): Promise<T> {
  const token = localStorage.getItem('token');
  const guestId = getOrCreateStrataxGuestId();

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      [STRATAX_GUEST_ID_HEADER]: guestId,
      [STRATAX_CLIENT_ID_HEADER]: guestId,
    }
  };

  // Add token if available
  if (token) {
    (options.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  // Add body for POST/PUT
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

  // Handle 401 (unauthorized) - redirect to login
  if (response.status === 401) {
    const body = await response.json().catch(() => null);

    // Only force logout for real session expiry.
    if (!isLikelyJwtAuthFailure(endpoint, body)) {
      throw new Error('Unauthorized');
    }

    // Clear auth data
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('tier');
    
    // Dispatch custom event for components to react
    window.dispatchEvent(new CustomEvent('auth:logout', { 
      detail: { reason: 'Session expired. Please login again.' } 
    }));
    
    throw new Error('Session expired. Please login again.');
  }

  // Handle 429 (rate limit exceeded)
  if (response.status === 429) {
    const data: ApiError = await response.json();
    
    // Dispatch event for rate limit modal
    window.dispatchEvent(new CustomEvent('ratelimit:exceeded', { 
      detail: data.detail 
    }));
    
    if (typeof data.detail === 'string') {
      throw new Error(data.detail);
    } else {
      throw new Error(data.detail.message);
    }
  }

  // Handle other errors
  if (!response.ok) {
    const data: ApiError = await response.json();
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Request failed');
  }

  return response.json();
}

export async function requestEmailVerification(): Promise<void> {
  await apiCall('/auth/request-email-verification', 'POST');
}

export async function forgotPassword(email: string): Promise<void> {
  await apiCall('/auth/forgot-password', 'POST', { email });
}

export async function verifyEmailToken(token: string): Promise<{ ok: boolean; message?: string }>{
  const safeToken = String(token || '').trim();
  if (!safeToken) return { ok: false, message: 'Missing token' };

  const guestId = getOrCreateStrataxGuestId();
  const res = await fetch(`${API_BASE_URL}/auth/verify-email?token=${encodeURIComponent(safeToken)}`, {
    method: 'GET',
    headers: {
      [STRATAX_GUEST_ID_HEADER]: guestId,
      [STRATAX_CLIENT_ID_HEADER]: guestId,
    }
  });

  if (res.ok) return { ok: true };
  const body = await safeReadJson(res);
  const detail = body?.detail ?? body;
  const msg = typeof detail === 'string' ? detail : (detail?.message || 'Verification failed');
  return { ok: false, message: `${res.status} ${msg}`.trim() };
}

export async function resetPasswordWithToken(opts: { token: string; new_password: string }): Promise<{ ok: boolean; message?: string }>{
  const safeToken = String(opts?.token || '').trim();
  const newPassword = String(opts?.new_password || '');
  if (!safeToken) return { ok: false, message: 'Missing token' };
  if (!newPassword) return { ok: false, message: 'Missing new password' };

  const guestId = getOrCreateStrataxGuestId();
  const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [STRATAX_GUEST_ID_HEADER]: guestId,
      [STRATAX_CLIENT_ID_HEADER]: guestId,
    },
    body: JSON.stringify({ token: safeToken, new_password: newPassword }),
  });

  if (res.ok) return { ok: true };

  const body = await safeReadJson(res);
  const detail = body?.detail ?? body;
  const msgFromJson = typeof detail === 'string' ? detail : (detail?.message || detail?.error);
  const msgFromText = msgFromJson ? '' : await safeReadText(res);
  const msg = (msgFromJson || msgFromText || 'Reset failed').toString();
  return { ok: false, message: `${res.status} ${msg}`.trim() };
}

/**
 * Makes an authenticated API call and returns rate limit info from headers
 */
export async function apiCallWithRateLimit<T = any>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body: any = null
): Promise<{ data: T; rateLimit: { remaining: number; limit: number } }> {
  const token = localStorage.getItem('token');

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    }
  };

  if (token) {
    (options.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

  // Get rate limit info from headers
  const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '0');
  const limit = parseInt(response.headers.get('X-RateLimit-Limit') || '0');

  // Show warning when approaching limit (< 20%)
  if (remaining && limit && remaining < limit * 0.2) {
    window.dispatchEvent(new CustomEvent('ratelimit:warning', { 
      detail: { 
        message: `You have ${remaining}/${limit} API calls remaining today. Consider upgrading!`,
        remaining,
        limit
      } 
    }));
  }

  // Handle 401
  if (response.status === 401) {
    const body = await response.json().catch(() => null);

    if (!isLikelyJwtAuthFailure(endpoint, body)) {
      throw new Error('Unauthorized');
    }

    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('tier');
    
    window.dispatchEvent(new CustomEvent('auth:logout', { 
      detail: { reason: 'Session expired. Please login again.' } 
    }));
    
    throw new Error('Session expired. Please login again.');
  }

  // Handle 429
  if (response.status === 429) {
    const data: ApiError = await response.json();
    
    window.dispatchEvent(new CustomEvent('ratelimit:exceeded', { 
      detail: data.detail 
    }));
    
    if (typeof data.detail === 'string') {
      throw new Error(data.detail);
    } else {
      throw new Error(data.detail.message);
    }
  }

  if (!response.ok) {
    const data: ApiError = await response.json();
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Request failed');
  }

  const data = await response.json();

  return {
    data,
    rateLimit: { remaining, limit }
  };
}

/**
 * Get current user info
 */
export async function getCurrentUser() {
  return apiCall('/auth/me');
}

/**
 * Get user quota information
 */
export async function getQuota() {
  return apiCall('/auth/quota');
}

/**
 * Ask a question (with authentication)
 */
export async function askQuestion(sessionId: string, question: string) {
  return apiCall('/api/ask', 'POST', {
    session_id: sessionId,
    question
  });
}

/**
 * Start a mock interview (with authentication)
 */
export async function startMockInterview(difficulty: string, topic: string) {
  return apiCall('/api/mock-interview/start', 'POST', {
    difficulty,
    topic
  });
}
