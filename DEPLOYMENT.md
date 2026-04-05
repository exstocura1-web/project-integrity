# Deployment Guide — Project Integrity

Private deployment for a single consultant. Total time: ~2 hours.

---

## Step 1 — Get your Firebase UID (5 minutes)

1. Open your app in Google AI Studio and sign in
2. Open browser DevTools (F12) → Console tab
3. Type this and press Enter:
   ```
   firebase.auth().currentUser.uid
   ```
4. Copy the UID string (e.g. `abc123XYZdef456GHI`)
5. Open `firestore.rules` and replace `REPLACE_WITH_YOUR_FIREBASE_UID` with it

---

## Step 2 — Set up GitHub (10 minutes)

```bash
# Extract the zip, open terminal in the folder, then:
git init
git add .
git commit -m "initial commit"

# Create a NEW PRIVATE repo at github.com (click + → New repository)
# Then connect and push:
git remote add origin https://github.com/YOUR_USERNAME/project-integrity.git
git branch -M main
git push -u origin main
```

---

## Step 3 — Get your Firebase service account (5 minutes)

Your server needs to write to Firestore. This is separate from the client-side Firebase config.

1. Firebase Console → Project Settings (gear icon)
2. Service Accounts tab
3. Click **Generate new private key** → download the JSON file
4. Open the JSON — you need three values:
   - `project_id` → becomes `FIREBASE_PROJECT_ID`
   - `client_email` → becomes `FIREBASE_CLIENT_EMAIL`
   - `private_key` → becomes `FIREBASE_PRIVATE_KEY` (the whole string including `-----BEGIN...`)

---

## Step 4 — Deploy backend to Railway (20 minutes)

Railway hosts your Express + Socket.io server.

1. Go to [railway.app](https://railway.app) → Sign up with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `project-integrity` repo
4. Railway auto-detects Node.js and uses `railway.toml` for build/start commands
5. Click **Variables** tab and add every variable from `.env.example`:

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `APP_URL` | Set AFTER Railway gives you a URL (e.g. `https://project-integrity.up.railway.app`) |
| `FIREBASE_PROJECT_ID` | From service account JSON |
| `FIREBASE_CLIENT_EMAIL` | From service account JSON |
| `FIREBASE_PRIVATE_KEY` | From service account JSON (paste the full string) |
| `ONEDRIVE_CLIENT_ID` | Azure Portal (optional — skip for now) |
| `ONEDRIVE_CLIENT_SECRET` | Azure Portal (optional — skip for now) |

6. Railway deploys automatically. Wait ~2 minutes.
7. Click **Settings** → **Domains** → copy your Railway URL (e.g. `https://project-integrity.up.railway.app`)
8. Go back to Variables → update `APP_URL` to that Railway URL

**Verify it works:** Open `https://your-railway-url.up.railway.app/api/webhooks/smartpm` in browser — should return a 404 (not an error page). That means the server is running.

---

## Step 5 — Deploy frontend to Vercel (15 minutes)

Vercel hosts your React UI.

1. Go to [vercel.com](https://vercel.com) → Sign up with GitHub
2. Click **Add New Project** → Import your `project-integrity` repo
3. Set these build settings:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Add environment variables (Production — use your real Railway hostname):
   - `VITE_API_BASE_URL` = your Railway API URL (e.g. `https://project-integrity.up.railway.app`) — **preferred**
   - `VITE_SOCKET_URL` = same host as above (no trailing slash)
   - If an older project only has `VITE_API_URL`, set it to the same Railway URL (see `vite-env.d.ts`); prefer renaming to `VITE_API_BASE_URL` in the Vercel UI when possible.
5. Click **Deploy**. Vercel builds and deploys in ~1 minute.
6. Production UI is served at your custom domain (e.g. `https://projectintegrity.cloud`) once DNS is configured; default `*.vercel.app` hostnames remain available for previews.

**Custom domain:** Vercel → Project → Settings → Domains → add `projectintegrity.cloud` / `www.projectintegrity.cloud`. Set Railway `FRONTEND_URL` to the canonical browser origin you use (e.g. `https://projectintegrity.cloud`) so CORS matches.

---

## Step 6 — Deploy Firestore security rules (5 minutes)

```bash
# Install Firebase CLI if you haven't
npm install -g firebase-tools

# Login
firebase login

# In your project folder:
firebase use YOUR_PROJECT_ID

# Deploy the rules
firebase deploy --only firestore:rules
```

Verify in Firebase Console → Firestore → Rules tab — you should see your new locked rules.

---

## Step 7 — Test the full pipeline (15 minutes)

1. Open your Vercel URL in browser
2. Sign in with your Google account (Exstocura1@gmail.com)
3. Go to Data Sources → upload a real XER file
4. Watch the Workflow Logs — should show "Schedule Ingested" with real activity count and SQI score
5. Go to Firebase Console → Firestore → Data → expand `clients` → your project data should be there
6. Your Command Center KPI cards will still show mock data until you wire `useProjectData.ts` (Step 8)

---

## Step 8 — Wire real data to dashboard (1–2 hours)

Open `src/App.tsx`. At the top of the `App()` function, add:

```tsx
import { useProjectData } from './hooks/useProjectData';

// Inside App():
const [activeClientId, setActiveClientId] = useState("my-client");
const [activeProjectId, setActiveProjectId] = useState("project-alpha");
const { summary, qualityTrend, tasks, loading, meta } = useProjectData(activeClientId, activeProjectId);
```

Then replace each hardcoded value — `useProjectData.ts` has a comment block showing exactly which lines to change for each KPI card.

---

## Monthly running costs

| Service | Cost |
|---|---|
| Railway (Hobby plan) | $5/month |
| Vercel (free tier) | $0 |
| Firebase Spark plan | $0 |
| Claude API (5 clients, weekly analysis) | ~$30–60/month |
| **Total** | **~$35–65/month** |

---

## Troubleshooting

**Railway deploy fails:** Check build logs — usually a missing env variable. Ensure `FIREBASE_PRIVATE_KEY` has no extra quotes.

**Firestore permission denied:** Your UID in `firestore.rules` doesn't match. Go to Firebase → Authentication → Users → copy UID exactly.

**Socket.io not connecting:** In Vercel, set `VITE_SOCKET_URL` (and `VITE_API_BASE_URL` / `VITE_API_URL`) to your Railway URL (not localhost). The browser must use the real `https://…` Railway host, not a relative path, in a split deploy.

**XER parse returns 0 activities:** The XER may use a different encoding. Try re-exporting from P6 with UTF-8 encoding selected.
