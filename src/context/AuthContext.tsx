import { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { STRATAX_API_BASE_URL } from '@/lib/strataxClient';

interface User {
  id: string;
  email: string;
  full_name: string;
  tier: 'free' | 'basic' | 'pro' | 'enterprise';
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// IMPORTANT:
// Auth and app API must point to the same backend, otherwise the JWT issued at login
// may not be recognized by the /api/* services (backend logs auth=false).
// Allow an explicit override via VITE_AUTH_API_URL, but default to STRATAX_API_BASE_URL.
const API_BASE_URL = (import.meta as any).env?.VITE_AUTH_API_URL || STRATAX_API_BASE_URL;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  async function fetchUser() {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else if (response.status === 401 || response.status === 403) {
        // Token is invalid or expired
        logout();
      } else {
        // Don't force-logout on transient backend issues (e.g. 5xx) or misroutes.
        console.warn('Auth check failed:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      // Network/CORS/etc: keep the session and allow the app to continue.
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        setToken(data.access_token);
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('userId', data.user_id);
        localStorage.setItem('tier', data.tier);

        // Always fetch latest user info after login
        await fetchUser();

        return;
      } else {
        throw new Error(data.detail || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  async function loginWithGoogle() {
    try {
      // Open Google OAuth popup
      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      const popup = window.open(
        `${API_BASE_URL}/auth/google`,
        'Google Login',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // Listen for message from popup
      return new Promise<void>((resolve, reject) => {
        const handleMessage = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          
          if (event.data.type === 'google-auth-success') {
            const { access_token, user_id, email, full_name, tier } = event.data;
            
            setToken(access_token);
            localStorage.setItem('token', access_token);
            localStorage.setItem('userId', user_id);
            localStorage.setItem('tier', tier);
            
            setUser({
              id: user_id,
              email,
              full_name: full_name || '',
              tier,
              created_at: new Date().toISOString()
            });
            
            window.removeEventListener('message', handleMessage);
            popup?.close();
            resolve();
          } else if (event.data.type === 'google-auth-error') {
            window.removeEventListener('message', handleMessage);
            popup?.close();
            reject(new Error(event.data.error || 'Google login failed'));
          }
        };

        window.addEventListener('message', handleMessage);
        
        // Cleanup if popup is closed
        const checkPopup = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkPopup);
            window.removeEventListener('message', handleMessage);
            reject(new Error('Login cancelled'));
          }
        }, 1000);
      });
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    }
  }

  async function register(email: string, password: string, fullName: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName
        })
      });

      const data = await response.json();

      if (response.ok) {
        setToken(data.access_token);
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('userId', data.user_id);
        localStorage.setItem('tier', data.tier);
        
        // Set user data immediately if available in response
        if (data.email) {
          setUser({
            id: data.user_id,
            email: data.email,
            full_name: fullName,
            tier: data.tier,
            created_at: data.created_at || new Date().toISOString()
          });
        }
        
        return;
      } else {
        throw new Error(data.detail || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }

  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('tier');
  }

  async function refreshUser() {
    if (token) {
      await fetchUser();
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, loginWithGoogle, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
