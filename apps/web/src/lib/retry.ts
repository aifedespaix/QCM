/**
 * Lectures réseau : délai maximal et relance.
 *
 * Une requête qui ne répond jamais (connexion mobile qui s'endort, proxy dont la connexion vers
 * PocketBase est bloquée) ne déclenche aucune erreur : sans délai maximal, `await` reste suspendu
 * pour toujours et la page affiche son squelette jusqu'au rechargement. Chaque lecture (GET) est
 * donc coupée après `GET_TIMEOUT_MS`, ce qui la transforme en erreur transitoire que `withRetry`
 * rejoue sur une nouvelle connexion.
 */

/** Une réponse saine arrive en moins d'une seconde : au-delà, mieux vaut repartir sur une nouvelle connexion. */
export const GET_TIMEOUT_MS = 6000

/** Un fichier .qcm avec ses images pèse quelques Mo : délai plus large, sur une connexion lente. */
export const FILE_TIMEOUT_MS = 30000

export const RETRY_ATTEMPTS = 4

function isTransient(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status
  return status === undefined || status === 0 || status >= 500 || status === 408 || status === 429
}

/**
 * Rejoue une lecture quand le réseau a flanché (coupure brève, mobile, serveur qui redémarre,
 * délai dépassé). Les erreurs « normales » du serveur (4xx : introuvable, refusé…) ne sont pas rejouées.
 */
export async function withRetry<T>(run: () => Promise<T>, attempts = RETRY_ATTEMPTS, pauseMs = 400): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (!isTransient(error) || attempt >= attempts) throw error
      await new Promise((resolve) => setTimeout(resolve, pauseMs * attempt))
    }
  }
}

/** Pose le délai maximal sur une lecture qui n'a pas déjà son propre signal d'annulation. */
export function withGetTimeout<O extends { method?: string; signal?: AbortSignal | null }>(options: O, ms = GET_TIMEOUT_MS): O {
  const method = (options.method ?? 'GET').toUpperCase()
  if (method !== 'GET' || options.signal) return options
  return { ...options, signal: AbortSignal.timeout(ms) }
}
