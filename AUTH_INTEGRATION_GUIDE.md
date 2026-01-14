# Authentication Integration Guide

This guide explains how to integrate the new authentication system into your Interview Assistant application.

## 🚀 What Has Been Implemented

### 1. Core Authentication System

#### **AuthContext** (`src/context/AuthContext.tsx`)
- Manages user authentication state globally
- Provides login, register, logout, and user refresh functions
- Automatically checks authentication status on app load
- Stores JWT tokens in localStorage

**Usage:**
```tsx
import { useAuth } from '@/context/AuthContext';

function MyComponent() {
  const { user, token, login, logout, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Not logged in</div>;
  
  return <div>Welcome {user.email}!</div>;
}
```

#### **Authentication API** (`src/lib/authApi.ts`)
- `apiCall()` - Makes authenticated API requests with JWT tokens
- `apiCallWithRateLimit()` - Includes rate limit tracking from headers
- Automatically handles 401 (session expired) and 429 (rate limit) errors
- Dispatches custom events for logout and rate limit warnings

**Usage:**
```tsx
import { apiCall } from '@/lib/authApi';

// Make authenticated API call
const data = await apiCall('/api/ask', 'POST', {
  session_id: 'session123',
  question: 'What is React?'
});
```

### 2. UI Components

#### **Login Component** (`src/components/Login.tsx`)
- Email/password login form
- Error handling and loading states
- Switch to register flow

#### **Register Component** (`src/components/Register.tsx`)
- New user registration form
- Password validation (minimum 8 characters)
- Confirm password matching
- Switch to login flow

#### **Auth Page** (`src/pages/Auth.tsx`)
- Combined login/register page with toggle
- Used for `/login` route

#### **UserProfile Component** (`src/components/UserProfile.tsx`)
- Displays user info, tier badge, and quota usage
- Dropdown menu with logout option
- Shows API calls and questions remaining

#### **RateLimitWarning Component** (`src/components/RateLimitWarning.tsx`)
- Shows warning when approaching rate limit (< 20%)
- Progress bar visualization
- Auto-hides after 10 seconds
- Optional upgrade button

#### **UpgradeModal Component** (`src/components/UpgradeModal.tsx`)
- Automatically appears when rate limit is exceeded
- Displays pricing tiers (Basic, Pro, Enterprise)
- Shows feature comparison
- Upgrade buttons (payment integration needed)

#### **ProtectedRoute Component** (`src/components/ProtectedRoute.tsx`)
- Guards routes based on authentication status
- Shows loading spinner while checking auth
- Redirects unauthenticated users to `/login`
- Redirects authenticated users away from `/login`

### 3. Integration Points

#### **App.tsx Updates**
- Added `/login` route with auth page
- Wrapped all protected routes with `<ProtectedRoute>`
- Added `<UpgradeModal />` and `<RateLimitWarning />` globally
- Routes automatically redirect based on auth status

#### **main.tsx Updates**
- Wrapped app with `<AuthProvider>`
- Setup global auth listener for logout events

#### **Index.tsx Updates**
- Added `<UserProfile />` component in header
- Added `<ThemeToggle />` component in header

### 4. Helper Utilities

#### **authHelpers.ts** (`src/lib/authHelpers.ts`)
- `addAuthHeaders()` - Adds JWT token to existing headers
- `authenticatedFetch()` - Wraps fetch calls with auth handling
- `setupAuthListener()` - Global listener for auth events

## 📋 Integration Checklist

### Step 1: Update Existing API Calls

You need to modify your existing API calls in `src/lib/api.ts` to include authentication. Here are three approaches:

#### **Option A: Use `authenticatedFetch` (Recommended)**

Replace `fetch` calls with `authenticatedFetch`:

```typescript
// BEFORE
const res = await fetch(`${BASE_URL}/api/session`, {
  method: "POST",
  headers: buildHeaders(),
});

// AFTER
import { authenticatedFetch } from './authHelpers';

const res = await authenticatedFetch(`${BASE_URL}/api/session`, {
  method: "POST",
  headers: buildHeaders(),
});
```

#### **Option B: Use `addAuthHeaders`**

Add auth headers to existing header builders:

```typescript
// BEFORE
export function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  return headers;
}

// AFTER
import { addAuthHeaders } from './authHelpers';

export function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  return addAuthHeaders(headers);
}
```

#### **Option C: Use `apiCall` from authApi.ts**

For new endpoints or complete rewrites, use the `apiCall` helper:

```typescript
import { apiCall } from './authApi';

export async function apiCreateSession() {
  return apiCall('/api/session', 'POST');
}

export async function apiSubmitQuestion(body: SubmitQuestionRequest) {
  return apiCall('/api/question', 'POST', body);
}
```

### Step 2: Test Authentication Flow

