# MakeTransfer — Firebase Spark + Render Free

This version runs the Express API and the frontend together on Render Free. Firebase Spark supplies Google Authentication and Cloud Firestore. Firebase Hosting can optionally serve a static mirror of the frontend and forwards API calls directly to Render using `VITE_API_URL`. No Cloud Run or Blaze plan is used.

## Important limits

- Render Free web services sleep after inactivity and can take around a minute to wake.
- Render Free has an ephemeral filesystem. This project attempts to persist uploaded file data and metadata in Firestore; the Firestore Spark quota is limited. The app's server-side local disk is not durable.
- Firestore is not Firebase Storage. Large file uploads can quickly consume Firestore storage, reads, writes and bandwidth. The existing server persistence implementation supports chunked files up to about 50 MB, but this is not a promise of unlimited free storage.
- Firebase Hosting is optional. The Render URL alone serves the complete app.

## 1. Firebase Spark setup (one time)

1. Open https://console.firebase.google.com/ and select project `maketransfer` (or update `.firebaserc` and `firebase-applet-config.json` if you use another project ID).
2. Keep the project on the **Spark** plan; do not enable Cloud Run.
3. Create the default Cloud Firestore database in a supported region.
4. In Build → Authentication → Get started, enable Google sign-in.
5. In Project settings → General → Your apps, register a Web app. Copy its `apiKey`, `appId`, `messagingSenderId`, `projectId`, `authDomain`, and `storageBucket` values into `firebase-applet-config.json`. Do not leave the `REPLACE_WITH_...` placeholders.
6. Authentication → Settings → Authorized domains: add `maketransfer.web.app` and your Render hostname (for example `maketransfer-api.onrender.com`).
7. Firestore → Rules: review the included `firestore.rules`. To make the current backend persistence work, deploy it with `firebase deploy --only firestore:rules`. **Warning:** these rules currently allow anyone to read and write `publicDocuments` because the backend uses the Firebase client SDK without Admin credentials. Anyone could alter or delete shared-document records and consume your quota. Do not use this setup for sensitive files or an important public production service; a secure production upgrade should move the backend to the Firebase Admin SDK and restrict client writes.

## 2. Deploy the full app to Render Free

1. Push this project folder to a GitHub repository. Do not commit real API keys or `.env` files.
2. In https://dashboard.render.com/ choose **New → Blueprint**, connect the repository, and select the included `render.yaml`.
3. Render creates the `maketransfer-api` web service on the Free plan. Wait for the first deploy to finish.
4. Open the generated `https://YOUR-SERVICE.onrender.com` URL. Test `https://YOUR-SERVICE.onrender.com/api/health`; it should return JSON with `status: ok`.
5. In Render → Environment, replace `APP_URL` with the exact generated Render URL. Keep `SESSION_SECRET` stable; do not regenerate it on every deployment. Save changes and redeploy.

The Render URL serves both the website and API. Since the frontend is built with an empty `VITE_API_URL` on Render, its `/api/...` calls stay on the same origin.

## 3. Optional: deploy a Firebase Hosting mirror (Spark-compatible)

This is optional because Render already serves the complete website. If you want the `https://maketransfer.web.app` address:

```bash
npm install
export VITE_API_URL="https://YOUR-SERVICE.onrender.com"
npm run build
npm install -g firebase-tools
firebase login
firebase use maketransfer
firebase deploy --only hosting
```

Replace `YOUR-SERVICE` with your real Render service hostname. The static Firebase Hosting site will call the Render API cross-origin; this app's API currently enables permissive CORS. The Render hostname must also be listed in Firebase Authentication authorized domains.

To update only the Render app, push commits to the connected GitHub branch; Render will rebuild automatically. To update the Firebase Hosting mirror, rerun the commands above with the same `VITE_API_URL`.

## 4. Local development

```bash
npm install
npm run dev
```

Open the local URL printed by Vite/Express (normally http://localhost:3000).
