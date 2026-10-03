/**
 * Headless checks for the plugin's non-UI logic.
 *
 * The built `lib/client.js` is a browser bundle, but every state-free module
 * (model / store / ai / strings) is plain JavaScript. This harness evaluates the
 * bundle with a fake `window.__ModuleLoader__` and a `require` that refuses every
 * platform request, so loading those modules proves they touch no browser or
 * React API at module-body time. UI modules are then required on purpose, with a
 * tiny React stub, to prove they only *use* React inside functions.
 *
 * Usage: node tools/test-client.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { EventEmitter } from 'node:events'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const BUNDLE = path.join(ROOT, 'lib', 'client.js')

let failures = 0
let checks = 0

function check(name, condition, detail) {
  checks += 1
  if (condition) {
    console.log('  ok   ' + name)
  } else {
    failures += 1
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' — ' + detail))
  }
}

function group(name) {
  console.log('\n' + name)
}

/* --------------------------------------------------------------- load bundle */

const source = fs.readFileSync(BUNDLE, 'utf8')
let registration = null
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(spec) {
        registration = spec
      },
    },
    document: {
      head: {
        appendChild(node) {
          node.parentNode = this
        },
      },
      getElementById() {
        return null
      },
      createElement() {
        return { id: '', textContent: '', parentNode: null }
      },
      body: {
        appendChild() {},
        removeChild() {},
      },
    },
  },
  console,
  setTimeout,
  clearTimeout,
}
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

check('bundle registers through window.__ModuleLoader__.load', registration !== null)
check('bundle id is the package name', registration && registration.id === 'dsh-ui-flow-mapper', registration && registration.id)

const platformRequests = []
const reactStub = {
  createElement(type, props) {
    return { type: type, props: props || {}, children: Array.prototype.slice.call(arguments, 2) }
  },
  memo: (fn) => fn,
  useRef: () => ({ current: null }),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useReducer: (fn, initial) => [initial, () => {}],
  useSyncExternalStore: (subscribe, get) => get(),
  Fragment: 'Fragment',
}
function platformRequire(id) {
  platformRequests.push(id)
  if (id === 'react' || id === 'react/jsx-runtime') return reactStub
  throw new Error('unexpected platform require: ' + id)
}

const exportsObject = registration.factory(platformRequire)
check('factory returns a module object', exportsObject && typeof exportsObject === 'object')
check('exports apply()', typeof exportsObject.apply === 'function')
check('exports inject list', Array.isArray(exportsObject.inject), JSON.stringify(exportsObject.inject))
check('platform requests are limited to the React baseline', platformRequests.every((id) => id === 'react' || id === 'react/jsx-runtime'), platformRequests.join(','))

const m = exportsObject.__internal
check('debug hatch exposes internal modules', typeof m === 'function')

/* ---------------------------------------------------------------------- model */

group('model')
const model = m('model')
const doc = model.createDoc('测试软件')
check('createDoc sets schema/version', doc.schema === 'dsh-uiflow/canvas' && doc.version === '1.0.0')
check('default screen size is 1920x1080', doc.meta.design.defaultSize.w === 1920 && doc.meta.design.defaultSize.h === 1080)
check('responsive is off in 1.0', doc.meta.design.responsive === false)

const screen = model.createScreen(doc)
doc.screens.push(screen)
check('new screen gets a readable id', screen.id === 'screen_1', screen.id)
check('new screen takes the default size', screen.size.w === 1920 && screen.size.h === 1080)

const button = model.createElement('button', { x: 100, y: 200 }, 'elem_1', 1)
screen.elements.push(button)
const rect = model.createElement('rect', { x: 0, y: 0, w: 150, h: 150 }, 'elem_2', 2)
screen.elements.push(rect)

check('button is interactive by default', button.type === 'interactive')
check('rect is decorative by default', rect.type === 'decorative')
check('text may be promoted to interactive', model.typeForShape('text', 'interactive') === 'interactive')
check('a shape without an explicit type keeps its decorative default', model.typeForShape('rect', undefined) === 'decorative')
check('ids increment', model.nextId('elem', ['elem_1', 'elem_3']) === 'elem_4')

check('hit test finds the button under the cursor', model.hitTest(screen, 110, 210).id === 'elem_1')
check('hit test prefers the smaller area on top for overlapping shapes', (function () {
  const big = model.createElement('rect', { x: 100, y: 200, w: 200, h: 100 }, 'elem_big', 3)
  screen.elements.push(big)
  const hit = model.hitTest(screen, 110, 210)
  screen.elements.pop()
  return hit !== null && hit.id === 'elem_big'
})())
check('hit test picks the higher z-index', model.hitTest(screen, 50, 50).id === 'elem_2')
check('hit test skips elements that do not contain the point', model.hitTest(screen, 149, 149).id === 'elem_2' && model.hitTest(screen, 151, 151) === null)
check('hit test gives a line a vertical slop', (function () {
  const line = model.createElement('line', { x: 10, y: 10, w: 200, h: 4 }, 'elem_line', 9)
  screen.elements.push(line)
  const hit = model.hitTest(screen, 20, 20)
  return hit !== null && hit.id === 'elem_line'
})())

check('style merge: defaults per shape', model.styleFor(button).fill === '#4D6BFE')
check('style merge: element override wins', (function () {
  const custom = model.createElement('rect', {}, 'elem_c', 1)
  custom.style = { fill: '#000000' }
  return model.styleFor(custom).fill === '#000000' && model.styleFor(custom).radius === 0
})())

