/**
 * Canvas document model: schema constants, factories, hit testing and the
 * import/validate rules from the charter (§4).
 *
 * Pure data + pure functions — no React, no DSH APIs — so `tools/test-client.mjs`
 * can exercise all of it in plain Node.
 */

const SCHEMA = 'dsh-uiflow/canvas'
const VERSION = '1.0.0'
const DEFAULT_SIZE = { w: 1920, h: 1080 }
const MIN_SIZE = { w: 320, h: 240 }
const MIN_ELEMENT_SIZE = 8

/** Shape -> default element type (`INV-1`'s source of truth). */
const SHAPE_TYPE = {
  rect: 'decorative',
  roundrect: 'decorative',
  ellipse: 'decorative',
  line: 'decorative',
  arrow: 'decorative',
  text: 'decorative',
  image: 'decorative',
  button: 'interactive',
  menuitem: 'interactive',
  tab: 'interactive',
  card: 'interactive',
  input: 'interactive',
  select: 'interactive',
  checkbox: 'interactive',
  radio: 'interactive',
  slider: 'interactive',
  switch: 'interactive',
}
const SHAPES = Object.keys(SHAPE_TYPE)
/** Shapes that render their `text`. */
const TEXT_SHAPES = { text: 1, button: 1, input: 1, select: 1, card: 1, menuitem: 1, tab: 1 }
const ROLE_PRESETS = ['导航', '开关', '输入', '展示', '弹窗', '上传', '下载', '其他']
const CONNECTION_TYPES = ['navigate', 'overlay']

const SHAPE_BOX = {
  rect: { w: 320, h: 180 },
  roundrect: { w: 320, h: 180 },
  ellipse: { w: 180, h: 180 },
  line: { w: 280, h: 4 },
  arrow: { w: 280, h: 4 },
  text: { w: 260, h: 48 },
  image: { w: 320, h: 200 },
  button: { w: 160, h: 48 },
  menuitem: { w: 240, h: 44 },
  tab: { w: 120, h: 40 },
  card: { w: 360, h: 240 },
  input: { w: 280, h: 44 },
  select: { w: 280, h: 44 },
  checkbox: { w: 22, h: 22 },
  radio: { w: 22, h: 22 },
  slider: { w: 240, h: 28 },
  switch: { w: 52, h: 28 },
}

/** Per-shape visual defaults; a design's own colours, not app theme tokens. */
const SHAPE_STYLE = {
  rect: { fill: '#E9ECF1', radius: 0 },
  roundrect: { fill: '#E9ECF1', radius: 20 },
  ellipse: { fill: '#E9ECF1', radius: 999 },
  line: { fill: '#8A93A3', radius: 2 },
  arrow: { fill: '#8A93A3', radius: 2 },
  text: { fill: null, color: '#1F2329', fontSize: 24, fontWeight: 500, align: 'left' },
  image: { fill: null },
  button: { fill: '#4D6BFE', color: '#FFFFFF', radius: 8, fontSize: 15, fontWeight: 600, align: 'center' },
  menuitem: { fill: null, color: '#1F2329', radius: 6, fontSize: 15, align: 'left' },
  tab: { fill: '#F2F4F7', color: '#1F2329', radius: 6, fontSize: 14, align: 'center' },
  card: { fill: '#FFFFFF', stroke: '#E3E7ED', radius: 12, color: '#1F2329', fontSize: 16, align: 'left' },
  input: { fill: '#FFFFFF', stroke: '#C9CED6', radius: 6, color: '#8A93A3', fontSize: 15, align: 'left' },
  select: { fill: '#FFFFFF', stroke: '#C9CED6', radius: 6, color: '#1F2329', fontSize: 15, align: 'left' },
  checkbox: { fill: '#FFFFFF', stroke: '#C9CED6', radius: 4 },
  radio: { fill: '#FFFFFF', stroke: '#C9CED6', radius: 999 },
  slider: { fill: '#D8DCE3', radius: 999 },
  switch: { fill: '#C9CED6', radius: 999 },
}

const BASE_STYLE = {
  fill: null,
  stroke: null,
  strokeWidth: 1,
  radius: 0,
  opacity: 1,
  color: '#1F2329',
  fontSize: 15,
  fontWeight: 400,
  align: 'center',
  image: null,
}

function nowIso() {
  return new Date().toISOString()
}

