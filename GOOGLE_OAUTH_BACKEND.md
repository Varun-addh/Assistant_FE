# Google OAuth Backend Implementation Guide

## Overview
The frontend is ready for Google OAuth. This guide explains what the backend needs to implement.

## Architecture

```
Frontend (Popup)              Backend                      Google OAuth
     |                          |                              |
     |--1. Open popup---------->|                              |
     |    /auth/google          |                              |
     |                          |--2. Redirect---------------->|
     |                          |    (with client_id, etc)     |
     |                          |                              |
     |                          |<-3. Callback with code-------|
     |                          |    /auth/google/callback     |
     |                          |                              |
     |                          |--4. Exchange code for--------│
     |                          |    user info                 |
     |                          |                              |
     |<-5. Redirect to----------|                              |
     |    /auth/google/callback |                              |
     |    with token params     |                              |
     |                          |                              |
     |--6. postMessage to------>|                              |
     |    parent window         |                              |
     |                          |                              |
     └-7. Close popup           |                              |
```

## Required Endpoints

### 1. GET /auth/google
**Purpose**: Initiate Google OAuth flow

**Implementation**:
```python
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
import os

router = APIRouter()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_REDIRECT_URI = "http://localhost:8000/auth/google/callback"

@router.get("/auth/google")
async def google_login():
    # Redirect to Google OAuth consent screen
    google_auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={GOOGLE_REDIRECT_URI}&"
        "response_type=code&"
        "scope=openid%20email%20profile&"
        "access_type=offline"
    )
    return RedirectResponse(google_auth_url)
```

### 2. GET /auth/google/callback
**Purpose**: Handle Google OAuth callback and create/login user

**Implementation**:
```python
import httpx
from fastapi import Request
from fastapi.responses import RedirectResponse

GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

@router.get("/auth/google/callback")
async def google_callback(request: Request, code: str = None, error: str = None):
    if error:
        # Redirect to frontend callback with error
        return RedirectResponse(
            f"http://localhost:8080/auth/google/callback?error={error}"
        )
    
    if not code:
        return RedirectResponse(
            "http://localhost:8080/auth/google/callback?error=no_code"
        )
    
    try:
        # Exchange code for access token
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "redirect_uri": GOOGLE_REDIRECT_URI,
                    "grant_type": "authorization_code",
                }
            )
            token_data = token_response.json()
            access_token = token_data.get("access_token")
            
            # Get user info from Google
            userinfo_response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"}
            )
            userinfo = userinfo_response.json()
        
        # Extract user data
        google_id = userinfo.get("id")
        email = userinfo.get("email")
        full_name = userinfo.get("name")
        
        # Check if user exists by email or google_id
        user = await get_user_by_email_or_google_id(email, google_id)
        
        if not user:
            # Create new user
            user = await create_user(
                email=email,
                full_name=full_name,
                google_id=google_id,
                tier="free"
            )
        elif not user.google_id:
            # Link existing user to Google account
            await update_user_google_id(user.id, google_id)
        
        # Generate JWT token for the user
        jwt_token = create_access_token(user.id)
        
        # Redirect to frontend callback with user data
        return RedirectResponse(
            f"http://localhost:8080/auth/google/callback?"
            f"token={jwt_token}&"
            f"user_id={user.id}&"
            f"email={email}&"
            f"full_name={full_name}&"
            f"tier={user.tier}"
        )
        
    except Exception as e:
        return RedirectResponse(
            f"http://localhost:8080/auth/google/callback?error={str(e)}"
        )
```

## Environment Variables

Add these to your `.env` file:

```env
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

## Database Schema Changes

Add `google_id` field to your User model:

```python
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True)
    full_name = Column(String)
    password_hash = Column(String, nullable=True)  # Nullable for OAuth users
    google_id = Column(String, unique=True, nullable=True, index=True)
    tier = Column(String, default="free")
    created_at = Column(DateTime, default=datetime.utcnow)
