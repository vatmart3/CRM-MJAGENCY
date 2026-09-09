import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { clientId, isCloud, supabase } from './supabase'
import { idKeyOf, SYNCED_COLLECTIONS, SYNCED_SINGLETONS } from '../store/types'

type Row = { collection: string; id: string; data: Record<string, unknown> }
type State = Record<string, unknown>
type StoreLike = { getState: () => State; setState: (partial: State) => void }

const COLLECTIONS: readonly string[] = SYNCED_COLLECTIONS
const SINGLETONS: readonly string[] = SYNCED_SINGLETONS
const isSingleton = (c: string) => SINGLETONS.includes(c)

let store: StoreLike | null = null
let ready = false

/** État de la connexion, pour l'indicateur affiché dans la barre du haut. */
export type SyncStatus = 'local' | 'connecting' | 'live' | 'error'
let status: SyncStatus = isCloud ? 'connecting' : 'local'
let lastError: string | null = null
const listeners = new Set<(s: SyncStatus) => void>()
const notify = () => listeners.forEach((l) => l(status))
const setStatus = (s: SyncStatus) => {
  if (status === s) return
  status = s
  if (s !== 'error') lastError = null
  notify()
}
export const getSyncStatus = () => status
export const getSyncError = () => lastError

/** Traduit les erreurs Supabase les plus courantes en message actionnable. */
const explain = (e: unknown): string => {
  const raw = e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : ''
  if (/does not exist|42P01/i.test(raw) || code === '42P01')
    return 'Les tables n’existent pas encore. Exécutez le script supabase/schema.sql dans le SQL Editor de Supabase.'
  if (code === '42501' || /row-level security|violates/i.test(raw))
    return 'Accès refusé par la base. Vérifiez que votre adresse email figure bien dans la table allowed_emails.'
  if (/Invalid API key|apikey/i.test(raw)) return 'Clé Supabase invalide. Vérifiez VITE_SUPABASE_ANON_KEY.'
  if (/Failed to fetch|NetworkError|fetch failed/i.test(raw))
    return 'Base injoignable. Vérifiez la connexion internet et l’adresse VITE_SUPABASE_URL.'
  return raw
}