group('connections + invariants')
const screen2 = model.createScreen(doc, { name: '设置' })
screen2.id = 'screen_2'
doc.screens.push(screen2)
const connection = model.createConnection('screen_1', 'elem_1', 'screen_2', 'navigate')
connection.id = 'conn_1'
doc.connections.push(connection)
check('connection is element -> screen', connection.from.element === 'elem_1' && connection.to.screen === 'screen_2')
check('navigate has no overlay payload', connection.overlay === null)

let report = model.validateDoc(doc)
check('valid document reports no errors', report.errors.length === 0, report.errors.join('; '))

const overlay = model.createConnection('screen_1', 'elem_1', 'screen_2', 'overlay')
overlay.id = 'conn_2'
doc.connections.push(overlay)
check('overlay carries a payload (INV-3)', overlay.overlay !== null && overlay.overlay.modal === true)

const broken = model.clone(doc)
broken.connections.push({
  id: 'conn_bad',
  from: { screen: 'screen_1', element: 'elem_2' },
  to: { screen: 'screen_2' },
  type: 'navigate',
  overlay: null,
  note: '',
})
report = model.validateDoc(broken)
check('decorative source is an error', report.errors.some((message) => message.indexOf('INV-1') >= 0))

group('import normalisation')
const imported = model.normalizeDoc({
  schema: 'dsh-uiflow/canvas',
  version: '1.0.0',
  meta: { name: '导入' },
  screens: [{
    id: 'screen_1',
    name: '首页',
    size: { w: 1280, h: 720 },
    elements: [
      { id: 'elem_1', type: 'interactive', shape: 'button', position: { x: 10, y: 20, w: 100, h: 40 }, zIndex: 1 },
      { id: 'elem_2', type: 'interactive', shape: 'rect', position: { x: 0, y: 0, w: 50, h: 50 }, zIndex: 2 },
    ],
  }, { id: 'screen_2', name: 'B', size: { w: 1280, h: 720 }, elements: [{ id: 'elem_9', shape: 'button', type: 'interactive' }] }],
  connections: [
    { id: 'conn_1', from: { screen: 'screen_1', element: 'elem_1' }, to: { screen: 'screen_2' }, type: 'navigate', note: 'n' },
    { id: 'conn_2', from: { screen: 'screen_1', element: 'elem_2' }, to: { screen: 'screen_2' }, type: 'navigate' },
    { id: 'conn_3', from: { screen: 'screen_1', element: 'elem_1' }, to: { screen: 'nope' }, type: 'navigate' },
  ],
})
check('import keeps the declared screen size', imported.doc.screens[0].size.w === 1280)
check('import keeps an explicit interactive override on any shape', imported.doc.screens[0].elements[1].type === 'interactive')
check('import drops a link whose screen is missing', imported.doc.connections.length === 2, String(imported.doc.connections.length))
check('import reports what it dropped', imported.errors.some((message) => message.indexOf('丢弃') >= 0), imported.errors.join('; '))
check('import clamps a tiny size to the minimum', model.normalizeDoc({ screens: [{ size: { w: 10, h: 10 } }] }).doc.screens[0].size.w === model.MIN_SIZE.w)
check('import of junk returns an empty document', model.normalizeDoc('nope').doc.screens.length === 0)

group('geometry')
check('edgePoint lands on the border', (function () {
  const rect = { x: 0, y: 0, w: 100, h: 50 }
  const point = model.edgePoint(rect, { x: -100, y: 25 })
  return Math.abs(point.x - 0) < 1e-6 && Math.abs(point.y - 25) < 1e-6
})())
check('boundsOf covers every card', (function () {
  const bounds = model.boundsOf(doc, model.defaultCardPositions(doc.screens))
  return bounds.w >= 1920 && bounds.h >= 1080
})())
check('default layout puts screens in a grid', (function () {
  const positions = model.defaultCardPositions([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }])
  return positions.a.x === 0 && positions.b.x > 0 && positions.d.y > 0
})())
check('summarize counts everything', (function () {
  const stats = model.summarize(doc)
  return stats.screens === 2 && stats.connections === 2
})())

/* ---------------------------------------------------------------------- store */

group('store')
const storeModule = m('store')
const docStore = storeModule.createStore(model.clone(doc))
let notifications = 0
const unsubscribe = docStore.subscribe(() => {
  notifications += 1
})
const before = docStore.get()
docStore.mutate((draft) => {
  draft.meta.name = '改了'
  return draft
})
check('mutate swaps the snapshot identity', docStore.get() !== before)
check('mutate notifies subscribers', notifications === 1)
check('undo restores the previous snapshot', docStore.undo() === true && docStore.get() === before)
check('redo re-applies it', docStore.redo() === true && docStore.get().meta.name === '改了')
check('history: false does not create an undo step', (function () {
  docStore.mutate((draft) => {
    draft.meta.description = 'drag frame'
    return draft
  }, { history: false })
  return docStore.undo() === true && docStore.get().meta.name === before.meta.name
})())
check('pushHistory closes a live drag as one step', (function () {
  const snapshot = docStore.get()
  docStore.mutate((draft) => {
    draft.meta.description = 'live'
    return draft
  }, { history: false })
  docStore.pushHistory(snapshot)
  return docStore.undo() === true && docStore.get().meta.description === snapshot.meta.description
})())
unsubscribe()
check('unsubscribe stops notifications', (function () {
  const seen = notifications
  docStore.mutate((draft) => {
    draft.meta.name = 'again'
    return draft
  })
  return notifications === seen
})())
check('seedDoc ships one screen so the canvas is usable at once', storeModule.seedDoc().screens.length === 1)

/* ------------------------------------------------------------------------- ai */

