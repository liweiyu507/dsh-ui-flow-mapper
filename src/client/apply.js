/**
 * Browser half entry: inject the stylesheet, register the dictionaries, own the
 * document store, and take the two registration steps the right Sidebar's tab
 * system asks for (`§6.3` of the charter).
 *
 * Services injected (cordis service keys): `slots` and `locale` are the plugin's
 * own needs; `sidebarRightTabs` is the tab-type registry the official right
 * Sidebar provides.
 *
 * Visual language (see DESIGN.md): this is a drafting instrument, so the chrome
 * stays quiet and inherits the host theme, while the drawing itself speaks in
 * paper, rule lines and two plotter inks. Measurements are monospaced; nothing
 * else is.
 */

const strings = m('strings')
const store = m('store')
const kit = m('ui-kit')
const appModule = m('ui-app')

const h = kit.h

const NS = 'uiFlowMapper'
const TYPE_ID = 'dsh-ui-flow-mapper'
const KIND = 'uiflow'
const STYLE_ID = 'ufm-style'

const inject = ['slots', 'locale', 'sidebarRightTabs']

const CSS = `
/* ---------------------------------------------------------------- foundation */
.ufm-root{
  --ufm-ink-jump:#2557D6;
  --ufm-ink-cover:#B25E00;
  --ufm-ink-jump-soft:rgba(37,87,214,.12);
  --ufm-ink-cover-soft:rgba(178,94,0,.12);
  --ufm-rule:var(--dsw-alias-border-l1);
  --ufm-rule-strong:var(--dsw-alias-border-l2);
  --ufm-quiet:var(--dsw-alias-label-secondary);
  --ufm-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
  display:flex;flex-direction:column;height:100%;min-height:200px;
  font-size:12px;line-height:1.45;color:var(--dsw-alias-label-primary);
  background:var(--dsw-alias-bg-base);
}
.ufm-root *,.ufm-root *::before,.ufm-root *::after{box-sizing:border-box}
.ufm-root :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;border-radius:2px}

/* ------------------------------------------------------------------- pen rack */
.ufm-rail,.ufm-pens{display:flex;align-items:center;gap:2px;padding:4px 6px;background:var(--dsw-specific-sidebar-fill);flex:none}
.ufm-rail{border-bottom:1px solid var(--ufm-rule)}
.ufm-pens{border-bottom:1px solid var(--ufm-rule);overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}
.ufm-rail-sep{width:1px;align-self:stretch;margin:0 4px;background:var(--ufm-rule);flex:none}
.ufm-rail-spacer{flex:1}
.ufm-btn{font:inherit;font-size:11px;line-height:1.6;padding:2px 6px;border:1px solid transparent;border-radius:4px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}
.ufm-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.ufm-btn:disabled{opacity:.38;cursor:default}
.ufm-btn.is-danger{color:var(--dsw-alias-state-error-primary)}
.ufm-btn.is-active{border-color:var(--ufm-ink-jump);color:var(--ufm-ink-jump)}
.ufm-btn.is-emphasis{border-color:var(--ufm-rule-strong)}
.ufm-pen{display:flex;flex-direction:column;align-items:center;gap:2px;width:50px;padding:3px 2px 2px;border:none;border-radius:4px;background:transparent;color:var(--ufm-quiet);cursor:pointer;flex:none}
.ufm-pen:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.ufm-pen-label{font-size:10px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.ufm-pen.is-active{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.ufm-pen.is-active .ufm-pen-label{font-weight:600}
.ufm-pen.is-active::after{content:"";display:block;width:22px;height:2px;margin-top:1px;background:var(--ufm-ink-jump)}

/* ------------------------------------------------------------------ the table */
.ufm-main{flex:1;min-height:0;display:flex;flex-direction:column}
.ufm-viewport{position:relative;flex:1;min-height:150px;overflow:hidden;background:var(--dsw-alias-bg-base);touch-action:none;cursor:default}
.ufm-viewport.is-drawing{cursor:crosshair}
.ufm-viewport.is-linking{cursor:crosshair}
.ufm-grid{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;background-repeat:repeat}
.ufm-grid-minor{opacity:.4;background-image:repeating-linear-gradient(to right,var(--ufm-rule) 0 1px,transparent 1px 100%),repeating-linear-gradient(to bottom,var(--ufm-rule) 0 1px,transparent 1px 100%)}
.ufm-grid-major{opacity:.85;background-image:repeating-linear-gradient(to right,var(--ufm-rule) 0 1px,transparent 1px 100%),repeating-linear-gradient(to bottom,var(--ufm-rule) 0 1px,transparent 1px 100%)}
.ufm-card{position:absolute}
.ufm-card-body{position:absolute;left:0;top:0;overflow:hidden;border:1px solid var(--ufm-rule-strong);box-shadow:0 2px 10px rgba(0,0,0,.16)}
.ufm-card.is-selected .ufm-card-body{outline:1px solid var(--ufm-ink-jump);outline-offset:0}
.ufm-card.is-new .ufm-card-body{animation:ufm-trace .26s ease-out}
@keyframes ufm-trace{
  from{outline:2px solid var(--ufm-ink-jump);outline-offset:10px;opacity:.55}
  to{outline:2px solid transparent;outline-offset:0;opacity:1}
}
.ufm-card-head{position:absolute;left:0;bottom:100%;display:flex;align-items:baseline;gap:8px;max-width:100%;padding:1px 0 3px;background:transparent;border:none;cursor:move;font-size:11px;white-space:nowrap;overflow:hidden}
.ufm-card-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;max-width:60%}
.ufm-card-size{font-family:var(--ufm-mono);font-variant-numeric:tabular-nums;font-size:10px;color:var(--ufm-quiet)}
.ufm-card-head::after{content:"";flex:1;height:1px;background:var(--ufm-rule);align-self:center;min-width:12px}
.ufm-el-outline{position:absolute;z-index:9000;border:1px solid var(--ufm-ink-jump);pointer-events:none}
.ufm-todo{position:absolute;z-index:9001;border:1px solid var(--ufm-ink-cover);color:var(--ufm-ink-cover);background:var(--dsw-alias-bg-overlay);font-size:9px;line-height:13px;padding:0 4px;white-space:nowrap;transform:translate(-100%,-50%);pointer-events:none}
.ufm-el-edit{position:absolute;z-index:9002;background:rgba(255,255,255,.97);border:1px solid var(--ufm-ink-jump);outline:none;resize:none;overflow:hidden;font-family:inherit;line-height:1.25}

/* --------------------------------------------------------------- link layer */
.ufm-svg{position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:2}
.ufm-link-tag{font-family:var(--ufm-mono);font-size:9px;letter-spacing:.02em}

/* --------------------------------------------------------------- selection */
.ufm-selection{position:absolute;border:1px solid var(--ufm-ink-jump);pointer-events:none;z-index:3}
.ufm-selection::before,.ufm-selection::after{content:"";position:absolute;width:7px;height:7px;border:1px solid var(--ufm-ink-jump)}
.ufm-selection::before{left:-1px;top:-1px;border-right:none;border-bottom:none}
.ufm-selection::after{right:-1px;bottom:-1px;border-left:none;border-top:none}
.ufm-handle{position:absolute;width:7px;height:7px;background:var(--dsw-alias-bg-base);border:1px solid var(--ufm-ink-jump);pointer-events:auto;z-index:4}
.ufm-handle:hover{background:var(--ufm-ink-jump)}
.ufm-measure{position:absolute;z-index:6;padding:1px 4px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--ufm-ink-jump);color:var(--dsw-alias-label-primary);font-family:var(--ufm-mono);font-size:10px;font-variant-numeric:tabular-nums;pointer-events:none;white-space:nowrap}
.ufm-hintbar{position:absolute;left:50%;top:8px;transform:translateX(-50%);z-index:6;padding:2px 9px;font-size:11px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--ufm-ink-jump);pointer-events:none;white-space:nowrap}
.ufm-canvas-controls{position:absolute;left:8px;bottom:8px;z-index:5;display:flex;align-items:center;gap:2px;padding:2px 4px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--ufm-rule)}
.ufm-mini{font:inherit;font-size:11px;line-height:1.5;padding:0 5px;border:none;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:3px}
.ufm-mini:hover{background:var(--dsw-alias-bg-layer-2)}
.ufm-mini.is-wide{border-left:1px solid var(--ufm-rule);border-radius:0 3px 3px 0}
.ufm-zoom-label{font-family:var(--ufm-mono);font-variant-numeric:tabular-nums;font-size:10px;color:var(--ufm-quiet);min-width:38px;text-align:center}
.ufm-new-screen{position:absolute;right:10px;bottom:10px;z-index:5;font:inherit;font-size:12px;padding:5px 12px;border:1px solid var(--ufm-ink-jump);border-radius:3px;background:var(--dsw-alias-bg-overlay);color:var(--ufm-ink-jump);cursor:pointer;font-weight:600}
.ufm-new-screen:hover{background:var(--ufm-ink-jump-soft)}
.ufm-empty{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:300px;text-align:left;padding:16px 18px;border:1px solid var(--ufm-rule);background:var(--dsw-alias-bg-layer-1);z-index:5}
.ufm-empty-title{font-size:13px;font-weight:600;margin-bottom:4px}
.ufm-empty-body{font-size:11px;color:var(--ufm-quiet);margin-bottom:10px}
.ufm-menu{position:absolute;z-index:20;display:flex;flex-direction:column;min-width:150px;padding:3px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--ufm-rule-strong);box-shadow:0 8px 22px rgba(0,0,0,.26)}
.ufm-menu-item{font:inherit;font-size:11px;text-align:left;padding:4px 8px;border:none;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}
.ufm-menu-item:hover{background:var(--dsw-alias-bg-layer-2)}
.ufm-menu-item.is-danger{color:var(--dsw-alias-state-error-primary)}

/* ------------------------------------------------------------- spec sheet */
.ufm-inspector{flex:none;display:flex;flex-direction:column;max-height:54%;border-top:1px solid var(--ufm-rule);background:var(--dsw-alias-bg-layer-1)}
.ufm-inspector.is-collapsed{max-height:none}
.ufm-inspector-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 8px;border-bottom:1px solid var(--ufm-rule)}
.ufm-spec-kind{font-size:11px;font-weight:600}
.ufm-spec-id{font-family:var(--ufm-mono);font-size:10px;color:var(--ufm-quiet)}
.ufm-inspector-body{overflow:auto;padding:8px 8px 14px}
.ufm-panel{display:flex;flex-direction:column;gap:7px}
.ufm-section-title{font-size:11px;font-weight:600;margin-top:6px;padding-top:6px;border-top:1px solid var(--ufm-rule);word-break:break-all}
.ufm-section-title:first-child{margin-top:0;padding-top:0;border-top:none}
.ufm-row{display:flex;gap:8px;align-items:flex-start}
.ufm-row-label{flex:0 0 66px;padding-top:3px;font-size:11px;color:var(--ufm-quiet);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ufm-row-body{flex:1;min-width:0}
.ufm-inline{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
.ufm-col{display:flex;flex-direction:column;gap:3px}
.ufm-times,.ufm-unit{font-family:var(--ufm-mono);font-size:11px;color:var(--ufm-quiet)}
.ufm-input,.ufm-select,.ufm-textarea{width:100%;font:inherit;font-size:11px;padding:3px 6px;border:1px solid var(--ufm-rule);border-radius:3px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);outline:none}
.ufm-input:hover,.ufm-select:hover,.ufm-textarea:hover{border-color:var(--ufm-rule-strong)}
.ufm-input:focus,.ufm-select:focus,.ufm-textarea:focus{border-color:var(--ufm-ink-jump);outline:none}
.ufm-num{font-family:var(--ufm-mono);font-variant-numeric:tabular-nums;text-align:right;flex:1;min-width:46px}
.ufm-textarea{resize:vertical;min-height:38px;line-height:1.5}
.ufm-check{display:flex;align-items:center;gap:5px;font-size:11px}
.ufm-color{display:flex;gap:4px;align-items:center}
.ufm-color-swatch{width:24px;height:20px;padding:0;border:1px solid var(--ufm-rule);border-radius:3px;background:transparent;flex:none;cursor:pointer}
.ufm-color-text{flex:1;font-family:var(--ufm-mono);font-size:10px}
.ufm-btn-row{display:flex;gap:4px;flex-wrap:wrap}
.ufm-divider{height:1px;background:var(--ufm-rule);margin:2px 0}
.ufm-note{font-size:11px;color:var(--ufm-ink-cover);border-left:2px solid var(--ufm-ink-cover);padding-left:6px}
.ufm-spec-line{display:flex;align-items:baseline;gap:6px;font-size:11px}
.ufm-spec-value{font-family:var(--ufm-mono);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.ufm-report{display:flex;flex-direction:column;gap:2px;font-size:10px}
.ufm-report .is-error{color:var(--dsw-alias-state-error-primary)}
.ufm-report .is-warn{color:var(--ufm-ink-cover)}

/* --------------------------------------------------------------- status bar */
.ufm-status{display:flex;align-items:center;gap:12px;padding:2px 8px;border-top:1px solid var(--ufm-rule);font-size:10px;color:var(--ufm-quiet);flex:none;overflow:hidden;white-space:nowrap}
.ufm-status-item{display:flex;align-items:baseline;gap:4px;min-width:0}
.ufm-status-value{font-family:var(--ufm-mono);font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.ufm-status-spacer{flex:1}
.ufm-toast{color:var(--ufm-ink-jump);font-weight:600}
.ufm-save-state{color:var(--ufm-quiet)}
.ufm-save-failed{color:var(--dsw-alias-state-error-primary)}

/* ------------------------------------------------------------------- modal */
.ufm-modal-backdrop{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.45)}
.ufm-modal{display:flex;flex-direction:column;gap:6px;width:min(780px,92vw);max-height:86vh;padding:12px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--ufm-rule-strong);box-shadow:0 14px 44px rgba(0,0,0,.42)}
.ufm-modal-head{font-size:13px;font-weight:600}
.ufm-modal-hint{font-size:11px;color:var(--ufm-quiet)}
.ufm-modal-text{flex:1;min-height:240px;padding:8px;border:1px solid var(--ufm-rule);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--ufm-mono);font-size:11px;line-height:1.5;resize:none;outline:none}
.ufm-modal-foot{display:flex;gap:6px;justify-content:flex-end}

/* -------------------------------------------------- the door in the header */
.ufm-tab-title{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ufm-header-btn{font:inherit;font-size:11px;line-height:1.6;padding:1px 8px;border:1px solid var(--ufm-rule);border-radius:3px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}
.ufm-header-btn:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--ufm-ink-jump);color:var(--ufm-ink-jump)}

@media (prefers-reduced-motion: reduce){
  .ufm-card.is-new .ufm-card-body{animation:none}
}
`

