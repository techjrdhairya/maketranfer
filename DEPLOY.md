# MakeTransfer: Firebase Spark + free Node backend

Firebase project: `makebytechd` (shared with MakeQR)  ·  Hosting site: `maketransfer`  ·  https://maketransfer.web.app

Spark plan = static hosting + Firestore only (no Cloud Run / Cloud Functions). MakeTransfer needs a
Node backend for uploads, passwords and zip downloads, so:

    Browser -> maketransfer.web.app (Firebase Hosting, static site)
            -> https://maketranfer.onrender.com (Node server, Render free plan)
            -> Firestore in makebytechd (files and links are stored here, so nothing is lost on restart)

## A. One-time setup
1. Firebase console > makebytechd:
   - Authentication > Settings > Authorized domains > add `maketransfer.web.app`.
   - Hosting: create the site, or run `firebase hosting:sites:create maketransfer`.
2. Install tools and log in:
```
npm install -g firebase-tools
firebase login
```
3. Backend on Render (render.com, free): New > Blueprint > pick this repo (it reads `render.yaml`),
   or New > Web Service with: Build `npm install --include=dev && npm run build`, Start `npm start`, and env vars
   `NODE_ENV=production`, `APP_URL=https://maketransfer.web.app`, `SESSION_SECRET=<long random string>`.
   Name the service `maketransfer-api`. If Render gives a different URL, put it in `.env.production`
   as `VITE_API_BASE_URL`.

## B. Build and deploy the site (every time)
```
npm install
npm run build:web
firebase deploy --only hosting:maketransfer,firestore
```
Shortcuts: `npm run deploy:web` (site only), `npm run deploy:rules` (Firestore rules only).
The backend redeploys automatically when you push to the repo Render is watching.

## Run locally
```
npm install
npm run dev        # http://localhost:3000 (frontend + backend together)
```

## Notes
- `firestore.rules` is SHARED with MakeQR. Keep the same file in both repos and deploy rules from one place.
- Render free services sleep after ~15 minutes idle; the first request afterwards takes about 30-60 s.
  Upgrade the Render plan, or use Firebase Blaze + Cloud Run, to remove that.
- `publicDocuments` in the rules is open because the server uses the client SDK. Moving the server to the
  Firebase Admin SDK would let you lock it down.
- Firestore free quota (Spark): 1 GiB stored, 20k writes and 50k reads per day. Big files use many writes.

## Keeping the free Render server awake
- The server pings its own public URL (`/api/health`) every 14 minutes. Render provides the URL automatically
  as `RENDER_EXTERNAL_URL`; set `KEEP_ALIVE_URL` only if you want to override it. Look for `[keep-alive]` in the logs.
- The website also pings the server when it opens and every 14 minutes while a tab stays open, so the server
  starts waking up before the first request.
- Backup: add a free monitor at uptimerobot.com (HTTP, every 5 minutes) on `https://maketranfer.onrender.com/api/health`.
- Render's free plan includes about 750 instance hours per month **shared by all free web services in your account**.
  One always-on service uses about 744 hours. If MakeQR (or any other free service) also runs on Render, keeping both
  awake all month exceeds the allowance and Render suspends services until the next month.

## My Documents
- The page is at `/documents` (header button "My Documents"). Drafts, published, unpublished, expired and
  unavailable documents are shown with the status the server reports.
- Deleting removes the file from the server and from Firestore (retried in the background if Firestore is slow),
  and your browser/account records are only cleaned once the server confirms.

## Devices (send to a device ID)
- Page: `/devices` (header button "Devices"). Each browser gets an ID like `K7M-4QP` the first time it opens that page;
  after that it stays connected (Server-Sent Events) so it can receive.
- **Direct mode:** both devices online -> WebRTC data channel, the file never touches the server (no size limit,
  STUN only; if a direct connection cannot be made the app falls back to the server inbox automatically).
- **Server inbox:** receiver offline -> file is uploaded as a private draft and appears in their inbox for 24 hours.
  Nothing can be downloaded until they accept.
- **Firestore rules:** the shared `firestore.rules` now includes `mtDevices` and `mtTransfers`.
  Deploy them once: `firebase deploy --only firestore`. Without them everything still works while the server stays
  up, but device IDs / inbox items are forgotten when Render restarts.
- No new npm packages and no new environment variables.
