/**
 * Host half of dsh-ui-flow-mapper.
 *
 * The editor lives in the browser half (`./client`). This side exists for one
 * reason: **saving**. DSH's workspace-file Remote is deliberately read-only
 * (`remote.workspaceFiles.read/stat/list/changes`), so the only supported way to
 * put a file into the session's workspace is from the Host, where `node:fs` is
 * available. The browser half posts the canvas document to
 * `POST /dsh-ui-flow-mapper/save`, and this handler writes it to
 * `<workspace>/UI Flow Mapper/<name>.uiflow.json`.
 *
 * The route is same-origin only, POST-only, size-capped, and the client never
 * chooses a directory: it may only suggest a file *name*, which is sanitized.
 *
 * Session identity comes in over the wire (the browser half reads it from its
 * standard tab props); the *workspace* is resolved here, never dictated by the
 * client. Cordis only exposes injected services, so `sessions` is taken through
 * an optional scoped injection: the routes must register even where that service
 * is absent, and the lookup simply stays unavailable there.
 */

import fs from 'node:fs'
import path from 'node:path'

/** Where the browser half posts a document. */
const SAVE_ROUTE = '/dsh-ui-flow-mapper/save'
/** Where it asks for the destination before saving (so the UI can show it). */
const STATUS_ROUTE = '/dsh-ui-flow-mapper/status'
/** The sub-folder created inside the workspace. */
const FOLDER = 'UI Flow Mapper'
/** 8 MiB is far more canvas than anyone draws; anything larger is a mistake. */
const MAX_BODY_BYTES = 8 * 1024 * 1024

export const inject = ['webServer']

/**
 * Keep the client's suggestion a *name*: one segment, no traversal, fixed suffix.
 *
 * @param suggested - the name the browser half sent.
 * @param fallbackName - the document's own name, when nothing usable was sent.
 * @returns a file name safe to join onto the workspace folder.
 */
function safeFileName(suggested, fallbackName) {
  const raw = typeof suggested === 'string' && suggested.trim() !== '' ? suggested : fallbackName
  const base = String(raw === undefined || raw === null ? '' : raw).split(/[\\/]/).pop() || 'canvas'
  const cleaned = base
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    .replace(/\.+$/, '')
    .trim()
  const stem = cleaned.replace(/\.uiflow\.json$/i, '').replace(/\.json$/i, '') || 'canvas'
  return stem.slice(0, 80) + '.uiflow.json'
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Same-origin fence: a page on this server, or a loopback client. */
function originAllowed(req) {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '') return true
  const host = req.headers.host
  try {
    const parsed = new URL(origin)
    if (parsed.host === host) return true
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  } catch (err) {
    return false
  }
}

