# Firebase Authentication — authorized domains

Add these under **Firebase Console → Authentication → Settings → Authorized domains** (each as its own row; Firebase includes `localhost` by default on many projects — confirm it is present).

| Domain | Purpose |
|--------|---------|
| `localhost` | Local dev (`npm run dev`, typically port 3000) |
| `projectintegrity.cloud` | Production custom domain (apex) |
| `www.projectintegrity.cloud` | Production custom domain (`www`) |
| `project-integrity.vercel.app` | Default Vercel production hostname (optional if using custom domain only) |
| `project-integrity-e9fm03doj-exstocura1-webs-projects.vercel.app` | Per-deployment Vercel hostname (optional for preview builds) |
| `app.exstocura.com` | Other custom domain when DNS is mapped |

Also verify **Authentication → Sign-in method → Google** is enabled.

### Google Cloud Console — OAuth 2.0 Web client (fixes `signInWithRedirect` loops on custom domains)

Firebase injects your **Web client ID** into the client SDK. The same client must allow your **real site origins** and **all redirect handlers** Google uses during the redirect flow.

1. **Find the Web client ID**
   - [Google Cloud Console](https://console.cloud.google.com/) → select project **`gen-lang-client-0942661754`** (same as Firebase).
   - **APIs & Services** → **Credentials**.
   - Under **OAuth 2.0 Client IDs**, open the **Web client** (often named like *Web client (auto created by Google Service)*).

2. **Authorized JavaScript origins** — add every origin users sign in from:

   - `https://projectintegrity.cloud`
   - `https://www.projectintegrity.cloud`
   - `https://gen-lang-client-0942661754.firebaseapp.com` (matches `authDomain` in `firebase-applet-config.json`)
   - Optional: `http://localhost:3000` and `http://localhost:5173` for local dev.

3. **Authorized redirect URIs** — include **both** Firebase’s handler on the default auth domain **and** your custom hosts (Firebase may complete the round-trip via your page origin):

   - `https://gen-lang-client-0942661754.firebaseapp.com/__/auth/handler` (**required** for default `authDomain`)
   - `https://projectintegrity.cloud/__/auth/handler`
   - `https://www.projectintegrity.cloud/__/auth/handler`

4. Save, wait a minute, then retry sign-in in an incognito window.

If any origin or redirect URI is missing, Google accepts the login but Firebase never establishes a session — the app returns to the login screen (auth loop).
