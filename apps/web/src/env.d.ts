/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_PB_URL: string
  readonly PUBLIC_SITE_URL: string
  readonly PUBLIC_RELEASES_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