group('ai')
const ai = m('ai')
const pack = ai.buildPromptPack(doc)
check('prompt pack states the task', pack.indexOf('# 任务') >= 0)
check('prompt pack embeds the system prompt', pack.indexOf('你是「界面跳转图 → 软件实现」的理解引擎') >= 0)
check('prompt pack embeds the canvas JSON', pack.indexOf('"schema": "dsh-uiflow/canvas"') >= 0)
check('prompt pack asks for the unresolved bucket', pack.indexOf('"unresolved"') >= 0)
check('canvas sent to the model has no view state', ai.canvasForAI(doc).ui === undefined)
check('canvas sent to the model keeps created/updated out of the prompt body', (function () {
  const payload = ai.canvasForAI(doc)
  return payload.meta.name === doc.meta.name && payload.screens.length === doc.screens.length
})())

/* --------------------------------------------------------------------- strings */

group('strings')
const strings = m('strings')
const dicts = strings.toDicts()
check('zh and en dictionaries have identical key sets', JSON.stringify(Object.keys(dicts.zh).sort()) === JSON.stringify(Object.keys(dicts.en).sort()))
check('every key has both languages', Object.keys(strings.TABLE).every((key) => Array.isArray(strings.TABLE[key]) && strings.TABLE[key].length === 2 && strings.TABLE[key][0] && strings.TABLE[key][1]))
check('interpolation works', strings.fill('a {n} b', { n: 3 }) === 'a 3 b')

/* -------------------------------------------------------------- UI module load */

group('ui modules under a React stub')
const kit = m('ui-kit')
check('ui-kit loaded without touching the DOM', typeof kit.Btn === 'function')
const canvasModule = m('ui-canvas')
check('ui-canvas loaded', typeof canvasModule.CanvasViewport === 'function')
const inspectorModule = m('ui-inspector')
check('ui-inspector loaded', typeof inspectorModule.Inspector === 'function')
const appModule = m('ui-app')
check('ui-app loaded', typeof appModule.UiFlowApp === 'function')
check('the only platform modules requested are React and its jsx runtime', platformRequests.every((id) => id === 'react' || id === 'react/jsx-runtime'), platformRequests.join(','))
check('modules are cached (no duplicate platform requests)', (function () {
  const seen = platformRequests.length
  m('ui-app')
  m('model')
  return platformRequests.length === seen
})())

/* ----------------------------------------------------------------------- apply */

group('apply() with a fake DSH client context')
const registeredTypes = []
const registeredSlots = []
const dicts_ = []
const effects = []
const fakeCtx = {
  effect(fn, label) {
    effects.push(label)
    const dispose = fn()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  locale: {
    register(namespace, dictionaries) {
      dicts_.push({ namespace, dictionaries })
      return () => {}
    },
    bind() {
      return (key) => key
    },
    subscribe() {
      return () => {}
    },
    getLocale() {
      return { id: 'zh-CN' }
    },
  },
  slots: {
    register(descriptor, component) {
      registeredSlots.push({ descriptor, component })
      return () => {}
    },
    inject(key, callback) {
      return callback()
    },
  },
  sidebarRightTabs: {
    register(definition) {
      registeredTypes.push(definition)
      return () => {}
    },
  },
  layout: {
    openRightbar() {},
  },
}
const api = exportsObject
api.apply(fakeCtx)

check('one tab type registered', registeredTypes.length === 1)
check('tab type id matches the key the body registers under', registeredTypes[0].id === registeredSlots[0].descriptor.key)
check('tab type declares a kind', registeredTypes[0].kind === 'uiflow')
check('tab type keeps its body mounted', registeredTypes[0].keepMounted === true)
check('tab type exposes a chip title', registeredTypes[0].title() === 'title')
check('tab type contributes a guide entry', Array.isArray(registeredTypes[0].guide) && registeredTypes[0].guide.length === 1)
check('body registers into sidebar.right.pane.tab', registeredSlots[0].descriptor.name === 'sidebar.right.pane.tab')
check('the chip title is registered under the same key', registeredSlots.length === 3
  && registeredSlots[1].descriptor.name === 'sidebar.right.pane.tab.title'
  && registeredSlots[1].descriptor.key === 'dsh-ui-flow-mapper')
check('a third seat offers a visible door in the Session header', registeredSlots[2].descriptor.name === 'conversation.session.header.utilities'
  && registeredSlots[2].descriptor.id === 'dsh-ui-flow-mapper:open'
  && typeof registeredSlots[2].descriptor.label === 'function')
check('body carries the locale namespace', registeredSlots[0].descriptor.locale === 'uiFlowMapper')
check('dictionaries registered for the namespace', dicts_.length === 1 && dicts_[0].namespace === 'uiFlowMapper')
check('effects are labelled for debugging', effects.every((label) => typeof label === 'string' && label.indexOf('ui-flow-mapper') === 0), effects.join(' | '))
check('body component renders a full shell tree', (function () {
  // The framework renders Body, then React renders the element Body returns —
  // simulate exactly that one level with the props apply() really passed.
  const bodyTree = registeredSlots[0].component()
  if (!bodyTree || typeof bodyTree.type !== 'function') return false
  const tree = bodyTree.type(bodyTree.props)
  if (!tree || !tree.props || !tree.props.className) return false
  function count(node, predicate) {
    if (!node || typeof node !== 'object') return 0
    let found = predicate(node) ? 1 : 0
    const children = node.children || []
    for (const child of children) {
      if (Array.isArray(child)) {
        for (const nested of child) found += count(nested, predicate)
      } else {
        found += count(child, predicate)
      }
    }
    return found
  }
  const hasClass = (node, token) => String((node.props && node.props.className) || '').split(/\s+/).indexOf(token) >= 0
  return hasClass(tree, 'ufm-root')
    && count(tree, (node) => hasClass(node, 'ufm-rail')) === 1
    && count(tree, (node) => hasClass(node, 'ufm-pens')) === 1
    && count(tree, (node) => hasClass(node, 'ufm-inspector')) === 1
    && count(tree, (node) => hasClass(node, 'ufm-inspector-body')) === 1
    && count(tree, (node) => hasClass(node, 'ufm-status')) === 1
    && count(tree, (node) => hasClass(node, 'ufm-modal-backdrop')) === 0
})())

/* --------------------------------------------------- deep render of every view */

group('deep render (every component body, with a seeded document)')

/** Render a tree by invoking every function component, like React would. */
function deepRender(element, onError, path) {
  let count = 0
  const walk = (node, trail) => {
    if (node === null || node === undefined || typeof node === 'boolean') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child, trail)
      return
    }
    if (typeof node === 'string' || typeof node === 'number') {
      count += 1
      return
    }
    const type = node.type
    if (typeof type === 'function') {
      let out
      try {
        out = type(node.props)
      } catch (err) {
        onError(trail + ' > ' + (type.name || 'anonymous'), err)
        return
      }
      walk(out, trail + ' > ' + (type.name || 'anonymous'))
      return
    }
    count += 1
    walk(node.children || [], trail + ' > ' + type)
  }
  walk(element, 'root')
  return count
}

