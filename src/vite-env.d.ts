/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEB_MODE?: string;
  readonly VITE_E2E_MODE?: string;
  readonly VITE_CI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