```

## Google OAuth Setup

### 1. Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable "Google+ API"

### 2. Create OAuth 2.0 Credentials
1. Navigate to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Choose "Web application"
4. Add authorized redirect URIs:
   - `http://localhost:8000/auth/google/callback`
   - `https://yourdomain.com/auth/google/callback` (production)
5. Copy Client ID and Client Secret

### 3. Configure OAuth Consent Screen
1. Navigate to "OAuth consent screen"
2. Choose "External" (for testing) or "Internal" (for organization)
3. Fill in app name, user support email, developer email
4. Add scopes: `openid`, `email`, `profile`
5. Add test users (if external and in testing mode)

## Frontend Flow (Already Implemented)

```typescript
// 1. User clicks "Continue with Google" button
const loginWithGoogle = async () => {
  // 2. Open popup window
  const popup = window.open(
    'http://localhost:8000/auth/google',
    'Google Sign In',
    'width=500,height=600'
  );
  
  // 3. Listen for postMessage from callback page
  window.addEventListener('message', (event) => {
    if (event.data.type === 'google-auth-success') {
      // 4. Store token and user data
      localStorage.setItem('token', event.data.access_token);
      localStorage.setItem('user', JSON.stringify({
        id: event.data.user_id,
        email: event.data.email,
        full_name: event.data.full_name,
        tier: event.data.tier
      }));
      // 5. Redirect to app
    }
  });
};
```

## Testing

### Local Testing
1. Start backend: `uvicorn main:app --reload --port 8000`
2. Start frontend: `npm run dev` (port 8080)
3. Click "Continue with Google" on login page
4. Should redirect to Google, then back to app with user logged in

### Test User Flow
1. **New User**: Creates account with Google email, sets tier to "free"
2. **Existing Email User**: Links Google ID to existing account
3. **Returning Google User**: Logs in directly

## Security Considerations

1. **State Parameter**: Add CSRF protection
```python
import secrets
state = secrets.token_urlsafe(32)
# Store in session, verify in callback
```

2. **Token Validation**: Verify Google tokens
```python
from google.oauth2 import id_token
from google.auth.transport import requests

idinfo = id_token.verify_oauth2_token(
    token, requests.Request(), GOOGLE_CLIENT_ID
)
```

3. **HTTPS in Production**: Use HTTPS for all OAuth redirects

4. **Secure Redirect**: Validate redirect URLs to prevent open redirects

## Troubleshooting

### "redirect_uri_mismatch"
- Ensure redirect URI in Google Console exactly matches `GOOGLE_REDIRECT_URI`
- Check for trailing slashes: `http://localhost:8000/auth/google/callback` vs `/callback/`

### "invalid_client"
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
- Check that OAuth consent screen is configured

### Popup blocked
- User has popup blocker enabled
- Frontend already handles this with try-catch and error message

### User created but token not received
- Check JWT token generation logic
- Verify redirect URL includes all required parameters

## Production Deployment

1. Update redirect URIs in Google Console:
   ```
   https://yourdomain.com/auth/google/callback
   ```

2. Update frontend callback URL in backend:
   ```python
   FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8080")
   return RedirectResponse(
       f"{FRONTEND_URL}/auth/google/callback?token={jwt_token}..."
   )
   ```

3. Enable HTTPS and update CORS settings

4. Set environment variables in production:
   ```env
   GOOGLE_CLIENT_ID=production_client_id
   GOOGLE_CLIENT_SECRET=production_secret
   FRONTEND_URL=https://yourdomain.com
   ```

## API Response Format

The backend callback should redirect to frontend with these URL parameters:

**Success**:
```
http://localhost:8080/auth/google/callback?
  token=jwt_token_here&
  user_id=123&
  email=user@example.com&
  full_name=John%20Doe&
  tier=free
```

**Error**:
```
http://localhost:8080/auth/google/callback?
  error=authentication_failed
```

The frontend GoogleCallback component will parse these and postMessage to the opener window.
