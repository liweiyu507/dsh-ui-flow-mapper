/**
 * The editor shell: the pen rack, the drafting table, the spec sheet, the AI
 * prompt modal, every document action, persistence and shortcuts.
 *
 * State split (`D-12`): the document lives in the store and is persisted as
 * `uiflow:doc`; tool / zoom / pan / card positions / selection are view state
 * persisted separately as `uiflow:ui` and never fed to the model.
 */

const model = m('model')
const store = m('store')
const ai = m('ai')
const strings = m('strings')
const kit = m('ui-kit')
const canvasModule = m('ui-canvas')
const inspectorModule = m('ui-inspector')

const h = kit.h
const React = kit.React
const { Btn, PenIcon } = kit

/** Where the Host half writes the canvas (`lib/index.js`). */
const SAVE_URL = '/dsh-ui-flow-mapper/save'
const STATUS_URL = '/dsh-ui-flow-mapper/status'
/** Autosave cadence: one minute, as asked. */
const AUTOSAVE_MS = 60000

/** `14:07:32` in the reader's own clock, for the status line. */
function clockOf(iso) {
  const date = iso ? new Date(iso) : new Date()
  const pad = (n) => (n < 10 ? '0' + n : String(n))
  return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds())
}

/**
 * The pen rack, in drafting order. The select pen comes first because it is the
 * resting state; everything after it marks the paper.
 */
const PENS = [
  { shape: 'select', key: 'toolSelect', shortcut: 'V' },
  { shape: 'rect', key: 'toolRect', shortcut: 'R' },
  { shape: 'roundrect', key: 'toolRoundRect', shortcut: 'D' },
  { shape: 'ellipse', key: 'toolEllipse', shortcut: 'O' },
  { shape: 'line', key: 'toolLine', shortcut: 'L' },
  { shape: 'arrow', key: 'toolArrow', shortcut: 'A' },
  { shape: 'card', key: 'toolCard', shortcut: 'C' },
  { shape: 'button', key: 'toolButton', shortcut: 'B' },
  { shape: 'input', key: 'toolInput', shortcut: 'N' },
  { shape: 'switch', key: 'toolSwitch', shortcut: 'S' },
  { shape: 'text', key: 'toolText', shortcut: 'T' },
  { shape: 'image', key: 'toolImage', shortcut: 'I' },
]

/** Plain-letter shortcut -> pen. */
const PEN_BY_KEY = (function () {
  const map = {}
  for (const pen of PENS) map[pen.shortcut.toLowerCase()] = pen.shape
  return map
})()

function penKeyOf(shape) {
  for (const pen of PENS) if (pen.shape === shape) return pen.key
  return 'toolSelect'
}

function isTypingTarget(target) {
  if (!target) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true
}

