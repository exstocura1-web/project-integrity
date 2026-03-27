<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/47153a80-b629-458d-9c40-b59544d46e9c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Production deploy notes

- Deploy frontend (Vite) to Vercel using `npm run build` with `dist` output.
- Deploy backend (`server.ts`) to a Node host (for example Railway) using `tsx server.ts`.
- Set frontend env vars in Vercel:
  - `VITE_API_BASE_URL=https://your-backend-host`
  - `VITE_SOCKET_URL=https://your-backend-host`
- Set backend env vars in Railway:
  - `APP_URL=https://your-backend-host`
  - `FRONTEND_URL=https://your-frontend-host`
