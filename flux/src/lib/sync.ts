import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { clientId, isCloud, supabase } from './supabase'
import { ENTITY_NAMES, JournalEntry } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Synchronisation avec Supabase
//
// Table flux_records : une ligne par enregistrement (collection + id + data JSON).
// Table flux_journal : journal d'historique, en ajout seul (ni modification ni
// suppression possibles, c'est la base qui l'impose).
// Aucune suppression n'est jamais envoyée : supprimer = archiver.
// ─────────────────────────────────────────────────────────────────────────────

type Row = { collection: string; id: string; data: Record<string, unknown> }
type State = Record<string, unknown>
type StoreLike = { getState: () => State; setState: (partial: State) => void }

const COLLECTIONS: readonly string[] = ENTITY_NAMES
const SINGLETONS = ['settings', 'stats'] as const

let store: StoreLike | null = null
let ready = false

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
export const onSyncStatus = (l: (s: SyncStatus) => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

const explain = (e: unknown): string => {
  const raw = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : ''
  if (/does not exist|Could not find the table/i.test(raw) || code === '42P01' || code === 'PGRST205')
    return 'Les tables de FLUX n’existent pas encore. Exécutez le script supabase/flux.sql dans le SQL Editor de Supabase.'
  if (code === '42501' || /row-level security|violates/i.test(raw))
    return 'Accès refusé par la base. Vérifiez que votre adresse figure dans allowed_emails (et que seuls les administrateurs modifient les réglages).'
  if (/Invalid API key|apikey/i.test(raw)) return 'Clé Supabase invalide. Vérifiez VITE_SUPABASE_ANON_KEY.'
  if (/Failed to fetch|NetworkError|fetch failed/i.test(raw)) return 'Base injoignable. Vérifiez la connexion internet.'
  return raw
}
const fail = (e: unknown, context: string) => {
  lastError = explain(e)
  console.error('[flux] ' + context, e)
  if (status === 'error') notify()
  else setStatus('error')
}

// ── File d'écriture groupée (200 ms) ────────────────────────────────────────
const pending = new Map<string, Row>()
let journalQueue: JournalEntry[] = []
let timer: ReturnType<typeof setTimeout> | null = null

const schedule = () => {
  if (!ready || timer) return
  timer = setTimeout(() => {
    timer = null
    void flush()
  }, 200)
}

const flush = async () => {
  if (!supabase) return
  const rows = [...pending.values()]
  pending.clear()
  const entries = journalQueue
  journalQueue = []
  try {
    if (rows.length) {
      const { error } = await supabase
        .from('flux_records')
        .upsert(rows.map((r) => ({ ...r, client_id: clientId })), { onConflict: 'collection,id' })
      if (error) throw error
    }
    if (entries.length) {
      const { error } = await supabase.from('flux_journal').insert(
        entries.map((e) => ({ id: e.id, at: e.at, by_user: e.by, action: e.action, entity: e.entity, entity_id: e.entityId, label: e.label, motif: e.motif ?? null, details: e.details ?? null, client_id: clientId })),
      )
      if (error) throw error
    }
    setStatus('live')
  } catch (e) {
    fail(e, 'écriture impossible')
  }
}

export const pushUpsert = (collection: string, id: string, data: Record<string, unknown>) => {
  if (!ready) return
  pending.set(collection + '::' + id, { collection, id, data })
  schedule()
}
export const pushSingleton = (collection: (typeof SINGLETONS)[number], data: Record<string, unknown>) => pushUpsert(collection, collection, data)
export const pushJournal = (e: JournalEntry) => {
  if (!ready) return
  journalQueue.push(e)
  schedule()
}

// ── Lecture ─────────────────────────────────────────────────────────────────
const applyRows = (rows: Row[], full = false) => {
  if (!store) return
  const next: State = {}
  const grouped = new Map<string, Row[]>()
  for (const r of rows) grouped.set(r.collection, [...(grouped.get(r.collection) ?? []), r])
  for (const c of COLLECTIONS) {
    const list = grouped.get(c)
    if (list) next[c] = list.map((r) => r.data)
    else if (full) next[c] = []
  }
  const current = store.getState()
  for (const c of SINGLETONS) {
    const row = grouped.get(c)?.[0]
    if (row) next[c] = { ...(current[c] as object), ...row.data }
  }
  store.setState(next)
}

type JournalRow = { id: string; at: string; by_user: string; action: string; entity: string; entity_id: string; label: string; motif: string | null; details: string | null }
const fromJournalRow = (r: JournalRow): JournalEntry => ({
  id: r.id,
  at: r.at,
  by: r.by_user as JournalEntry['by'],
  action: r.action as JournalEntry['action'],
  entity: r.entity as JournalEntry['entity'],
  entityId: r.entity_id,
  label: r.label,
  motif: r.motif ?? undefined,
  details: r.details ?? undefined,
})

const onRecord = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
  if (!store || payload.eventType === 'DELETE') return
  const row = payload.new as Partial<Row> & { client_id?: string }
  if (!row?.collection || row.id === undefined || row.client_id === clientId) return
  if ((SINGLETONS as readonly string[]).includes(row.collection)) {
    applyRows([row as Row])
    return
  }
  const list = store.getState()[row.collection]
  if (!Array.isArray(list)) return
  const items = list as { id: string }[]
  const data = row.data as { id: string }
  const exists = items.some((i) => i.id === row.id)
  store.setState({ [row.collection]: exists ? items.map((i) => (i.id === row.id ? data : i)) : [...items, data] })
}

