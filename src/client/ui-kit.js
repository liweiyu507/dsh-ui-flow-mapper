/**
 * Small presentational kit shared by the canvas, the inspector and the shell.
 *
 * Deliberately dependency-free (no component library import): the plugin's only
 * platform baseline needs are React and `react/jsx-runtime`, and hand-rolled
 * controls keep the bundle honest. Text labels instead of an icon font.
 */

const React = require('react')
const h = React.createElement

/**
 * Pen glyphs for the tool rack.
 *
 * A pen rack is a place where shapes are recognised before they are read, so
 * these are drawn as the shapes themselves rather than as an icon font: every
 * glyph is the outline the pen will lay down.
 */
function PenIcon(props) {
  const shape = props.shape
  const common = {
    width: 15,
    height: 15,
    viewBox: '0 0 14 14',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  }
  const children = []
  if (shape === 'select') {
    children.push(h('path', { key: 'p', d: 'M3.4 1.8 L3.4 11.4 L6 9 L8.2 12.2 L9.6 11.4 L7.4 8.3 L10.6 7.9 Z', fill: 'currentColor', stroke: 'none' }))
  } else if (shape === 'rect') {
    children.push(h('rect', { key: 'r', x: 2, y: 3, width: 10, height: 8 }))
  } else if (shape === 'roundrect') {
    children.push(h('rect', { key: 'r', x: 2, y: 3, width: 10, height: 8, rx: 3 }))
  } else if (shape === 'ellipse') {
    children.push(h('ellipse', { key: 'e', cx: 7, cy: 7, rx: 5, ry: 4 }))
  } else if (shape === 'line') {
    children.push(h('line', { key: 'l', x1: 2, y1: 11, x2: 12, y2: 3 }))
  } else if (shape === 'arrow') {
    children.push(
      h('line', { key: 'l', x1: 2, y1: 11, x2: 11, y2: 4 }),
      h('path', { key: 'a', d: 'M7.2 3.6 H11.4 V7.8' }),
    )
  } else if (shape === 'card') {
    children.push(
      h('rect', { key: 'r', x: 2, y: 3.5, width: 10, height: 7, rx: 1 }),
      h('line', { key: 'l', x1: 2, y1: 6, x2: 12, y2: 6 }),
    )
  } else if (shape === 'button') {
    children.push(h('rect', { key: 'r', x: 2, y: 4.5, width: 10, height: 5, rx: 2.5, fill: 'currentColor', stroke: 'none', opacity: 0.85 }))
  } else if (shape === 'input') {
    children.push(
      h('rect', { key: 'r', x: 2, y: 4.5, width: 10, height: 5, rx: 1 }),
      h('line', { key: 'c', x1: 4.4, y1: 5.8, x2: 4.4, y2: 8.2 }),
    )
  } else if (shape === 'switch') {
    children.push(
      h('rect', { key: 'r', x: 1.8, y: 4.8, width: 10.4, height: 4.4, rx: 2.2 }),
      h('circle', { key: 'k', cx: 9.8, cy: 7, r: 1.5, fill: 'currentColor', stroke: 'none' }),
    )
  } else if (shape === 'text') {
    children.push(h('path', { key: 't', d: 'M2.6 4 H11.4 M7 4 V11.4' }))
  } else if (shape === 'image') {
    children.push(
      h('rect', { key: 'r', x: 2, y: 3.5, width: 10, height: 7, rx: 1 }),
      h('path', { key: 'm', d: 'M2.4 9.2 L5.4 6.6 L8 9.2 L10 7.4 L11.6 8.8' }),
      h('circle', { key: 's', cx: 4.7, cy: 5.7, r: 0.8 }),
    )
  }
  return h('svg', common, children)
}

/** Subscribe to a `{ get, subscribe }` store (React 18's external store hook). */
function useStoreValue(store) {
  return React.useSyncExternalStore(store.subscribe, store.get)
}

/** Re-render whenever the DSH locale or theme preference changes. */
function useLocaleTick(locale) {
  const [, force] = React.useReducer((n) => n + 1, 0)
  React.useEffect(() => {
    if (!locale || typeof locale.subscribe !== 'function') return undefined
    return locale.subscribe(force)
  }, [locale])
}