1. **Start your backend server** (ensure it's running on `http://localhost:8000`)
2. **Run the frontend**: `npm run dev`
3. **Test the flow**:
   - Visit `http://localhost:5173/` - should redirect to `/login`
   - Register a new account
   - Should automatically log in and redirect to home
   - Check that UserProfile appears in header
   - Logout and try logging in again

### Step 3: Configure API Base URL

Update the API_BASE_URL in authentication files if your backend is not on `localhost:8000`:

**Files to update:**
- `src/context/AuthContext.tsx` - Line 23: `const API_BASE_URL = 'http://localhost:8000';`
- `src/lib/authApi.ts` - Line 1: `const API_BASE_URL = 'http://localhost:8000';`

Or better yet, use environment variables:

```typescript
const API_BASE_URL = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8000';
```

### Step 4: Handle Rate Limit Events

The system automatically handles rate limits, but you can customize behavior:

```typescript
// Listen for rate limit warnings
window.addEventListener('ratelimit:warning', (event: any) => {
  console.warn('Rate limit warning:', event.detail);
  // Show custom notification
});

// Listen for rate limit exceeded
window.addEventListener('ratelimit:exceeded', (event: any) => {
  console.error('Rate limit exceeded:', event.detail);
  // UpgradeModal will automatically show
});
```

### Step 5: Implement Payment Integration

The `UpgradeModal` has placeholder upgrade buttons. Implement actual payment:

**In `src/components/UpgradeModal.tsx`:**

```typescript
const handleUpgrade = async (tier: string) => {
  // TODO: Integrate with Stripe, PayPal, etc.
  
  // Example with Stripe:
  const response = await apiCall('/api/create-checkout-session', 'POST', {
    tier: tier.toLowerCase()
  });
  
  // Redirect to Stripe checkout
  window.location.href = response.checkout_url;
};
```

## 🔐 Security Best Practices

1. **HTTPS in Production**: Always use HTTPS in production to protect JWT tokens
2. **Token Expiration**: Backend should implement token expiration (e.g., 24 hours)
3. **Refresh Tokens**: Consider implementing refresh tokens for better UX
4. **CORS Configuration**: Ensure backend allows requests from your frontend domain
5. **Rate Limiting**: Backend should implement proper rate limiting per user/tier

## 🎨 Customization

### Change Tier Colors

Edit `src/components/UserProfile.tsx`:

```typescript
const getTierColor = (tier: string) => {
  switch (tier.toLowerCase()) {
    case 'free': return 'default';
    case 'basic': return 'secondary';
    case 'pro': return 'default';  // Change to 'destructive', 'outline', etc.
    case 'enterprise': return 'default';
  }
};
```

### Customize Pricing Tiers

Edit `src/components/UpgradeModal.tsx`:

```typescript
const tiers = [
  {
    name: 'BASIC',
    price: 19,  // Change price
    description: 'Perfect for individual developers',
    // ... other properties
  },
  // Add or remove tiers
];

const tierFeatures: TierFeature[] = [
  // Add or modify features
  {
    name: 'API Calls per day',
    basic: '500',
    pro: '5,000',
    enterprise: 'Unlimited'
  },
];
```

## 🐛 Troubleshooting

### Issue: Infinite redirect loop between `/` and `/login`

**Solution**: Check that `ProtectedRoute` is properly implemented and `useAuth()` hook returns correct loading/user state.

### Issue: 401 errors after login

**Solution**: 
1. Check that token is being saved to localStorage
2. Verify backend is accepting the token format
3. Check CORS headers allow Authorization header

### Issue: Rate limit modal not showing

**Solution**:
1. Verify backend returns 429 status code
2. Check that `UpgradeModal` is included in App.tsx
3. Look for browser console errors

### Issue: UserProfile not showing

**Solution**:
1. Ensure user is logged in (check `useAuth()` hook)
2. Verify `UserProfile` component is imported and rendered
3. Check that API endpoint `/auth/me` works

## 📚 API Endpoints Expected

Your backend should implement these endpoints:

### Authentication
- `POST /auth/register` - Register new user
  - Body: `{ email, password, full_name }`
  - Returns: `{ access_token, user_id, email, tier, ... }`

- `POST /auth/login` - Login existing user
  - Body: `{ email, password }`
  - Returns: `{ access_token, user_id, email, tier, ... }`

- `GET /auth/me` - Get current user info
  - Headers: `Authorization: Bearer <token>`
  - Returns: `{ id, email, full_name, tier, created_at }`

- `GET /auth/quota` - Get user quota/limits
  - Headers: `Authorization: Bearer <token>`
  - Returns: `{ limits: {...}, usage: {...} }`

### Protected Endpoints
All your existing endpoints should accept `Authorization: Bearer <token>` header and:
- Return 401 if token is invalid/expired
- Return 429 if rate limit exceeded with:
  ```json
  {
    "detail": {
      "message": "Rate limit exceeded",
      "current_usage": 100,
      "limit": 100,
      "tier": "free"
    }
  }
  ```

## ✅ Complete Integration Example

Here's a complete example of integrating auth into an existing API function:

```typescript
// src/lib/api.ts - BEFORE
export async function apiCreateSession(): Promise<CreateSessionResponse> {
  const res = await fetch(`${BASE_URL}/api/session`, {
    method: "POST",
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error(`Create session failed: ${res.status}`);
  return res.json();
}

// src/lib/api.ts - AFTER (Option 1: Use authenticatedFetch)
import { authenticatedFetch } from './authHelpers';

export async function apiCreateSession(): Promise<CreateSessionResponse> {
  const res = await authenticatedFetch(`${BASE_URL}/api/session`, {
    method: "POST",
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error(`Create session failed: ${res.status}`);
  return res.json();
}

// src/lib/api.ts - AFTER (Option 2: Rewrite with apiCall)
import { apiCall } from './authApi';

export async function apiCreateSession(): Promise<CreateSessionResponse> {
  return apiCall('/api/session', 'POST');
}
```

## 🎉 Done!

Your authentication system is now fully integrated. Users can:
- ✅ Register and login
- ✅ Access protected routes
- ✅ See their tier and quota
- ✅ Receive rate limit warnings
- ✅ View upgrade options when limited
- ✅ Logout securely

For questions or issues, refer to the component source files for inline documentation.
