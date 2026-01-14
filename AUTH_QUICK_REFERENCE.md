# Authentication System - Quick Reference

## 🔑 Getting User Info

```tsx
import { useAuth } from '@/context/AuthContext';

function MyComponent() {
  const { user, token, loading } = useAuth();
  
  // user.id - User ID
  // user.email - User email
  // user.full_name - User's full name
  // user.tier - 'free' | 'basic' | 'pro' | 'enterprise'
  // token - JWT token string
}
```

## 🔐 Making Authenticated API Calls

### Method 1: Use apiCall (Recommended for new code)
```tsx
import { apiCall } from '@/lib/authApi';

// GET request
const data = await apiCall('/api/endpoint');

// POST request
const result = await apiCall('/api/endpoint', 'POST', { key: 'value' });

// PUT/DELETE
await apiCall('/api/endpoint/123', 'DELETE');
```

### Method 2: Use authenticatedFetch (For existing code)
```tsx
import { authenticatedFetch } from '@/lib/authHelpers';

const res = await authenticatedFetch('http://localhost:8000/api/endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

### Method 3: Add to existing headers
```tsx
import { addAuthHeaders } from '@/lib/authHelpers';

const res = await fetch(url, {
  method: 'POST',
  headers: addAuthHeaders({
    'Content-Type': 'application/json',
    'X-Custom-Header': 'value'
  }),
  body: JSON.stringify(data)
});
```

## 🚪 Authentication Actions

```tsx
import { useAuth } from '@/context/AuthContext';

function AuthExample() {
  const { login, register, logout, refreshUser } = useAuth();
  
  // Login
  await login('user@example.com', 'password123');
  
  // Register
  await register('user@example.com', 'password123', 'John Doe');
  
  // Logout
  logout();
  
  // Refresh user data
  await refreshUser();
}
```

## 🛡️ Protecting Routes

```tsx
import { ProtectedRoute } from '@/components/ProtectedRoute';

// In your router
<Route path="/dashboard" element={
  <ProtectedRoute>
    <Dashboard />
  </ProtectedRoute>
} />

// For auth pages (login/register) - redirects if already logged in
<Route path="/login" element={
  <ProtectedRoute requireAuth={false}>
    <Login />
  </ProtectedRoute>
} />
```

## 📊 Showing User Info

```tsx
import { UserProfile } from '@/components/UserProfile';

// Dropdown with user info, tier badge, quota, and logout
<UserProfile />
```

## ⚠️ Rate Limit Handling

```tsx
import { RateLimitWarning } from '@/components/RateLimitWarning';
import { UpgradeModal } from '@/components/UpgradeModal';

// In your App.tsx or layout
<RateLimitWarning onUpgradeClick={() => {/* optional custom handler */}} />
<UpgradeModal />

// Listen to events programmatically
window.addEventListener('ratelimit:warning', (event: any) => {
  console.log('Warning:', event.detail);
});

window.addEventListener('ratelimit:exceeded', (event: any) => {
  console.log('Exceeded:', event.detail);
});
```

## 🔄 Auto-Logout on 401

Automatic! When any API call returns 401:
1. Token is cleared from localStorage
2. `auth:logout` event is dispatched
3. User is redirected to `/login`

## 📈 Check Quota

```tsx
import { getQuota } from '@/lib/authApi';

const quota = await getQuota();
// quota.limits.daily_api_calls
// quota.limits.daily_copilot_questions
// quota.usage.api_calls_today
// quota.usage.copilot_questions_today
```

## 🎨 Tier Badge Colors

```tsx
// In components, user.tier will be one of:
'free' | 'basic' | 'pro' | 'enterprise'

// Use Badge component
<Badge variant={user.tier === 'pro' ? 'default' : 'secondary'}>
  {user.tier.toUpperCase()}
</Badge>
```

## 🚨 Error Handling

```tsx
try {
  await apiCall('/api/endpoint', 'POST', data);
} catch (error) {
  if (error.message.includes('Session expired')) {
    // User will be auto-redirected to login
  } else if (error.message.includes('Rate limit')) {
    // UpgradeModal will auto-show
  } else {
    // Handle other errors
    console.error(error);
  }
}
```

## 📝 Custom Auth Events

```tsx
// Trigger logout manually
window.dispatchEvent(new CustomEvent('auth:logout', { 
  detail: { reason: 'Custom reason' } 
}));

// Trigger upgrade modal manually
window.dispatchEvent(new CustomEvent('ratelimit:exceeded', { 
  detail: { 
    message: 'You hit the limit',
    current_usage: 100,
    limit: 100,
    tier: 'free'
  } 
}));
```

## 🔍 Check If Logged In

```tsx
// In components
const { user } = useAuth();
if (!user) {
  return <div>Please log in</div>;
}

// Outside components
const token = localStorage.getItem('token');
const isLoggedIn = !!token;
```

## 💾 Stored Data

```typescript
// LocalStorage keys used:
localStorage.getItem('token')      // JWT token
localStorage.getItem('userId')     // User ID  
localStorage.getItem('tier')       // User tier
```

## 🎯 Common Patterns

### Loading State
```tsx
const { user, loading } = useAuth();

if (loading) {
  return <div>Loading...</div>;
}

if (!user) {
  return <Navigate to="/login" />;
}

return <Dashboard user={user} />;
```

### Conditional Rendering by Tier
```tsx
const { user } = useAuth();

{user?.tier === 'pro' && (
  <PremiumFeature />
)}

{['pro', 'enterprise'].includes(user?.tier) && (
  <AdvancedFeature />
)}
```

### Update User After Profile Change
```tsx
const { refreshUser } = useAuth();

async function updateProfile(data) {
  await apiCall('/api/profile', 'PUT', data);
  await refreshUser(); // Refresh user data
}
```

## 📦 File Structure

```
src/
├── context/
│   └── AuthContext.tsx          # Main auth state management
├── lib/
│   ├── authApi.ts              # Authenticated API helpers
│   └── authHelpers.ts          # Helper utilities
├── components/
│   ├── Login.tsx               # Login form
│   ├── Register.tsx            # Registration form
│   ├── ProtectedRoute.tsx      # Route guard
│   ├── UserProfile.tsx         # User info dropdown
│   ├── RateLimitWarning.tsx    # Rate limit alert
│   └── UpgradeModal.tsx        # Upgrade pricing modal
└── pages/
    └── Auth.tsx                # Combined login/register page
```

## ⚡ Quick Start

1. **Install dependencies** (if not already):
   ```bash
   npm install
   ```

2. **Start backend** on `http://localhost:8000`

3. **Start frontend**:
   ```bash
   npm run dev
   ```

4. **Visit** `http://localhost:5173/` → will redirect to `/login`

5. **Register** a new account → automatically logs in and redirects to home

## 🐛 Debug Mode

```tsx
// Check auth state
console.log('Token:', localStorage.getItem('token'));
console.log('User:', useAuth().user);

// Test API call
import { apiCall } from '@/lib/authApi';
apiCall('/auth/me').then(console.log).catch(console.error);
```

## 📞 Support

See `AUTH_INTEGRATION_GUIDE.md` for detailed documentation and troubleshooting.
