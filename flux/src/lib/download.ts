// Enregistrement d'un fichier généré (PDF, CSV, sauvegarde JSON).
// Dans la version artefact de claude.ai, le cadre interdit les téléchargements
// directs : on passe par la capacité « downloads », qui demande confirmation.
// Partout ailleurs, lien de téléchargement classique.

type Downloads = { save: (req: { filename: string; data: Blob | string }) => Promise<{ status: string }> }
type ClaudeHost = { use?: (name: string) => Promise<unknown> }

let host: Promise<Downloads | null> | null = null
const artifactDownloads = () => {
  const claude = (window as unknown as { claude?: ClaudeHost }).claude
  if (!claude?.use) return Promise.resolve(null)
  host ??= claude.use('downloads').then((d) => (d as Downloads | null) ?? null).catch(() => null)
  return host
}

export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const downloads = await artifactDownloads()
  if (downloads) {
    try {
      await downloads.save({ filename, data: blob })
      return
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'declined') throw new Error('Téléchargement annulé.')
      if (code === 'rate_limited') throw new Error('Un autre téléchargement attend ta confirmation.')
      throw new Error('Téléchargement impossible dans cette vue.')
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