/** Inject the stylesheet once; the disposer removes it with the plugin. */
function ensureStyle() {
  const document_ = window.document
  if (!document_ || !document_.head) return () => {}
  const existing = document_.getElementById(STYLE_ID)
  if (existing !== null && existing !== undefined) return () => {}
  const style = document_.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document_.head.appendChild(style)
  return () => {
    if (style.parentNode) style.parentNode.removeChild(style)
  }
}

/** Browser plugin body. */
function apply(ctx) {
  ctx.effect(ensureStyle, 'ui-flow-mapper: stylesheet')
  ctx.effect(() => ctx.locale.register(NS, strings.toDicts()), 'ui-flow-mapper: dictionaries')

  /* The translator reads the namespace binding fresh, so switching language
     needs no re-registration and `t` keeps one identity for the whole life of
     the plugin (component props and memoized actions both rely on that). */
  let bound = ctx.locale.bind(NS)
  ctx.effect(
    () => ctx.locale.subscribe(() => {
      bound = ctx.locale.bind(NS)
    }),
    'ui-flow-mapper: locale binding',
  )
  const t = (key, vars) => strings.fill(bound(key), vars)

  const loaded = store.loadDoc()
  const docStore = store.createStore(loaded.doc)

  let fullscreen = false
  const host = {
    locale: ctx.locale,
    toggleFullscreen() {
      fullscreen = !fullscreen
      try {
        ctx.layout.openRightbar(true, fullscreen)
      } catch (err) {
        /* layout service unavailable (older DSH): the pane just stays as it is */
      }
    },
  }

  function Body(props) {
    /* `sessionId` is a standard prop of a right-Sidebar tab body; the save path
       needs it to resolve the session's workspace on the Host side. */
    return h(appModule.UiFlowApp, {
      store: docStore,
      t: t,
      host: host,
      sessionId: props && props.sessionId,
    })
  }

  /* Stage 1 — the tab type. `keepMounted` keeps an opened canvas mounted across
     tab switches, so the editor never loses its in-flight state. The guide entry
     is what puts a door to this tab on the right Sidebar's Start page. */
  ctx.effect(
    () => ctx.sidebarRightTabs.register({
      id: TYPE_ID,
      kind: KIND,
      title: () => t('title'),
      keepMounted: true,
      guide: [{
        id: 'open',
        order: 100,
        title: () => t('title'),
        description: () => t('guideDesc'),
      }],
    }),
    'ui-flow-mapper: tab type',
  )

  /* Stage 2 — the tab body, keyed by the very same id.
     The `inject` factory is how a tab body receives its standard props: the
     framework calls it with `(sessionId, actions)`. Without it the body has no
     session identity, and saving would have no workspace to resolve. */
  ctx.effect(
    () => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: TYPE_ID,
      locale: NS,
      inject: (sessionId, actions) => ({ sessionId: sessionId, actions: actions }),
    }, Body)),
    'ui-flow-mapper: tab body',
  )

  /* The chip title: registered so the tab is named from our dictionaries and
     follows a language switch, instead of freezing the text captured at open. */
  function TabTitle() {
    return h('span', { className: 'ufm-tab-title' }, t('title'))
  }

  ctx.effect(
    () => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab.title',
      key: TYPE_ID,
      locale: NS,
    }, TabTitle)),
    'ui-flow-mapper: tab title',
  )

  /* One visible door: a Session-header button that opens (and expands) the tab.
     Additive list slot, no shipped UI is replaced. */
  function openMapper() {
    try {
      ctx.sidebarRight.openTab(KIND)
    } catch (err) {
      /* No Session on screen yet (the controller throws instead of drawing into
         a surface nobody shows). Leave a trace for the devtools console. */
      const logger = window.console
      if (logger && typeof logger.warn === 'function') {
        logger.warn('[ui-flow-mapper] cannot open the tab right now:', err && err.message)
      }
    }
  }

  function HeaderButton() {
    return h(
      'button',
      {
        type: 'button',
        className: 'ufm-header-btn',
        title: t('title'),
        onClick: openMapper,
      },
      t('shortLabel'),
    )
  }

  ctx.effect(
    () => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: TYPE_ID + ':open',
      order: 60,
      label: () => t('title'),
    }, HeaderButton)),
    'ui-flow-mapper: header entry',
  )
}

module.exports = { apply, inject, NS, TYPE_ID, KIND }
