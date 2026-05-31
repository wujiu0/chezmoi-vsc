# chezmoi for VS Code — 实施计划

> **配套文档**:`DESIGN.md`
> **预计周期**:14 个开发日(可压缩到 2 个日历周)
> **里程碑**:M0(脚手架)→ M1(预览)→ M2(状态栏)→ M3(TreeView)→ M4(发布)

---

## 0. 启动前 Checklist

在写第一行代码之前必须完成,否则后面会返工:

- [ ] 决定 publisher 名(D1)
- [ ] 决定扩展 ID(D2),并去 marketplace 搜索确认无冲突
- [ ] 在本地装 chezmoi ≥ 2.40,准备一个测试用 dotfiles repo(可以 fork 一个常见的)
- [ ] 在 Microsoft Partner Center 申请 publisher,拿到 PAT
- [ ] 开 GitHub repo,确定开源协议(建议 MIT,与 chezmoi 上游一致)
- [ ] 跑一遍 `yo code` 生成参考模板,看看最新 VS Code 扩展脚手架结构
- [ ] 给 twpayne 发个 issue 报备(D3),不强求回复,但留个礼貌的招呼

---

## 1. 里程碑总览

| 里程碑                  | 时长 | 产出                      | 验收                                          |
| ----------------------- | ---- | ------------------------- | --------------------------------------------- |
| **M0 脚手架**           | 2 天 | 可激活的空扩展 + CI       | F5 能跑起来,有一条 hello 命令能执行           |
| **M1 预览**             | 3 天 | F1 完整功能               | 打开 `.tmpl` 文件,旁边能看渲染结果,编辑会刷新 |
| **M2 状态栏 + Watcher** | 3 天 | F2 完整功能               | 改 source 文件,状态栏数字会变                 |
| **M3 TreeView + Diff**  | 3 天 | F3 + F4 完整功能          | 侧边栏能看到 pending 列表,点击能打开 diff     |
| **M4 打磨与发布**       | 3 天 | v0.1.0 发布到 marketplace | 能搜到、能装、不崩                            |

---

## 2. M0 — 脚手架(Day 1–2)

### 2.1 仓库结构

```
chezmoi-vscode/
├── .github/
│   └── workflows/
│       ├── ci.yml          # lint + test on push
│       └── release.yml     # tag 触发 publish
├── .vscode/
│   ├── launch.json         # F5 debug 配置
│   └── tasks.json
├── docs/
│   ├── DESIGN.md           # 设计文档
│   ├── PLAN.md             # 本文件
│   └── CONTRIBUTING.md
├── src/
│   ├── extension.ts        # activate / deactivate
│   ├── chezmoi/
│   │   └── cli.ts          # 仅一个 exec 函数,先跑通
│   └── test/
│       ├── runTest.ts
│       └── suite/
│           ├── index.ts
│           └── extension.test.ts
├── images/
│   └── icon.png            # marketplace 图标(128x128)
├── .eslintrc.json
├── .gitignore
├── .vscodeignore           # 控制 vsix 不带源码
├── CHANGELOG.md
├── LICENSE
├── package.json
├── README.md
└── tsconfig.json
```

### 2.2 package.json 关键字段

```json
{
  "name": "chezmoi",
  "displayName": "chezmoi",
  "publisher": "<TBD>",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other", "SCM Providers"],
  "keywords": ["chezmoi", "dotfiles", "configuration"],
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [{ "command": "chezmoi.hello", "title": "Chezmoi: Hello" }]
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "lint": "eslint src --ext ts",
    "test": "node ./out/test/runTest.js"
  }
}
```

`onStartupFinished` 是延迟激活,首版不用 fine-grained event(后面 M2 会改成检测到 chezmoi 仓库才激活,降低无关用户的负担)。

### 2.3 Day 1 任务

- [ ] `yo code` 生成 TypeScript 扩展骨架
- [ ] 把目录结构按上面调整
- [ ] 装 `execa@^8`、`@types/vscode`、`@types/node`
- [ ] 写 `cli.ts`,只实现一个函数:`exec(args: string[]): Promise<{stdout, stderr, code}>`
- [ ] 写 `chezmoi.hello` 命令:跑 `chezmoi --version`,把输出弹 toast

### 2.4 Day 2 任务

