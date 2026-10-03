/**
 * Copy table for the whole feature.
 *
 * Format: `key: [zh, en]`. `toDicts()` splits it into the two dictionaries the
 * DSH locale service takes, so the plugin speaks the app's language instead of
 * hard-coding one.
 *
 * Voice rules (DESIGN.md §"写文案"): sentence case, plain verbs, one job per
 * string, no decorative meta strings ("A · B · C"), no summaries that repeat
 * what the screen already shows.
 */

const TABLE = {
  title: ['UI Flow Mapper', 'UI Flow Mapper'],
  shortLabel: ['流程图', 'Flow map'],
  guideDesc: ['画界面与交互跳转，产出喂给 AI 的画布 JSON', 'Draw screens and their jumps, export a canvas JSON for AI'],

  /* ---- pen rack: tools ---- */
  toolSelect: ['选择', 'Select'],
  toolRect: ['矩形', 'Rectangle'],
  toolRoundRect: ['圆角矩形', 'Rounded rect'],
  toolEllipse: ['椭圆', 'Ellipse'],
  toolLine: ['直线', 'Line'],
  toolArrow: ['箭头', 'Arrow'],
  toolCard: ['卡片', 'Card'],
  toolButton: ['按钮', 'Button'],
  toolInput: ['输入框', 'Input'],
  toolSwitch: ['开关', 'Switch'],
  toolText: ['文字', 'Text'],
  toolImage: ['图片', 'Image'],
  toolDrawHint: ['在界面上拖拽决定尺寸，单击按默认尺寸放置', 'Drag on a screen to size it, click to place at the default size'],
  toolDrawHintSmall: ['拖拽画到界面上', 'Drag on a screen to draw'],

  /* ---- pen rack: actions ---- */
  newScreen: ['新建界面', 'New screen'],
  undo: ['撤销', 'Undo'],
  redo: ['重做', 'Redo'],
  save: ['保存', 'Save'],
  saveOk: ['已保存 {time}', 'Saved {time}'],
  saveFailed: ['保存失败：{msg}', 'Save failed: {msg}'],
  saveNoWorkspace: ['没找到这个会话的工作区目录，已改为下载', 'No workspace folder for this session — downloaded instead'],
  saveTo: ['保存到 {path}', 'Saves to {path}'],
  saveToHint: ['自动保存：每 1 分钟', 'Autosave: every minute'],
  saveChecking: ['正在确认保存位置…', 'Checking where to save…'],
  saveWhere: ['保存位置', 'Saved to'],
  saveWhen: ['上次保存', 'Last saved'],
  saveNever: ['还没保存过', 'Not saved yet'],
  saveUnknown: ['还未知（等宿主应答）', 'unknown yet'],
  saveHostMissing: ['宿主保存通道未就绪：重启一次 DSH 就会生效', 'Host save channel not ready — restart DSH once'],
  del: ['删除', 'Delete'],
  dup: ['复制', 'Duplicate'],
  toFront: ['置顶', 'Bring to front'],
  toBack: ['置底', 'Send to back'],
  forward: ['上移一层', 'Move up one'],
  backward: ['下移一层', 'Move down one'],

  alignLeft: ['左对齐', 'Align left'],
  alignCenterH: ['水平居中', 'Center horizontally'],
  alignRight: ['右对齐', 'Align right'],
  alignTop: ['顶对齐', 'Align top'],
  alignMiddleV: ['垂直居中', 'Center vertically'],
  alignBottom: ['底对齐', 'Align bottom'],

  zoomOut: ['缩小', 'Zoom out'],
  zoomIn: ['放大', 'Zoom in'],
  zoomFit: ['适应窗口', 'Fit to view'],
  expand: ['面板全屏／还原', 'Toggle panel fullscreen'],

  exportPrompt: ['AI 提示词包', 'AI prompt pack'],
  exportJson: ['导出画布 JSON', 'Export canvas JSON'],
  importJson: ['导入画布 JSON', 'Import canvas JSON'],
  clearAll: ['清空画布', 'Clear canvas'],
  clearConfirm: ['清空整张画布？可以用撤销恢复。', 'Clear the whole canvas? Undo can bring it back.'],

  saved: ['已保存', 'Saved'],

  /* ---- document panel ---- */
  docTitle: ['文档', 'Document'],
  docName: ['名称', 'Name'],
  docDesc: ['说明', 'Description'],
  defaultSize: ['新界面默认尺寸', 'Default new-screen size'],
  statScreens: ['界面', 'Screens'],
  statElements: ['元素', 'Elements'],
  statLinks: ['连线', 'Links'],

  /* ---- screen panel ---- */
  screenTitle: ['界面', 'Screen'],
  name: ['名称', 'Name'],
  size: ['尺寸', 'Size'],
  width: ['宽', 'W'],
  height: ['高', 'H'],
  background: ['背景色', 'Background'],
  note: ['备注', 'Note'],
  deleteScreen: ['删除界面', 'Delete screen'],
  deleteScreenConfirm: ['删除这个界面？它的元素和相关连线会一起删除。', 'Delete this screen? Its elements and their links go with it.'],

  /* ---- element panel ---- */
  elementTitle: ['元素', 'Element'],
  type: ['类型', 'Type'],
  typeDecorative: ['装饰（不参与交互）', 'Decorative (no interaction)'],
  typeInteractive: ['交互（可挂连线）', 'Interactive (can hold links)'],
  text: ['文本', 'Text'],
  fixed: ['固定位置', 'Fixed'],
  fixedHint: ['固定＝与界面绑定：拖动它等于移动整个界面，两者相对位置不变。要微调它的位置，用下面的 x/y。', 'Fixed means bound to the screen: dragging it moves the whole screen and keeps the two locked together. To nudge it, use x/y below.'],
  zIndex: ['层级', 'Layer'],
  position: ['位置与大小', 'Position & size'],
  role: ['元素作用', 'Element role'],
  rolePreset: ['预设', 'Preset'],
  roleText: ['说明', 'Detail'],
  roleNone: ['未指定', 'None'],
  styleGroup: ['外观', 'Appearance'],
  fill: ['填充', 'Fill'],
  stroke: ['描边', 'Stroke'],
  radius: ['圆角', 'Radius'],
  opacity: ['不透明度', 'Opacity'],
  fontSize: ['字号', 'Font size'],
  fontWeight: ['字重', 'Weight'],
  color: ['文字颜色', 'Text color'],
  align: ['对齐', 'Align'],
  alignTextLeft: ['左', 'Left'],
  alignTextCenter: ['中', 'Center'],
  alignTextRight: ['右', 'Right'],
  imageGroup: ['图片', 'Image'],
  pickImage: ['选择图片', 'Pick image'],
  clearImage: ['移除图片', 'Clear image'],
  deleteElement: ['删除元素', 'Delete element'],
  madeInteractive: ['已把它设为交互元素，连线可以挂上了', 'Marked it interactive so the link has a source'],
  linkFromDecorative: ['装饰元素不能作为连线起点', 'A decorative element cannot start a link'],

  /* ---- connection panel ---- */
  connectionTitle: ['连线', 'Link'],
  connType: ['类型', 'Type'],
  connNavigate: ['跳转（整屏切换）', 'Navigate (full switch)'],
  connOverlay: ['覆盖小窗（弹窗／选择器）', 'Overlay (popup / picker)'],
  target: ['目标界面', 'Target screen'],
  connNote: ['备注（写人话，AI 会解析）', 'Note (plain words; the AI parses it)'],
  connFrom: ['起点元素', 'From element'],
  overlayGroup: ['浮层', 'Overlay'],
  overlayPosition: ['位置', 'Placement'],
  posCenter: ['居中', 'Center'],
  posBottom: ['底部抽屉', 'Bottom sheet'],
  posCustom: ['自定义', 'Custom'],
  anchor: ['左上角坐标', 'Top-left'],
  modal: ['模态', 'Modal'],
  dismiss: ['关闭方式', 'Dismiss'],
  dismissBackdrop: ['点遮罩关闭', 'Backdrop'],
  dismissClose: ['关闭按钮', 'Close button'],
  deleteConnection: ['删除连线', 'Delete link'],
  connNavigateShort: ['跳转', 'jump'],
  connOverlayShort: ['覆盖', 'overlay'],

  /* ---- inspector shell ---- */
  inspectorTitle: ['规格', 'Spec'],
  collapse: ['收起', 'Collapse'],
  expand: ['展开', 'Expand'],

  /* ---- canvas status ---- */
  statusPen: ['笔', 'Pen'],
  statusZoom: ['缩放', 'Zoom'],
  statusSelection: ['选中', 'Selection'],
  statusNothing: ['空选', 'nothing'],

  todoBadge: ['待连线', 'no link'],
  linkingHint: ['点目标界面落下连线，Esc 取消', 'Click the target screen to land the link, Esc cancels'],
  linkingOverlayHint: ['点目标界面放浮层，Esc 取消', 'Click the target screen to place the overlay, Esc cancels'],

  menuConnectNavigate: ['连一条跳转线', 'Add a navigate link'],
  menuConnectOverlay: ['连一条覆盖小窗线', 'Add an overlay link'],
  menuDuplicate: ['复制元素', 'Duplicate element'],
  menuDeleteElement: ['删除元素', 'Delete element'],
  menuDeleteScreen: ['删除界面', 'Delete screen'],
  menuFit: ['适应窗口', 'Fit to view'],
  menuNewScreen: ['新建界面', 'New screen'],

  promptTitle: ['AI 提示词包', 'AI prompt pack'],
  promptHint: ['把下面整段贴进 DSH 会话；回复会按系统提示词的 JSON 格式给出。', 'Paste the whole block into a DSH session; the reply follows the system prompt JSON shape.'],
  copy: ['复制', 'Copy'],
  copied: ['已复制', 'Copied'],
  copyFailed: ['复制没成功，请手动全选复制', 'Copy failed — select all and copy manually'],
  download: ['下载 .md', 'Download .md'],
  close: ['关闭', 'Close'],
  promptEmpty: ['画布上还没有界面，先放一个再导出。', 'No screens on the canvas yet — add one, then export.'],

  importFailed: ['导入失败：{msg}', 'Import failed: {msg}'],
  emptyTitle: ['画布是空的', 'The canvas is empty'],
  emptyBody: ['先新建一个界面，然后在上面摆元素、连跳转。', 'Create a screen, then place elements and wire the jumps.'],
  warnOverflow: ['{n} 个元素超出界面边界', '{n} element(s) outside the screen'],
  warnTodo: ['{n} 个交互元素还没连线', '{n} interactive element(s) without a link'],
}

/** Build `{ zh, en }` dictionaries for `ctx.locale.register`. */
function toDicts() {
  const zh = {}
  const en = {}
  for (const key of Object.keys(TABLE)) {
    zh[key] = TABLE[key][0]
    en[key] = TABLE[key][1]
  }
  return { zh, en }
}

/** Interpolate `{name}` placeholders in one translated string. */
function fill(text, vars) {
  if (!vars) return text
  let out = String(text)
  for (const key of Object.keys(vars)) out = out.split('{' + key + '}').join(String(vars[key]))
  return out
}

module.exports = { TABLE, toDicts, fill }
