import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Check, Crown, Zap } from 'lucide-react';
import { RateLimitInfo } from '../lib/authApi';

interface TierFeature {
  name: string;
  basic: string | boolean;
  pro: string | boolean;
  enterprise: string | boolean;
}

const tierFeatures: TierFeature[] = [
  {
    name: 'API Calls per day',
    basic: '500',
    pro: '5,000',
    enterprise: 'Unlimited'
  },
  {
    name: 'Copilot Questions per day',
    basic: '100',
    pro: '1,000',
    enterprise: 'Unlimited'
  },
  {
    name: 'Priority Support',
    basic: false,
    pro: true,
    enterprise: true
  },
  {
    name: 'Custom Integrations',
    basic: false,
    pro: false,
    enterprise: true
  },
  {
    name: 'Team Collaboration',
    basic: false,
    pro: true,
    enterprise: true
  }
];

const tiers = [
  {
    name: 'BASIC',
    price: 19,
    description: 'Perfect for individual developers',
    icon: Zap,
    color: 'from-blue-500 to-blue-600'
  },
  {
    name: 'PRO',
    price: 49,
    description: 'For professional developers',
    icon: Crown,
    color: 'from-purple-500 to-purple-600',
    popular: true
  },
  {
    name: 'ENTERPRISE',
    price: 'Custom',
    description: 'For teams and organizations',
    icon: Crown,
    color: 'from-amber-500 to-amber-600'
  }
];

export function UpgradeModal() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);

  useEffect(() => {
    const handleRateLimitExceeded = (event: any) => {
      setRateLimitInfo(event.detail);
      setOpen(true);
    };

    window.addEventListener('ratelimit:exceeded', handleRateLimitExceeded);

    return () => {
      window.removeEventListener('ratelimit:exceeded', handleRateLimitExceeded);
    };
  }, []);

  const handleUpgrade = (tier: string) => {
    // TODO: Implement actual upgrade logic (redirect to payment page, etc.)
    console.log('Upgrading to:', tier);
    alert(`Upgrade to ${tier} tier - Payment integration coming soon!`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">⚠️ Rate Limit Reached</DialogTitle>
          <DialogDescription>
            {rateLimitInfo && (
              <div className="mt-2 text-base">
                <p className="mb-2">{rateLimitInfo.message}</p>
                <div className="flex items-center gap-4 text-sm">
                  <span>Current Usage: <strong>{rateLimitInfo.current_usage}/{rateLimitInfo.limit}</strong></span>
                  <Badge variant="outline">Your Tier: {rateLimitInfo.tier.toUpperCase()}</Badge>
                </div>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-4">Upgrade Your Plan</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {tiers.map((tier) => {
              const Icon = tier.icon;
              const isCurrentTier = user?.tier.toUpperCase() === tier.name;
              
              return (
                <Card
                  key={tier.name}
                  className={`relative ${tier.popular ? 'border-primary shadow-lg' : ''}`}
                >
                  {tier.popular && (
                    <Badge className="absolute -top-2 left-1/2 -translate-x-1/2">
                      Most Popular
                    </Badge>
                  )}
                  
                  <CardHeader>
                    <div className={`w-12 h-12 rounded-lg bg-gradient-to-r ${tier.color} flex items-center justify-center mb-2`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <CardTitle className="flex items-center gap-2">
                      {tier.name}
                      {isCurrentTier && <Badge variant="secondary">Current</Badge>}
                    </CardTitle>
                    <CardDescription>{tier.description}</CardDescription>
                    <div className="mt-2">
                      <span className="text-3xl font-bold">
                        {typeof tier.price === 'number' ? `$${tier.price}` : tier.price}
                      </span>
                      {typeof tier.price === 'number' && (
                        <span className="text-muted-foreground">/month</span>
                      )}
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <ul className="space-y-2 mb-4">
                      {tierFeatures.map((feature) => {
                        const value = feature[tier.name.toLowerCase() as keyof TierFeature];
                        const isIncluded = value !== false;
                        
                        return (
                          <li key={feature.name} className="flex items-start gap-2 text-sm">
                            {isIncluded ? (
                              <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                            ) : (
                              <span className="h-4 w-4 mt-0.5 shrink-0" />
                            )}
                            <span className={!isIncluded ? 'text-muted-foreground line-through' : ''}>
                              {feature.name}: {typeof value === 'string' ? value : ''}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    
                    <Button
                      className="w-full"
                      variant={tier.popular ? 'default' : 'outline'}
                      onClick={() => handleUpgrade(tier.name)}
                      disabled={isCurrentTier}
                    >
                      {isCurrentTier ? 'Current Plan' : `Upgrade to ${tier.name}`}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="text-center text-sm text-muted-foreground">
            All plans include access to core features. Cancel anytime.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