/** Deep clone plain document data. */
function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function clampNumber(value, min, max, fallback) {
  if (!isFiniteNumber(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** Next free `<prefix>_<n>` id for a collection (`D-17`: readable, never reused). */
function nextId(prefix, ids) {
  let max = 0
  const head = prefix + '_'
  for (const id of ids) {
    if (typeof id !== 'string' || id.indexOf(head) !== 0) continue
    const n = Number(id.slice(head.length))
    if (Number.isFinite(n) && n > max) max = n
  }
  return head + (max + 1)
}

/** Merged style for rendering (base <- shape defaults <- element overrides). */
function styleFor(element) {
  return Object.assign({}, BASE_STYLE, SHAPE_STYLE[element.shape] || {}, element.style || {})
}

/**
 * Resolve an element's type from its shape and the requested type.
 *
 * The shape table gives the *default* (`D-05`); any shape may be explicitly
 * promoted to `interactive`, because in practice people draw a plain rectangle
 * and then want it to be the thing you click. `INV-1` is still enforced where it
 * matters: only `interactive` elements may start a link.
 */
function typeForShape(shape, requested) {
  const natural = SHAPE_TYPE[shape] || 'decorative'
  if (natural === 'interactive') return 'interactive'
  return requested === 'interactive' ? 'interactive' : 'decorative'
}

function createDoc(name) {
  const stamp = nowIso()
  return {
    schema: SCHEMA,
    version: VERSION,
    meta: {
      name: name || '未命名软件',
      description: '',
      createdAt: stamp,
      updatedAt: stamp,
      design: { defaultSize: Object.assign({}, DEFAULT_SIZE), responsive: false },
    },
    screens: [],
    connections: [],
  }
}

function createScreen(doc, options) {
  const opts = options || {}
  const size = opts.size || (doc && doc.meta && doc.meta.design.defaultSize) || DEFAULT_SIZE
  const ids = (doc ? doc.screens : []).map((s) => s.id)
  return {
    id: opts.id || nextId('screen', ids),
    name: opts.name || '界面 ' + ((doc ? doc.screens.length : 0) + 1),
    size: { w: Math.round(size.w), h: Math.round(size.h) },
    background: { fill: '#FFFFFF', image: null },
    note: '',
    elements: [],
  }
}

function createElement(shape, box, id, zIndex) {
  const kind = SHAPES.indexOf(shape) >= 0 ? shape : 'rect'
  const natural = SHAPE_BOX[kind]
  return {
    id: id || 'elem_1',
    type: SHAPE_TYPE[kind],
    shape: kind,
    text: '',
    position: {
      x: Math.round(box && isFiniteNumber(box.x) ? box.x : 0),
      y: Math.round(box && isFiniteNumber(box.y) ? box.y : 0),
      w: Math.round(box && isFiniteNumber(box.w) ? box.w : natural.w),
      h: Math.round(box && isFiniteNumber(box.h) ? box.h : natural.h),
    },
    zIndex: isFiniteNumber(zIndex) ? zIndex : 1,
    fixed: false,
    role: { preset: null, text: '' },
    style: Object.assign({}, SHAPE_STYLE[kind] || {}),
  }
}

function createConnection(fromScreenId, fromElementId, toScreenId, type) {
  return {
    id: 'conn_1',
    from: { screen: fromScreenId, element: fromElementId },
    to: { screen: toScreenId },
    type: CONNECTION_TYPES.indexOf(type) >= 0 ? type : 'navigate',
    overlay:
      type === 'overlay'
        ? { size: { w: 640, h: 480 }, position: 'center', anchor: { x: 640, y: 300 }, modal: true, dismiss: ['backdrop', 'close-button'] }
        : null,
    note: '',
    createdAt: nowIso(),
  }
}

function findScreen(doc, screenId) {
  return (doc.screens || []).find((s) => s.id === screenId)
}

function findElement(screen, elementId) {
  return screen ? (screen.elements || []).find((e) => e.id === elementId) : undefined
}

function findConnection(doc, connectionId) {
  return (doc.connections || []).find((c) => c.id === connectionId)
}

/** Topmost element under a design-space point (`zIndex` desc, then array order). */
function hitTest(screen, x, y) {
  if (!screen) return null
  const order = screen.elements
    .map((element, index) => ({ element, index }))
    .sort((a, b) => b.element.zIndex - a.element.zIndex || b.index - a.index)
  for (const candidate of order) {
    const el = candidate.element
    const p = el.position
    const slop = el.shape === 'line' || el.shape === 'arrow' ? 6 : 0
    if (x >= p.x && x <= p.x + p.w && y >= p.y - slop && y <= p.y + p.h + slop) return el
  }
  return null
}

/** Default canvas layout: three screens per row with a gap, in design pixels. */
function defaultCardPositions(screens) {
  const out = {}
  const cols = 3
  const gap = 160
  screens.forEach((screen, index) => {
    out[screen.id] = {
      x: (index % cols) * (DEFAULT_SIZE.w + gap),
      y: Math.floor(index / cols) * (DEFAULT_SIZE.h + gap),
    }
  })
  return out
}

/** Bounding box of every card, in canvas pixels. */
function boundsOf(doc, cardPositions) {
  const screens = doc.screens || []
  if (screens.length === 0) return { x: 0, y: 0, w: DEFAULT_SIZE.w, h: DEFAULT_SIZE.h }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const screen of screens) {
    const pos = cardPositions[screen.id] || { x: 0, y: 0 }
    minX = Math.min(minX, pos.x)
    minY = Math.min(minY, pos.y)
    maxX = Math.max(maxX, pos.x + screen.size.w)
    maxY = Math.max(maxY, pos.y + screen.size.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** Point on a rect's border along the segment from its centre towards `from`. */
function edgePoint(rect, from) {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const dx = from.x - cx
  const dy = from.y - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const sx = dx === 0 ? Infinity : rect.w / 2 / Math.abs(dx)
  const sy = dy === 0 ? Infinity : rect.h / 2 / Math.abs(dy)
  const t = Math.min(sx, sy)
  return { x: cx + dx * t, y: cy + dy * t }
}

function summarize(doc) {
  const screens = doc.screens || []
  let elements = 0
  for (const screen of screens) elements += (screen.elements || []).length
  return { screens: screens.length, elements, connections: (doc.connections || []).length }
}

function sanitizeStyle(raw, shape) {
  const base = Object.assign({}, SHAPE_STYLE[shape] || {})
  const out = Object.assign({}, raw && typeof raw === 'object' ? raw : {})
  const colors = ['fill', 'stroke', 'color']
  for (const key of colors) {
    const value = out[key]
    if (value !== null && value !== undefined && typeof value !== 'string') delete out[key]
  }
  if (typeof out.image !== 'string') delete out.image
  out.radius = clampNumber(out.radius, 0, 999, isFiniteNumber(base.radius) ? base.radius : 0)
  out.opacity = clampNumber(out.opacity, 0, 1, 1)
  out.fontSize = clampNumber(out.fontSize, 8, 200, isFiniteNumber(base.fontSize) ? base.fontSize : BASE_STYLE.fontSize)
  out.fontWeight = clampNumber(out.fontWeight, 100, 900, 400)
  out.strokeWidth = clampNumber(out.strokeWidth, 0, 40, 1)
  if (['left', 'center', 'right'].indexOf(out.align) < 0) out.align = base.align || 'center'
  return out
}

/**
 * Sanitize an imported document: coerce what can be coerced, drop what cannot,
 * and report every change (`INV-1`, `INV-2`, `INV-3`, `INV-6`, `INV-8`).
 */
function normalizeDoc(raw) {
  const errors = []
  if (!raw || typeof raw !== 'object') {
    errors.push('不是一个 JSON 对象')
    return { doc: createDoc(), errors }
  }
  if (raw.schema !== undefined && raw.schema !== SCHEMA) errors.push('schema 不是 ' + SCHEMA)
  const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {}
  const doc = createDoc(typeof meta.name === 'string' ? meta.name : '导入的画布')
  doc.meta.description = typeof meta.description === 'string' ? meta.description : ''
  const design = meta.design && typeof meta.design === 'object' ? meta.design : {}
  const size = design.defaultSize && typeof design.defaultSize === 'object' ? design.defaultSize : {}
  doc.meta.design.defaultSize = {
    w: Math.round(clampNumber(size.w, MIN_SIZE.w, 8192, DEFAULT_SIZE.w)),
    h: Math.round(clampNumber(size.h, MIN_SIZE.h, 8192, DEFAULT_SIZE.h)),
  }
  doc.meta.design.responsive = false
  doc.meta.createdAt = typeof meta.createdAt === 'string' ? meta.createdAt : doc.meta.createdAt
  doc.meta.updatedAt = nowIso()

  const screenIds = new Set()
  for (const rawScreen of Array.isArray(raw.screens) ? raw.screens : []) {
    if (!rawScreen || typeof rawScreen !== 'object') continue
    let id = typeof rawScreen.id === 'string' && rawScreen.id ? rawScreen.id : null
    if (!id || screenIds.has(id)) {
      id = nextId('screen', Array.from(screenIds))
      errors.push('界面 id 缺失或重复，已改为 ' + id)
    }
    screenIds.add(id)
    const rawSize = rawScreen.size && typeof rawScreen.size === 'object' ? rawScreen.size : {}
    const screen = {
      id,
      name: typeof rawScreen.name === 'string' && rawScreen.name ? rawScreen.name : '界面 ' + (screenIds.size),
      size: {
        w: Math.round(clampNumber(rawSize.w, MIN_SIZE.w, 8192, doc.meta.design.defaultSize.w)),
        h: Math.round(clampNumber(rawSize.h, MIN_SIZE.h, 8192, doc.meta.design.defaultSize.h)),
      },
      background: { fill: '#FFFFFF', image: null },
      note: typeof rawScreen.note === 'string' ? rawScreen.note : '',
      elements: [],
    }
    const bg = rawScreen.background
    if (bg && typeof bg.fill === 'string') screen.background.fill = bg.fill
    const elementIds = new Set()
    for (const rawElement of Array.isArray(rawScreen.elements) ? rawScreen.elements : []) {
      if (!rawElement || typeof rawElement !== 'object') continue
      const shape = SHAPES.indexOf(rawElement.shape) >= 0 ? rawElement.shape : 'rect'
      if (shape !== rawElement.shape) errors.push('未知形状已按矩形处理')
      const id2 = typeof rawElement.id === 'string' && rawElement.id && !elementIds.has(rawElement.id)
        ? rawElement.id
        : nextId('elem', Array.from(elementIds))
      if (id2 !== rawElement.id) errors.push('元素 id 缺失或重复，已改为 ' + id2)
      elementIds.add(id2)
      const wanted = rawElement.type === 'interactive' ? 'interactive' : 'decorative'
      const type = typeForShape(shape, wanted)
      if (type !== wanted) errors.push('元素 ' + id2 + ' 的形状与类型不符，类型已纠正为 ' + type)
      const rawPos = rawElement.position && typeof rawElement.position === 'object' ? rawElement.position : {}
      const box = SHAPE_BOX[shape]
      const element = {
        id: id2,
        type,
        shape,
        text: typeof rawElement.text === 'string' ? rawElement.text : '',
        position: {
          x: Math.round(clampNumber(rawPos.x, -100000, 100000, 0)),
          y: Math.round(clampNumber(rawPos.y, -100000, 100000, 0)),
          w: Math.round(clampNumber(rawPos.w, MIN_ELEMENT_SIZE, 100000, box.w)),
          h: Math.round(clampNumber(rawPos.h, MIN_ELEMENT_SIZE, 100000, box.h)),
        },
        zIndex: Math.round(clampNumber(rawElement.zIndex, -9999, 9999, 1)),
        fixed: rawElement.fixed === true,
        role: { preset: null, text: '' },
        style: sanitizeStyle(rawElement.style, shape),
      }
      const role = rawElement.role && typeof rawElement.role === 'object' ? rawElement.role : {}
      if (typeof role.preset === 'string' && ROLE_PRESETS.indexOf(role.preset) >= 0) element.role.preset = role.preset
      if (typeof role.text === 'string') element.role.text = role.text
      screen.elements.push(element)
    }
    doc.screens.push(screen)
  }

  let dropped = 0
  const connectionIds = new Set()
  for (const rawConnection of Array.isArray(raw.connections) ? raw.connections : []) {
    if (!rawConnection || typeof rawConnection !== 'object') continue
    const from = rawConnection.from && typeof rawConnection.from === 'object' ? rawConnection.from : {}
    const to = rawConnection.to && typeof rawConnection.to === 'object' ? rawConnection.to : {}
    const sourceScreen = findScreen(doc, from.screen)
    const sourceElement = findElement(sourceScreen, from.element)
    const targetScreen = findScreen(doc, to.screen)
    if (!sourceElement || !targetScreen || sourceElement.type !== 'interactive') {
      dropped += 1
      continue
    }
    let id = typeof rawConnection.id === 'string' && rawConnection.id && !connectionIds.has(rawConnection.id)
      ? rawConnection.id
      : nextId('conn', Array.from(connectionIds))
    connectionIds.add(id)
    const type = CONNECTION_TYPES.indexOf(rawConnection.type) >= 0 ? rawConnection.type : 'navigate'
    const connection = {
      id,
      from: { screen: sourceScreen.id, element: sourceElement.id },
      to: { screen: targetScreen.id },
      type,
      overlay: null,
      note: typeof rawConnection.note === 'string' ? rawConnection.note : '',
      createdAt: typeof rawConnection.createdAt === 'string' ? rawConnection.createdAt : nowIso(),
    }
    if (type === 'overlay') {
      const rawOverlay = rawConnection.overlay && typeof rawConnection.overlay === 'object' ? rawConnection.overlay : {}
      const rawOverlaySize = rawOverlay.size && typeof rawOverlay.size === 'object' ? rawOverlay.size : {}
      const placement = ['center', 'bottom-sheet', 'custom'].indexOf(rawOverlay.position) >= 0 ? rawOverlay.position : 'center'
      connection.overlay = {
        size: {
          w: Math.round(clampNumber(rawOverlaySize.w, 80, targetScreen.size.w, Math.min(640, targetScreen.size.w))),
          h: Math.round(clampNumber(rawOverlaySize.h, 60, targetScreen.size.h, Math.min(480, targetScreen.size.h))),
        },
        position: placement,
        anchor: {
          x: Math.round(clampNumber(rawOverlay.anchor && rawOverlay.anchor.x, 0, targetScreen.size.w, 0)),
          y: Math.round(clampNumber(rawOverlay.anchor && rawOverlay.anchor.y, 0, targetScreen.size.h, 0)),
        },
        modal: rawOverlay.modal !== false,
        dismiss: Array.isArray(rawOverlay.dismiss) && rawOverlay.dismiss.length > 0 ? rawOverlay.dismiss.filter((v) => typeof v === 'string') : ['backdrop', 'close-button'],
      }
    }
    doc.connections.push(connection)
  }
  if (dropped > 0) errors.push('已丢弃 ' + dropped + ' 条无效连线')
  return { doc, errors }
}

/** Live validation for the editor banner (`INV-1`..`INV-8`). */
function validateDoc(doc) {
  const errors = []
  const warnings = []
  let overflow = 0
  let todo = 0
  const linked = new Set()
  for (const connection of doc.connections || []) {
    if (connection.from && connection.from.element) linked.add(connection.from.screen + '/' + connection.from.element)
  }
  for (const screen of doc.screens || []) {
    for (const element of screen.elements || []) {
      if (element.type !== 'interactive' && linked.has(screen.id + '/' + element.id)) {
        errors.push('装饰元素 ' + element.id + ' 挂着连线（违反 INV-1）')
      }
      if (element.type === 'interactive' && !linked.has(screen.id + '/' + element.id)) todo += 1
      const p = element.position
      if (p.x < 0 || p.y < 0 || p.x + p.w > screen.size.w || p.y + p.h > screen.size.h) overflow += 1
    }
  }
  for (const connection of doc.connections || []) {
    const sourceScreen = findScreen(doc, connection.from.screen)
    const sourceElement = findElement(sourceScreen, connection.from.element)
    if (!sourceElement) errors.push('连线 ' + connection.id + ' 的起点元素不存在（违反 INV-2）')
    if (!findScreen(doc, connection.to.screen)) errors.push('连线 ' + connection.id + ' 的目标界面不存在（违反 INV-2）')
    if (connection.type === 'overlay' && !connection.overlay) errors.push('覆盖小窗连线 ' + connection.id + ' 缺少浮层参数（违反 INV-3）')
    if (connection.type === 'navigate' && connection.overlay) errors.push('跳转连线 ' + connection.id + ' 不该带浮层参数（违反 INV-3）')
  }
  if (overflow > 0) warnings.push(['warnOverflow', { n: overflow }])
  if (todo > 0) warnings.push(['warnTodo', { n: todo }])
  return { errors, warnings }
}

module.exports = {
  SCHEMA,
  VERSION,
  DEFAULT_SIZE,
  MIN_SIZE,
  MIN_ELEMENT_SIZE,
  SHAPE_TYPE,
  SHAPES,
  TEXT_SHAPES,
  ROLE_PRESETS,
  CONNECTION_TYPES,
  SHAPE_BOX,
  SHAPE_STYLE,
  BASE_STYLE,
  nowIso,
  clone,
  nextId,
  clampNumber,
  styleFor,
  typeForShape,
  createDoc,
  createScreen,
  createElement,
  createConnection,
  findScreen,
  findElement,
  findConnection,
  hitTest,
  defaultCardPositions,
  boundsOf,
  edgePoint,
  summarize,
  normalizeDoc,
  validateDoc,
}
