# Firebase Authentication — authorized domains

Add these under **Firebase Console → Authentication → Settings → Authorized domains** (each as its own row; Firebase includes `localhost` by default on many projects — confirm it is present).

| Domain | Purpose |
|--------|---------|
| `localhost` | Local dev (`npm run dev`, typically port 3000) |
| `project-integrity.vercel.app` | Production Vercel alias |
| `project-integrity-e9fm03doj-exstocura1-webs-projects.vercel.app` | Per-deployment Vercel hostname (optional but avoids surprises) |
| `app.exstocura.com` | Custom domain when DNS is mapped |

Also verify **Authentication → Sign-in method → Google** is enabled.

### Google Cloud OAuth (linked automatically by Firebase)

If you use a **custom** OAuth client, ensure **Authorized redirect URIs** include Firebase’s handler, e.g.:

`https://<your-project-id>.firebaseapp.com/__/auth/handler`

…and if you use a custom auth domain, the matching `__/auth/handler` URL Firebase documents for that domain.
