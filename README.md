# dsh-ui-flow-mapper（UI Flow Mapper）

挂在 **DeepSeek Harness 右侧栏**里的界面跳转图编辑器：像制图一样摆出软件的每个界面、画上元素、连上跳转，导出一份机器可读的画布 JSON + 系统提示词，贴进会话就能让 AI 读出交互逻辑、拆出任务 DAG 与前后端契约。

- 规格（唯一权威）：[`纲领.md`](./纲领.md)
- 施工红线与索引：[`AGENTS.md`](./AGENTS.md)
- 界面设计方向（含 Anthropic **frontend-design** 技能的落地方式）：[`DESIGN.md`](./DESIGN.md)

> 本目录就是**工程本体**（唯一一份）：DSH 通过 `node_modules\dsh-ui-flow-mapper` 这个 junction 指向本目录，所以这里改完就是线上跑的那份。改 `lib/index.js`（宿主半边）后需要重启一次 DSH，其余改动 `node tools/build-client.mjs` 后热加载。

## 怎么打开

1. **会话头部按钮**：会话标题右侧的「流程图」——直接打开并自动展开右侧栏。
2. **右侧栏开始页**：右侧栏「开始」页里的 *UI Flow Mapper* 卡片，点它把本页作为 tab 打开。
3. **面板全屏**：打开后点工具条最右的「面板全屏／还原」，把编辑器铺满右栏（窄栏下强烈建议）。

## 怎么用

界面分三层：上面的**笔架**（两行：动作 + 笔）、中间的**图纸台**（画布）、下面的**规格表**（属性）与**测量条**（状态）。

| 操作 | 结果 |
| --- | --- |
| 点一支笔（矩形／圆角矩形／椭圆／直线／箭头／卡片／按钮／输入框／开关／文字／图片） | 笔架高亮该笔，光标变十字 |
| 在界面上**拖拽** | 按拖出的尺寸落笔；拖拽时跟随显示 `宽 × 高` |
| 在界面上**单击** | 按该形状的默认尺寸落在点击处 |
| 落笔后 | 自动切回选择笔并选中新元素；按住 **Shift** 落笔可连续画 |
| `V R D O L A C B N S T I` | 依次对应：选择／矩形／圆角矩形／椭圆／直线／箭头／卡片／按钮／输入框／开关／文字／图片 |
| `Esc` | 取消当前笔 / 取消连线 / 退出文字编辑 |
| 左键单击界面·元素·连线 | 选中，规格表切到对应面板 |
| 双击界面 | 选中该处最上层元素；文字类元素直接就地编辑 |
| 拖拽元素 / 8 个手柄 | 移动 / 缩放，旁边实时显示坐标或尺寸 |
| 拖拽**固定**的元素 | 移动的是**整个界面**：固定＝元素与界面绑定，两者相对位置不变（要微调元素用规格表的 x/y） |
| 工具条的 ⇧⇧ ⇧ ⇩ ⇩⇩ | 图层：置顶／上移／下移／置底（画布渲染与命中测试共用同一份 `zIndex`） |
| 拖拽界面标题条 | 移动界面卡片（只改画布视图，不改设计数据） |
| 右键元素 | 连一条跳转线 / 连一条覆盖小窗线 / 复制 / 删除 |
| 连线模式下点目标界面 | 落线（`跳转` 实线、`覆盖` 虚线 + 斜纹浮层） |
| 滚轮 | 以光标为中心缩放；空白处拖拽平移 |
| **保存** / `Ctrl+S` | 写入当前会话工作区的 `UI Flow Mapper/` 子文件夹（不存在就建），文件名取文档名 |
| 自动保存 | 每 1 分钟一次，只在改过的时候写；规格表顶部显示保存位置与上次保存时间 |
| 规格表未选中时 | 文档设置、保存位置、校验报告、导出/导入、AI 提示词包 |

**保存失败不会丢东西**：手点保存若写不进去（没有工作区、权限、磁盘），会自动改为下载一份 `.uiflow.json` 并说明原因；自动保存失败只在状态栏提示，不会反复弹下载。

**连线不会"不出现"**：如果起点的形状本来是装饰（比如一个普通矩形），落线时它会自动被设为**交互**元素并提示你 —— 装饰元素不能作为连线起点这条规则仍然成立，只是不再由你去手动改。

