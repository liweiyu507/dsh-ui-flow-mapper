/**
 * Document store (single source of truth, `D-13`) + view-state persistence
 * (`D-12`: view state never enters the document).
 *
 * React-free on purpose so `tools/test-client.mjs` can drive it in plain Node.
 */

const model = m('model')

const DOC_KEY = 'uiflow:doc'
const UI_KEY = 'uiflow:ui'
const HISTORY_LIMIT = 120

/**
 * Snapshot store: every mutation swaps the whole document object, so
 * `useSyncExternalStore` sees a new identity exactly when something changed.
 */
function createStore(initial) {
  let state = initial
  let past = []
  let future = []
  const listeners = new Set()

  function emit() {
    for (const listener of Array.from(listeners)) {
      try {
        listener()
      } catch (err) {
        /* a broken listener must not break the editor */
      }
    }
  }

  return {
    get() {
      return state
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** Mutate through a draft; `history: false` for the frames of a live drag. */
    mutate(mutator, options) {
      const draft = model.clone(state)
      const result = mutator(draft) || draft
      if (result === state) return state
      const before = state
      state = result
      if (!options || options.history !== false) {
        past.push(before)
        if (past.length > HISTORY_LIMIT) past.shift()
        future = []
      }
      emit()
      return state
    },
    /** Close a live drag: the pre-drag snapshot becomes one undo step. */
    pushHistory(snapshot) {
      if (!snapshot || snapshot === state) return
      past.push(snapshot)
      if (past.length > HISTORY_LIMIT) past.shift()
      future = []
      emit()
    },
    replace(next, options) {
      const before = state
      state = next
      if (!options || options.history !== false) {
        past.push(before)
        if (past.length > HISTORY_LIMIT) past.shift()
        future = []
      }
      emit()
    },
    undo() {
      if (past.length === 0) return false
      future.push(state)
      state = past.pop()
      emit()
      return true
    },
    redo() {
      if (future.length === 0) return false
      past.push(state)
      state = future.pop()
      emit()
      return true
    },
    canUndo() {
      return past.length > 0
    },
    canRedo() {
      return future.length > 0
    },
  }
}

/** Read JSON from localStorage without ever throwing. */
function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    const parsed = JSON.parse(raw)
    return parsed === null || parsed === undefined ? fallback : parsed
  } catch (err) {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (err) {
    return false
  }
}

/** Debounced writer, so a drag does not hit storage on every frame. */
function createSaver(key, delayMs) {
  let handle = null
  let pending = null
  return function save(value) {
    pending = value
    if (handle !== null) return
    handle = window.setTimeout(() => {
      handle = null
      const next = pending
      pending = null
      if (next !== null) writeJson(key, next)
    }, delayMs || 400)
  }
}

/** First-run document: one empty screen so the canvas is never a dead end. */
function seedDoc() {
  const doc = model.createDoc('未命名软件')
  doc.screens.push(model.createScreen(doc, { name: '首页' }))
  return doc
}

function loadDoc() {
  const raw = readJson(DOC_KEY, null)
  if (raw === null) return { doc: seedDoc(), errors: [] }
  const result = model.normalizeDoc(raw)
  return { doc: result.doc, errors: result.errors }
}

function loadUi() {
  const raw = readJson(UI_KEY, null)
  if (!raw || typeof raw !== 'object') return null
  return raw
}

module.exports = {
  DOC_KEY,
  UI_KEY,
  createStore,
  readJson,
  writeJson,
  createSaver,
  seedDoc,
  loadDoc,
  loadUi,
}