function UiFlowApp(props) {
  const storeRef = props.store
  const t = props.t
  const host = props.host || {}

  const doc = kit.useStoreValue(storeRef)
  const docRef = React.useRef(doc)
  docRef.current = doc
  /* Re-render on a language switch: the copy table is read per render. */
  kit.useLocaleTick(host.locale)

  const initialUi = React.useMemo(() => store.loadUi() || {}, [])
  const [sel, setSel] = React.useState({ kind: 'none' })
  const [linking, setLinking] = React.useState(null)
  const [tool, setTool] = React.useState('select')
  const [zoom, setZoom] = React.useState(typeof initialUi.zoom === 'number' ? initialUi.zoom : 0.15)
  const [pan, setPan] = React.useState(initialUi.pan && typeof initialUi.pan.x === 'number' ? initialUi.pan : { x: 0, y: 0 })
  const [cardPos, setCardPos] = React.useState(initialUi.cardPos && typeof initialUi.cardPos === 'object' ? initialUi.cardPos : {})
  const [promptText, setPromptText] = React.useState(null)
  const [toast, setToast] = React.useState(null)
  const [inspectorOpen, setInspectorOpen] = React.useState(true)
  const [freshScreenId, setFreshScreenId] = React.useState(null)
  /* Saving is a first-class state here: the button, the status line and the spec
     sheet all read from it, so "did it save?" is never a guess. */
  const [saveState, setSaveState] = React.useState({ status: 'idle', at: null, path: null, error: null })
  const [saveTarget, setSaveTarget] = React.useState(null)

  const fitRef = React.useRef(null)
  const jsonInputRef = React.useRef(null)
  const imageInputRef = React.useRef(null)
  const imageTargetRef = React.useRef(null)
  const clipboardRef = React.useRef(null)
  const selRef = React.useRef(sel)
  selRef.current = sel
  const toolRef = React.useRef(tool)
  toolRef.current = tool

  const saveDoc = React.useMemo(() => store.createSaver(store.DOC_KEY, 400), [])
  const saveUi = React.useMemo(() => store.createSaver(store.UI_KEY, 400), [])

  React.useEffect(() => {
    saveDoc(doc)
  }, [doc])

  React.useEffect(() => {
    saveUi({ zoom: zoom, pan: pan, cardPos: cardPos, selected: sel, tool: tool })
  }, [zoom, pan, cardPos, sel, tool])

  const showToast = React.useCallback((message) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 2400)
  }, [])

  /* ---- saving into the session's workspace ---------------------------------
     The Host half owns the write (DSH's workspace-file Remote is read-only), so
     this half posts the document and reports exactly what happened. A failed
     manual save still hands the user the file rather than losing the work. */
  const sessionIdRef = React.useRef(props.sessionId)
  sessionIdRef.current = props.sessionId
  const lastSavedRef = React.useRef(null)
  const savingRef = React.useRef(false)

  const saveNow = React.useCallback((options) => {
    const opts = options || {}
    const current = storeRef.get()
    if (savingRef.current) return Promise.resolve(false)
    if (!opts.force && lastSavedRef.current === current) return Promise.resolve(false)
    if (!opts.force && current.screens.length === 0) return Promise.resolve(false)
    savingRef.current = true
    setSaveState((state) => ({ status: 'saving', at: state.at, path: state.path, error: null }))
    const fileName = (current.meta.name || 'canvas') + '.uiflow.json'
    return window
      .fetch(SAVE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current, fileName: fileName, document: current }),
      })
      .then((response) => response.json().then(
        (data) => ({ ok: response.ok, data: data }),
        () => ({ ok: false, data: null }),
      ))
      .then((result) => {
        savingRef.current = false
        if (result.ok && result.data && result.data.ok) {
          lastSavedRef.current = current
          setSaveState({ status: 'saved', at: result.data.at, path: result.data.path, error: null })
          if (!opts.silent) showToast(t('saveOk', { time: clockOf(result.data.at) }))
          return true
        }
        const error = (result.data && result.data.error) || 'unavailable'
        setSaveState((state) => ({ status: 'failed', at: state.at, path: state.path, error: error }))
        if (!opts.silent) showToast(saveErrorText(error))
        if (opts.downloadFallback === true) {
          ai.downloadText(fileName, JSON.stringify(current, null, 2), 'application/json;charset=utf-8')
        }
        return false
      })
  }, [])
  const saveRef = React.useRef(saveNow)
  saveRef.current = saveNow

  /** One place that turns a save failure code into something a person can act on. */
  function saveErrorText(error) {
    if (error === 'no-workspace') return t('saveNoWorkspace')
    if (error === 'unavailable' || error === 'bad-body') return t('saveHostMissing')
    return t('saveFailed', { msg: error })
  }

  /* Where would it land? Ask once, so the button and the spec sheet can say so. */
  React.useEffect(() => {
    let cancelled = false
    const url = STATUS_URL + (props.sessionId ? '?sessionId=' + encodeURIComponent(props.sessionId) : '')
    window
      .fetch(url, { credentials: 'same-origin' })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && data && data.ok) setSaveTarget({ folder: data.folder, root: data.root })
      }, () => {})
    return () => {
      cancelled = true
    }
  }, [props.sessionId])

  /* Autosave: once a minute, and only when the document actually changed. */
  React.useEffect(() => {
    const handle = window.setInterval(() => {
      saveRef.current({ silent: true, downloadFallback: false })
    }, AUTOSAVE_MS)
    return () => window.clearInterval(handle)
  }, [])

  const actions = React.useMemo(() => {
    const mutate = (fn, history) => storeRef.mutate(fn, { history: history === false ? false : true })

    function selectedScreenOf(draft, selection) {
      if (selection && (selection.kind === 'element' || selection.kind === 'screen')) {
        const found = model.findScreen(draft, selection.screenId)
        if (found) return found
      }
      return draft.screens[0]
    }

    return {
      /* ---- documents ---- */
      setDocMeta(patch) {
        mutate((draft) => {
          Object.assign(draft.meta, patch)
          return draft
        })
      },
      setDefaultSize(size) {
        mutate((draft) => {
          draft.meta.design.defaultSize = { w: size.w, h: size.h }
          return draft
        })
      },
      openPrompt() {
        const current = storeRef.get()
        if (current.screens.length === 0) {
          showToast(t('promptEmpty'))
          return
        }
        setPromptText(ai.buildPromptPack(current))
      },
      exportJson() {
        const current = storeRef.get()
        ai.downloadText((current.meta.name || 'canvas') + '.uiflow.json', JSON.stringify(current, null, 2), 'application/json;charset=utf-8')
        showToast(t('saved'))
      },
      importJson() {
        if (jsonInputRef.current) jsonInputRef.current.click()
      },
      clearAll() {
        if (!window.confirm(t('clearConfirm'))) return
        storeRef.replace(store.seedDoc())
        setSel({ kind: 'none' })
      },

      /* ---- screens ---- */
      newScreen() {
        const next = mutate((draft) => {
          draft.screens.push(model.createScreen(draft))
          return draft
        })
        const created = next.screens[next.screens.length - 1]
        if (created) {
          setSel({ kind: 'screen', screenId: created.id })
          setFreshScreenId(created.id)
          window.setTimeout(() => setFreshScreenId((current) => (current === created.id ? null : current)), 340)
        }
      },
      setScreen(screenId, patch) {
        mutate((draft) => {
          const screen = model.findScreen(draft, screenId)
          if (screen) Object.assign(screen, patch)
          return draft
        })
      },
      setScreenSize(screenId, size) {
        mutate((draft) => {
          const screen = model.findScreen(draft, screenId)
          if (!screen) return draft
          screen.size = {
            w: Math.max(model.MIN_SIZE.w, Math.round(size.w)),
            h: Math.max(model.MIN_SIZE.h, Math.round(size.h)),
          }
          return draft
        })
      },
      setScreenBackground(screenId, fill) {
        mutate((draft) => {
          const screen = model.findScreen(draft, screenId)
          if (screen) screen.background = { fill: fill === null ? '#FFFFFF' : fill, image: null }
          return draft
        })
      },
      deleteScreen(screenId) {
        if (!window.confirm(t('deleteScreenConfirm'))) return
        mutate((draft) => {
          draft.screens = draft.screens.filter((screen) => screen.id !== screenId)
          draft.connections = draft.connections.filter((connection) => connection.from.screen !== screenId && connection.to.screen !== screenId)
          return draft
        })
        setSel({ kind: 'none' })
      },

      /* ---- elements ---- */
      /** Land a pen stroke: `box` is already in design space. */
      createAt(screenId, shape, box, keepTool) {
        const created = { screenId: screenId, elementId: null }
        mutate((draft) => {
          const screen = model.findScreen(draft, screenId)
          if (!screen) return draft
          const maxZ = screen.elements.reduce((max, element) => Math.max(max, element.zIndex), 0)
          const element = model.createElement(
            shape,
            box,
            model.nextId('elem', screen.elements.map((item) => item.id)),
            maxZ + 1,
          )
          if (shape === 'button') element.text = t('toolButton')
          if (shape === 'text') element.text = t('toolText')
          screen.elements.push(element)
          created.elementId = element.id
          return draft
        })
        if (!created.elementId) return
        setSel({ kind: 'element', screenId: screenId, elementId: created.elementId })
        if (!keepTool) setTool('select')
        if (shape === 'image') {
          imageTargetRef.current = created
          if (imageInputRef.current) imageInputRef.current.click()
        }
      },
      setElement(screenId, elementId, patch) {
        mutate((draft) => {
          const element = model.findElement(model.findScreen(draft, screenId), elementId)
          if (!element) return draft
          if (patch.type !== undefined) patch.type = model.typeForShape(element.shape, patch.type)
          Object.assign(element, patch)
          return draft
        })
      },
      setElementBox(screenId, elementId, patch, history) {
        mutate((draft) => {
          const element = model.findElement(model.findScreen(draft, screenId), elementId)
          if (!element) return draft
          Object.assign(element.position, patch)
          element.position.x = Math.round(element.position.x)
          element.position.y = Math.round(element.position.y)
          element.position.w = Math.max(model.MIN_ELEMENT_SIZE, Math.round(element.position.w))
          element.position.h = Math.max(model.MIN_ELEMENT_SIZE, Math.round(element.position.h))
          return draft
        }, history !== false)
      },
      setElementText(screenId, elementId, text) {
        mutate((draft) => {
          const element = model.findElement(model.findScreen(draft, screenId), elementId)
          if (element) element.text = text
          return draft
        })
      },
      setElementStyle(screenId, elementId, patch) {
        mutate((draft) => {
          const element = model.findElement(model.findScreen(draft, screenId), elementId)
          if (element) element.style = Object.assign({}, element.style, patch)
          return draft
        })
      },
      setElementRole(screenId, elementId, patch) {
        mutate((draft) => {
          const element = model.findElement(model.findScreen(draft, screenId), elementId)
          if (element) element.role = Object.assign({}, element.role, patch)
          return draft
        })
      },
      moveZ(screenId, elementId, op) {
        mutate((draft) => {
          const screen = model.findScreen(draft, screenId)
          if (!screen) return draft
          const list = screen.elements.slice().sort((a, b) => a.zIndex - b.zIndex)
          const index = list.findIndex((element) => element.id === elementId)
          if (index < 0) return draft
          const item = list.splice(index, 1)[0]
          const at = op === 'front'
            ? list.length
            : op === 'back'
              ? 0
              : op === 'up'
                ? Math.min(list.length, index + 1)
                : Math.max(0, index - 1)
          list.splice(at, 0, item)
          list.forEach((element, order) => {
            const target = model.findElement(screen, element.id)
            if (target) target.zIndex = order + 1
          })
          return draft
        })
      },
      alignElement(screenId, elementId, mode) {
        mutate((draft) => {
          const screen = model.findScreen(draft, screenId)
          const element = model.findElement(screen, elementId)
          if (!screen || !element) return draft
          const p = element.position
          if (mode === 'left') p.x = 0
          if (mode === 'right') p.x = screen.size.w - p.w
          if (mode === 'centerH') p.x = Math.round((screen.size.w - p.w) / 2)
          if (mode === 'top') p.y = 0
          if (mode === 'bottom') p.y = screen.size.h - p.h
          if (mode === 'middleV') p.y = Math.round((screen.size.h - p.h) / 2)
          return draft
        })
      },
      duplicateElement(screenId, elementId) {
        const created = { screenId: screenId, elementId: null }
        mutate((draft) => {
          const screen = model.findScreen(draft, screenId)
          const element = model.findElement(screen, elementId)
          if (!screen || !element) return draft
          const copy = model.clone(element)
          copy.id = model.nextId('elem', screen.elements.map((item) => item.id))
          copy.position.x += 24
          copy.position.y += 24
          copy.zIndex = screen.elements.reduce((max, item) => Math.max(max, item.zIndex), 0) + 1
          screen.elements.push(copy)
          created.elementId = copy.id
          return draft
        })
        if (created.elementId) setSel({ kind: 'element', screenId: screenId, elementId: created.elementId })
      },
      deleteElement(screenId, elementId) {
        mutate((draft) => {
          const screen = model.findScreen(draft, screenId)
          if (screen) screen.elements = screen.elements.filter((element) => element.id !== elementId)
          draft.connections = draft.connections.filter(
            (connection) => !(connection.from.screen === screenId && connection.from.element === elementId),
          )
          return draft
        })
        setSel({ kind: 'screen', screenId: screenId })
      },
      pickImage(screenId, elementId) {
        imageTargetRef.current = { screenId: screenId, elementId: elementId }
        if (imageInputRef.current) imageInputRef.current.click()
      },

      /* ---- links ---- */
      /**
       * Create a link. A decorative source is promoted to `interactive` in the
       * same step — people draw a plain rectangle, then want it clickable, and
       * refusing that is how a link "does not appear".
       */
      createConnection(fromScreenId, fromElementId, toScreenId, type) {
        const current = storeRef.get()
        const sourceElement = model.findElement(model.findScreen(current, fromScreenId), fromElementId)
        if (!sourceElement) return
        const promoted = sourceElement.type !== 'interactive'
        const created = { id: null }
        mutate((draft) => {
          const element = model.findElement(model.findScreen(draft, fromScreenId), fromElementId)
          if (element && element.type !== 'interactive') element.type = model.typeForShape(element.shape, 'interactive')
          const connection = model.createConnection(fromScreenId, fromElementId, toScreenId, type)
          connection.id = model.nextId('conn', draft.connections.map((item) => item.id))
          if (type === 'overlay') {
            const target = model.findScreen(draft, toScreenId)
            if (target) {
              connection.overlay.size = {
                w: Math.min(640, target.size.w),
                h: Math.min(480, target.size.h),
              }
            }
          }
          draft.connections.push(connection)
          created.id = connection.id
          return draft
        })
        if (created.id) setSel({ kind: 'connection', connectionId: created.id })
        if (promoted) showToast(t('madeInteractive'))
      },
      setConnection(connectionId, patch) {
        mutate((draft) => {
          const connection = model.findConnection(draft, connectionId)
          if (connection) Object.assign(connection, patch)
          return draft
        })
      },
      setConnectionType(connectionId, type) {
        mutate((draft) => {
          const connection = model.findConnection(draft, connectionId)
          if (!connection) return draft
          connection.type = type
          if (type === 'overlay') {
            const target = model.findScreen(draft, connection.to.screen)
            connection.overlay = {
              size: { w: Math.min(640, target ? target.size.w : 640), h: Math.min(480, target ? target.size.h : 480) },
              position: 'center',
              anchor: { x: 0, y: 0 },
              modal: true,
              dismiss: ['backdrop', 'close-button'],
            }
          } else {
            connection.overlay = null
          }
          return draft
        })
      },
      setConnectionOverlay(connectionId, patch) {
        mutate((draft) => {
          const connection = model.findConnection(draft, connectionId)
          if (!connection || !connection.overlay) return draft
          connection.overlay = Object.assign({}, connection.overlay, patch)
          return draft
        })
      },
      deleteConnection(connectionId) {
        mutate((draft) => {
          draft.connections = draft.connections.filter((connection) => connection.id !== connectionId)
          return draft
        })
        setSel({ kind: 'none' })
      },

      /* ---- misc ---- */
      copySelection() {
        const selection = selRef.current
        if (!selection || selection.kind !== 'element') return
        const current = storeRef.get()
        const element = model.findElement(model.findScreen(current, selection.screenId), selection.elementId)
        if (!element) return
        clipboardRef.current = { screenId: selection.screenId, element: model.clone(element) }
        showToast(t('copy'))
      },
      pasteSelection() {
        const payload = clipboardRef.current
        if (!payload) return
        const selection = selRef.current
        const targetScreenId = selection && (selection.kind === 'element' || selection.kind === 'screen')
          ? selection.screenId
          : payload.screenId
        const created = { screenId: targetScreenId, elementId: null }
        mutate((draft) => {
          const screen = model.findScreen(draft, targetScreenId)
          if (!screen) return draft
          const copy = model.clone(payload.element)
          copy.id = model.nextId('elem', screen.elements.map((item) => item.id))
          copy.position.x += 24
          copy.position.y += 24
          copy.zIndex = screen.elements.reduce((max, item) => Math.max(max, item.zIndex), 0) + 1
          screen.elements.push(copy)
          created.elementId = copy.id
          return draft
        })
        if (created.elementId) setSel({ kind: 'element', screenId: targetScreenId, elementId: created.elementId })
      },
      deleteSelection() {
        const selection = selRef.current
        if (selection.kind === 'element') actionsRef.current.deleteElement(selection.screenId, selection.elementId)
        else if (selection.kind === 'connection') actionsRef.current.deleteConnection(selection.connectionId)
        else if (selection.kind === 'screen') actionsRef.current.deleteScreen(selection.screenId)
      },
      undo() {
        storeRef.undo()
      },
      redo() {
        storeRef.redo()
      },
      fit() {
        if (fitRef.current) fitRef.current()
      },
      toggleFullscreen() {
        if (typeof host.toggleFullscreen === 'function') host.toggleFullscreen()
      },
    }
  }, [])

  const actionsRef = React.useRef(actions)
  actionsRef.current = actions

  /* ---- shortcuts ---- */
  React.useEffect(() => {
    const onKey = (event) => {
      const typing = isTypingTarget(event.target)
      const mod = event.ctrlKey || event.metaKey
      const key = String(event.key || '').toLowerCase()
      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) actionsRef.current.redo()
        else actionsRef.current.undo()
        return
      }
      if (mod && key === 'y') {
        event.preventDefault()
        actionsRef.current.redo()
        return
      }
      if (typing) return
      if (mod && key === 'c') {
        actionsRef.current.copySelection()
        return
      }
      if (mod && key === 'v') {
        actionsRef.current.pasteSelection()
        return
      }
      if (mod && key === 'd') {
        event.preventDefault()
        const selection = selRef.current
        if (selection.kind === 'element') actionsRef.current.duplicateElement(selection.screenId, selection.elementId)
        return
      }
      if (mod && key === 's') {
        event.preventDefault()
        saveRef.current({ force: true })
        return
      }
      if (mod) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        actionsRef.current.deleteSelection()
        return
      }
      if (PEN_BY_KEY[key] !== undefined) {
        event.preventDefault()
        setTool(PEN_BY_KEY[key])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* ---- file pickers ---- */
  function onJsonPicked(event) {
    const file = event.target.files && event.target.files[0]
    event.target.value = ''
    if (!file) return
    ai.readTextFile(file).then((text) => {
      let raw
      try {
        raw = JSON.parse(text)
      } catch (err) {
        showToast(t('importFailed', { msg: 'JSON' }))
        return
      }
      const result = model.normalizeDoc(raw)
      storeRef.replace(result.doc)
      setSel({ kind: 'none' })
      if (result.errors.length > 0) showToast(t('importFailed', { msg: result.errors.join('; ') }))
      else showToast(t('saved'))
    }, () => showToast(t('importFailed', { msg: 'read' })))
  }

  function onImagePicked(event) {
    const file = event.target.files && event.target.files[0]
    event.target.value = ''
    const target = imageTargetRef.current
    imageTargetRef.current = null
    if (!file || !target) return
    ai.readImageFile(file).then((dataUrl) => {
      actionsRef.current.setElementStyle(target.screenId, target.elementId, { image: dataUrl })
      const probe = new window.Image()
      probe.onload = () => {
        const maxWidth = 480
        const scale = probe.naturalWidth > maxWidth ? maxWidth / probe.naturalWidth : 1
        actionsRef.current.setElementBox(target.screenId, target.elementId, {
          w: Math.round(probe.naturalWidth * scale),
          h: Math.round(probe.naturalHeight * scale),
        }, true)
      }
      probe.src = dataUrl
    }, () => showToast(t('importFailed', { msg: 'image' })))
  }

  /* ---- status readout ---- */
  const selectionText = (function () {
    if (sel.kind === 'element') {
      const element = model.findElement(model.findScreen(doc, sel.screenId), sel.elementId)
      if (element) {
        return element.position.x + ', ' + element.position.y + '   ' + element.position.w + '×' + element.position.h
      }
    }
    if (sel.kind === 'screen') {
      const screen = model.findScreen(doc, sel.screenId)
      if (screen) return screen.size.w + '×' + screen.size.h
    }
    if (sel.kind === 'connection') {
      const connection = model.findConnection(doc, sel.connectionId)
      if (connection) return t(connection.type === 'overlay' ? 'connOverlayShort' : 'connNavigateShort')
    }
    return t('statusNothing')
  })()

  const canZ = sel.kind === 'element'

  return h(
    'div',
    { className: 'ufm-root' },

    /* ---- rail: the actions that are not pens ---- */
    h(
      'div',
      { className: 'ufm-rail' },
      h(Btn, {
        title: saveTarget
          ? t('save') + '  Ctrl+S — ' + t('saveTo', { path: saveTarget.folder })
          : t('save') + '  Ctrl+S',
        active: saveState.status === 'saving',
        onClick: () => saveRef.current({ force: true, downloadFallback: true }),
      }, saveState.status === 'saving' ? t('saveChecking') : t('save')),
      h(Btn, { title: t('undo') + '  Ctrl+Z', onClick: actions.undo }, t('undo')),
      h('span', { className: 'ufm-rail-sep' }),
      h(Btn, {
        title: t('dup'),
        disabled: !canZ,
        onClick: () => { const s = selRef.current; actions.duplicateElement(s.screenId, s.elementId) },
      }, t('dup')),
      h(Btn, { title: t('del'), danger: true, disabled: sel.kind === 'none', onClick: actions.deleteSelection }, t('del')),
      h('span', { className: 'ufm-rail-sep' }),
      h(Btn, { title: t('toFront'), disabled: !canZ, onClick: () => { const s = selRef.current; actions.moveZ(s.screenId, s.elementId, 'front') } }, '⇧⇧'),
      h(Btn, { title: t('forward'), disabled: !canZ, onClick: () => { const s = selRef.current; actions.moveZ(s.screenId, s.elementId, 'up') } }, '⇧'),
      h(Btn, { title: t('backward'), disabled: !canZ, onClick: () => { const s = selRef.current; actions.moveZ(s.screenId, s.elementId, 'down') } }, '⇩'),
      h(Btn, { title: t('toBack'), disabled: !canZ, onClick: () => { const s = selRef.current; actions.moveZ(s.screenId, s.elementId, 'back') } }, '⇩⇩'),
      h('span', { className: 'ufm-rail-spacer' }),
      h(Btn, { title: t('zoomFit'), onClick: actions.fit }, t('zoomFit')),
      h(Btn, { title: t('expand'), onClick: actions.toggleFullscreen }, t('expand')),
      h('span', { className: 'ufm-rail-sep' }),
      h(Btn, { title: t('exportPrompt'), onClick: actions.openPrompt }, t('exportPrompt')),
    ),

    /* ---- pen rack ---- */
    h(
      'div',
      { className: 'ufm-pens' },
      PENS.map((pen) =>
        h(
          'button',
          {
            key: pen.shape,
            type: 'button',
            className: 'ufm-pen' + (tool === pen.shape ? ' is-active' : ''),
            title: t(pen.key) + '  ' + pen.shortcut,
            'aria-label': t(pen.key),
            'aria-pressed': tool === pen.shape,
            onClick: () => setTool(pen.shape),
          },
          h(PenIcon, { shape: pen.shape }),
          h('span', { className: 'ufm-pen-label' }, t(pen.key)),
        ),
      ),
    ),

    h(
      'div',
      { className: 'ufm-main' },
      h(canvasModule.CanvasViewport, {
        doc: doc,
        t: t,
        store: storeRef,
        actions: actions,
        zoom: zoom,
        pan: pan,
        cardPos: cardPos,
        sel: sel,
        setSel: setSel,
        linking: linking,
        setLinking: setLinking,
        setZoom: setZoom,
        setPan: setPan,
        setCardPos: setCardPos,
        fitRef: fitRef,
        tool: tool,
        onToolChange: setTool,
        freshScreenId: freshScreenId,
      }),
      h(
        'div',
        { className: 'ufm-inspector' + (inspectorOpen ? '' : ' is-collapsed') },
        h(
          'div',
          { className: 'ufm-inspector-head' },
          h('span', { className: 'ufm-spec-kind' }, t('inspectorTitle')),
          h('button', {
            type: 'button',
            className: 'ufm-mini',
            title: inspectorOpen ? t('collapse') : t('expand'),
            'aria-label': inspectorOpen ? t('collapse') : t('expand'),
            'aria-expanded': inspectorOpen,
            onClick: () => setInspectorOpen((open) => !open),
          }, inspectorOpen ? '▾' : '▸'),
        ),
        inspectorOpen
          ? h('div', { className: 'ufm-inspector-body' },
              h(inspectorModule.Inspector, {
                doc: doc,
                sel: sel,
                t: t,
                actions: actions,
                save: {
                  status: saveState.status,
                  error: saveState.error,
                  where: saveState.path || (saveTarget ? saveTarget.folder : null),
                  when: saveState.at ? clockOf(saveState.at) : null,
                },
              }))
          : null,
      ),
    ),

    /* ---- measurement line ---- */
    h(
      'div',
      { className: 'ufm-status' },
      h('span', { className: 'ufm-status-item' },
        h('span', null, t('statusPen')),
        h('span', { className: 'ufm-status-value' }, t(penKeyOf(tool)))),
      h('span', { className: 'ufm-status-item' },
        h('span', null, t('statusZoom')),
        h('span', { className: 'ufm-status-value' }, Math.round(zoom * 100) + '%')),
      h('span', { className: 'ufm-status-item' },
        h('span', null, t('statusSelection')),
        h('span', { className: 'ufm-status-value' }, selectionText)),
      h('span', { className: 'ufm-status-spacer' }),
      toast
        ? h('span', { className: 'ufm-toast' }, toast)
        : saveState.status === 'saving'
          ? h('span', null, t('saveChecking'))
          : saveState.status === 'failed'
            ? h('span', { className: 'ufm-save-failed' }, saveErrorText(saveState.error))
            : h('span', {
                className: 'ufm-save-state',
                title: saveState.path || (saveTarget ? saveTarget.folder : ''),
              }, saveState.at ? t('saveOk', { time: clockOf(saveState.at) }) : t('saveToHint')),
    ),

    promptText !== null
      ? h(
          'div',
          { className: 'ufm-modal-backdrop', onPointerDown: () => setPromptText(null) },
          h(
            'div',
            { className: 'ufm-modal', onPointerDown: (event) => event.stopPropagation() },
            h('div', { className: 'ufm-modal-head' }, t('promptTitle')),
            h('div', { className: 'ufm-modal-hint' }, t('promptHint')),
            h('textarea', { className: 'ufm-modal-text', readOnly: true, value: promptText }),
            h(
              'div',
              { className: 'ufm-modal-foot' },
              h(Btn, {
                onClick: () => {
                  ai.copyText(promptText).then((ok) => showToast(ok ? t('copied') : t('copyFailed')))
                },
              }, t('copy')),
              h(Btn, { onClick: () => ai.downloadText((doc.meta.name || 'canvas') + '-ai-prompt.md', promptText, 'text/markdown;charset=utf-8') }, t('download')),
              h(Btn, { onClick: () => setPromptText(null) }, t('close')),
            ),
          ),
        )
      : null,

    h('input', { ref: jsonInputRef, type: 'file', accept: '.json,application/json', style: { display: 'none' }, onChange: onJsonPicked }),
    h('input', { ref: imageInputRef, type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: onImagePicked }),
  )
}

module.exports = { UiFlowApp, PENS }
