# 来源与许可范围（PROVENANCE）

本文件说明**发布出去的这个包里有什么、没有什么、以及各自的权利状态**。

## 一、许可范围

| 范围 | 许可 |
| --- | --- |
| `lib/`、`src/`、`tools/`、`cordis.patch.yml`、`package.json`、文档 | **MIT**（见 [`LICENSE`](./LICENSE)） |
| `icon.svg` | **MIT**（随本项目一起授权） |
| `.design-refs/` | **不随包发布**（见下） |

## 二、不随包发布的东西

- **`.design-refs/`**：Anthropic《frontend-design》插件技能正文的逐字节副本，仅存在于源码仓库，用于记录界面设计的依据。它属于 Anthropic 的插件内容（原文标注 `license: Complete terms in LICENSE.txt`），**不纳入 npm 包**，也不在本项目的 MIT 覆盖范围内。要用它请按上游方式自行安装：
  `claude plugin marketplace add anthropics/claude-code` 然后 `claude plugin install frontend-design@claude-code-plugins`。
- **`UI Flow Mapper/`**：插件运行时**保存用户画布**的目录（默认建在用户会话的工作区里），不属于源码，也不随包发布。

## 三、运行时会碰什么

这个插件不做任何网络请求、不收集遥测、不读写工作区以外的位置。它的两处"动磁盘"行为都写在 `lib/index.js` 里，且都可审：

1. `POST /dsh-ui-flow-mapper/save` —— 把浏览器半边传来的画布文档写进
   `<当前会话工作区>/UI Flow Mapper/<文档名>.uiflow.json`。同名覆盖，目录不存在时创建。
2. `GET /dsh-ui-flow-mapper/status` —— 只回答"会写到哪里"，不写任何东西。

两条路由都是同源校验、仅接受 POST（status 除外）、请求体上限 8 MiB，且**目录由宿主决定**：
浏览器半边只能建议一个文件**名**，该名字会被消毒（去掉路径分隔符与保留字符）后拼进上述目录，
不能借它写到别处。

浏览器半边只从宿主提供的模块基线里取 `react` 与 `react/jsx-runtime`，不引入任何第三方运行时依赖。

## 四、第三方材料的致谢

- 界面设计方向参考了 Anthropic 的 **frontend-design** 技能（见上文，未随包分发）。
- 与 DSH 的接线方式参照了官方包 `@deepseek-ai/dsh-client-ui-sidebar-right`
  与社区插件 `dsh-whale-widget` 的公开实现；两者均为 MIT。
