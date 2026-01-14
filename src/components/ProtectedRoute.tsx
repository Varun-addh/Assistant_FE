import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAuth?: boolean;
}

/**
 * ProtectedRoute component that guards routes based on authentication status
 * 
 * @param children - Components to render if authorized
 * @param requireAuth - If true, requires user to be logged in. If false, redirects logged-in users away.
 */
export function ProtectedRoute({ children, requireAuth = true }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If route requires auth and user is not logged in, redirect to login
  if (requireAuth && !user) {
    return <Navigate to="/login" replace />;
  }

  // If route is for guests only (like login page) and user is logged in, redirect to home
  if (!requireAuth && user) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}