function Btn(props) {
  return h(
    'button',
    {
      type: 'button',
      className: 'ufm-btn'
        + (props.active ? ' is-active' : '')
        + (props.danger ? ' is-danger' : '')
        + (props.wide ? ' is-wide' : ''),
      title: props.title || props.children,
      'aria-label': props.title,
      disabled: props.disabled === true,
      onMouseDown: props.onMouseDown,
      onClick: props.onClick,
    },
    props.children,
  )
}

function Row(props) {
  return h(
    'div',
    { className: 'ufm-row' },
    h('div', { className: 'ufm-row-label', title: props.label }, props.label),
    h('div', { className: 'ufm-row-body' }, props.children),
  )
}

function SectionTitle(props) {
  return h('div', { className: 'ufm-section-title' }, props.children)
}

function NumInput(props) {
  const [text, setText] = React.useState(String(props.value))
  const [focused, setFocused] = React.useState(false)
  React.useEffect(() => {
    if (!focused) setText(String(props.value))
  }, [props.value, focused])
  const commit = (raw) => {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      setText(String(props.value))
      return
    }
    const min = props.min === undefined ? -Infinity : props.min
    const max = props.max === undefined ? Infinity : props.max
    const next = Math.round(Math.min(max, Math.max(min, parsed)))
    setText(String(next))
    props.onChange(next)
  }
  return h('input', {
    className: 'ufm-input ufm-num',
    type: 'text',
    inputMode: 'numeric',
    value: text,
    title: props.title,
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false)
      commit(text)
    },
    onChange: (event) => setText(event.target.value),
    onKeyDown: (event) => {
      if (event.key === 'Enter') {
        commit(text)
        event.currentTarget.blur()
      }
      if (event.key === 'Escape') {
        setText(String(props.value))
        event.currentTarget.blur()
      }
    },
  })
}

function TextInput(props) {
  const [text, setText] = React.useState(props.value || '')
  const [focused, setFocused] = React.useState(false)
  React.useEffect(() => {
    if (!focused) setText(props.value || '')
  }, [props.value, focused])
  return h('input', {
    className: 'ufm-input',
    type: 'text',
    value: text,
    placeholder: props.placeholder,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onChange: (event) => {
      setText(event.target.value)
      props.onChange(event.target.value)
    },
  })
}

function TextArea(props) {
  const [text, setText] = React.useState(props.value || '')
  const [focused, setFocused] = React.useState(false)
  React.useEffect(() => {
    if (!focused) setText(props.value || '')
  }, [props.value, focused])
  return h('textarea', {
    className: 'ufm-textarea',
    rows: props.rows || 3,
    value: text,
    placeholder: props.placeholder,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onChange: (event) => {
      setText(event.target.value)
      props.onChange(event.target.value)
    },
  })
}

function Select(props) {
  return h(
    'select',
    {
      className: 'ufm-select',
      value: props.value === null || props.value === undefined ? '' : String(props.value),
      onChange: (event) => props.onChange(event.target.value),
    },
    props.options.map((option) => h('option', { key: String(option.value), value: String(option.value) }, option.label)),
  )
}

function Checkbox(props) {
  return h(
    'label',
    { className: 'ufm-check' },
    h('input', {
      type: 'checkbox',
      checked: props.checked === true,
      onChange: (event) => props.onChange(event.target.checked),
    }),
    h('span', null, props.label),
  )
}

/** Colour field: empty means "none" (transparent / no stroke). */
function ColorField(props) {
  const value = typeof props.value === 'string' && props.value ? props.value : ''
  return h(
    'span',
    { className: 'ufm-color' },
    h('input', {
      type: 'color',
      className: 'ufm-color-swatch',
      value: /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000',
      onChange: (event) => props.onChange(event.target.value),
    }),
    h('input', {
      type: 'text',
      className: 'ufm-input ufm-color-text',
      value,
      placeholder: props.placeholder || 'none',
      onChange: (event) => {
        const next = event.target.value.trim()
        props.onChange(next === '' ? null : next)
      },
    }),
  )
}

function Divider() {
  return h('div', { className: 'ufm-divider' })
}

module.exports = {
  h,
  React,
  useStoreValue,
  useLocaleTick,
  PenIcon,
  Btn,
  Row,
  SectionTitle,
  NumInput,
  TextInput,
  TextArea,
  Select,
  Checkbox,
  ColorField,
  Divider,
}
