# Stratax AI – AI Interview Assistant

A mobile‑first React + Vite application that helps users prepare and perform in interviews. It generates polished, ready‑to‑speak answers with examples and best practices. The app is installable as a PWA and supports voice input, resume uploads, versioned edits, and quick mobile actions.

## Highlights
- Mobile‑first UX with a fixed composer and compact reading experience
- AI answer generation with streaming display and rich formatting
- Inline edit‑and‑compare flow (Original vs Latest)
- Resume/profile upload for context (PDF/DOC/TXT)0
- Voice capture (Web Speech API when available)
- History browsing and session management
- PWA installability for Android/iOS (Add to Home screen / Install)

## Tech Stack
- React + TypeScript (Vite)
- TailwindCSS + shadcn/ui (Radix primitives)
- lucide‑react icons
- Service Worker + Web App Manifest (PWA)
- Firebase Hosting (example) or any static hosting

## Project Structure
```
src/
  components/
    InterviewAssistant.tsx   # Main screen shell & state
    SearchBar.tsx            # Mobile composer, mic/upload/send
    AnswerCard.tsx           # Streamed answer, inline edit, actions
    ThemeToggle.tsx          # Dark/light
    ui/*                     # shadcn ui primitives
  hooks/*                    # theme, toast, mic helpers
  lib/api.ts                 # API calls (create session, submit question, history)
  main.tsx                   # App bootstrap + SW registration
public/
  manifest.webmanifest       # PWA manifest
  sw.js                      # Service worker (cache core assets)
  icons/                     # App icons (192/512/maskable)
```

## Key Features
- Answer generation with streaming UI and markdown‑like formatting (headings, lists, code, tables)
- Inline editing of the last question with “Cancel” and “Send” controls
- Version navigation (Original/Latest) for edited responses
- History sidebar with delete, mobile overlay
- Mobile long‑press quick actions (copy/edit)
- PWA: offline core caching, standalone launch, app icon

## Getting Started
Prerequisites: Node 18+, pnpm/npm, modern browser.

Install and run:
```bash
npm install
npm run dev
```
Build:
```bash
npm run build
npm run preview
```

Environment:
- Create `.env` if your API endpoints require configuration. Default API functions live in `src/lib/api.ts` and can be adapted to your backend.

## PWA Setup
- Manifest: `public/manifest.webmanifest` contains name, colors, scope, `display: standalone`, and icons.
- Icons: place exact filenames in `public/icons/`:
  - `stratax-ai-192.png` (192×192)
  - `stratax-ai-512.png` (512×512)
  - `stratax-ai-maskable-512.png` (512×512, mask‑safe)
- Service worker: `public/sw.js` provides simple cache‑first for core assets.
- Registration: handled in `src/main.tsx`.

Install on mobile:
- Android/Chrome: Menu (⋮) → Add to Home screen (or the in‑app Install button when shown).
- iOS/Safari: Share → Add to Home Screen.

## Deployment
- Any static host works (Firebase Hosting, Vercel, Netlify, Cloudflare Pages).
- Ensure HTTPS and that `/.well-known` and `manifest.webmanifest` are served without redirects.

### Hugging Face Spaces (Private) — Host UI inside the Space

If you make the Space **private**, the frontend must be served from the **same origin** as the backend (through HF’s authenticated reverse proxy), otherwise the browser will see `404` for API calls.

This repo includes a Docker Space setup (`Dockerfile` + `nginx.conf`) that serves the built Vite app on port `7860` with SPA routing.

Steps:
1) Create a new Hugging Face Space → **SDK: Docker**
2) Push this repo to that Space (or connect GitHub)
3) In Space Settings → Variables:
  - Set `VITE_API_BASE_URL` to an empty value (or leave it unset; when hosted on `*.hf.space` it defaults to same-origin)
4) Rebuild the Space

Notes:
- When hosted on HF, API requests should be relative (`/api/...`) so they go through HF auth.
- If you need your backend to be private too, it must be served from the same Space/origin as these `/api/...` routes.

### Firebase Hosting (example)
```bash
# after firebase init hosting
npm run build
firebase deploy
```

## Android Play Store (TWA) – Optional
Use Trusted Web Activity (Bubblewrap) to ship the PWA as a Play Store app.
1) Install Bubblewrap: `npm i -g @bubblewrap/cli`
2) Initialize: `bubblewrap init --manifest=https://YOUR_DOMAIN/manifest.webmanifest`
3) Build AAB: `bubblewrap build`
4) Host `/.well-known/assetlinks.json` with your signing cert fingerprint
5) Upload AAB in Google Play Console and complete listing

## Architecture Notes
- `InterviewAssistant` orchestrates session, history, and UI layout.
- `SearchBar` manages input, mic, upload, and send controls.
- `AnswerCard` renders streamed content with robust sanitization and formatting, plus inline edit controls.
- API layer (`lib/api.ts`) centralizes HTTP calls and response types.

## Accessibility & Performance
- Keyboard and touch‑friendly controls; large hit targets on mobile.
- Content streaming avoids layout jumps, while final render converts to semantic blocks.
- Lighthouse‑friendly PWA configuration.

## Customization
- Theme: adjust Tailwind config and `ThemeToggle`.
- Branding: replace icons in `public/icons/` and update manifest colors.
- Copy and headers: update titles in `index.html` and visible labels in `InterviewAssistant.tsx`.

## Troubleshooting
- “Install app” missing: ensure correct icon filenames/sizes, HTTPS, and a responding SW. Clear site data, reload, interact once.
- Gray letter icon: verify PNG names match manifest exactly and reinstall.
- Service worker cache issues: bump `CACHE_NAME` in `public/sw.js` and reload.

## License
Internal project – all rights reserved.


