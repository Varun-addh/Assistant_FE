import { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';

interface RateLimitWarningProps {
  onUpgradeClick?: () => void;
}

export function RateLimitWarning({ onUpgradeClick }: RateLimitWarningProps) {
  const [warning, setWarning] = useState<{ message: string; remaining: number; limit: number } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleWarning = (event: any) => {
      setWarning(event.detail);
      setVisible(true);
      
      // Auto-hide after 10 seconds
      setTimeout(() => setVisible(false), 10000);
    };

    window.addEventListener('ratelimit:warning', handleWarning);

    return () => {
      window.removeEventListener('ratelimit:warning', handleWarning);
    };
  }, []);

  if (!visible || !warning) return null;

  const percentage = (warning.remaining / warning.limit) * 100;

  return (
    <Alert variant="destructive" className="fixed bottom-4 right-4 max-w-md z-50 animate-in slide-in-from-bottom">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Rate Limit Warning</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="mb-2">{warning.message}</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-secondary rounded-full h-2">
            <div
              className="bg-destructive h-2 rounded-full transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="text-xs font-medium">
            {warning.remaining}/{warning.limit}
          </span>
        </div>
        {onUpgradeClick && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            onClick={onUpgradeClick}
          >
            Upgrade Now
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
