/**
 * The spec sheet: what the selection is, and every editable field of it (`§3.4`).
 *
 * Layout follows the drafting-table metaphor (DESIGN.md): a hairline-led sheet of
 * labelled rows, measurements in mono so columns of numbers line up, and no
 * decoration beyond the rules that carry the grouping. Every change goes through
 * the app's `actions`.
 */

const model = m('model')
const kit = m('ui-kit')
const h = kit.h
const React = kit.React

const { Row, SectionTitle, Btn, NumInput, TextInput, TextArea, Select, Checkbox, ColorField } = kit

/** The identity line every panel opens with: what this is, and its id. */
function SpecLine(props) {
  return h(
    'div',
    { className: 'ufm-spec-line' },
    h('span', { className: 'ufm-spec-kind' }, props.kind),
    props.id ? h('span', { className: 'ufm-spec-id' }, props.id) : null,
    props.extra ? h('span', { className: 'ufm-spec-id' }, props.extra) : null,
  )
}

function DocumentPanel(props) {
  const doc = props.doc
  const t = props.t
  const actions = props.actions
  const stats = model.summarize(doc)
  const report = model.validateDoc(doc)
  return h(
    'div',
    { className: 'ufm-panel' },
    h(SpecLine, { kind: t('docTitle'), id: doc.meta.name }),
    h('div', { className: 'ufm-spec-line' },
      h('span', { className: 'ufm-spec-id' }, t('saveWhere')),
      h('span', { className: 'ufm-spec-value', title: (props.save && props.save.where) || '' },
        (props.save && props.save.where) || t('saveUnknown'))),
    h('div', { className: 'ufm-spec-line' },
      h('span', { className: 'ufm-spec-id' }, t('saveWhen')),
      h('span', { className: 'ufm-spec-value' }, (props.save && props.save.when) || t('saveNever'))),
    h(Row, { label: t('docName') }, h(TextInput, { value: doc.meta.name, onChange: (v) => actions.setDocMeta({ name: v }) })),
    h(Row, { label: t('docDesc') }, h(TextArea, { value: doc.meta.description, rows: 2, onChange: (v) => actions.setDocMeta({ description: v }) })),
    h(Row, { label: t('defaultSize') },
      h('span', { className: 'ufm-inline' },
        h(NumInput, { value: doc.meta.design.defaultSize.w, min: model.MIN_SIZE.w, max: 8192, onChange: (v) => actions.setDefaultSize({ w: v, h: doc.meta.design.defaultSize.h }) }),
        h('span', { className: 'ufm-times' }, '×'),
        h(NumInput, { value: doc.meta.design.defaultSize.h, min: model.MIN_SIZE.h, max: 8192, onChange: (v) => actions.setDefaultSize({ w: doc.meta.design.defaultSize.w, h: v }) }),
      )),
    h(SectionTitle, null, t('statScreens') + ' ' + stats.screens + '   ' + t('statElements') + ' ' + stats.elements + '   ' + t('statLinks') + ' ' + stats.connections),

    report.errors.length > 0 || report.warnings.length > 0
      ? h('div', { className: 'ufm-report' },
          report.errors.map((message, index) => h('div', { key: 'e' + index, className: 'is-error' }, message)),
          report.warnings.map((entry, index) =>
            h('div', { key: 'w' + index, className: 'is-warn' }, t(entry[0], entry[1])),
          ),
        )
      : null,

    h(SectionTitle, null, t('exportPrompt')),
    h('div', { className: 'ufm-btn-row' },
      h(Btn, { onClick: () => actions.openPrompt() }, t('exportPrompt')),
      h(Btn, { onClick: () => actions.exportJson() }, t('exportJson')),
      h(Btn, { onClick: () => actions.importJson() }, t('importJson')),
      h(Btn, { danger: true, onClick: () => actions.clearAll() }, t('clearAll')),
    ),
  )
}

