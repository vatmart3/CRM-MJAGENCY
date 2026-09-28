import { FileRef } from '../types'
import { BUCKET, supabase } from './supabase'
import { uid } from './format'
import { today } from './dates'

// Justificatifs : Supabase Storage en ligne, IndexedDB en mode local.
// Les photos sont réduites avant l'envoi (1 800 px, JPEG) : un ticket reste lisible
// et pèse une centaine de Ko au lieu de plusieurs Mo.

const DB = 'flux-files'
const STORE = 'files'

const idb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

const idbPut = async (key: string, blob: Blob) => {
  const db = await idb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
const idbGet = async (key: string) => {
  const db = await idb()
  return new Promise<Blob | undefined>((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as Blob | undefined)
    req.onerror = () => reject(req.error)
  })
}

/** Réduit une photo. Les PDF et petits fichiers passent tels quels. */
export const compressImage = async (file: File, max = 1800, quality = 0.82): Promise<Blob> => {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 900_000) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

const safeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(-80)

export class FileError extends Error {}

/** Enregistre un justificatif et renvoie sa référence. */
export async function saveFile(file: File): Promise<FileRef> {
  if (file.size > 15 * 1024 * 1024) throw new FileError('Fichier trop lourd (15 Mo maximum).')
  const blob = await compressImage(file)
  const isJpeg = blob !== file
  const name = isJpeg ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name
  const type = isJpeg ? 'image/jpeg' : file.type || 'application/octet-stream'
  const path = `${today().slice(0, 7)}/${uid()}-${safeName(name)}`

  if (supabase) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false })
    if (error) throw new FileError('Envoi du justificatif impossible : ' + error.message)
    return { path, name, type, size: blob.size, storage: 'cloud' }
  }
  await idbPut(path, blob)
  return { path, name, type, size: blob.size, storage: 'local' }
}

/** Adresse temporaire pour afficher ou télécharger le justificatif. */
export async function fileUrl(ref: FileRef): Promise<string> {
  if (ref.storage === 'cloud') {
    if (!supabase) throw new FileError('Ce justificatif est en ligne : connectez-vous pour l’ouvrir.')
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ref.path, 600)
    if (error || !data) throw new FileError('Justificatif introuvable.')
    return data.signedUrl
  }
  const blob = await idbGet(ref.path)
  if (!blob) throw new FileError('Justificatif introuvable dans ce navigateur.')
  return URL.createObjectURL(blob)
}

export async function fileBlob(ref: FileRef): Promise<Blob> {
  if (ref.storage === 'local') {
    const blob = await idbGet(ref.path)
    if (!blob) throw new FileError('Justificatif introuvable dans ce navigateur.')
    return blob
  }
  const res = await fetch(await fileUrl(ref))
  return res.blob()
}

export const openFile = async (ref: FileRef) => {
  // La fenêtre s'ouvre tout de suite (sinon Safari la bloque), puis reçoit l'adresse.
  const w = window.open('', '_blank')
  try {
    const url = await fileUrl(ref)
    // Fenêtre refusée (bloqueur, cadre intégré) : on ne quitte jamais l'app.
    if (!w) throw new FileError('Le navigateur a bloqué l’ouverture du justificatif.')
    w.location.href = url
  } catch (e) {
    w?.close()
    throw e
  }
}

export const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

export const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`)