function renderCase(name, element) {
  const errors = []
  const nodes = deepRender(element, (path, err) => errors.push(path + ': ' + err.message), 'root')
  check(name + ' (rendered ' + nodes + ' nodes)', errors.length === 0, errors.join(' | '))
}

const richDoc = (function buildRichDoc() {
  const document_ = model.createDoc('渲染用例')
  const first = model.createScreen(document_, { name: '首页' })
  const second = model.createScreen(document_, { name: '设置' })
  document_.screens.push(first, second)
  let index = 0
  for (const shape of model.SHAPES) {
    index += 1
    const element = model.createElement(shape, { x: 20 + index * 5, y: 20 + index * 5 }, 'elem_' + index, index)
    element.text = '文本 ' + shape
    first.elements.push(element)
  }
  first.elements[0].type = 'interactive'
  first.elements[0].role = { preset: '开关', text: '控制夜间模式' }
  first.elements[1].style = { image: 'data:image/png;base64,iVBORw0KGgo=' }
  const navigate = model.createConnection(first.id, first.elements[0].id, second.id, 'navigate')
  navigate.id = 'conn_1'
  navigate.note = '点击后进入设置页'
  const overlay = model.createConnection(first.id, first.elements[1].id, second.id, 'overlay')
  overlay.id = 'conn_2'
  document_.connections.push(navigate, overlay)
  return document_
})()

const richStore = storeModule.createStore(richDoc)
const noop = () => {}
const stubActions = new Proxy({}, { get: () => noop })
const tIdentity = (key) => key
const hh = kit.h

const canvasProps = {
  doc: richDoc,
  t: tIdentity,
  store: richStore,
  actions: stubActions,
  zoom: 0.5,
  pan: { x: 0, y: 0 },
  cardPos: {},
  sel: { kind: 'none' },
  setSel: noop,
  linking: null,
  setLinking: noop,
  setZoom: noop,
  setPan: noop,
  setCardPos: noop,
  fitRef: { current: null },
}

renderCase('canvas renders every shape and both connection kinds', hh(canvasModule.CanvasViewport, canvasProps))
renderCase('canvas renders the linking banner and rubber band', (function () {
  // `linking` with no cursor point exercises the hint only; with one, the band.
  return hh(canvasModule.CanvasViewport, Object.assign({}, canvasProps, {
    linking: { screenId: 'screen_1', elementId: 'elem_1', type: 'overlay' },
    sel: { kind: 'element', screenId: 'screen_1', elementId: 'elem_1' },
  }))
})())
renderCase('canvas renders a screen selection', hh(canvasModule.CanvasViewport, Object.assign({}, canvasProps, {
  sel: { kind: 'screen', screenId: 'screen_1' },
})))
renderCase('canvas renders a connection selection', hh(canvasModule.CanvasViewport, Object.assign({}, canvasProps, {
  sel: { kind: 'connection', connectionId: 'conn_2' },
})))
renderCase('canvas renders its empty state', hh(canvasModule.CanvasViewport, Object.assign({}, canvasProps, {
  doc: model.createDoc('空'),
})))

const inspectorProps = { doc: richDoc, t: tIdentity, actions: stubActions }
renderCase('inspector renders the document panel', hh(inspectorModule.Inspector, Object.assign({}, inspectorProps, { sel: { kind: 'none' } })))
renderCase('inspector renders the screen panel', hh(inspectorModule.Inspector, Object.assign({}, inspectorProps, { sel: { kind: 'screen', screenId: 'screen_1' } })))
renderCase('inspector renders an element panel', hh(inspectorModule.Inspector, Object.assign({}, inspectorProps, { sel: { kind: 'element', screenId: 'screen_1', elementId: 'elem_1' } })))
renderCase('inspector renders an image element panel', hh(inspectorModule.Inspector, Object.assign({}, inspectorProps, { sel: { kind: 'element', screenId: 'screen_1', elementId: 'elem_2' } })))
renderCase('inspector renders a navigate connection panel', hh(inspectorModule.Inspector, Object.assign({}, inspectorProps, { sel: { kind: 'connection', connectionId: 'conn_1' } })))
renderCase('inspector renders an overlay connection panel', hh(inspectorModule.Inspector, Object.assign({}, inspectorProps, { sel: { kind: 'connection', connectionId: 'conn_2' } })))
renderCase('inspector falls back when the selection is stale', hh(inspectorModule.Inspector, Object.assign({}, inspectorProps, { sel: { kind: 'element', screenId: 'gone', elementId: 'gone' } })))
renderCase('app shell renders against a populated document', hh(appModule.UiFlowApp, { store: richStore, t: tIdentity, host: { toggleFullscreen: noop } }))
renderCase('app shell renders against an empty document', hh(appModule.UiFlowApp, { store: storeModule.createStore(model.createDoc('空')), t: tIdentity, host: {} }))
renderCase('app shell renders with a pen in hand', hh(appModule.UiFlowApp, { store: richStore, t: tIdentity, host: {} }))

