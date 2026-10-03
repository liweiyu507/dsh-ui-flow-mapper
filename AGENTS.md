# UI Flow Mapper — 施工入口（先读我）

本目录是 DSH 插件 **UI Flow Mapper** 的工程本体（唯一一份，没有别的副本）。完整规格在 [`纲领.md`](./纲领.md)，界面设计方向在 [`DESIGN.md`](./DESIGN.md)——**动手前必读这两份**，本文件只是索引与红线。

## 一句话

挂在 DSH 右侧栏的界面跳转图编辑器：摆出软件的每个界面、画上元素、连上跳转，产出机器可读的画布 JSON，供 AI 读懂交互逻辑并生成前后端实现。

## 本目录与线上的关系（重要）

- `node_modules\dsh-ui-flow-mapper`（junction）**指向本目录**，所以 profile 里装的 `dsh-ui-flow-mapper` 跑的就是这里；本目录就是线上那份，改这里就是改线上。
- 改完 `src/` → `node tools/build-client.mjs` → 客户端热加载新产物；没生效就先刷新页面。
- **改 `lib/index.js`（宿主半边）必须重启 DSH**：宿主插件在进程启动时装配一次，路由与注入不会热更新。
- **改了 bundle 的解析路径（junction 指向）也必须重启 DSH**：宿主在启动时快照每个 `client.js` 入口，路径变化它不会自己发现。

## 读什么（按任务）

| 你要做的事 | 读 |
| --- | --- |
| 任何改动之前 | 纲领 §2 冻结决策、§9 禁止事项；DESIGN §三（别退回 AI 默认脸） |
| 画布 / 交互 / 笔架 | 纲领 §3、§4（含 8 条不变量）；DESIGN §二 |
| AI 理解层 | 纲领 §5（系统提示词 + 输出 schema 现成可用） |
| DSH 接线 / 注册 / 打包 | 纲领 §6、§0 环境事实 |
| 判断"做完没有" | 纲领 §7 里程碑与验收标准、§12 实现现状 |

## 红线（违反即返工）

1. 只有 `interactive` 元素能挂连线；连线只能 元素 → 界面（不能元素→元素）。装饰元素落线时**自动升为交互**，不要改成拒绝。
2. AI 的结构化解析产物**不得回写画布**；画布里的 `note` 永远是纯文本。
3. 视图态（工具/缩放/平移/选中/卡片位置）与文档数据分开，喂 AI 时剔除视图态。
4. 不得实现响应式、元素→元素连线、插件内自带 key 的模型调用。
5. 不占 `replaceRisk: shadows-shipped-ui` 的席位（不遮蔽官方 UI）。
6. 外壳颜色只准用 DSH 主题 token；制图语言（墨迹、网格、刻线）只准用在图纸图元上。
7. 只用官方 API；不确定就查（见下），不要自造。

## 环境速查

- 工作目录：`C:\Users\16693\.dsh\profiles\desktop\node_modules\dsh-UI Flow Mapper`（junction `node_modules\dsh-ui-flow-mapper` 指向本目录）
- 包名：`dsh-ui-flow-mapper`（目录名非法，靠 junction 提供合法包名；**不要在 node_modules 里重命名/迁移目录**）
- DSH 官方源码只在 `C:\dsh\resources\app.asar` 内，路径前缀 `dsh/node_modules/@deepseek-ai/…`
- 读官方源码 / 中文 README：`node tools/asar-read.mjs`（作业文件 `tools/.tmp/job.json`，用法见脚本头部注释）
- 关键接线（已核实）：客户端半边是 `window.__ModuleLoader__.load({ id, factory })` 包络，导出 `apply(ctx)` + `inject`（服务键）；右侧栏 Tab 走 `ctx.sidebarRightTabs.register({ id, kind, title, keepMounted, guide })` + 三处 `ctx.slots.register`（正文 `sidebar.right.pane.tab`、标题 `sidebar.right.pane.tab.title`、入口 `conversation.session.header.utilities`）

## 当前状态

**1.0 核心 + 界面重做 + 图层/固定绑定/工作区保存 已实现并装载**：

- 140 项无头检查 ALL PASS（含 17 种形状与两类连线的全组件深度渲染、连线可见性、笔工具、图层序、固定绑定、宿主保存路由的真实落盘、静态文案键与 CSS 类审计）。
- 连线可见性已修：任意形状都能显式升为交互，落线时自动升格并提示；连线层两色两笔型 + 端点 + 类型标签 + hover 备注。
- 绘图有**圆角矩形**笔；笔架支持拖拽定尺寸、Shift 连续画、单键切笔。
- **图层**：渲染/命中/重排共用文档里的 `zIndex`（此前渲染漏写，重排看起来没效果）。
- **固定＝与界面绑定**：拖拽固定元素移动的是界面卡片，元素保持设计坐标。
- **保存**：按钮替代重做并与撤销换位（重做保留 `Ctrl+Shift+Z`），`Ctrl+S` + 每 60 秒自动保存，落到 `<工作区>/UI Flow Mapper/<文档名>.uiflow.json`；写入由宿主半边 `lib/index.js` 的两条路由完成（官方工作区文件 Remote 只读）；失败自动回退为下载。
- 界面设计说明与自查见 `DESIGN.md`；frontend-design 技能正文（逐字节副本）见 `.design-refs/frontend-design/`。

**改完 `lib/index.js`（宿主半边）必须重启 DSH**：宿主插件在启动时装配，路由不会热更新。客户端半边同路径改内容可热加载。

未决项见纲领 §6.5（只剩"快捷键服务接入"未做）与 §8（Q-01..Q-08，均不阻塞 1.0）。