## 设计说明（一句话版）

外壳全部继承 DSH 主题，不另起皮肤；制图语言只用在图纸上——8px/80px 双层网格、两种绘图笔墨迹（跳转＝实线+实心方块端点，覆盖＝虚线+空心端点+斜纹浮层）、选中框用四角刻线而不是圆角胶囊；**测量值一律等宽**（坐标、尺寸、缩放、id），其余文案跟随宿主字体。动效只保留两处：新建界面的描边入场、拖拽时跟随的尺寸标注。完整计划与"改掉了哪些 AI 默认脸"见 [`DESIGN.md`](./DESIGN.md)。

## 开发

```bash
node tools/build-client.mjs   # src/client/*.js  ->  lib/client.js（提交产物）
node tools/test-client.mjs    # 115 项无头检查，含全组件深度渲染与静态审计
```

产物 `lib/client.js` 是把 9 个源模块包进 `window.__ModuleLoader__.load({ id, factory })` 的**手写包络**，不需要打包器、不写 JSX。测试除逻辑外还做两项静态审计：**每个 `t('key')` 都在文案表里**、**每个用到的 CSS 类都有样式且没有死类**。

改完 `src/` → build → 客户端热加载新产物（若没生效，先刷新页面）。

## 安装

```bash
# 1) 装进某个 DSH profile（把 desktop 换成你的 profile 名）
dsh plugin --profile desktop add dsh-ui-flow-mapper

# 或者手动两步：先在 profile 里装上依赖，再把包名加进 profile 的 dsh.profile.bundles
npm install dsh-ui-flow-mapper
```

装好后重启一次 DSH：右侧栏会话头部会出现「流程图」入口，右侧栏「开始」页也有一张 *UI Flow Mapper* 卡片。

要求：DSH `0.2.0-rc.2`（见 `package.json` 的 `dsh.compatibility`），Node ≥ 20。运行时不需要安装任何第三方依赖：浏览器半边只从宿主提供的模块基线取 React。

## 发布（维护者）

```bash
npm run build          # src/client/*.js -> lib/client.js（必须，产物随包发布）
npm test               # 143 项无头检查
npm run check:publish  # 发布预检：清单一致性、随包文件集、产物是否比源码旧、占位符
npm pack --dry-run     # 看最终会发布哪些文件（会先自动跑 prepack）
npm publish            # prepack 会自动 build + test + 预检，防止发出过期产物
```

发布前请替换 manifest 里的占位符：`repository` / `homepage` / `bugs` 的 `YOUR-GH-NAME`、`author` 的 `YOUR-NAME`，以及 `LICENSE` 里的版权所有者（预检会把它们标成 warn 而不是 error，方便你先跑通流程）。

**光发 npm 不会出现在 DSH 插件市场里。** 市场（dshmarket）只允许安装精选目录 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 中列出的来源；上架方式是在**那个仓库**提一个 PR 加一条条目（站点与市场会自动收录，通常一天内生效），具体格式见它的 `contributing.md`——条目还带截图，建议先截一张编辑器界面图。

## 目录

```
src/client/strings.js      文案表（zh/en 成对，句子级语气统一）
src/client/model.js        画布 schema、工厂、命中测试、导入校验（无 React）
src/client/store.js        文档 store + 视图态持久化（无 React）
src/client/ai.js           AI 提示词包 / 剪贴板 / 下载 / 读文件
src/client/ui-kit.js       控件 + 笔架图标
src/client/ui-canvas.js    图纸台：网格、卡片、元素、落笔、拖拽、SVG 连线层
src/client/ui-inspector.js 规格表（文档 / 界面 / 元素 / 连线）
src/client/ui-app.js       外壳：笔架、动作、快捷键、提示词弹窗、测量条
src/client/apply.js        浏览器半边入口：样式表、词典、三个阶段注册
lib/index.js               Host 半边（空，与官方 sidebar-right 同构）
tools/asar-read.mjs        只读 asar 提取器（查 DSH 官方源码/中文 README）
.design-refs/              frontend-design 技能的逐字节副本与来源说明
```

## 1.0 边界（有意不做）

响应式布局、元素→元素连线、旋转／动画、插件内自带 API key 的模型调用、后端代码生成与部署（只输出契约）。
