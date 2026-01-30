import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getQuota, requestEmailVerification } from '../lib/authApi';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { User, LogOut, Crown, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface QuotaInfo {
  limits: {
    daily_api_calls: number;
    daily_copilot_questions: number;
  };
  usage: {
    api_calls_today: number;
    copilot_questions_today: number;
  };
}

type UserProfileVariant = 'header' | 'sidebar' | 'icon';

function maskEmail(email: string) {
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0) return trimmed;

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const visible = Math.min(2, Math.max(1, local.length));
  const localMasked = local.length <= visible ? local : `${local.slice(0, visible)}…`;
  return `${localMasked}@${domain}`;
}

export function UserProfile({
  showLogout = true,
  variant = 'header',
  onLogout,
  showTier = false,
  showEmailInTrigger = false,
}: {
  showLogout?: boolean;
  variant?: UserProfileVariant;
  onLogout?: () => void;
  showTier?: boolean;
  showEmailInTrigger?: boolean;
}) {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [sendingVerification, setSendingVerification] = useState(false);

  useEffect(() => {
    if (user) {
      loadQuota();
    }
  }, [user]);

  const loadQuota = async () => {
    try {
      const quotaData = await getQuota();
      setQuota(quotaData);
    } catch (error) {
      console.error('Failed to load quota:', error);
      // Don't show quota if it fails - user can still logout
      setQuota(null);
    }
  };

  if (!user) return null;

  const maskedEmail = user.email ? maskEmail(user.email) : '';
  const displayName = user.full_name?.trim() || maskedEmail || 'Account';

  const getTierColor = (tier: string) => {
    switch (tier.toLowerCase()) {
      case 'free':
        return 'default';
      case 'basic':
        return 'secondary';
      case 'pro':
        return 'default';
      case 'enterprise':
        return 'default';
      default:
        return 'default';
    }
  };

  const getTierIcon = (tier: string) => {
    if (tier.toLowerCase() === 'pro' || tier.toLowerCase() === 'enterprise') {
      return <Crown className="h-3 w-3" />;
    }
    return null;
  };

  const handleLogout = () => {
    logout();
    onLogout?.();
  };

  const handleSendVerification = async () => {
    setSendingVerification(true);
    try {
      await requestEmailVerification();
      toast({
        title: 'Verification email sent',
        description: 'Check your inbox for the verification link.',
      });
    } catch (err: any) {
      toast({
        title: 'Could not send email',
        description: err?.message || 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setSendingVerification(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'icon' ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-xl hover:bg-muted/50"
            aria-label="Account"
            title="Account"
          >
            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
              <User className="h-4 w-4" />
            </div>
          </Button>
        ) : variant === 'sidebar' ? (
          <Button
            variant="ghost"
            className="w-full justify-start gap-2.5 h-auto py-2 px-2 rounded-xl hover:bg-muted/50"
          >
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="text-sm font-semibold leading-tight truncate">{displayName}</div>
              {showEmailInTrigger && maskedEmail && (
                <div className="text-[11px] text-muted-foreground leading-tight truncate">{maskedEmail}</div>
              )}
            </div>
            {showTier && (
              <Badge variant={getTierColor(user.tier)} className="gap-1 shrink-0">
                {getTierIcon(user.tier)}
                {user.tier.toUpperCase()}
              </Badge>
            )}
          </Button>
        ) : (
          <Button variant="ghost" className="flex items-center gap-2">
            <User className="h-4 w-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{displayName}</p>
            {maskedEmail && (
              <p className="text-xs text-muted-foreground">{maskedEmail}</p>
            )}
            {showTier && (
              <div className="pt-1">
                <Badge variant={getTierColor(user.tier)} className="gap-1">
                  {getTierIcon(user.tier)}
                  {user.tier.toUpperCase()}
                </Badge>
              </div>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {quota && quota.usage && quota.limits && (
          <>
            <div className="px-2 py-2 text-xs">
              <div className="flex justify-between mb-1">
                <span className="text-muted-foreground">API Calls:</span>
                <span className="font-medium">
                  {quota.usage.api_calls_today ?? 0}/{quota.limits.daily_api_calls ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Questions:</span>
                <span className="font-medium">
                  {quota.usage.copilot_questions_today ?? 0}/{quota.limits.daily_copilot_questions ?? 0}
                </span>
              </div>
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem onClick={handleSendVerification} disabled={sendingVerification}>
          <Mail className="mr-2 h-4 w-4" />
          {sendingVerification ? 'Sending verification…' : 'Send verification email'}
        </DropdownMenuItem>

        {showLogout && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