const onJournal = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
  if (!store || payload.eventType !== 'INSERT') return
  const row = payload.new as JournalRow & { client_id?: string }
  if (row.client_id === clientId) return
  const journal = (store.getState().journal as JournalEntry[]) ?? []
  if (journal.some((j) => j.id === row.id)) return
  store.setState({ journal: [fromJournalRow(row), ...journal] })
}

/** Envoie tout l'état local : premier remplissage d'une base vide. */
const pushEverything = async (state: State) => {
  if (!supabase) return
  const rows: Row[] = []
  for (const c of COLLECTIONS) for (const item of (state[c] as { id: string }[]) ?? []) rows.push({ collection: c, id: item.id, data: item as unknown as Record<string, unknown> })
  for (const c of SINGLETONS) rows.push({ collection: c, id: c, data: state[c] as Record<string, unknown> })
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('flux_records').upsert(rows.slice(i, i + 500).map((r) => ({ ...r, client_id: clientId })), { onConflict: 'collection,id' })
    if (error) throw error
  }
}

export const initSync = async (target: StoreLike) => {
  store = target
  if (!supabase) {
    setStatus('local')
    return
  }
  setStatus('connecting')
  try {
    const { data, error } = await supabase.from('flux_records').select('collection,id,data')
    if (error) throw error
    const rows = (data ?? []) as Row[]
    if (rows.length === 0) {
      // Base neuve : on y dépose les catégories, l'abonnement d'exemple et les réglages.
      // Ce qui existait dans ce navigateur (mode local) part avec.
      await pushEverything(target.getState())
    } else applyRows(rows, true)

    const { data: journal, error: jErr } = await supabase.from('flux_journal').select('*').order('at', { ascending: false }).limit(1000)
    if (jErr) throw jErr
    store.setState({ journal: ((journal ?? []) as JournalRow[]).map(fromJournalRow) })
    ready = true

    supabase
      .channel('flux-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flux_records' }, onRecord)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'flux_journal' }, onJournal)
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') setStatus('live')
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') fail(new Error('Temps réel indisponible. Vérifiez la publication supabase_realtime.'), 'temps réel')
      })
  } catch (e) {
    fail(e, 'connexion impossible')
  }
}

export const stopSync = () => {
  ready = false
  pending.clear()
  journalQueue = []
  store = null
  void supabase?.removeAllChannels()
  setStatus(isCloud ? 'connecting' : 'local')
}
