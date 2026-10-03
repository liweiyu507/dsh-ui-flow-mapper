/**
 * The canvas: the drafting table. Screen cards, element rendering, geometric hit
 * testing, transform drags, the pen tools, and the two link inks.
 *
 * Coordinate systems — these helpers are the only places that convert (§7):
 *   - design space : the screen's own pixels (default 1920x1080), in the document
 *   - canvas space : viewport pixels = design * zoom + pan
 */

const model = m('model')
const kit = m('ui-kit')
const h = kit.h
const React = kit.React

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_CURSOR = {
  nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize',
  se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize',
}
const MIN_ZOOM = 0.05
const MAX_ZOOM = 4
const MIN_ELEMENT = model.MIN_ELEMENT_SIZE
/** Below this drag distance (design px) a pen click places a default-sized box. */
const DRAW_THRESHOLD = 6
const MINOR_GRID = 8
const MAJOR_GRID = 80

/**
 * What dragging this element does.
 *
 * A `fixed` element is bound to its screen: dragging it moves the screen card
 * and leaves the element at its design position, so the two can never drift
 * apart. Everything else moves within its screen as usual.
 *
 * @param element - the element under the pointer.
 * @returns the drag mode to start.
 */
function dragModeFor(element) {
  return element && element.fixed === true ? 'move-card' : 'move-element'
}

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

/* ------------------------------------------------------------------ rendering */