function ScreenPanel(props) {
  const screen = props.screen
  const t = props.t
  const actions = props.actions
  return h(
    'div',
    { className: 'ufm-panel' },
    h(SpecLine, { kind: t('screenTitle'), id: screen.id, extra: screen.elements.length + ' ' + t('statElements') }),
    h(Row, { label: t('name') }, h(TextInput, { value: screen.name, onChange: (v) => actions.setScreen(screen.id, { name: v }) })),
    h(Row, { label: t('size') },
      h('span', { className: 'ufm-inline' },
        h(NumInput, { value: screen.size.w, min: model.MIN_SIZE.w, max: 8192, onChange: (v) => actions.setScreenSize(screen.id, { w: v, h: screen.size.h }) }),
        h('span', { className: 'ufm-times' }, '×'),
        h(NumInput, { value: screen.size.h, min: model.MIN_SIZE.h, max: 8192, onChange: (v) => actions.setScreenSize(screen.id, { w: screen.size.w, h: v }) }),
      )),
    h(Row, { label: t('background') },
      h(ColorField, { value: screen.background.fill, onChange: (v) => actions.setScreenBackground(screen.id, v) })),
    h(Row, { label: t('note') }, h(TextArea, { value: screen.note, rows: 2, onChange: (v) => actions.setScreen(screen.id, { note: v }) })),
    h(SectionTitle, null, t('deleteScreen')),
    h('div', { className: 'ufm-btn-row' },
      h(Btn, { danger: true, onClick: () => actions.deleteScreen(screen.id) }, t('deleteScreen')),
    ),
  )
}

function ElementPanel(props) {
  const element = props.element
  const screen = props.screen
  const t = props.t
  const actions = props.actions
  const style = model.styleFor(element)
  const set = (patch) => actions.setElement(screen.id, element.id, patch)
  const setStyle = (patch) => actions.setElementStyle(screen.id, element.id, patch)
  const isText = model.TEXT_SHAPES[element.shape]

  return h(
    'div',
    { className: 'ufm-panel' },
    h(SpecLine, { kind: t('elementTitle'), id: element.id, extra: element.shape }),

    h(SectionTitle, null, t('type')),
    h(Row, { label: t('type') },
      h(Select, {
        value: element.type,
        options: [
          { value: 'decorative', label: t('typeDecorative') },
          { value: 'interactive', label: t('typeInteractive') },
        ],
        onChange: (v) => set({ type: v }),
      })),
    isText ? h(Row, { label: t('text') }, h(TextArea, { value: element.text, rows: 2, onChange: (v) => set({ text: v }) })) : null,
    h(Row, { label: t('fixed') }, h(Checkbox, { checked: element.fixed, label: t('fixed'), onChange: (v) => set({ fixed: v }) })),
    element.fixed ? h('div', { className: 'ufm-note' }, t('fixedHint')) : null,
    h(Row, { label: t('zIndex') },
      h('span', { className: 'ufm-inline' },
        h(NumInput, { value: element.zIndex, min: -9999, max: 9999, onChange: (v) => set({ zIndex: v }) }),
        h(Btn, { title: t('toFront'), onClick: () => actions.moveZ(screen.id, element.id, 'front') }, '⇧⇧'),
        h(Btn, { title: t('forward'), onClick: () => actions.moveZ(screen.id, element.id, 'up') }, '⇧'),
        h(Btn, { title: t('backward'), onClick: () => actions.moveZ(screen.id, element.id, 'down') }, '⇩'),
        h(Btn, { title: t('toBack'), onClick: () => actions.moveZ(screen.id, element.id, 'back') }, '⇩⇩'),
      )),

    h(SectionTitle, null, t('position')),
    h(Row, { label: 'x / y' },
      h('span', { className: 'ufm-inline' },
        h(NumInput, { value: element.position.x, onChange: (v) => actions.setElementBox(screen.id, element.id, { x: v }, true) }),
        h(NumInput, { value: element.position.y, onChange: (v) => actions.setElementBox(screen.id, element.id, { y: v }, true) }),
      )),
    h(Row, { label: t('width') + ' / ' + t('height') },
      h('span', { className: 'ufm-inline' },
        h(NumInput, { value: element.position.w, min: model.MIN_ELEMENT_SIZE, onChange: (v) => actions.setElementBox(screen.id, element.id, { w: v }, true) }),
        h(NumInput, { value: element.position.h, min: model.MIN_ELEMENT_SIZE, onChange: (v) => actions.setElementBox(screen.id, element.id, { h: v }, true) }),
      )),
    h(Row, { label: t('align') },
      h('div', { className: 'ufm-btn-row' },
        h(Btn, { title: t('alignLeft'), 'aria-label': t('alignLeft'), onClick: () => actions.alignElement(screen.id, element.id, 'left') }, '⇤'),
        h(Btn, { title: t('alignCenterH'), 'aria-label': t('alignCenterH'), onClick: () => actions.alignElement(screen.id, element.id, 'centerH') }, '⇔'),
        h(Btn, { title: t('alignRight'), 'aria-label': t('alignRight'), onClick: () => actions.alignElement(screen.id, element.id, 'right') }, '⇥'),
        h(Btn, { title: t('alignTop'), 'aria-label': t('alignTop'), onClick: () => actions.alignElement(screen.id, element.id, 'top') }, '⇡'),
        h(Btn, { title: t('alignMiddleV'), 'aria-label': t('alignMiddleV'), onClick: () => actions.alignElement(screen.id, element.id, 'middleV') }, '⇕'),
        h(Btn, { title: t('alignBottom'), 'aria-label': t('alignBottom'), onClick: () => actions.alignElement(screen.id, element.id, 'bottom') }, '⇣'),
      )),

    h(SectionTitle, null, t('role')),
    h(Row, { label: t('rolePreset') },
      h(Select, {
        value: element.role.preset === null ? '' : element.role.preset,
        options: [{ value: '', label: t('roleNone') }].concat(model.ROLE_PRESETS.map((preset) => ({ value: preset, label: preset }))),
        onChange: (v) => actions.setElementRole(screen.id, element.id, { preset: v === '' ? null : v }),
      })),
    h(Row, { label: t('roleText') },
      h(TextInput, { value: element.role.text, placeholder: t('roleText'), onChange: (v) => actions.setElementRole(screen.id, element.id, { text: v }) })),

    h(SectionTitle, null, t('styleGroup')),
    h(Row, { label: t('fill') }, h(ColorField, { value: style.fill, onChange: (v) => setStyle({ fill: v }) })),
    h(Row, { label: t('stroke') }, h(ColorField, { value: style.stroke, onChange: (v) => setStyle({ stroke: v }) })),
    h(Row, { label: t('radius') }, h(NumInput, { value: style.radius, min: 0, max: 999, onChange: (v) => setStyle({ radius: v }) })),
    h(Row, { label: t('opacity') },
      h('span', { className: 'ufm-inline' },
        h(NumInput, { value: Math.round(style.opacity * 100), min: 0, max: 100, onChange: (v) => setStyle({ opacity: v / 100 }) }),
        h('span', { className: 'ufm-unit' }, '%'),
      )),
    isText
      ? h(React.Fragment, null,
          h(Row, { label: t('fontSize') }, h(NumInput, { value: style.fontSize, min: 8, max: 200, onChange: (v) => setStyle({ fontSize: v }) })),
          h(Row, { label: t('fontWeight') },
            h(Select, {
              value: String(style.fontWeight),
              options: [
                { value: '400', label: '400' }, { value: '500', label: '500' },
                { value: '600', label: '600' }, { value: '700', label: '700' },
              ],
              onChange: (v) => setStyle({ fontWeight: Number(v) }),
            })),
          h(Row, { label: t('color') }, h(ColorField, { value: style.color, onChange: (v) => setStyle({ color: v }) })),
          h(Row, { label: t('align') },
            h(Select, {
              value: style.align,
              options: [
                { value: 'left', label: t('alignTextLeft') },
                { value: 'center', label: t('alignTextCenter') },
                { value: 'right', label: t('alignTextRight') },
              ],
              onChange: (v) => setStyle({ align: v }),
            })),
        )
      : null,
    element.shape === 'image'
      ? h(React.Fragment, null,
          h(SectionTitle, null, t('imageGroup')),
          h('div', { className: 'ufm-btn-row' },
            h(Btn, { onClick: () => actions.pickImage(screen.id, element.id) }, t('pickImage')),
            h(Btn, { onClick: () => setStyle({ image: null }) }, t('clearImage')),
          ))
      : null,

    h(SectionTitle, null, t('deleteElement')),
    h('div', { className: 'ufm-btn-row' },
      h(Btn, { onClick: () => actions.duplicateElement(screen.id, element.id) }, t('dup')),
      h(Btn, { danger: true, onClick: () => actions.deleteElement(screen.id, element.id) }, t('deleteElement')),
    ),
  )
}