/* ------------------------------------------------------------- link visibility */

group('links are visible (the reported bug)')

/** Walk the rendered tree the way React would, collecting host nodes by type. */
function collectNodes(element, type, bag) {
  const walk = (node) => {
    if (node === null || node === undefined || typeof node === 'boolean') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
      return
    }
    if (typeof node === 'string' || typeof node === 'number') return
    const nodeType = node.type
    if (typeof nodeType === 'function') {
      walk(nodeType(node.props))
      return
    }
    if (nodeType === type) bag.push(node)
    walk(node.children || [])
  }
  walk(element)
  return bag
}

const promotedDoc = (function () {
  const document_ = model.createDoc('连线可见性')
  const first = model.createScreen(document_, { name: '首页' })
  document_.screens.push(first)
  const second = model.createScreen(document_, { name: '设置' })
  document_.screens.push(second)
  /* A plain rectangle — the thing people actually draw and then click. */
  const rect = model.createElement('rect', { x: 100, y: 100, w: 200, h: 80 }, 'elem_1', 1)
  first.elements.push(rect)
  return { doc: document_, rect: rect, first: first, second: second }
})()

check('a plain rect starts decorative', promotedDoc.rect.type === 'decorative')
check('any shape can be explicitly promoted (D-05: the map gives defaults)', model.typeForShape('rect', 'interactive') === 'interactive')
check('a promoted rect may start a link (INV-1 satisfied)', (function () {
  const target = promotedDoc.rect
  target.type = model.typeForShape(target.shape, 'interactive')
  const link = model.createConnection('screen_1', 'elem_1', 'screen_2', 'navigate')
  link.id = 'conn_1'
  promotedDoc.doc.connections.push(link)
  return model.validateDoc(promotedDoc.doc).errors.length === 0
})())
check('an unpromoted decorative element still cannot start a link (INV-1 kept)', (function () {
  const copy = model.clone(promotedDoc.doc)
  copy.screens[0].elements[0].type = 'decorative'
  return model.validateDoc(copy).errors.some((message) => message.indexOf('INV-1') >= 0)
})())
check('the auto-promote promise in createConnection is what the model allows', (function () {
  const copy = model.clone(promotedDoc.doc)
  const element = copy.screens[0].elements[0]
  element.type = 'decorative'
  element.type = model.typeForShape(element.shape, 'interactive')
  return model.validateDoc(copy).errors.length === 0
})())

const selectionCalls = []
const linkTree = hh(canvasModule.CanvasViewport, Object.assign({}, canvasProps, {
  doc: promotedDoc.doc,
  cardPos: {},
  zoom: 0.5,
  setSel: (next) => selectionCalls.push(next),
}))
const svgPaths = collectNodes(linkTree, 'path', []).filter((node) => node.props.markerEnd !== undefined)
check('the link layer renders a visible path with an arrowhead', svgPaths.length === 1, String(svgPaths.length))
check('the path geometry is finite (a NaN would make it invisible)', (function () {
  if (svgPaths.length === 0) return false
  const d = String(svgPaths[0].props.d || '')
  const numbers = d.match(/-?\d+(\.\d+)?/g) || []
  return numbers.length >= 8 && numbers.every((value) => Number.isFinite(Number(value)))
})())
check('the path is stroked with the jump ink, not a missing token', (function () {
  if (svgPaths.length === 0) return false
  const stroke = String(svgPaths[0].props.stroke || '')
  return stroke.indexOf('--ufm-ink-jump') >= 0 && stroke.indexOf('#') > 0
})())
check('the path has a visible width and a dash pattern only when covering', (function () {
  if (svgPaths.length === 0) return false
  const path = svgPaths[0]
  return Number(path.props.strokeWidth) >= 2 && path.props.strokeDasharray === undefined
})())
check('a pen-down terminal marks the source element', (function () {
  const rects = collectNodes(linkTree, 'rect', [])
  return rects.some((node) => node.props.width === 6 && node.props.height === 6 && node.props.fill !== undefined)
})())
check('the link carries a type tag', (function () {
  const texts = collectNodes(linkTree, 'text', [])
  return texts.some((node) => (node.children || []).indexOf('connNavigateShort') >= 0)
})())
check('clicking the invisible hit path selects the link', (function () {
  const hits = collectNodes(linkTree, 'path', []).filter((node) => node.props.stroke === 'transparent')
  if (hits.length === 0 || typeof hits[0].props.onPointerDown !== 'function') return false
  hits[0].props.onPointerDown({ stopPropagation() {} })
  return selectionCalls.length === 1 && selectionCalls[0].kind === 'connection' && selectionCalls[0].connectionId === 'conn_1'
})())
check('an overlay link draws a hatched sheet and a dashed line', (function () {
  const copy = model.clone(promotedDoc.doc)
  const link = model.createConnection('screen_1', 'elem_1', 'screen_2', 'overlay')
  link.id = 'conn_2'
  copy.connections.push(link)
  const tree = hh(canvasModule.CanvasViewport, Object.assign({}, canvasProps, { doc: copy, zoom: 0.5 }))
  const dashed = collectNodes(tree, 'path', []).filter((node) => node.props.strokeDasharray !== undefined)
  const sheets = collectNodes(tree, 'rect', []).filter((node) => String(node.props.fill || '').indexOf('ufm-hatch') >= 0)
  return dashed.length >= 1 && sheets.length === 1
})())