/** One element box, in design pixels, inside the scaled card body. */
const ElementView = React.memo(function ElementView(props) {
  const element = props.element
  const style = model.styleFor(element)
  const shape = element.shape
  const box = {
    position: 'absolute',
    /* The document's own stacking order, drawn. Without this the array order
       decided what covered what, so the reorder controls looked dead while the
       hit test (which does read zIndex) picked a different element. */
    zIndex: element.zIndex,
    left: element.position.x,
    top: element.position.y,
    width: element.position.w,
    height: element.position.h,
    boxSizing: 'border-box',
    opacity: style.opacity,
    borderRadius: style.radius,
    background: typeof style.fill === 'string' ? style.fill : 'transparent',
    border: style.stroke ? style.strokeWidth + 'px solid ' + style.stroke : 'none',
    color: style.color,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    display: 'flex',
    alignItems: 'center',
    justifyContent: style.align === 'left' ? 'flex-start' : style.align === 'right' ? 'flex-end' : 'center',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textAlign: style.align,
    padding: model.TEXT_SHAPES[shape] ? '0 10px' : 0,
    pointerEvents: 'none',
    userSelect: 'none',
  }
  const children = []

  if (shape === 'image') {
    if (typeof style.image === 'string' && style.image) {
      box.backgroundImage = 'url(' + style.image + ')'
      box.backgroundSize = 'cover'
      box.backgroundPosition = 'center'
    } else {
      box.background = 'transparent'
      box.border = '1px dashed #C9CED6'
      children.push(h('span', { key: 'ph', style: { color: '#8A93A3', fontSize: 12, margin: '0 auto' } }, props.imageHint))
    }
  } else if (shape === 'switch') {
    children.push(h('span', {
      key: 'knob',
      style: {
        position: 'absolute', left: 3, top: 3,
        width: Math.max(4, element.position.h - 6), height: Math.max(4, element.position.h - 6),
        borderRadius: 999, background: '#FFFFFF', boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
      },
    }))
  } else if (shape === 'checkbox') {
    children.push(h('span', { key: 'tick', style: { margin: '0 auto', fontSize: 14, lineHeight: 1 } }, '✓'))
  } else if (shape === 'radio') {
    children.push(h('span', { key: 'dot', style: { margin: '0 auto', width: '46%', height: '46%', borderRadius: 999, background: style.color } }))
  } else if (shape === 'slider') {
    children.push(
      h('span', { key: 'track', style: { position: 'absolute', left: 0, right: 0, top: '50%', height: 4, marginTop: -2, borderRadius: 999, background: '#8A93A3', opacity: 0.5 } }),
      h('span', { key: 'thumb', style: { position: 'absolute', left: '40%', top: '50%', width: 14, height: 14, marginTop: -7, marginLeft: -7, borderRadius: 999, background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' } }),
    )
  } else if (shape === 'arrow') {
    children.push(h('span', {
      key: 'head',
      style: {
        position: 'absolute', right: -9, top: '50%', marginTop: -6, width: 0, height: 0,
        borderLeft: '10px solid ' + (typeof style.fill === 'string' ? style.fill : '#8A93A3'),
        borderTop: '6px solid transparent', borderBottom: '6px solid transparent',
      },
    }))
  } else if (shape === 'select') {
    children.push(
      h('span', { key: 'text', style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' } }, element.text),
      h('span', { key: 'caret', style: { color: '#8A93A3', fontSize: 11, marginLeft: 6 } }, '▾'),
    )
  } else if (model.TEXT_SHAPES[shape]) {
    children.push(h('span', { key: 'text', style: { width: '100%', overflow: 'hidden', textOverflow: 'ellipsis' } }, element.text))
  }

  return h('div', { className: 'ufm-el', style: box, 'data-shape': shape }, children)
})

/** The 8 resize handles of the selection, at constant screen size. */
function SelectionHandles(props) {
  const rect = props.rect
  return h(
    'div',
    { className: 'ufm-selection', style: { left: rect.x, top: rect.y, width: rect.w, height: rect.h } },
    HANDLES.map((dir) => {
      const fx = dir.indexOf('w') >= 0 ? 0 : dir.indexOf('e') >= 0 ? 1 : 0.5
      const fy = dir.indexOf('n') >= 0 ? 0 : dir.indexOf('s') >= 0 ? 1 : 0.5
      return h('div', {
        key: dir,
        className: 'ufm-handle',
        style: { left: rect.w * fx - 3.5, top: rect.h * fy - 3.5, cursor: HANDLE_CURSOR[dir] },
        onPointerDown: (event) => props.onResizeStart(event, dir),
      })
    }),
  )
}

/** Drafting paper: a minor and a major rule grid that follow zoom and pan. */
function GridLayer(props) {
  const zoom = props.zoom
  const pan = props.pan
  const layers = []
  if (MAJOR_GRID * zoom >= 9) {
    layers.push(h('div', {
      key: 'major',
      className: 'ufm-grid ufm-grid-major',
      style: { backgroundSize: MAJOR_GRID * zoom + 'px ' + MAJOR_GRID * zoom + 'px', backgroundPosition: pan.x + 'px ' + pan.y + 'px' },
    }))
  }
  if (MINOR_GRID * zoom >= 5) {
    layers.push(h('div', {
      key: 'minor',
      className: 'ufm-grid ufm-grid-minor',
      style: { backgroundSize: MINOR_GRID * zoom + 'px ' + MINOR_GRID * zoom + 'px', backgroundPosition: pan.x + 'px ' + pan.y + 'px' },
    }))
  }
  return h('div', null, layers)
}

/* ---------------------------------------------------------------- connections */

function cubicPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t
  const a = mt * mt * mt
  const b = 3 * mt * mt * t
  const c = 3 * mt * t * t
  const d = t * t * t
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y }
}

/**
 * The link layer: the one place this UI spends its boldness.
 *
 * Two plotter inks tell the two kinds apart at a glance — `navigate` is a solid
 * line that leaves the screen, `overlay` a dashed line that lands a hatched sheet
 * on top of the target. Both end in an arrowhead and both mark their start with a
 * pen-down terminal, so a link always reads from its source element.
 */
function ConnectionsLayer(props) {
  const doc = props.doc
  const zoom = props.zoom
  const pan = props.pan
  const positions = props.positions
  const selectedId = props.selectedId
  const onSelect = props.onSelect
  const t = props.t

  const inkJump = 'var(--ufm-ink-jump, #2557D6)'
  const inkCover = 'var(--ufm-ink-cover, #B25E00)'
  const items = []

  for (const connection of doc.connections) {
    const sourceScreen = model.findScreen(doc, connection.from.screen)
    const targetScreen = model.findScreen(doc, connection.to.screen)
    if (!sourceScreen || !targetScreen) continue
    const sourceElement = model.findElement(sourceScreen, connection.from.element)
    if (!sourceElement) continue
    const sourcePos = positions[sourceScreen.id]
    const targetPos = positions[targetScreen.id]
    if (!sourcePos || !targetPos) continue

    const start = {
      x: sourcePos.x * zoom + pan.x + (sourceElement.position.x + sourceElement.position.w / 2) * zoom,
      y: sourcePos.y * zoom + pan.y + (sourceElement.position.y + sourceElement.position.h / 2) * zoom,
    }
    const targetRect = {
      x: targetPos.x * zoom + pan.x,
      y: targetPos.y * zoom + pan.y,
      w: targetScreen.size.w * zoom,
      h: targetScreen.size.h * zoom,
    }
    const end = model.edgePoint(targetRect, start)
    const dx = end.x - start.x
    const c1 = { x: start.x + dx * 0.45, y: start.y }
    const c2 = { x: end.x - dx * 0.45, y: end.y }
    const path = 'M ' + start.x + ' ' + start.y + ' C ' + c1.x + ' ' + c1.y + ', ' + c2.x + ' ' + c2.y + ', ' + end.x + ' ' + end.y
    const isOverlay = connection.type === 'overlay'
    const selected = connection.id === selectedId
    const ink = selected ? 'var(--dsw-alias-brand-primary)' : (isOverlay ? inkCover : inkJump)
    const mid = cubicPoint(start, c1, c2, end, 0.5)
    const tag = t(isOverlay ? 'connOverlayShort' : 'connNavigateShort')
    const tagWidth = tag.length * 7 + 10
    const note = connection.note ? connection.note : ''

    if (isOverlay && connection.overlay) {
      const overlay = connection.overlay
      const ow = overlay.size.w * zoom
      const oh = overlay.size.h * zoom
      const ox = overlay.position === 'bottom-sheet'
        ? targetRect.x + (targetRect.w - ow) / 2
        : overlay.position === 'custom'
          ? targetRect.x + overlay.anchor.x * zoom
          : targetRect.x + (targetRect.w - ow) / 2
      const oy = overlay.position === 'bottom-sheet'
        ? targetRect.y + targetRect.h - oh
        : overlay.position === 'custom'
          ? targetRect.y + overlay.anchor.y * zoom
          : targetRect.y + (targetRect.h - oh) / 2
      items.push(h('rect', {
        key: connection.id + '-sheet',
        x: ox, y: oy, width: ow, height: oh,
        fill: 'url(#ufm-hatch)',
        stroke: ink,
        strokeWidth: 1,
        pointerEvents: 'none',
      }))
    }

    /* pen-down terminal: filled for a jump, hollow for a sheet */
    items.push(h('rect', {
      key: connection.id + '-terminal',
      x: start.x - 3, y: start.y - 3, width: 6, height: 6,
      fill: isOverlay ? 'var(--dsw-alias-bg-base)' : ink,
      stroke: ink,
      strokeWidth: 1,
      pointerEvents: 'none',
    }))

    items.push(
      h('path', {
        key: connection.id + '-hit',
        d: path,
        fill: 'none',
        stroke: 'transparent',
        strokeWidth: 16,
        style: { pointerEvents: 'stroke', cursor: 'pointer' },
        onPointerDown: (event) => {
          event.stopPropagation()
          onSelect(connection.id)
        },
      }),
      h('path', {
        key: connection.id,
        d: path,
        fill: 'none',
        stroke: ink,
        strokeWidth: selected ? 3.5 : 2.5,
        strokeDasharray: isOverlay ? '7 4' : undefined,
        strokeLinecap: 'round',
        markerEnd: isOverlay ? 'url(#ufm-arrow-cover)' : 'url(#ufm-arrow-jump)',
        pointerEvents: 'none',
      }),
      h(
        'g',
        { key: connection.id + '-tag', transform: 'translate(' + mid.x + ',' + mid.y + ')', pointerEvents: 'none' },
        h('title', null, note || tag),
        h('rect', {
          x: -tagWidth / 2, y: -8, width: tagWidth, height: 16,
          fill: selected ? ink : 'var(--dsw-alias-bg-overlay)',
          stroke: ink,
          strokeWidth: 1,
        }),
        h('text', {
          className: 'ufm-link-tag',
          x: 0, y: 3.5,
          textAnchor: 'middle',
          fill: selected ? 'var(--dsw-alias-bg-base)' : ink,
        }, tag),
      ),
    )
  }

  return h(
    'svg',
    { className: 'ufm-svg', width: '100%', height: '100%' },
    h(
      'defs',
      null,
      h('marker', { id: 'ufm-arrow-jump', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' },
        h('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: inkJump })),
      h('marker', { id: 'ufm-arrow-cover', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' },
        h('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: inkCover })),
      h('pattern', { id: 'ufm-hatch', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
        h('rect', { width: 8, height: 8, fill: 'var(--ufm-ink-cover-soft, rgba(178,94,0,.12))' }),
        h('line', { x1: 0, y1: 0, x2: 0, y2: 8, stroke: inkCover, strokeWidth: 1, opacity: 0.55 })),
    ),
    items,
  )
}

/* ------------------------------------------------------------- the drafting table */

function CanvasViewport(props) {
  const doc = props.doc
  const t = props.t
  const store = props.store
  const actions = props.actions
  const zoom = props.zoom
  const pan = props.pan
  const cardPos = props.cardPos
  const sel = props.sel
  const setSel = props.setSel
  const linking = props.linking
  const setLinking = props.setLinking
  const setZoom = props.setZoom
  const setPan = props.setPan
  const setCardPos = props.setCardPos
  const fitRef = props.fitRef
  const tool = props.tool || 'select'

  const viewportRef = React.useRef(null)
  const dragRef = React.useRef(null)
  const cancelEditRef = React.useRef(false)
  const didFitRef = React.useRef(false)
  const editRef = React.useRef(null)
  const latest = React.useRef({})
  const [menu, setMenu] = React.useState(null)
  const [editing, setEditing] = React.useState(null)
  const [linkPoint, setLinkPoint] = React.useState(null)
  const [draft, setDraft] = React.useState(null)

  latest.current = { doc: doc, zoom: zoom, pan: pan, cardPos: cardPos, linking: linking, sel: sel, tool: tool }

  const defaults = React.useMemo(() => model.defaultCardPositions(doc.screens), [doc.screens])
  const positions = React.useMemo(() => {
    const out = {}
    for (const screen of doc.screens) out[screen.id] = cardPos[screen.id] || defaults[screen.id] || { x: 0, y: 0 }
    return out
  }, [doc.screens, cardPos, defaults])

  const linkedKeys = React.useMemo(() => {
    const set = {}
    for (const connection of doc.connections) set[connection.from.screen + '/' + connection.from.element] = true
    return set
  }, [doc.connections])

  /** Canvas pixel -> design pixel inside one screen. */
  function toDesign(screenId, clientX, clientY) {
    const viewport = viewportRef.current
    if (!viewport) return { x: 0, y: 0 }
    const state = latest.current
    const rect = viewport.getBoundingClientRect()
    const pos = state.cardPos[screenId] || defaults[screenId] || { x: 0, y: 0 }
    return {
      x: (clientX - rect.left - (pos.x * state.zoom + state.pan.x)) / state.zoom,
      y: (clientY - rect.top - (pos.y * state.zoom + state.pan.y)) / state.zoom,
    }
  }

  function toViewport(clientX, clientY) {
    const viewport = viewportRef.current
    if (!viewport) return { x: 0, y: 0 }
    const rect = viewport.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  function zoomAround(factor, clientX, clientY) {
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const cx = clientX === undefined ? rect.width / 2 : clientX - rect.left
    const cy = clientY === undefined ? rect.height / 2 : clientY - rect.top
    const state = latest.current
    const nextZoom = clampZoom(state.zoom * factor)
    const ratio = nextZoom / state.zoom
    setZoom(nextZoom)
    setPan({ x: cx - (cx - state.pan.x) * ratio, y: cy - (cy - state.pan.y) * ratio })
  }

  function fit() {
    const viewport = viewportRef.current
    if (!viewport) return
    const state = latest.current
    const rect = viewport.getBoundingClientRect()
    const resolved = Object.assign({}, model.defaultCardPositions(state.doc.screens), state.cardPos)
    const bounds = model.boundsOf(state.doc, resolved)
    if (bounds.w <= 0 || bounds.h <= 0) return
    const padding = 44
    const nextZoom = clampZoom(Math.min(
      (rect.width - padding * 2) / bounds.w,
      (rect.height - padding * 2) / bounds.h,
    ))
    setZoom(nextZoom)
    setPan({
      x: (rect.width - bounds.w * nextZoom) / 2 - bounds.x * nextZoom,
      y: (rect.height - bounds.h * nextZoom) / 2 - bounds.y * nextZoom,
    })
  }

  /* ---- wheel zoom, keeping the point under the cursor fixed ---- */
  React.useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return undefined
    const onWheel = (event) => {
      event.preventDefault()
      zoomAround(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY)
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [])

  /* ---- one window-level drag loop for every drag mode ---- */
  React.useEffect(() => {
    const onMove = (event) => {
      const drag = dragRef.current
      if (!drag) return
      const state = latest.current
      drag.moved = true
      if (drag.mode === 'pan') {
        setPan({
          x: drag.startPan.x + (event.clientX - drag.startClientX),
          y: drag.startPan.y + (event.clientY - drag.startClientY),
        })
        return
      }
      if (drag.mode === 'move-card') {
        setCardPos(Object.assign({}, state.cardPos, {
          [drag.screenId]: {
            x: drag.startPos.x + (event.clientX - drag.startClientX) / state.zoom,
            y: drag.startPos.y + (event.clientY - drag.startClientY) / state.zoom,
          },
        }))
        return
      }
      if (drag.mode === 'draw') {
        const point = toDesign(drag.screenId, event.clientX, event.clientY)
        const box = normalizeBox(drag.startDesign, point)
        drag.box = box
        setDraft({ screenId: drag.screenId, box: box })
        return
      }
      if (drag.mode === 'move-element') {
        actions.setElementBox(drag.screenId, drag.elementId, {
          x: Math.round(drag.startBox.x + (event.clientX - drag.startClientX) / state.zoom),
          y: Math.round(drag.startBox.y + (event.clientY - drag.startClientY) / state.zoom),
        }, false)
        return
      }
      if (drag.mode === 'resize-element') {
        const start = drag.startBox
        const dx = (event.clientX - drag.startClientX) / state.zoom
        const dy = (event.clientY - drag.startClientY) / state.zoom
        const west = drag.dir.indexOf('w') >= 0
        const east = drag.dir.indexOf('e') >= 0
        const north = drag.dir.indexOf('n') >= 0
        const south = drag.dir.indexOf('s') >= 0
        let x = start.x
        let y = start.y
        let w = start.w
        let h = start.h
        if (east) w = start.w + dx
        if (west) {
          w = start.w - dx
          x = start.x + dx
        }
        if (south) h = start.h + dy
        if (north) {
          h = start.h - dy
          y = start.y + dy
        }
        if (w < MIN_ELEMENT) {
          if (west) x = start.x + start.w - MIN_ELEMENT
          w = MIN_ELEMENT
        }
        if (h < MIN_ELEMENT) {
          if (north) y = start.y + start.h - MIN_ELEMENT
          h = MIN_ELEMENT
        }
        actions.setElementBox(drag.screenId, drag.elementId, {
          x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
        }, false)
      }
    }
    const onUp = (event) => {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null
      if (drag.mode === 'draw') {
        const point = toDesign(drag.screenId, event.clientX, event.clientY)
        const box = drag.box && drag.box.w >= DRAW_THRESHOLD && drag.box.h >= DRAW_THRESHOLD
          ? drag.box
          : defaultBoxAt(drag.shape, point)
        setDraft(null)
        actions.createAt(drag.screenId, drag.shape, box, event.shiftKey === true)
        return
      }
      if (drag.preDoc && drag.moved) store.pushHistory(drag.preDoc)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  /* ---- Esc cancels linking / editing, and puts the select pen back ---- */
  React.useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      if (latest.current.linking) {
        setLinking(null)
        setLinkPoint(null)
      }
      if (latest.current.tool !== 'select') {
        props.onToolChange('select')
      }
      cancelEditRef.current = true
      setEditing(null)
      setMenu(null)
      setDraft(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* ---- context menu dismissal ---- */
  React.useEffect(() => {
    if (!menu) return undefined
    const close = () => setMenu(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  /* ---- text editing autofocus ---- */
  React.useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus()
      editRef.current.select()
    }
  }, [editing])

  /* ---- "fit to view" for the toolbar ---- */
  React.useEffect(() => {
    if (!fitRef) return undefined
    fitRef.current = fit
    return () => {
      fitRef.current = null
    }
  }, [])

  /* ---- first paint: fit once the viewport has a size ---- */
  React.useEffect(() => {
    if (didFitRef.current) return
    const viewport = viewportRef.current
    if (!viewport || doc.screens.length === 0) return
    const rect = viewport.getBoundingClientRect()
    if (rect.width < 60 || rect.height < 60) return
    didFitRef.current = true
    fit()
  }, [doc.screens.length])

  function startPan(event) {
    setSel({ kind: 'none' })
    setMenu(null)
    if (event.button !== 0 && event.button !== 1) return
    dragRef.current = {
      mode: 'pan',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPan: pan,
    }
  }

  function onCardPointerDown(event, screen) {
    event.stopPropagation()
    setMenu(null)
    if (event.button !== 0) return
    if (linking) {
      actions.createConnection(linking.screenId, linking.elementId, screen.id, linking.type)
      setLinking(null)
      setLinkPoint(null)
      return
    }
    if (tool !== 'select') {
      const point = toDesign(screen.id, event.clientX, event.clientY)
      dragRef.current = {
        mode: 'draw',
        shape: tool,
        screenId: screen.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startDesign: point,
        box: null,
      }
      setDraft({ screenId: screen.id, box: { x: point.x, y: point.y, w: 0, h: 0 } })
      return
    }
    const point = toDesign(screen.id, event.clientX, event.clientY)
    const hit = model.hitTest(screen, point.x, point.y)
    if (!hit) {
      setSel({ kind: 'screen', screenId: screen.id })
      dragRef.current = { mode: 'pan', startClientX: event.clientX, startClientY: event.clientY, startPan: pan }
      return
    }
    setSel({ kind: 'element', screenId: screen.id, elementId: hit.id })
    if (dragModeFor(hit) === 'move-card') {
      dragRef.current = {
        mode: 'move-card',
        screenId: screen.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPos: positions[screen.id],
      }
      return
    }
    dragRef.current = {
      mode: 'move-element',
      screenId: screen.id,
      elementId: hit.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox: Object.assign({}, hit.position),
      preDoc: store.get(),
    }
  }

  function onCardDoubleClick(event, screen) {
    event.stopPropagation()
    const point = toDesign(screen.id, event.clientX, event.clientY)
    const hit = model.hitTest(screen, point.x, point.y)
    if (!hit) return
    setSel({ kind: 'element', screenId: screen.id, elementId: hit.id })
    if (model.TEXT_SHAPES[hit.shape]) setEditing({ screenId: screen.id, elementId: hit.id })
  }

  function onCardContextMenu(event, screen) {
    event.preventDefault()
    event.stopPropagation()
    const point = toDesign(screen.id, event.clientX, event.clientY)
    const hit = model.hitTest(screen, point.x, point.y)
    if (hit) setSel({ kind: 'element', screenId: screen.id, elementId: hit.id })
    const at = toViewport(event.clientX, event.clientY)
    setMenu({ x: at.x, y: at.y, screenId: screen.id, elementId: hit ? hit.id : null })
  }

  function onResizeStart(event, dir) {
    event.stopPropagation()
    if (!sel || sel.kind !== 'element') return
    const screen = model.findScreen(doc, sel.screenId)
    const element = model.findElement(screen, sel.elementId)
    if (!element) return
    dragRef.current = {
      mode: 'resize-element',
      dir: dir,
      screenId: sel.screenId,
      elementId: sel.elementId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox: Object.assign({}, element.position),
      preDoc: store.get(),
    }
  }

  function commitEdit() {
    const target = editing
    setEditing(null)
    if (!target) return
    if (cancelEditRef.current) {
      cancelEditRef.current = false
      return
    }
    const node = editRef.current
    if (node) actions.setElementText(target.screenId, target.elementId, node.value)
  }

  /* ---- geometry for the overlays ---- */
  const selectedElement = sel && sel.kind === 'element'
    ? model.findElement(model.findScreen(doc, sel.screenId), sel.elementId)
    : null
  const selectedScreenId = sel && (sel.kind === 'element' || sel.kind === 'screen') ? sel.screenId : null

  let selectionRect = null
  if (selectedElement && positions[selectedScreenId]) {
    const pos = positions[selectedScreenId]
    selectionRect = {
      x: pos.x * zoom + pan.x + selectedElement.position.x * zoom,
      y: pos.y * zoom + pan.y + selectedElement.position.y * zoom,
      w: selectedElement.position.w * zoom,
      h: selectedElement.position.h * zoom,
    }
  }

  let linkStart = null
  if (linking && linkPoint) {
    const screen = model.findScreen(doc, linking.screenId)
    const element = model.findElement(screen, linking.elementId)
    const pos = screen ? positions[screen.id] : null
    if (screen && element && pos) {
      linkStart = {
        x: pos.x * zoom + pan.x + (element.position.x + element.position.w / 2) * zoom,
        y: pos.y * zoom + pan.y + (element.position.y + element.position.h / 2) * zoom,
      }
    }
  }

  /* Live dimension readout: while a transform is in flight, print the numbers
     where the change is happening (a drafting table always shows its figures). */
  let measure = null
  const drag = dragRef.current
  if (drag && drag.mode === 'draw' && draft) {
    const pos = positions[draft.screenId]
    if (pos) {
      measure = {
        x: pos.x * zoom + pan.x + (draft.box.x + draft.box.w) * zoom + 10,
        y: pos.y * zoom + pan.y + (draft.box.y + draft.box.h) * zoom + 10,
        text: Math.round(draft.box.w) + ' × ' + Math.round(draft.box.h),
      }
    }
  } else if (drag && drag.mode === 'move-card') {
    /* Dragging a screen by its head — or by one of its fixed elements. */
    const moved = positions[drag.screenId]
    const movedScreen = model.findScreen(doc, drag.screenId)
    if (moved && movedScreen) {
      measure = {
        x: moved.x * zoom + pan.x + movedScreen.size.w * zoom + 10,
        y: moved.y * zoom + pan.y + movedScreen.size.h * zoom + 10,
        text: Math.round(moved.x) + ', ' + Math.round(moved.y),
      }
    }
  } else if (drag && drag.mode === 'move-element' && selectedElement) {
    measure = {
      x: selectionRect.x + selectionRect.w + 10,
      y: selectionRect.y + selectionRect.h + 10,
      text: selectedElement.position.x + ', ' + selectedElement.position.y,
    }
  } else if (drag && drag.mode === 'resize-element' && selectedElement) {
    measure = {
      x: selectionRect.x + selectionRect.w + 10,
      y: selectionRect.y + selectionRect.h + 10,
      text: selectedElement.position.w + ' × ' + selectedElement.position.h,
    }
  }

  const menuItems = []
  if (menu) {
    if (menu.elementId) {
      menuItems.push(
        { label: t('menuConnectNavigate'), action: () => setLinking({ screenId: menu.screenId, elementId: menu.elementId, type: 'navigate' }) },
        { label: t('menuConnectOverlay'), action: () => setLinking({ screenId: menu.screenId, elementId: menu.elementId, type: 'overlay' }) },
        { label: t('menuDuplicate'), action: () => actions.duplicateElement(menu.screenId, menu.elementId) },
        { label: t('menuDeleteElement'), action: () => actions.deleteElement(menu.screenId, menu.elementId), danger: true },
      )
    } else {
      menuItems.push(
        { label: t('menuNewScreen'), action: () => actions.newScreen() },
        { label: t('menuFit'), action: fit },
        { label: t('menuDeleteScreen'), action: () => actions.deleteScreen(menu.screenId), danger: true },
      )
    }
  }

  const editingElement = editing
    ? model.findElement(model.findScreen(doc, editing.screenId), editing.elementId)
    : null

  const hint = linking
    ? t(linking.type === 'overlay' ? 'linkingOverlayHint' : 'linkingHint')
    : tool !== 'select' ? t('toolDrawHintSmall') : null

  return h(
    'div',
    {
      className: 'ufm-viewport'
        + (linking ? ' is-linking' : '')
        + (tool !== 'select' ? ' is-drawing' : ''),
      ref: viewportRef,
      onPointerDown: startPan,
      onPointerMove: (event) => {
        if (!linking) return
        setLinkPoint(toViewport(event.clientX, event.clientY))
      },
      onContextMenu: (event) => {
        event.preventDefault()
        setMenu(null)
      },
    },

    h(GridLayer, { zoom: zoom, pan: pan }),

    doc.screens.length === 0
      ? h('div', { className: 'ufm-empty' },
          h('div', { className: 'ufm-empty-title' }, t('emptyTitle')),
          h('div', { className: 'ufm-empty-body' }, t('emptyBody')),
          h('button', {
            type: 'button',
            className: 'ufm-new-screen',
            style: { position: 'static' },
            onPointerDown: (event) => event.stopPropagation(),
            onClick: () => actions.newScreen(),
          }, t('newScreen')))
      : null,

    doc.screens.map((screen) => {
      const pos = positions[screen.id]
      const screenSelected = sel && sel.kind === 'screen' && sel.screenId === screen.id
      const selectedElementId = sel && sel.kind === 'element' && sel.screenId === screen.id ? sel.elementId : null
      const currentSelection = selectedElementId ? model.findElement(screen, selectedElementId) : null
      const editable = editing && editing.screenId === screen.id ? editingElement : null
      const editableStyle = editable ? model.styleFor(editable) : null
      const draftHere = draft && draft.screenId === screen.id ? draft.box : null

      return h(
        'div',
        {
          key: screen.id,
          className: 'ufm-card' + (screenSelected ? ' is-selected' : '') + (props.freshScreenId === screen.id ? ' is-new' : ''),
          style: {
            left: pos.x * zoom + pan.x,
            top: pos.y * zoom + pan.y,
            width: screen.size.w * zoom,
            height: screen.size.h * zoom,
          },
        },
        h(
          'div',
          {
            className: 'ufm-card-head',
            onPointerDown: (event) => {
              event.stopPropagation()
              setSel({ kind: 'screen', screenId: screen.id })
              dragRef.current = {
                mode: 'move-card',
                screenId: screen.id,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startPos: pos,
              }
            },
          },
          h('span', { className: 'ufm-card-name' }, screen.name),
          h('span', { className: 'ufm-card-size' }, screen.size.w + '×' + screen.size.h),
        ),
        h(
          'div',
          {
            className: 'ufm-card-body',
            style: {
              width: screen.size.w,
              height: screen.size.h,
              transform: 'scale(' + zoom + ')',
              transformOrigin: '0 0',
              background: screen.background && screen.background.fill ? screen.background.fill : '#FFFFFF',
            },
            onPointerDown: (event) => onCardPointerDown(event, screen),
            onDoubleClick: (event) => onCardDoubleClick(event, screen),
            onContextMenu: (event) => onCardContextMenu(event, screen),
          },
          screen.elements.map((element) =>
            h(ElementView, { key: element.id, element: element, imageHint: t('imageGroup') }),
          ),
          zoom >= 0.25
            ? screen.elements
                .filter((element) => element.type === 'interactive' && !linkedKeys[screen.id + '/' + element.id])
                .map((element) =>
                  h('span', {
                    key: element.id + '-todo',
                    className: 'ufm-todo',
                    style: { left: element.position.x + element.position.w, top: element.position.y },
                  }, t('todoBadge')),
                )
            : null,
          draftHere
            ? h('div', {
                className: 'ufm-el-outline',
                style: {
                  left: draftHere.x,
                  top: draftHere.y,
                  width: draftHere.w,
                  height: draftHere.h,
                  borderStyle: 'dashed',
                },
              })
            : null,
          currentSelection
            ? h('div', {
                className: 'ufm-el-outline',
                style: {
                  left: currentSelection.position.x,
                  top: currentSelection.position.y,
                  width: currentSelection.position.w,
                  height: currentSelection.position.h,
                },
              })
            : null,
          editable
            ? h('textarea', {
                ref: editRef,
                className: 'ufm-el-edit',
                defaultValue: editable.text,
                style: {
                  left: editable.position.x,
                  top: editable.position.y,
                  width: editable.position.w,
                  height: editable.position.h,
                  fontSize: editableStyle.fontSize,
                  fontWeight: editableStyle.fontWeight,
                  color: editableStyle.color,
                  textAlign: editableStyle.align,
                  padding: model.TEXT_SHAPES[editable.shape] ? '0 10px' : 0,
                },
                onPointerDown: (event) => event.stopPropagation(),
                onBlur: commitEdit,
                onKeyDown: (event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault()
                    commitEdit()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelEditRef.current = true
                    setEditing(null)
                  }
                },
              })
            : null,
        ),
      )
    }),

    h(ConnectionsLayer, {
      doc: doc,
      t: t,
      zoom: zoom,
      pan: pan,
      positions: positions,
      selectedId: sel && sel.kind === 'connection' ? sel.connectionId : null,
      onSelect: (connectionId) => setSel({ kind: 'connection', connectionId: connectionId }),
    }),

    linkStart && linkPoint
      ? h('svg', { className: 'ufm-svg' },
          h('path', {
            d: 'M ' + linkStart.x + ' ' + linkStart.y + ' L ' + linkPoint.x + ' ' + linkPoint.y,
            stroke: 'var(--ufm-ink-jump, #2557D6)',
            strokeWidth: 2,
            strokeDasharray: '6 4',
            fill: 'none',
          }))
      : null,

    selectionRect ? h(SelectionHandles, { rect: selectionRect, onResizeStart: onResizeStart }) : null,

    measure
      ? h('div', {
          className: 'ufm-measure',
          style: { left: Math.round(measure.x), top: Math.round(measure.y) },
        }, measure.text)
      : null,

    hint ? h('div', { className: 'ufm-hintbar' }, hint) : null,

    h(
      'div',
      { className: 'ufm-canvas-controls', onPointerDown: (event) => event.stopPropagation() },
      h('button', { type: 'button', className: 'ufm-mini', title: t('zoomOut'), 'aria-label': t('zoomOut'), onClick: () => zoomAround(1 / 1.25) }, '−'),
      h('span', { className: 'ufm-zoom-label' }, Math.round(zoom * 100) + '%'),
      h('button', { type: 'button', className: 'ufm-mini', title: t('zoomIn'), 'aria-label': t('zoomIn'), onClick: () => zoomAround(1.25) }, '+'),
      h('button', { type: 'button', className: 'ufm-mini is-wide', title: t('zoomFit'), onClick: fit }, t('zoomFit')),
    ),

    h(
      'button',
      {
        type: 'button',
        className: 'ufm-new-screen',
        onPointerDown: (event) => event.stopPropagation(),
        onClick: () => actions.newScreen(),
      },
      t('newScreen'),
    ),

    menu
      ? h(
          'div',
          { className: 'ufm-menu', style: { left: menu.x, top: menu.y }, onPointerDown: (event) => event.stopPropagation() },
          menuItems.map((item, index) =>
            h(
              'button',
              {
                key: index,
                type: 'button',
                className: 'ufm-menu-item' + (item.danger ? ' is-danger' : ''),
                onClick: () => {
                  setMenu(null)
                  item.action()
                },
              },
              item.label,
            ),
          ),
        )
      : null,
  )
}

/** Normalized box between two design-space points. */
function normalizeBox(from, to) {
  return {
    x: Math.round(Math.min(from.x, to.x)),
    y: Math.round(Math.min(from.y, to.y)),
    w: Math.round(Math.abs(to.x - from.x)),
    h: Math.round(Math.abs(to.y - from.y)),
  }
}

/** Default-sized box centred on a point (the pen's click-without-drag behaviour). */
function defaultBoxAt(shape, point) {
  const box = model.SHAPE_BOX[shape] || model.SHAPE_BOX.rect
  return {
    x: Math.round(point.x - box.w / 2),
    y: Math.round(point.y - box.h / 2),
    w: box.w,
    h: box.h,
  }
}

module.exports = { CanvasViewport, clampZoom, normalizeBox, defaultBoxAt, dragModeFor }
