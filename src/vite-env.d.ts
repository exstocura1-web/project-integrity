/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  /** @deprecated Prefer VITE_API_BASE_URL; kept for Vercel configs that only set this name */
  readonly VITE_API_URL: string;
  readonly VITE_SOCKET_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