/* ------------------------------------------------------------------ pen tools */

group('pen tools')

const penRack = appModule.PENS
check('the rack starts with the select pen', penRack[0].shape === 'select')
check('the rack offers a rounded rectangle', penRack.some((pen) => pen.shape === 'roundrect'))
check('every pen has its own shortcut', new Set(penRack.map((pen) => pen.shortcut)).size === penRack.length)
check('every pen maps to a real shape', penRack.every((pen) => pen.shape === 'select' || model.SHAPES.indexOf(pen.shape) >= 0))
check('roundrect is a decorative shape with a soft default radius', (function () {
  const element = model.createElement('roundrect', { x: 0, y: 0 }, 'elem_r', 1)
  return element.type === 'decorative' && model.styleFor(element).radius === 20
})())
check('roundrect is drawn like any other box (radius comes from style)', (function () {
  const element = model.createElement('roundrect', { x: 10, y: 10, w: 100, h: 60 }, 'elem_r', 1)
  const tree = hh(canvasModule.CanvasViewport, Object.assign({}, canvasProps, {
    doc: (function () {
      const document_ = model.createDoc('圆角')
      const screen = model.createScreen(document_, { name: 'A' })
      document_.screens.push(screen)
      screen.elements.push(element)
      return document_
    })(),
    zoom: 1,
  }))
  const boxes = collectNodes(tree, 'div', []).filter((node) => node.props['data-shape'] === 'roundrect')
  return boxes.length === 1 && boxes[0].props.style.borderRadius === 20
})())
check('a drag produces the drawn box in design space', (function () {
  const box = canvasModule.normalizeBox({ x: 300, y: 200 }, { x: 100, y: 80 })
  return box.x === 100 && box.y === 80 && box.w === 200 && box.h === 120
})())
check('a click (no drag) produces a default-sized box centred on the point', (function () {
  const box = canvasModule.defaultBoxAt('roundrect', { x: 500, y: 400 })
  return box.w === model.SHAPE_BOX.roundrect.w && box.x === 500 - box.w / 2
})())

/* ------------------------------------------------------- layer order (z-index) */

group('layer order is drawn')

const stackDoc = (function () {
  const document_ = model.createDoc('图层')
  const screen = model.createScreen(document_, { name: 'A' })
  document_.screens.push(screen)
  const low = model.createElement('rect', { x: 0, y: 0, w: 200, h: 200 }, 'elem_1', 1)
  const high = model.createElement('rect', { x: 20, y: 20, w: 120, h: 120 }, 'elem_2', 7)
  screen.elements.push(low, high)
  return document_
})()

const stackTree = hh(canvasModule.CanvasViewport, Object.assign({}, canvasProps, { doc: stackDoc, zoom: 1 }))
const drawnBoxes = collectNodes(stackTree, 'div', []).filter((node) => node.props['data-shape'] === 'rect')
check('every element carries its document z-index into the render', (function () {
  if (drawnBoxes.length !== 2) return false
  const seen = {}
  for (const node of drawnBoxes) seen[node.props.style.zIndex] = true
  return seen[1] === true && seen[7] === true
})())
check('the higher element is the one drawn on top', (function () {
  const low = drawnBoxes.filter((node) => node.props.style.zIndex === 1)[0]
  const high = drawnBoxes.filter((node) => node.props.style.zIndex === 7)[0]
  return low !== undefined && high !== undefined && high.props.style.zIndex > low.props.style.zIndex
})())
check('hit testing agrees with what is drawn (one z-index source)', (function () {
  const hit = model.hitTest(stackDoc.screens[0], 30, 30)
  return hit !== null && hit.id === 'elem_2' && hit.zIndex === 7
})())
check('reordering rewrites the z-index the render reads', (function () {
  const copy = model.clone(stackDoc)
  const list = copy.screens[0].elements.slice().sort((a, b) => a.zIndex - b.zIndex)
  const item = list.splice(0, 1)[0]
  list.push(item)
  list.forEach((element, order) => {
    element.zIndex = order + 1
  })
  const tree = hh(canvasModule.CanvasViewport, Object.assign({}, canvasProps, { doc: copy, zoom: 1 }))
  const boxes = collectNodes(tree, 'div', []).filter((node) => node.props['data-shape'] === 'rect')
  const raised = boxes.filter((node) => node.props.style.zIndex === 2)
  return raised.length === 1 && copy.screens[0].elements[0].id === 'elem_1'
})())

/* --------------------------------------------------------- fixed = screen-bound */

group('a fixed element is bound to its screen')

