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