const fail = (e: unknown, context: string) => {
  lastError = explain(e)
  console.error('[sync] ' + context, e)
  if (status === 'error') notify()
  else setStatus('error')
}
export const onSyncStatus = (l: (s: SyncStatus) => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

// ——————————————————————————————————————————————————————————————————
// Conversion état de l'app vers lignes de la table, et retour
// ——————————————————————————————————————————————————————————————————

/** « currentUser » reste propre à chaque personne : il ne part jamais en base. */
const stripLocalOnly = (collection: string, data: Record<string, unknown>) => {
  if (collection !== 'settings') return data
  const { currentUser, ...rest } = data as { currentUser?: unknown }
  void currentUser
  return rest
}

const rowsFromState = (state: State): Row[] => {
  const rows: Row[] = []
  for (const c of COLLECTIONS) {
    const list = state[c]
    if (!Array.isArray(list)) continue
    const key = idKeyOf(c)
    for (const item of list as Record<string, unknown>[]) {
      rows.push({ collection: c, id: String(item[key]), data: item })
    }
  }
  for (const c of SINGLETONS) {
    const value = state[c]
    if (value === undefined) continue
    const data = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : { value }
    rows.push({ collection: c, id: c, data: stripLocalOnly(c, data) })
  }
  return rows
}

const applyRows = (rows: Row[]) => {
  if (!store) return
  const current = store.getState()
  const next: State = {}
  const byCollection = new Map<string, Row[]>()
  for (const r of rows) {
    const list = byCollection.get(r.collection)
    if (list) list.push(r)
    else byCollection.set(r.collection, [r])
  }
  for (const c of COLLECTIONS) {
    const list = byCollection.get(c)
    if (list) next[c] = list.map((r) => r.data)
  }
  for (const c of SINGLETONS) {
    const row = byCollection.get(c)?.[0]
    if (!row) continue
    if (c === 'settings') {
      const local = current.settings as { currentUser?: unknown } | undefined
      next.settings = { ...row.data, currentUser: local?.currentUser }
    } else if (c === 'partnerWarning') {
      next[c] = 'value' in row.data ? row.data.value : row.data
    } else {
      next[c] = row.data
    }
  }
  store.setState(next)
}

// ——————————————————————————————————————————————————————————————————
// File d'écriture : les changements sont regroupés sur 200 ms
// ——————————————————————————————————————————————————————————————————

type Pending = { op: 'upsert'; row: Row } | { op: 'delete'; collection: string; id: string }
const pending = new Map<string, Pending>()
let timer: ReturnType<typeof setTimeout> | null = null

const schedule = () => {
  if (!ready || timer) return
  timer = setTimeout(() => {
    timer = null
    void flush()
  }, 200)
}

const flush = async () => {
  if (!supabase || pending.size === 0) return
  const batch = [...pending.values()]
  pending.clear()

  const upserts = batch.filter((p): p is Extract<Pending, { op: 'upsert' }> => p.op === 'upsert')
  const deletes = batch.filter((p): p is Extract<Pending, { op: 'delete' }> => p.op === 'delete')

  try {
    if (upserts.length) {
      const payload = upserts.map(({ row }) => ({
        collection: row.collection,
        id: row.id,
        data: stripLocalOnly(row.collection, row.data),
        client_id: clientId,
      }))
      const { error } = await supabase.from('records').upsert(payload, { onConflict: 'collection,id' })
      if (error) throw error
    }
    for (const d of deletes) {
      const { error } = await supabase.from('records').delete().eq('collection', d.collection).eq('id', d.id)
      if (error) throw error
    }
    setStatus('live')
  } catch (e) {
    fail(e, 'écriture impossible')
  }
}

const keyOf = (collection: string, id: string) => collection + '::' + id

export const pushUpsert = (collection: string, id: string, data: Record<string, unknown>) => {
  if (!ready) return
  pending.set(keyOf(collection, id), { op: 'upsert', row: { collection, id, data } })
  schedule()
}

export const pushDelete = (collection: string, id: string) => {
  if (!ready) return
  pending.set(keyOf(collection, id), { op: 'delete', collection, id })
  schedule()
}

/** Remplace une collection entière : on écrit les présents, on supprime les absents. */
export const pushCollection = (collection: string, items: Record<string, unknown>[], previousIds: string[]) => {
  if (!ready) return
  const key = idKeyOf(collection)
  const keptIds = new Set(items.map((i) => String(i[key])))
  for (const item of items) pushUpsert(collection, String(item[key]), item)
  for (const id of previousIds) if (!keptIds.has(id)) pushDelete(collection, id)
}

/** Envoie l'intégralité de l'état, pour le premier remplissage ou après réinitialisation. */
export const pushEverything = async (state: State, wipeFirst = false) => {
  if (!supabase) return
  try {
    if (wipeFirst) {
      const { error } = await supabase.from('records').delete().neq('collection', '')
      if (error) throw error
    }
    const rows = rowsFromState(state).map((r) => ({
      collection: r.collection,
      id: r.id,
      data: stripLocalOnly(r.collection, r.data),
      client_id: clientId,
    }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('records').upsert(rows.slice(i, i + 500), { onConflict: 'collection,id' })
      if (error) throw error
    }
    setStatus('live')
  } catch (e) {
    fail(e, 'envoi initial impossible')
  }
}

// ——————————————————————————————————————————————————————————————————
// Démarrage : chargement puis abonnement temps réel
// ——————————————————————————————————————————————————————————————————

const onRealtime = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
  if (!store) return
  const row = (payload.new ?? payload.old) as Partial<Row> & { client_id?: string }
  if (!row?.collection || row.id === undefined) return
  if (payload.eventType !== 'DELETE' && row.client_id === clientId) return

  const collection = row.collection
  const id = String(row.id)
  const state = store.getState()

  if (isSingleton(collection)) {
    if (payload.eventType === 'DELETE') return
    applyRows([{ collection, id, data: (row.data ?? {}) as Record<string, unknown> }])
    return
  }
  const list = state[collection]
  if (!Array.isArray(list)) return
  const key = idKeyOf(collection)
  const items = list as Record<string, unknown>[]

  if (payload.eventType === 'DELETE') {
    store.setState({ [collection]: items.filter((i) => String(i[key]) !== id) })
    return
  }
  const data = row.data as Record<string, unknown>
  const exists = items.some((i) => String(i[key]) === id)
  store.setState({
    [collection]: exists ? items.map((i) => (String(i[key]) === id ? data : i)) : [...items, data],
  })
}

/**
 * Charge les données du serveur puis écoute les changements.
 * Si la base est vide, on y envoie l'état local : c'est le premier remplissage.
 */
export const initSync = async (target: StoreLike) => {
  store = target
  if (!supabase) {
    setStatus('local')
    return
  }
  setStatus('connecting')
  try {
    const { data, error } = await supabase.from('records').select('collection,id,data')
    if (error) throw error
    const rows = (data ?? []) as Row[]
    ready = true
    if (rows.length === 0) await pushEverything(target.getState())
    else applyRows(rows)

    supabase
      .channel('records-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, onRealtime)
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') setStatus('live')
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') fail(new Error('Temps réel indisponible. Vérifiez que la table records est bien publiée dans supabase_realtime.'), 'temps réel')
      })
  } catch (e) {
    fail(e, 'connexion impossible')
  }
}

export const stopSync = () => {
  ready = false
  pending.clear()
  store = null
  void supabase?.removeAllChannels()
  setStatus(isCloud ? 'connecting' : 'local')
}