- [ ] 配 ESLint + Prettier
- [ ] 配 GitHub Actions CI(npm install / lint / compile / test)
- [ ] 写第一个测试:`cli.exec(['--version'])` 应该返回非空 stdout
- [ ] README 占位(后面 M4 完善)
- [ ] LICENSE、CHANGELOG.md 占位
- [ ] 提交并打 tag `v0.0.1-alpha.0`(不发布,只是为了走通 release workflow 流程)

### 2.5 M0 验收

- F5 启动 extension host,运行 `Chezmoi: Hello`,能看到 chezmoi 版本号 toast
- CI 全绿
- `vsce package` 能生成 .vsix 文件且 < 100KB

---

## 3. M1 — 模板预览(Day 3–5)

### 3.1 新增模块

```
src/
├── chezmoi/
│   ├── cli.ts                  # 扩展:支持 stdin、超时、信号
│   ├── context.ts              # source dir 检测
│   └── paths.ts                # source path ↔ target path 转换
├── features/
│   └── preview/
│       ├── provider.ts         # TextDocumentContentProvider
│       ├── languageInfer.ts    # 从 source filename 推断目标 languageId
│       └── commands.ts         # Open Preview to Side 命令
```

### 3.2 Day 3 任务

- [ ] `cli.ts` 升级:加 `execStdin(args, input): Promise<...>`,加 `timeout` 参数
- [ ] `context.ts`:激活时跑 `chezmoi source-path`,缓存结果,失败时进入降级状态
- [ ] `paths.ts`:实现 source → target 转换
  - 规则:`dot_` → `.`、`private_` 前缀去掉、`.tmpl` 后缀去掉等
  - 写完整单元测试,覆盖 chezmoi 文档列出的所有前缀

### 3.3 Day 4 任务

- [ ] `provider.ts`:实现 `TextDocumentContentProvider`
  - scheme:`chezmoi-preview`
  - URI 格式:`chezmoi-preview:/<encoded-source-path>`
  - `provideTextDocumentContent`:读源文件 → `chezmoi execute-template` → 返回
- [ ] `languageInfer.ts`:从 target path 推断 languageId
  - 简单查表:`.zshrc → shellscript`、`.lua → lua`、`.toml → toml`...
- [ ] 注册命令 `chezmoi.openPreviewToSide`
  - 编辑器右上角加按钮,只在 source dir 内文件可见

### 3.4 Day 5 任务

- [ ] 实现 onChange 刷新
  - 监听 `vscode.workspace.onDidChangeTextDocument`
  - 仅响应 source dir 内文件
  - debounce 300ms,然后 `EventEmitter<Uri>.fire(previewUri)`
- [ ] 错误展示
  - execute-template 失败:返回 `# chezmoi error:\n# <stderr>\n\n<原内容>` 作为预览内容
- [ ] 文件大小保护:> 1MB 直接返回 `# file too large to preview`
- [ ] 写集成测试:用 fixture 仓库,打开 .tmpl,断言预览内容

### 3.5 M1 验收

- 打开 `dot_zshrc.tmpl`,运行命令,右侧出现渲染结果
- 渲染结果有正确的 shell 高亮
- 编辑左侧,300ms 内右侧刷新
- 把 `{{ .chezmoi.os }}` 改成 `{{ .nonexistent }}`,右侧能看到错误信息但不崩
- 关掉预览 tab 再开,内容正常

---

## 4. M2 — 状态栏与 Watcher(Day 6–8)

### 4.1 新增模块

```
src/
├── chezmoi/
│   ├── status.ts               # 解析 status 输出
│   └── queue.ts                # 命令并发控制
├── features/
│   ├── statusBar/
│   │   └── item.ts
│   └── watcher/
│       └── index.ts
└── services/
    └── statusService.ts        # 全局状态服务
```

### 4.2 Day 6 任务

- [ ] `status.ts`:解析 `chezmoi status` 输出
  - 输入:多行文本,每行 `<code1><code2> <path>`
  - 输出:`StatusEntry[]`(path、code1、code2、是否脚本、是否加密)
  - 写完整单元测试,覆盖 git-style 状态码 + chezmoi 特有的 R(script)
- [ ] `queue.ts`:实现读写锁队列
  - 接口:`runRead<T>(fn): Promise<T>`、`runWrite<T>(fn): Promise<T>`
  - 写命令独占;读命令并发但同 key 去重(状态刷新只跑一个)

### 4.3 Day 7 任务