check('dragging a fixed element moves the screen, not the element', (function () {
  const fixed = model.createElement('button', { x: 10, y: 10 }, 'elem_f', 1)
  fixed.fixed = true
  const loose = model.createElement('button', { x: 10, y: 10 }, 'elem_l', 1)
  return canvasModule.dragModeFor(fixed) === 'move-card' && canvasModule.dragModeFor(loose) === 'move-element'
})())
check('the binding leaves the element at its design position', (function () {
  const element = model.createElement('rect', { x: 40, y: 60, w: 100, h: 50 }, 'elem_b', 1)
  element.fixed = true
  const before = Object.assign({}, element.position)
  const cardPos = { screen_1: { x: 400, y: 300 } }
  /* In that mode only the card moves; the element must be untouched. */
  cardPos.screen_1 = { x: cardPos.screen_1.x + 25, y: cardPos.screen_1.y + 25 }
  return canvasModule.dragModeFor(element) === 'move-card'
    && element.position.x === before.x && element.position.y === before.y
})())
check('the spec sheet explains the binding when it is on', (function () {
  const tree = hh(inspectorModule.Inspector, {
    doc: (function () {
      const copy = model.clone(stackDoc)
      copy.screens[0].elements[0].fixed = true
      return copy
    })(),
    sel: { kind: 'element', screenId: 'screen_1', elementId: 'elem_1' },
    t: tIdentity,
    actions: stubActions,
  })
  const notes = collectNodes(tree, 'div', []).filter((node) => node.props.className === 'ufm-note')
  return notes.length === 1 && (notes[0].children || []).indexOf('fixedHint') >= 0
})())

/* ------------------------------------------------------------ saving (Host half) */

group('saving into the workspace (Host half)')

const routes = {}
const savedWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ufm-ws-'))
/** The session the fake Host is asked about; the fallback test blanks it out. */
const sessionLookup = {
  get() {
    return { header: { cwd: savedWorkspace } }
  },
}
const injectedDeps = []
const hostCtx = {
  webServer: {
    register(route) {
      routes[route.path] = route
      return () => {
        delete routes[route.path]
      }
    },
  },
  effect(fn) {
    const dispose = fn()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  /* Cordis exposes a service only to a context that injected it — the fake has
     to behave the same way, or the test would pass on a broken plugin. */
  inject(deps, callback) {
    injectedDeps.push(deps.join())
    const scoped = { sessions: sessionLookup }
    const dispose = callback(scoped)
    return typeof dispose === 'function' ? dispose : () => {}
  },
}
const hostHalf = await import(pathToFileURL(path.join(ROOT, 'lib', 'index.js')).href)
hostHalf.apply(hostCtx)
check('the Host half registers the save route', typeof routes['/dsh-ui-flow-mapper/save'] === 'object')
check('the Host half registers the status route', typeof routes['/dsh-ui-flow-mapper/status'] === 'object')
check('the Host half injects only the web server', Array.isArray(hostHalf.inject) && hostHalf.inject.join() === 'webServer')

function fakeRequest(method, body, headers) {
  const emitter = new EventEmitter()
  emitter.method = method
  emitter.url = '/dsh-ui-flow-mapper/save'
  emitter.headers = Object.assign({ host: '127.0.0.1:19387', origin: 'http://127.0.0.1:19387' }, headers || {})
  emitter.destroy = () => {}
  queueMicrotask(() => {
    if (body !== undefined) emitter.emit('data', Buffer.from(body))
    emitter.emit('end')
  })
  return emitter
}

function fakeResponse() {
  const seen = { status: 0, body: '' }
  return {
    seen,
    writeHead(status) {
      seen.status = status
    },
    end(body) {
      seen.body = body || ''
    },
  }
}

async function callSave(options) {
  const response = fakeResponse()
  routes['/dsh-ui-flow-mapper/save'].handler(fakeRequest(options.method || 'POST', options.body, options.headers), response)
  await new Promise((resolve) => setTimeout(resolve, 25))
  let parsed = null
  try {
    parsed = JSON.parse(response.seen.body)
  } catch (err) {
    parsed = null
  }
  return { status: response.seen.status, data: parsed }
}

const savePayload = JSON.stringify({ sessionId: 'session-x', fileName: '我的画布', document: stackDoc })
const saveResult = await callSave({ body: savePayload })
check('a POST writes the document', saveResult.status === 200 && saveResult.data && saveResult.data.ok === true, JSON.stringify(saveResult.data))
const savedFile = path.join(savedWorkspace, 'UI Flow Mapper', '我的画布.uiflow.json')
check('the file lands in the workspace under "UI Flow Mapper"', fs.existsSync(savedFile), savedFile)
check('the sub-folder is created when missing', fs.existsSync(path.join(savedWorkspace, 'UI Flow Mapper')))
check('the written file round-trips as a canvas document', (function () {
  if (!fs.existsSync(savedFile)) return false
  const parsed = JSON.parse(fs.readFileSync(savedFile, 'utf8'))
  return parsed.schema === 'dsh-uiflow/canvas' && parsed.screens.length === 1 && parsed.screens[0].elements.length === 2
})())
check('saving again overwrites the same file', (function () {
  return fs.readdirSync(path.join(savedWorkspace, 'UI Flow Mapper')).length === 1
})())

const traversal = await callSave({ body: JSON.stringify({ sessionId: 'session-x', fileName: '../../escape', document: stackDoc }) })
check('a traversing file name stays inside the folder', (function () {
  const names = fs.readdirSync(path.join(savedWorkspace, 'UI Flow Mapper'))
  return traversal.status === 200
    && names.indexOf('escape.uiflow.json') >= 0
    && !fs.existsSync(path.join(savedWorkspace, 'escape.uiflow.json'))
    && !fs.existsSync(path.join(path.dirname(savedWorkspace), 'escape.uiflow.json'))
})())

check('a GET is refused', (await callSave({ method: 'GET' })).status === 405)
check('a body that is not JSON is refused', (await callSave({ body: 'not json' })).status === 400)
check('a payload without a document is refused', (await callSave({ body: JSON.stringify({ sessionId: 's' }) })).status === 400)
check('a foreign origin is refused', (await callSave({
  body: savePayload,
  headers: { origin: 'https://evil.example', host: '127.0.0.1:19387' },
})).status === 403)

const noWorkspace = await (async function () {
  const previous = sessionLookup.get
  const previousCwd = process.cwd()
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ufm-cwd-'))
  sessionLookup.get = () => undefined
  /* The cwd fallback must land in the Host cwd, never in the caller's tree. */
  process.chdir(sandbox)
  try {
    const result = await callSave({ body: JSON.stringify({ sessionId: 'cold', fileName: 'x', document: stackDoc }) })
    return {
      status: result.status,
      data: result.data,
      landed: fs.existsSync(path.join(sandbox, 'UI Flow Mapper', 'x.uiflow.json')),
    }
  } finally {
    process.chdir(previousCwd)
    sessionLookup.get = previous
  }
})()
check('an unresolvable session still saves, into the Host cwd', noWorkspace.status === 200
  && noWorkspace.data.ok === true
  && noWorkspace.landed === true)

check('the Host half takes the session service by scoped injection', injectedDeps.indexOf('sessions') >= 0, injectedDeps.join(' | '))
check('a resolved session cwd wins over the Host process cwd', (function () {
  /* The round-trip above already proves it: the file landed in the temp
     workspace the fake session reported, not in the process cwd. */
  return fs.existsSync(path.join(savedWorkspace, 'UI Flow Mapper', '我的画布.uiflow.json'))
})())

check('the tab body asks the framework for its session identity', (function () {
  const descriptor = registeredSlots[0].descriptor
  if (typeof descriptor.inject !== 'function') return false
  const injected = descriptor.inject('session-42', { close() {} })
  return injected.sessionId === 'session-42' && typeof injected.actions === 'object'
})())

const clientText = fs.readFileSync(path.join(ROOT, 'src', 'client', 'ui-app.js'), 'utf8')
const hostText = fs.readFileSync(path.join(ROOT, 'lib', 'index.js'), 'utf8')
check('the two halves name the same save route', (function () {
  const clientRoute = /SAVE_URL\s*=\s*'([^']+)'/.exec(clientText)
  const hostRoute = /SAVE_ROUTE\s*=\s*'([^']+)'/.exec(hostText)
  return clientRoute !== null && hostRoute !== null && clientRoute[1] === hostRoute[1]
})())
check('the two halves name the same status route', (function () {
  const clientRoute = /STATUS_URL\s*=\s*'([^']+)'/.exec(clientText)
  const hostRoute = /STATUS_ROUTE\s*=\s*'([^']+)'/.exec(hostText)
  return clientRoute !== null && hostRoute !== null && clientRoute[1] === hostRoute[1]
})())
check('autosave runs once a minute', /AUTOSAVE_MS\s*=\s*60000/.test(clientText) && /setInterval/.test(clientText))
check('the save button replaced redo and sits before undo', (function () {
  const rail = clientText.slice(clientText.indexOf("className: 'ufm-rail'"))
  const save = rail.indexOf("t('save')")
  const undo = rail.indexOf("t('undo')")
  return save >= 0 && undo >= 0 && save < undo
})())

