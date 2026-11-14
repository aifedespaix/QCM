import { readonly, ref } from 'vue'

export type QcmTheme = 'light' | 'dark'

const STORAGE_KEY = 'qcm:theme'

function initialTheme(): QcmTheme {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Stockage indisponible : on suit le système.
  }
  const prefersDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  return prefersDark ? 'dark' : 'light'
}

const theme = ref<QcmTheme>(initialTheme())

function apply(value: QcmTheme): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = value
}

apply(theme.value)

function setTheme(value: QcmTheme): void {
  theme.value = value
  apply(value)
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value)
  } catch {
    // Stockage indisponible : le thème reste valable pour la session.
  }
}

/** Thème clair/sombre partagé, conservé dans localStorage, appliqué sur <html data-theme>. */
export function useQcmTheme() {
  return {
    theme: readonly(theme),
    setTheme,
    toggleTheme: () => setTheme(theme.value === 'dark' ? 'light' : 'dark'),
  }
}
