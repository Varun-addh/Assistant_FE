# Environment Variables Configuration

## Local Development (.env.local)

Create a `.env.local` file for local development:

```env
# Auth API (your backend)
VITE_AUTH_API_URL=http://localhost:8000

# Interview Assistant APIs (HF Space)
VITE_API_BASE_URL=https://intvmate-interview-assistant.hf.space
VITE_API_URL=https://intvmate-interview-assistant.hf.space
VITE_INTELLIGENCE_API_URL=https://intvmate-interview-assistant.hf.space/api/intelligence
VITE_HISTORY_API_URL=https://intvmate-interview-assistant.hf.space/api/history/

# Code execution
# Code execution is backend-only via POST /api/code/execute.
# Do NOT put RapidAPI/Judge0 keys in any VITE_* variable (Vite embeds them into the browser bundle).
# Configure any sandbox providers (Judge0/RapidAPI, Piston, etc.) in your BACKEND environment instead.
# Visualize tracing + per-line explanations are enabled by request flags (e.g. trace=true, explain_trace=true) and require no additional frontend env vars.
```

## Production Deployment

### HuggingFace Spaces
Add these as **Repository secrets** in HF Space settings:

```env
VITE_AUTH_API_URL=https://your-auth-backend.com
VITE_API_BASE_URL=https://intvmate-interview-assistant.hf.space
VITE_API_URL=https://intvmate-interview-assistant.hf.space
VITE_INTELLIGENCE_API_URL=https://intvmate-interview-assistant.hf.space/api/intelligence
VITE_HISTORY_API_URL=https://intvmate-interview-assistant.hf.space/api/history/
```

### Firebase Hosting
Update `.env.production`:

```env
VITE_AUTH_API_URL=https://your-auth-backend.com
VITE_API_BASE_URL=https://intvmate-interview-assistant.hf.space
VITE_API_URL=https://intvmate-interview-assistant.hf.space
VITE_INTELLIGENCE_API_URL=https://intvmate-interview-assistant.hf.space/api/intelligence
VITE_HISTORY_API_URL=https://intvmate-interview-assistant.hf.space/api/history/
```

## Important: Google OAuth Redirect URIs

### Development
Add to Google Cloud Console OAuth credentials:
```
http://localhost:8080/auth/google/callback
```

### Production
Add to Google Cloud Console OAuth credentials:
```
https://your-production-domain.com/auth/google/callback
https://intvmate-interview-assistant.hf.space/auth/google/callback
```

## Backend Configuration

Your authentication backend needs to know the frontend URL for redirects:

```python
# Backend .env
FRONTEND_URL=http://localhost:8080  # local
# OR
FRONTEND_URL=https://your-production-domain.com  # production
FRONTEND_URL=https://intvmate-interview-assistant.hf.space  # HF Spaces

GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
```

Update backend Google OAuth callback:

```python
# In /auth/google/callback
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8080")

return RedirectResponse(
    f"{FRONTEND_URL}/auth/google/callback?"
    f"token={jwt_token}&user_id={user.id}&..."
)
```

## What Changed?

### Before
- Hardcoded `localhost:8000` for auth API
- Would only work locally

### After
- Uses `VITE_AUTH_API_URL` environment variable
- Falls back to `localhost:8000` if not set
- Works in all environments (local, HF Spaces, Firebase, etc.)

## Testing

### Local (with local backend)
```bash
# .env.local
VITE_AUTH_API_URL=http://localhost:8000

npm run dev  # Runs on http://localhost:8080
```

### Local (with production backend)
```bash
# .env.local
VITE_AUTH_API_URL=https://your-auth-backend.com

npm run dev
```

### Production Build
```bash
npm run build  # Uses .env.production
firebase deploy
```

## CORS Configuration

Your auth backend needs to allow requests from your frontend domain:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",  # Local development
        "https://your-domain.com",  # Production
        "https://intvmate-interview-assistant.hf.space",  # HF Spaces
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Common Issues

### ❌ "Failed to fetch" errors
**Solution**: Check that `VITE_AUTH_API_URL` points to your running backend

### ❌ CORS errors
**Solution**: Add your frontend domain to backend CORS allowed origins

### ❌ Google OAuth redirect_uri_mismatch
**Solution**: Add exact callback URL to Google Cloud Console (including protocol and port)

### ❌ OAuth popup blocked
**Solution**: Modern browsers block popups by default - user needs to allow popups for your domain
