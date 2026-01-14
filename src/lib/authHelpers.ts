/**
 * Helper utilities to integrate authentication with existing API calls
 * 
 * This file provides wrappers and utilities to add JWT authentication
 * to existing API functions without modifying the original api.ts file extensively.
 */

/**
 * Enhances headers with JWT token from localStorage
 * Call this function to add authentication to any existing buildHeaders() result
 */
export function addAuthHeaders(headers: HeadersInit): HeadersInit {
  const token = localStorage.getItem('token');
  
  const enhancedHeaders = { ...headers } as Record<string, string>;
  
  if (token) {
    enhancedHeaders['Authorization'] = `Bearer ${token}`;
  }
  
  return enhancedHeaders;
}

/**
 * Wraps any fetch call to add authentication and handle auth errors
 * Use this to wrap existing fetch calls in api.ts
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = localStorage.getItem('token');
  
  const enhancedOptions: RequestInit = {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  };
  
  const response = await fetch(url, enhancedOptions);
  
  // Handle 401 (unauthorized) - redirect to login
  if (response.status === 401) {
    let body: any = null;
    try {
      body = await response.clone().json();
    } catch {
      body = null;
    }

    const detail = body?.detail ?? body;
    const msg = (typeof detail === 'string' ? detail : (detail?.message || detail?.error || '')).toString().toLowerCase();
    const likelyJwt = msg.includes('token') || msg.includes('jwt') || msg.includes('expired') || msg.includes('signature') || url.toLowerCase().includes('/auth/me');
    const likelyKey = msg.includes('api key') || msg.includes('invalid api key') || msg.includes('invalid_key');

    if (!likelyJwt && likelyKey) {
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
  
  // Handle 429 (rate limit exceeded)
  if (response.status === 429) {
    const data = await response.json().catch(() => ({ detail: 'Rate limit exceeded' }));
    
    window.dispatchEvent(new CustomEvent('ratelimit:exceeded', { 
      detail: data.detail 
    }));
    
    throw new Error(typeof data.detail === 'string' ? data.detail : data.detail.message);
  }
  
  return response;
}

/**
 * Listen for auth logout events and redirect to login page
 * Call this once in your app initialization (e.g., in main.tsx or App.tsx)
 */
export function setupAuthListener() {
  window.addEventListener('auth:logout', (event: any) => {
    console.warn('Authentication expired:', event.detail?.reason);
    
    // Redirect to login page
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  });
}

/**
 * Example: How to modify an existing API call to use authentication
 * 
 * BEFORE:
 * const res = await fetch(`${BASE_URL}/api/session`, {
 *   method: "POST",
 *   headers: buildHeaders(),
 * });
 * 
 * AFTER (Option 1 - Using authenticatedFetch):
 * const res = await authenticatedFetch(`${BASE_URL}/api/session`, {
 *   method: "POST",
 *   headers: buildHeaders(),
 * });
 * 
 * AFTER (Option 2 - Using addAuthHeaders):
 * const res = await fetch(`${BASE_URL}/api/session`, {
 *   method: "POST",
 *   headers: addAuthHeaders(buildHeaders()),
 * });
 */
