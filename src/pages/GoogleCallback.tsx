import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function GoogleCallback() {
  useEffect(() => {
    // Get the auth data from URL params (sent by backend)
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const userId = params.get('user_id');
    const email = params.get('email');
    const fullName = params.get('full_name');
    const tier = params.get('tier');
    const error = params.get('error');

    if (error) {
      // Send error back to opener window
      if (window.opener) {
        window.opener.postMessage({
          type: 'google-auth-error',
          error: error
        }, window.location.origin);
      }
      window.close();
      return;
    }

    if (token && userId) {
      // Send success message to opener window
      if (window.opener) {
        window.opener.postMessage({
          type: 'google-auth-success',
          access_token: token,
          user_id: userId,
          email: email || '',
          full_name: fullName || '',
          tier: tier || 'free'
        }, window.location.origin);
      }
      window.close();
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-12 w-12 animate-spin mx-auto text-purple-500" />
        <p className="text-muted-foreground">Completing Google sign in...</p>
      </div>
    </div>
  );
}