- [ ] `statusService.ts`:全局单例
  - `refresh()`:走 queue,跑 status,parse,通过 EventEmitter 通知订阅者
  - `onDidChange: Event<StatusEntry[]>`
  - 内部缓存上次结果,提供同步读
- [ ] `statusBar/item.ts`:订阅 statusService
  - 按 §6.2 规则渲染
  - 点击 → QuickPick(暂时只放 Apply / Refresh / Show Status)

### 4.4 Day 8 任务

- [ ] `watcher/index.ts`:监听 source dir
  - `vscode.workspace.createFileSystemWatcher(new RelativePattern(sourceDir, '**/*'))`
  - 三个事件 debounce 合并(500ms),统一触发 `statusService.refresh()`
  - 注意:扩展启动时跑一次 refresh
- [ ] `commands`:实现 `Chezmoi: Apply` / `Refresh` / `Show Diff`
  - Apply 通过 queue.runWrite,完成后立刻刷新状态
- [ ] 处理 chezmoi 缺失场景
  - 激活时 `cli.exec(['--version'])` 失败 → 状态栏 warning + 所有命令禁用
  - 弹一次 toast,带"安装 chezmoi"链接

### 4.5 M2 验收

- 状态栏永久驻留,显示正确数字
- 在 source dir 外修改文件,状态栏不动(避开误触发)
- 在 source dir 改文件,500ms 后状态栏数字+1
- 点状态栏 → 选 Apply All → 数字归零
- 卸载 chezmoi 二进制,扩展显示降级状态而非崩溃

---

## 5. M3 — TreeView 与 Diff(Day 9–11)

### 5.1 新增模块

```
src/
├── features/
│   ├── tree/
│   │   ├── provider.ts         # TreeDataProvider
│   │   ├── item.ts             # StatusEntry → TreeItem
│   │   └── commands.ts         # 右键菜单命令
│   └── diff/
│       └── open.ts             # 打开 diff 视图
```

### 5.2 Day 9 任务

- [ ] `tree/provider.ts`:实现 `TreeDataProvider<StatusEntry>`
  - 订阅 statusService.onDidChange,刷新
  - 树结构按 §4.3:Pending / Scripts / Encrypted 三段
- [ ] `tree/item.ts`:每个 entry 渲染成 TreeItem
  - label:文件名
  - description:状态码
  - resourceUri:source 路径(用于颜色)
  - command:点击默认行为 = 打开 diff
- [ ] package.json 注册 viewContainer + view

### 5.3 Day 10 任务

- [ ] `diff/open.ts`:打开 diff 视图
  - 左:`chezmoi-preview://...` URI(M1 已有)
  - 右:`file://<homeDir>/<target>` URI
  - 调用 `vscode.diff` 命令
  - 标题:`<filename> (chezmoi ↔ home)`
- [ ] 右键菜单完整实现(见 §4.3):Apply this file / Re-add / Forget / Open Source / Open Target / Copy Target Path
- [ ] `forget` 加二次确认对话框

### 5.4 Day 11 任务

- [ ] `Chezmoi: Add Current File` 命令
  - 仅在 home dir 内文件激活时可用
  - 用 `vscode.window.activeTextEditor` 判断
  - 跑 `chezmoi add <path>`,刷新状态
- [ ] `Chezmoi: Edit Config` 命令
  - 探测 `~/.config/chezmoi/chezmoi.{toml,yaml,json}` 哪个存在,打开
- [ ] `Chezmoi: Open Source Directory` 命令
  - `executeCommand('vscode.openFolder', sourceDir, true)` (新窗口)
- [ ] OutputChannel:所有 chezmoi 命令的 stdout/stderr 都写一份到 channel,便于 debug

### 5.5 M3 验收

- 侧边栏 chezmoi 图标可见,点击展开 TreeView
- 列表实时反映 pending 文件
- 点击文件 → 自动打开 diff
- 右键 → Apply this file → 文件消失出列表
- 在 home dir 里随便 touch 一个文件,跑 Add Current File,文件出现在 TreeView 里

---

## 6. M4 — 打磨与发布(Day 12–14)

### 6.1 Day 12 — 打磨