function apply(ctx) {
  /**
   * Resolves a session's workspace root, once the session service is available.
   * `null` means "this deployment cannot tell me", and the caller falls back.
   */
  let sessionCwdOf = null
  let sessionServiceSeen = false

  try {
    ctx.inject(['sessions'], (scoped) => {
      sessionServiceSeen = true
      sessionCwdOf = function (sessionId) {
        try {
          const session = scoped.sessions.get(sessionId)
          const cwd = session && session.header ? session.header.cwd : undefined
          return typeof cwd === 'string' && path.isAbsolute(cwd) ? cwd : null
        } catch (err) {
          return null
        }
      }
      return () => {
        sessionCwdOf = null
      }
    })
  } catch (err) {
    /* Older context without scoped injection: the cwd fallback still saves. */
    sessionCwdOf = null
  }

  /**
   * Where a session's files belong.
   *
   * Order: the live Session header's `cwd` (validated absolute at creation),
   * then the workspace registry's session index, then the Host process cwd —
   * which is what `sandbox-policy` already treats as the workspace root here.
   *
   * @param sessionId - the session the editor tab belongs to, when known.
   * @returns an absolute directory path, or null when nothing usable was found.
   */
  function resolveWorkspaceRoot(sessionId) {
    if (typeof sessionId === 'string' && sessionId !== '') {
      if (sessionCwdOf !== null) {
        const cwd = sessionCwdOf(sessionId)
        if (cwd !== null) return cwd
      }
      try {
        const registry = ctx.workspaceRegistry
        if (registry && typeof registry.sessionPath === 'function') {
          const known = registry.sessionPath(sessionId)
          if (typeof known === 'string' && path.isAbsolute(known)) return known
        }
      } catch (err) {
        /* registry unavailable or not injected: fall through */
      }
    }
    const fallback = process.cwd()
    return typeof fallback === 'string' && path.isAbsolute(fallback) ? fallback : null
  }

  /** What the resolution actually saw — surfaced so the UI can explain itself. */
  function diagnose(sessionId) {
    return {
      sessionService: sessionServiceSeen,
      sessionLookup: sessionCwdOf !== null,
      sessionId: typeof sessionId === 'string' ? sessionId : null,
      sessionCwd: sessionCwdOf !== null && typeof sessionId === 'string' ? sessionCwdOf(sessionId) : null,
      cwd: process.cwd(),
    }
  }

  async function handleSave(req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
      return
    }
    if (!originAllowed(req)) {
      sendJson(res, 403, { ok: false, error: 'origin-rejected' })
      return
    }
    let payload
    try {
      payload = JSON.parse(await readBody(req))
    } catch (err) {
      sendJson(res, 400, { ok: false, error: 'bad-body' })
      return
    }
    const document_ = payload && payload.document
    if (!document_ || typeof document_ !== 'object' || Array.isArray(document_)) {
      sendJson(res, 400, { ok: false, error: 'bad-document' })
      return
    }
    const root = resolveWorkspaceRoot(payload.sessionId)
    if (root === null) {
      sendJson(res, 409, { ok: false, error: 'no-workspace' })
      return
    }
    const dir = path.join(root, FOLDER)
    const file = path.join(dir, safeFileName(payload.fileName, document_.meta && document_.meta.name))
    try {
      fs.mkdirSync(dir, { recursive: true })
      const text = JSON.stringify(document_, null, 2)
      fs.writeFileSync(file, text, 'utf8')
      sendJson(res, 200, {
        ok: true,
        path: file,
        folder: dir,
        bytes: Buffer.byteLength(text),
        at: new Date().toISOString(),
        viaSession: sessionCwdOf !== null && typeof payload.sessionId === 'string' && sessionCwdOf(payload.sessionId) === root,
      })
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String((err && err.message) || err) })
    }
  }

  function handleStatus(req, res) {
    const url = new URL(req.url || STATUS_ROUTE, 'http://127.0.0.1')
    const sessionId = url.searchParams.get('sessionId')
    const root = resolveWorkspaceRoot(sessionId)
    if (root === null) {
      sendJson(res, 200, { ok: false, error: 'no-workspace', debug: diagnose(sessionId) })
      return
    }
    const dir = path.join(root, FOLDER)
    sendJson(res, 200, {
      ok: true,
      root: root,
      folder: dir,
      exists: fs.existsSync(dir),
      debug: diagnose(sessionId),
    })
  }

  /** Register one route, tolerating both spellings the webserver has shipped. */
  function register(route) {
    const server = ctx.webServer
    if (server && typeof server.register === 'function') return server.register(route)
    if (server && typeof server.registerRoute === 'function') return server.registerRoute(route)
    throw new Error('webserver offers neither register() nor registerRoute()')
  }

  try {
    const disposeSave = register({
      kind: 'exact',
      path: SAVE_ROUTE,
      handler: (req, res) => {
        handleSave(req, res).catch((err) => {
          try {
            sendJson(res, 500, { ok: false, error: String((err && err.message) || err) })
          } catch (ignored) {
            /* the response was already sent */
          }
        })
      },
    })
    const disposeStatus = register({
      kind: 'exact',
      path: STATUS_ROUTE,
      handler: (req, res) => {
        try {
          handleStatus(req, res)
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String((err && err.message) || err) })
        }
      },
    })
    ctx.effect(() => () => {
      for (const dispose of [disposeSave, disposeStatus]) {
        try {
          dispose()
        } catch (err) {
          /* already gone */
        }
      }
    }, 'ui-flow-mapper: save routes')
  } catch (err) {
    /* No web server in this composition: the browser half falls back to a
       download, so saving still works — it just is not automatic. */
    const logger = globalThis.console
    if (logger && typeof logger.warn === 'function') {
      logger.warn('[ui-flow-mapper] workspace save route unavailable:', (err && err.message) || err)
    }
  }
}

export { apply }