function ConnectionPanel(props) {
  const connection = props.connection
  const doc = props.doc
  const t = props.t
  const actions = props.actions
  const isOverlay = connection.type === 'overlay'
  const overlay = connection.overlay || { size: { w: 640, h: 480 }, position: 'center', anchor: { x: 0, y: 0 }, modal: true, dismiss: [] }
  const sourceScreen = model.findScreen(doc, connection.from.screen)
  const sourceElement = model.findElement(sourceScreen, connection.from.element)

  return h(
    'div',
    { className: 'ufm-panel' },
    h(SpecLine, { kind: t('connectionTitle'), id: connection.id, extra: isOverlay ? t('connOverlayShort') : t('connNavigateShort') }),
    h(Row, { label: t('connFrom') },
      h('span', { className: 'ufm-spec-id' },
        (sourceScreen ? sourceScreen.name : '?') + ' / ' + (sourceElement ? sourceElement.id : '?'))),
    h(Row, { label: t('connType') },
      h(Select, {
        value: connection.type,
        options: [
          { value: 'navigate', label: t('connNavigate') },
          { value: 'overlay', label: t('connOverlay') },
        ],
        onChange: (v) => actions.setConnectionType(connection.id, v),
      })),
    h(Row, { label: t('target') },
      h(Select, {
        value: connection.to.screen,
        options: doc.screens.map((screen) => ({ value: screen.id, label: screen.name })),
        onChange: (v) => actions.setConnection(connection.id, { to: { screen: v } }),
      })),
    h(Row, { label: t('connNote') },
      h(TextArea, {
        value: connection.note,
        rows: 4,
        placeholder: '【跳转】… 【条件】… 【参数】…',
        onChange: (v) => actions.setConnection(connection.id, { note: v }),
      })),

    isOverlay
      ? h(React.Fragment, null,
          h(SectionTitle, null, t('overlayGroup')),
          h(Row, { label: t('size') },
            h('span', { className: 'ufm-inline' },
              h(NumInput, { value: overlay.size.w, min: 80, onChange: (v) => actions.setConnectionOverlay(connection.id, { size: { w: v, h: overlay.size.h } }) }),
              h('span', { className: 'ufm-times' }, '×'),
              h(NumInput, { value: overlay.size.h, min: 60, onChange: (v) => actions.setConnectionOverlay(connection.id, { size: { w: overlay.size.w, h: v } }) }),
            )),
          h(Row, { label: t('overlayPosition') },
            h(Select, {
              value: overlay.position,
              options: [
                { value: 'center', label: t('posCenter') },
                { value: 'bottom-sheet', label: t('posBottom') },
                { value: 'custom', label: t('posCustom') },
              ],
              onChange: (v) => actions.setConnectionOverlay(connection.id, { position: v }),
            })),
          overlay.position === 'custom'
            ? h(Row, { label: t('anchor') },
                h('span', { className: 'ufm-inline' },
                  h(NumInput, { value: overlay.anchor.x, onChange: (v) => actions.setConnectionOverlay(connection.id, { anchor: { x: v, y: overlay.anchor.y } }) }),
                  h(NumInput, { value: overlay.anchor.y, onChange: (v) => actions.setConnectionOverlay(connection.id, { anchor: { x: overlay.anchor.x, y: v } }) }),
                ))
            : null,
          h(Row, { label: t('modal') }, h(Checkbox, { checked: overlay.modal, label: t('modal'), onChange: (v) => actions.setConnectionOverlay(connection.id, { modal: v }) })),
          h(Row, { label: t('dismiss') },
            h('div', { className: 'ufm-col' },
              h(Checkbox, {
                checked: overlay.dismiss.indexOf('backdrop') >= 0,
                label: t('dismissBackdrop'),
                onChange: (v) => actions.setConnectionOverlay(connection.id, { dismiss: toggle(overlay.dismiss, 'backdrop', v) }),
              }),
              h(Checkbox, {
                checked: overlay.dismiss.indexOf('close-button') >= 0,
                label: t('dismissClose'),
                onChange: (v) => actions.setConnectionOverlay(connection.id, { dismiss: toggle(overlay.dismiss, 'close-button', v) }),
              }),
            )),
        )
      : null,

    h(SectionTitle, null, t('deleteConnection')),
    h('div', { className: 'ufm-btn-row' },
      h(Btn, { danger: true, onClick: () => actions.deleteConnection(connection.id) }, t('deleteConnection')),
    ),
  )
}

function toggle(list, value, on) {
  const next = (list || []).filter((item) => item !== value)
  if (on) next.push(value)
  return next
}

function Inspector(props) {
  const doc = props.doc
  const sel = props.sel
  const t = props.t
  const actions = props.actions

  if (sel && sel.kind === 'element') {
    const screen = model.findScreen(doc, sel.screenId)
    const element = model.findElement(screen, sel.elementId)
    if (screen && element) return h(ElementPanel, { screen: screen, element: element, t: t, actions: actions })
  }
  if (sel && sel.kind === 'screen') {
    const screen = model.findScreen(doc, sel.screenId)
    if (screen) return h(ScreenPanel, { screen: screen, t: t, actions: actions })
  }
  if (sel && sel.kind === 'connection') {
    const connection = model.findConnection(doc, sel.connectionId)
    if (connection) return h(ConnectionPanel, { connection: connection, doc: doc, t: t, actions: actions })
  }
  return h(DocumentPanel, { doc: doc, t: t, actions: actions })
}

module.exports = { Inspector }