- [ ] 错误处理大扫除:遍历所有 catch,确保有 user-facing message
- [ ] 文案审查:所有 toast、command title、配置 description 过一遍
- [ ] 中文界面:checkpoint — 暂不做 i18n,只用英文(后续根据用户反馈再加)
- [ ] 性能 profile:测一遍 §7 表格里的指标
- [ ] 内存泄漏检查:重复打开/关闭预览 50 次,看内存是否回收
- [ ] 跨平台手测:macOS / Linux / Windows 各跑一遍主流程

### 6.2 Day 13 — 文档与素材

- [ ] README.md 完整版
  - Features 章节,每个功能配 GIF
  - 安装、配置、FAQ
  - 推荐组合安装的扩展(BasixKOR 的高亮)
  - 链接到 DESIGN.md 和上游 chezmoi
- [ ] CHANGELOG.md 写 0.1.0 内容
- [ ] icon.png 准备(128×128,PNG)
- [ ] 录 3 个 GIF(预览、状态栏、TreeView)
  - 用 LICEcap 或 Kap,控制在 < 2MB

### 6.3 Day 14 — 发布

- [ ] `vsce package` 检查 vsix 内容,确保没有 src/、node_modules/
- [ ] 在干净环境(Docker / 同事电脑)装一遍,跑一遍主流程
- [ ] `vsce publish` 发到 marketplace
- [ ] 同步发到 Open VSX(可选,D6)
- [ ] 发 GitHub release,带 vsix 附件
- [ ] 在 chezmoi 上游 discussion #1737 贴个回复:"做了个 MVP,欢迎试用反馈"
- [ ] 发个 Reddit (r/unixporn / r/commandline) 帖子,带截图

---

## 7. 风险与对策

| 风险                                        | 影响 | 概率 | 对策                                                               |
| ------------------------------------------- | ---- | ---- | ------------------------------------------------------------------ |
| chezmoi 命令输出格式跨版本不稳              | 中   | 中   | 启动时检测版本,< 2.40 直接降级。CI 矩阵跑 3 个版本                 |
| `execute-template` 在加密文件上会卡住等密码 | 高   | 中   | 预览前用 `chezmoi managed` 检查 attr,加密文件跳过自动预览,改为按需 |
| Windows 路径处理出错                        | 中   | 高   | 全程用 `vscode.Uri`,不手拼路径;CI 加 Windows runner                |
| Watcher 在大型 source dir 卡顿              | 中   | 低   | 默认监听 `**/*`,提供配置项 `chezmoi.watcher.exclude`               |
| 用户没装 chezmoi 装了我们                   | 低   | 高   | 激活时检测,降级模式 + 一次性安装提示                               |
| 双向修改冲突(MM)处理复杂                    | 中   | 中   | MVP 只标红,不提供自动合并;v2 接入 chezmoi merge                    |
| publisher 申请被卡                          | 高   | 低   | 启动前就申请,不要等到 M4                                           |

---

## 8. 后续节奏

发布 v0.1.0 之后:

- **Week 1**:监控 issues,只修 bug 不加 feature
- **Week 2**:根据 marketplace 评论 + GitHub issue 的高频请求决定 v0.2 内容
- **Month 2**:启动 v1.0(LSP 那个大头)的设计文档

不订强 KPI,但建议跟踪:

- marketplace 装机数(每周看一次)
- GitHub stars 增长(自然指标)
- issue 平均响应时长(质量指标)

---

## 9. 第一周每日的具体可见产出

| Day | 你应该能给我看什么                                 |
| --- | -------------------------------------------------- |
| 1   | F5 跑起来,执行命令弹 toast                         |
| 2   | CI 绿色,vsix 能打包                                |
| 3   | 单元测试:source path → target path 转换全过        |
| 4   | 命令面板执行 Open Preview,右侧出现内容(可能没高亮) |
| 5   | 编辑左侧,右侧自动刷新;错误情况能优雅显示           |
| 6   | 单元测试:status 解析全过                           |
| 7   | 状态栏数字能动,但还没接 watcher                    |
| 8   | 改 source 文件,状态栏自动变化;Apply All 工作       |
| 9   | TreeView 可见,但点击还不打开 diff                  |
| 10  | 点击文件能看到 diff                                |
| 11  | 右键菜单完整,Add Current File 工作                 |
| 12  | 三个平台手测过,有 bug 列表                         |
| 13  | README 写完,GIF 录好                               |
| 14  | marketplace 上线,能搜到                            |

每天结束 push 一个 daily branch,我们一起复盘。
