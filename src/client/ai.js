/**
 * The AI understanding layer (`D-14`): the plugin never calls a model itself.
 * It produces a paste-ready prompt pack — system prompt + canvas JSON — that a
 * DSH session turns into interactions, a task DAG, API contracts and frontend
 * bindings (`§5` of the charter).
 */

const model = m('model')

/** System prompt handed to the model, verbatim from the charter §5.2. */
const SYSTEM_PROMPT = `# 角色
你是「界面跳转图 → 软件实现」的理解引擎。你的任务：读一张画布，
理解它描述的软件交互逻辑，拆解成可执行的前后端任务。

# 输入结构
画布 JSON 包含：
- meta：软件名与一句话说明
- screens[]：每个界面（id, name, size, background, elements[]）
- elements[]：元素（id, type, shape, text, position{x,y,w,h}, zIndex, fixed, role{preset,text}, style）
  - type: decorative（装饰，不参与交互）| interactive（交互，可挂连线）
- connections[]：连线（id, from, to, type, overlay, note）
  - from: { screen, element }  ← 必须从元素出发
  - to: { screen }
  - type: navigate（跳转）| overlay（覆盖小窗）
  - note: 纯文本备注（你要解析成结构化）

# 你的工作流程（严格按序）
1. 【全局理解】用一段话概括这个软件是做什么的
2. 【界面清单】列出所有界面及其职责
3. 【交互图谱】把每条 connection 解析为结构化动作：
   {
     trigger: 哪个元素,
     action: navigate/overlay,
     target: 目标界面,
     guard: 是否需要登录/权限,
     params: 携带参数,
     condition: 触发条件
   }
4. 【任务拆解】生成任务 DAG：
   - 按「关键路径优先」与「从上到下细化」两种路径各输出一遍
   - 每个任务标注：依赖、优先级、涉及界面/元素、前后端归属
5. 【契约定义】为每个需要后端的交互定义 API 契约：
   { method, path, req, res, auth }
6. 【前端绑定】把每个界面的元素，映射到前端组件建议

# 输出格式（严格 JSON）
{
  "summary": "软件一句话概括",
  "screens": [{ "id": "", "name": "", "responsibility": "" }],
  "interactions": [],
  "task_dag": { "critical_path": [], "top_down": [] },
  "api_contracts": [],
  "frontend_bindings": [],
  "unresolved": [{ "ref": "elem_1", "kind": "TODO|AMBIGUOUS", "note": "你的假设" }]
}

# 规则
- 装饰元素不参与交互，忽略
- 没有连线的交互元素 = 未完成设计，进 unresolved 并标注 TODO
- note 是自然语言，你必须解析成结构，不要照抄
- 界面之间不能直接连线，只能通过元素
- overlay 类型要标注"弹窗/选择器/浮层"
- 遇到歧义，进 unresolved 标注 [AMBIGUOUS] 并给出你的假设`

/** The document as the model should see it (`INV-5`: no view state). */
function canvasForAI(doc) {
  return {
    schema: doc.schema,
    version: doc.version,
    meta: {
      name: doc.meta.name,
      description: doc.meta.description,
      design: doc.meta.design,
    },
    screens: doc.screens,
    connections: doc.connections,
  }
}

/** Full prompt pack: task line + system prompt + canvas JSON. */
function buildPromptPack(doc) {
  const stats = model.summarize(doc)
  const canvas = JSON.stringify(canvasForAI(doc), null, 2)
  return [
    '# 任务',
    '把下面这张「界面跳转图」画布转成软件实现方案。严格按系统提示词的流程与 JSON 输出格式作答，不要输出 JSON 以外的内容。',
    '',
    '画布规模：' + stats.screens + ' 个界面 / ' + stats.elements + ' 个元素 / ' + stats.connections + ' 条连线。',
    '',
    '## 系统提示词',
    '',
    SYSTEM_PROMPT,
    '',
    '## 画布 JSON',
    '',
    '```json',
    canvas,
    '```',
    '',
  ].join('\n')
}

/** Copy through the async clipboard API, falling back to a hidden textarea. */
function copyText(text) {
  const clipboard = window.navigator && window.navigator.clipboard
  if (clipboard && typeof clipboard.writeText === 'function') {
    return clipboard.writeText(text).then(
      () => true,
      () => legacyCopy(text),
    )
  }
  return Promise.resolve(legacyCopy(text))
}

function legacyCopy(text) {
  try {
    const area = window.document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', 'readonly')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    window.document.body.appendChild(area)
    area.select()
    const ok = window.document.execCommand('copy')
    window.document.body.removeChild(area)
    return ok
  } catch (err) {
    return false
  }
}

/** Save text as a file download. */
function downloadText(filename, text, mime) {
  const blob = new window.Blob([text], { type: mime || 'text/plain;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = filename
  window.document.body.appendChild(link)
  link.click()
  window.document.body.removeChild(link)
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new window.FileReader()
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsText(file)
  })
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new window.FileReader()
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })
}

module.exports = {
  SYSTEM_PROMPT,
  canvasForAI,
  buildPromptPack,
  copyText,
  downloadText,
  readTextFile,
  readImageFile,
}