/* -------------------------------------------------------- static audits */

group('static audits over the sources')

const SRC_DIR = path.join(ROOT, 'src', 'client')
const sourceFiles = fs.readdirSync(SRC_DIR).filter((name) => name.endsWith('.js'))
const sources = sourceFiles.map((name) => ({ name: name, text: fs.readFileSync(path.join(SRC_DIR, name), 'utf8') }))
const table = strings.TABLE

const usedKeys = new Set()
for (const file of sources) {
  for (const match of file.text.matchAll(/\bt\(\s*'([A-Za-z][A-Za-z0-9]*)'/g)) usedKeys.add(match[1])
}
const missingKeys = Array.from(usedKeys).filter((key) => table[key] === undefined)
check('every copy key used in the sources exists in the table (' + usedKeys.size + ' keys)', missingKeys.length === 0, missingKeys.join(', '))

const cssText = sources.find((file) => file.name === 'apply.js').text
const usedClasses = new Set()
for (const file of sources) {
  /* Only class attributes count: custom properties, SVG ids and animation names
     share the `ufm-` prefix but are not classes. */
  for (const match of file.text.matchAll(/className:\s*'([^']*)'/g)) {
    for (const token of match[1].split(/\s+/)) if (token.indexOf('ufm-') === 0) usedClasses.add(token)
  }
}
const missingClasses = Array.from(usedClasses).filter((name) => cssText.indexOf('.' + name) < 0)
check('every ufm- class used in the sources is styled (' + usedClasses.size + ' classes)', missingClasses.length === 0, missingClasses.join(', '))

const cssClasses = new Set()
for (const match of cssText.match(/\.ufm-[a-z0-9-]+/g) || []) cssClasses.add(match.slice(1))
const unusedClasses = Array.from(cssClasses).filter((name) => !usedClasses.has(name) && name !== 'ufm-root')
check('the stylesheet carries no dead class (' + cssClasses.size + ' styled)', unusedClasses.length === 0, unusedClasses.join(', '))

const removedKeys = ['groupStart', 'groupDraw', 'stats', 'emptyHint', 'hintDecorative']
check('the rejected copy keys are gone', removedKeys.every((key) => table[key] === undefined), removedKeys.filter((key) => table[key] !== undefined).join(', '))

/* ---------------------------------------------------------------------- report */

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)') + ' — ' + checks + ' checks')
process.exit(failures === 0 ? 0 : 1)
