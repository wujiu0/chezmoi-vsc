# chezmoi for VS Code — 产品设计文档

> **文档版本**：v0.1 (MVP)
> **状态**:Draft
> **目标读者**:扩展开发者、早期用户、潜在贡献者

---

## 1. 背景与定位

### 1.1 为什么做这个

[chezmoi](https://www.chezmoi.io/) 是目前最强大的 dotfiles 管理工具之一,支持模板、加密、跨机器差异化配置。但它的核心交互模型是 CLI:用户需要在终端里反复 `chezmoi edit` / `chezmoi diff` / `chezmoi apply`,在 source dir 和 home dir 之间来回切换。

**VS Code 是 chezmoi 用户最主流的编辑器之一**,但目前生态里没有一个把 chezmoi 工作流"装"进编辑器的扩展:

| 现有方案 | 局限 |
|---|---|
| `BasixKOR/vscode-chezmoi` | 只做 Go Template 语法高亮 |
| `jorcelinojunior/chezmoi-tools` | 命令面板包装,无可视化、无预览 |
| `helm-intellisense` + `files.associations` hack | 借用 Helm 高亮,治标不治本 |
| 上游 issue #1737 | 社区呼吁有 LSP 扩展,无人推进 |

### 1.2 用户画像

**主要目标用户**:已经在用 chezmoi、且日常编辑器是 VS Code 的开发者。

具体特征:
- 拥有 2 台以上设备(笔记本/工作机/服务器),需要跨机器同步配置
- 至少有几个 `.tmpl` 文件,使用过 `{{ .chezmoi.os }}` 这类变量
- 编辑 dotfiles 的频率大约每周 1–3 次
- 痛过"改完 source 忘了 apply"或"不知道模板渲染后长什么样"

**非目标用户**:还没决定要不要用 chezmoi 的人(不通过扩展做 onboarding)。

### 1.3 核心痛点(用户验证)

| 痛点 | 当前 workaround | 我们怎么解 |
|---|---|---|
| 不知道当前 `.tmpl` 渲染结果 | 手动 `chezmoi cat` / `execute-template` | 编辑器旁实时预览面板 |
| 改了 source 忘了 apply | 自己心里记 / git status 提醒 | 状态栏 pending 数字 + 一键 apply |
| 没有可视化 status/diff | `chezmoi status` + 在终端看色块 | 侧边栏 TreeView + 原生 diff 视图 |

---

## 2. MVP 范围

### 2.1 必做(In Scope)

**F1 — 模板实时预览**
- 在打开的 chezmoi source 文件旁开预览面板
- 内容是 `chezmoi execute-template < <当前文件>` 的输出
- 文件编辑时 debounce 刷新(默认 300ms)
- 渲染失败时显示错误信息,不崩溃

**F2 — Apply 提醒与一键操作**
- 状态栏永久驻留一个 chezmoi 图标 + pending 数字
- source dir 文件变化时自动刷新计数
- 点击状态栏 → QuickPick 菜单:Apply All / Show Diff / Show Status / Refresh

**F3 — Status 侧边栏**
- Activity Bar 一个 chezmoi 图标,点击展开 TreeView
- 树根:`Pending Changes (n)`
- 叶子:每个有差异的文件,带状态徽章(M / A / D / R / 加密锁标)
- 文件点击 → 打开 diff(左:source 渲染后,右:home 现状)
- 右键菜单:Apply this file / Re-add / Forget / Open Source

**F4 — 基础命令面板**
- `Chezmoi: Apply`
- `Chezmoi: Diff`
- `Chezmoi: Status`
- `Chezmoi: Edit Config`
- `Chezmoi: Open Source Directory`
- `Chezmoi: Add Current File`(在 home dir 文件上触发)

### 2.2 不做(Out of Scope, v1+)

- Go Template 语法高亮(已有扩展,我们在 README 推荐安装)
- 模板变量智能提示 / LSP(v2 目标,见第 9 节)
- chezmoi init 引导流程
- 加密/解密 GUI 操作(v2)
- 远程仓库 git push/pull 集成(VS Code 已有 Git 扩展)
- Web 版 VS Code 支持(本地工具,不适用)

### 2.3 不做的理由(避免范围蔓延)

- **不做语法高亮**:已有 `BasixKOR/vscode-chezmoi`,做了就是重复劳动且分散维护精力
- **不做 LSP**:工程量级是 MVP 的 5 倍以上,先验证 MVP 价值再投入
- **不做 init 流程**:目标用户是已上手用户,新手引导是另一个产品

---

## 3. 用户旅程

### 3.1 首次使用

```
1. 用户在 marketplace 搜 "chezmoi" → 安装本扩展
2. 重启 / reload window
3. 扩展激活时:
   - 检测 PATH 里有没有 chezmoi 二进制 → 没有则提示并附安装链接
   - 跑 `chezmoi source-path` 确定 source dir → 失败则提示 init
   - 跑 `chezmoi status` 初始化状态栏数字
4. 状态栏出现 `$(sync) chezmoi: 0`,Activity Bar 出现 chezmoi 图标
5. 用户打开 source dir 里的任意 .tmpl 文件 → 自动询问是否开预览
```

### 3.2 日常编辑流(F1 主路径)

```
1. 用户打开 ~/.local/share/chezmoi/dot_zshrc.tmpl
2. 命令面板:Chezmoi: Open Preview to Side
3. 右侧出现渲染后内容,带正确的 shell 语法高亮
4. 用户编辑左侧文件 → 右侧 300ms 后刷新
5. 用户保存 → 状态栏数字从 0 变成 1
6. 用户点状态栏 → 选 Apply All → 完成
```

### 3.3 检查变化流(F2 + F3 主路径)

```
1. 用户从另一台机器 git pull 拿到了新 commit
2. 切回当前机器,VS Code 状态栏显示 `chezmoi: 3`
3. 点击状态栏 → 选 Show Status
4. 侧边 TreeView 展开,看到 3 个文件:
   M dot_gitconfig
   A dot_config/nvim/init.lua
   M dot_zshrc.tmpl
5. 点 dot_zshrc.tmpl → 打开 diff,左侧渲染后内容、右侧 home 现状
6. 看完无问题 → 右键 → Apply this file
```

---

## 4. 详细功能设计

### 4.1 F1 — 模板预览

**触发方式**
- 命令:`Chezmoi: Open Preview to Side`(主)
- 编辑器标题栏按钮:打开 `.tmpl` 文件时显示一个 preview 图标
- 配置项 `chezmoi.autoPreviewOnOpen`(默认 false)开启时,自动打开

**实现机制**
- 注册 `TextDocumentContentProvider`,scheme = `chezmoi-preview`
- 预览 URI 格式:`chezmoi-preview://render/<原文件相对路径>?<时间戳>`
- `provideTextDocumentContent` 内部:
  1. 找到原文件的真实路径
  2. `cat <file> | chezmoi execute-template`(用 stdin 而非 `-f`,避开必须在 source 里的限制)
  3. 返回 stdout
  4. 报错时返回带 `--- chezmoi error ---` 前缀的 stderr
- 编辑变更:用 `EventEmitter<Uri>.fire(uri)` 触发刷新
- Debounce:`lodash.debounce` 300ms,可配置

**语法高亮**
- 利用 chezmoi 命名约定推断目标文件名:
  - `dot_zshrc.tmpl` → `.zshrc` → shellscript
  - `dot_config/nvim/init.lua.tmpl` → `init.lua` → lua
- 通过 `vscode.workspace.openTextDocument({ content, language })` 指定 languageId
- 推断失败则不指定,让 VS Code 自动检测

**性能保护**
- 文件 > 1MB 时不预览,提示用户文件过大
- 单次 execute-template 超过 5s 视为超时,kill 进程

### 4.2 F2 — 状态栏与提醒

**显示规则**

| 状态 | 显示 |
|---|---|
| pending = 0 | `$(check) chezmoi` |
| pending > 0 | `$(sync) chezmoi: N` |
| chezmoi 未安装 | `$(warning) chezmoi: not found` |
| 命令执行中 | `$(sync~spin) chezmoi: working...` |

**点击行为**
- 弹出 QuickPick,选项动态生成:
  - 若 pending > 0:`Apply All`、`Show Diff`、`Show Status`
  - 始终显示:`Refresh`、`Open Source Directory`、`Settings`

**自动刷新触发**
- `FileSystemWatcher` 监听 source dir 全量(`**/*`)
- 任何 add/change/delete 事件 → debounce 500ms → 跑 `chezmoi status` → 更新数字
- 用户手动跑 apply 命令 → 立即刷新

**并发控制**
- chezmoi 持写锁的命令(apply/add/edit/forget/import/init/state/unmanage/update)排队执行
- 读命令(status/diff/verify)允许并发,但同一个 status 调用做去重
- 实现:简单的 mutex queue,1 个 in-flight 写命令 + 最多 1 个 pending 读命令

### 4.3 F3 — Status TreeView

**树结构**

```
Chezmoi
├─ Pending Changes (3)
│  ├─ [M ] dot_gitconfig
│  ├─ [ A] dot_config/nvim/init.lua
│  └─ [MM] dot_zshrc.tmpl       ← 双向修改冲突
├─ Scripts
│  ├─ [R ] run_once_install-packages.sh
│  └─ [R ] run_onchange_setup-fonts.sh
└─ Encrypted (collapsed)
   └─ encrypted_private_id_rsa.age
```

**状态码映射**(基于 `chezmoi status` 输出)

| code | 含义 | 图标 |
|---|---|---|
| `M ` | source 已变更,apply 会更新 home | 蓝色圆点 |
| ` M` | home 已变更,需 re-add | 黄色三角 |
| `MM` | 双向都改了,需手动合并 | 红色叹号 |
| `A ` | source 新增 | 绿色加号 |
| `D ` | source 删除 | 灰色减号 |
| `R ` | 脚本待运行 | 紫色播放 |

**Diff 打开方式**
- 左侧:`chezmoi-preview://render/<file>`(模板渲染后)
- 右侧:`file://<home>/<target>`(home 现状)
- 用 `vscode.diff` 命令:`vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title)`
- 标题:`<filename> (source ↔ home)`

**Context Menu**

| 菜单项 | 命令 | 适用 |
|---|---|---|
| Apply this file | `chezmoi apply <target>` | 所有 |
| Re-add from home | `chezmoi re-add <target>` | M/MM |
| Forget | `chezmoi forget <target>` | 所有,需二次确认 |
| Open Source | 打开 source file | 所有 |
| Open Target | 打开 home file | 所有 |
| Copy Target Path | clipboard write | 所有 |

### 4.4 F4 — 命令面板

所有命令前缀 `Chezmoi:`,见 §2.1。

每个命令的实现细节:
- `Apply`:`chezmoi apply`,完成后强制刷新 status
- `Diff`:`chezmoi diff` → 打开一个 read-only 文档显示输出
- `Status`:聚焦 TreeView,刷新
- `Edit Config`:打开 `~/.config/chezmoi/chezmoi.{toml,yaml,json}` (按存在的那个打开)
- `Open Source Directory`:`vscode.commands.executeCommand('vscode.openFolder', sourceDirUri, true)`
- `Add Current File`:仅在 home dir 文件激活时可用,跑 `chezmoi add <currentFile>`

---

## 5. 技术架构

### 5.1 模块依赖

```
extension.ts (entry)
  │
  ├─ ChezmoiCli ────────── execa 封装,所有命令进出走这里
  │   ├─ exec(args[]): Promise<{stdout, stderr, code}>
  │   ├─ stream(args[], stdin?): AsyncIterator
  │   └─ checkInstalled(): Promise<boolean>
  │
  ├─ ChezmoiContext ────── 全局状态:source dir、binary path、config
  │   └─ 启动时一次性 resolve,变更通过 EventEmitter 广播
  │
  ├─ StatusService ─────── 解析 status 输出,管理 pending 列表
  │   ├─ refresh(): Promise<StatusEntry[]>
  │   └─ onDidChange: Event<StatusEntry[]>
  │
  ├─ Watcher ───────────── FileSystemWatcher + debounce
  │   └─ 触发 StatusService.refresh()
  │
  ├─ PreviewProvider ───── TextDocumentContentProvider
  │   └─ 渲染失败时返回结构化错误
  │
  ├─ TreeProvider ──────── TreeDataProvider<StatusEntry>
  │   └─ 订阅 StatusService.onDidChange
  │
  ├─ StatusBar ─────────── 订阅 StatusService.onDidChange
  │
  ├─ Commands ──────────── 所有命令注册集中在此
  │
  └─ CommandQueue ──────── 读写互斥的命令队列
```

### 5.2 关键依赖库

| 库 | 用途 | 备选 |
|---|---|---|
| `execa` | 调用 chezmoi 二进制 | child_process(更原始) |
| `vscode` | 扩展 API | (不可替换) |
| `lodash.debounce` | 防抖 | 自己写 setTimeout |

刻意不引入:lodash 全包、moment、axios。MVP 阶段保持依赖最小。

### 5.3 错误处理策略

| 场景 | 处理 |
|---|---|
| chezmoi 二进制缺失 | 状态栏显示 warning,所有命令禁用,首次激活弹一次安装提示 |
| `chezmoi source-path` 失败 | 状态栏显示 `not initialized`,提示用户运行 init |
| `execute-template` 报错 | 预览面板显示错误信息,不抛 toast(高频操作) |
| `apply` 失败 | 弹 toast 显示 stderr 头 200 字符,详情写入 OutputChannel |
| 加密文件解密失败(密码错) | 预览面板显示 `[encrypted - decryption failed]`,不重试 |

### 5.4 配置项 schema

```jsonc
{
  "chezmoi.executable": {
    "type": "string",
    "default": "chezmoi",
    "description": "Path to chezmoi binary"
  },
  "chezmoi.sourceDir": {
    "type": "string",
    "default": "",
    "description": "Override source directory (empty = auto-detect via `chezmoi source-path`)"
  },
  "chezmoi.preview.autoOpen": {
    "type": "boolean",
    "default": false,
    "description": "Automatically open preview when opening a .tmpl file"
  },
  "chezmoi.preview.debounce": {
    "type": "number",
    "default": 300,
    "description": "Milliseconds to wait before refreshing preview on edit"
  },
  "chezmoi.preview.maxFileSize": {
    "type": "number",
    "default": 1048576,
    "description": "Skip preview for files larger than this (bytes)"
  },
  "chezmoi.statusBar.enabled": {
    "type": "boolean",
    "default": true
  },
  "chezmoi.notifications.applyReminder": {
    "type": "string",
    "enum": ["off", "statusBarOnly", "toast"],
    "default": "statusBarOnly",
    "description": "How to notify when source files change"
  },
  "chezmoi.advanced.executeTemplateArgs": {
    "type": "array",
    "items": { "type": "string" },
    "default": [],
    "description": "Extra arguments to pass to `chezmoi execute-template`"
  }
}
```

---

## 6. UI 设计

### 6.1 命名与图标

- 扩展显示名:**chezmoi**(VS Code marketplace)
- Publisher:待定(见 §10)
- Activity Bar 图标:chezmoi 官方 logo 单色化的 SVG(向上游确认 license)
- 状态栏图标:`$(sync)` / `$(check)` / `$(warning)`(用内置 codicon,降低首版美术成本)

### 6.2 状态栏

```
┌─────────────────────────────────────────────────┐
│  ... [Ln 12, Col 4]  [Spaces: 2]  ⟳ chezmoi: 3 │
└─────────────────────────────────────────────────┘
                                     ↑
                                     hover: "3 pending changes - Click to apply"
```

### 6.3 TreeView 状态徽章

不用自定义图标,用 codicon + 颜色 description:

```
▾ Pending Changes (3)
    ● dot_gitconfig                          M
    ● dot_zshrc.tmpl                         MM
    ● dot_config/nvim/init.lua               A
```

(实际渲染中 `M` / `MM` / `A` 用 `description` 字段显示,颜色通过 `resourceUri` + 主题色映射)

### 6.4 预览 tab 标题

`Preview: dot_zshrc.tmpl`(图标用 `preview` codicon)

### 6.5 命令面板调用

输入 "chezmoi" 应能在 200ms 内列出所有命令,按使用频率排序:

```
> chezmoi
  Chezmoi: Apply
  Chezmoi: Open Preview to Side
  Chezmoi: Show Diff
  Chezmoi: Show Status
  Chezmoi: Add Current File
  ...
```

---

## 7. 性能与质量目标

| 指标 | 目标 |
|---|---|
| 扩展激活时间(冷启动) | < 500ms |
| status 命令响应 | < 1s(50 文件以下) |
| 预览首次渲染 | < 800ms |
| 预览 debounced 刷新 | < 500ms(感知层) |
| 内存占用 | < 50MB |
| 包体积(发布到 marketplace) | < 500KB |

测试覆盖:
- 单元测试覆盖 CLI 输出解析(status / managed / data)
- 集成测试:在 GitHub Actions 跑真实 chezmoi 二进制
- 手动测试矩阵:macOS / Linux / Windows × chezmoi 2.50+

---

## 8. 兼容性

### 8.1 chezmoi 版本

- 最低支持:chezmoi 2.40+(发布于 2024 年中,大部分用户已升级)
- 启动时检测版本,过低则降级到只读模式

### 8.2 VS Code 版本

- 最低 `engines.vscode` ≥ 1.85(2023-12 发布,主流稳定)

### 8.3 平台

- macOS、Linux、Windows 全支持
- 路径处理统一走 `vscode.Uri` 和 `path.posix` / `path.win32` 区分
- WSL / Remote SSH:扩展声明 `extensionKind: ["workspace"]`,跑在 host 侧

### 8.4 跟其他扩展协作

- 不与 `BasixKOR/vscode-chezmoi` 冲突,在 README 推荐组合安装
- 与 GitLens 共存:预览面板的 Git history 不接管
- 与 ESLint/Prettier 共存:不对 .tmpl 文件应用格式化器

---

## 9. v2 路线图(参考,不在 MVP 内)

| 特性 | 说明 |
|---|---|
| **模板 LSP** | 提供 `.chezmoi.*` 变量补全、sprig 函数 hover 文档、execute-template 实时错误下划线 |
| **Init 引导** | 命令面板触发 `chezmoi init` 流程,引导填写仓库地址 |
| **加密管理** | GUI 添加/移除 encrypted attr,查看密钥配置 |
| **Diff 内联应用** | 在 diff 视图里支持逐 hunk apply |
| **Template Snippets** | 常用模板片段(os 判断、hostname 判断)snippet |
| **Cheat Sheet 面板** | 受新用户欢迎,WebView 展示常用命令 |

---

## 10. 待决策事项

| ID | 问题 | 截止 |
|---|---|---|
| D1 | publisher 名称?个人 ID 还是新建 org? | 启动开发前 |
| D2 | 扩展 ID 取 `chezmoi`、`chezmoi-vscode`、还是 `vscode-chezmoi`? | 启动开发前 |
| D3 | 是否找上游 (twpayne) 沟通,看能否官方背书? | MVP 发布前 |
| D4 | 图标:复用 chezmoi 官方 logo 还是另设计? | beta 前 |
| D5 | telemetry 是否加?加的话用 ApplicationInsights 还是不加? | beta 前 |
| D6 | open VSX 同步发布?(VSCodium 用户) | v1.0 前 |

---

## 附录 A:chezmoi 命令参考(本扩展用到的)

| 命令 | 用途 | 锁类型 |
|---|---|---|
| `chezmoi source-path` | 获取 source dir | 无 |
| `chezmoi status` | 列出 pending | 读 |
| `chezmoi managed --format=json` | 列全部受管文件 | 读 |
| `chezmoi diff <target>` | 单文件 diff | 读 |
| `chezmoi cat <target>` | 渲染后内容 | 读 |
| `chezmoi execute-template` | 任意模板渲染(stdin) | 无 |
| `chezmoi apply [target]` | 应用 | 写 |
| `chezmoi add <homefile>` | 加入管理 | 写 |
| `chezmoi re-add [target]` | 把 home 改动同步回 source | 写 |
| `chezmoi forget <target>` | 移除管理(保留文件) | 写 |
| `chezmoi data --format=json` | 获取模板变量(v2 用) | 无 |

## 附录 B:参考资料

- chezmoi 官方文档:https://www.chezmoi.io/
- 上游 LSP 讨论:https://github.com/twpayne/chezmoi/discussions/1737
- VS Code 虚拟文档指南:https://code.visualstudio.com/api/extension-guides/virtual-documents
- 既有扩展参考:https://github.com/jorcelinojunior/chezmoi-tools
