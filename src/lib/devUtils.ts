/**
 * Development utilities for bypassing API key requirements during local development
 */

// Check if running in development mode
export const isDevelopmentMode = (): boolean => {
    const hostname = window.location.hostname;
    return hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.') ||
        hostname.endsWith('.local');
};

// Check if API key is required (false in dev mode)
export const isApiKeyRequired = (): boolean => {
    // In development, API keys are optional for UI purposes
    if (isDevelopmentMode()) {
        console.log('🔧 [Dev Mode] API key requirement bypassed for UI');
        return false;
    }
    return true;
};

// Get API key - returns actual key if exists, null otherwise (no placeholders)
export const getApiKey = (keyName: 'user_api_key' | 'gemini_api_key'): string | null => {
    const key = localStorage.getItem(keyName);

    // Always return the actual key or null - no placeholders
    // This ensures the backend gets real keys or properly handles missing keys
    if (isDevelopmentMode() && !key) {
        console.log(`🔧 [Dev Mode] No ${keyName} found, returning null (backend will handle)`);
    }

    return key;
};

// Check if user has valid API keys (always true in dev mode for UI purposes)
export const hasValidApiKeys = (): boolean => {
    if (isDevelopmentMode()) {
        console.log('🔧 [Dev Mode] API key validation bypassed for UI');
        return true;
    }

    const groqKey = localStorage.getItem('user_api_key');
    const geminiKey = localStorage.getItem('gemini_api_key');

    return !!(groqKey || geminiKey);
};
