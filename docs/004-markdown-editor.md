# Markdown 双栏编辑器

## 1. 功能范围

`/docs/[id]` 是文档的主编辑页面，提供 Markdown 源码编辑、实时预览、自动保存、本地草稿恢复、历史版本、标签、双链、文件粘贴、AI 辅助、分享、导出和文档关系浏览。

编辑器以“任何未经确认的本地内容都不能静默丢失，任何基于旧版本的写入都不能静默覆盖新版本”为最高约束。辅助功能失败时，正文编辑、本地草稿和手动重试仍应可用。

## 2. 代码边界

编辑器实现位于 `web/src/app/docs/[id]`，核心边界如下：

- `EditorPageClient`：页面级组合、路由、加载错误处理，以及 AI、标签、分享等独立功能接入。
- `useEditorSession`：组合正文缓冲区、保存队列、本地持久化、自动保存和冲突入口。
- `useEditorBuffer`：维护正文快照、即时脏状态、实时标题、统计和预览快照。
- `useEditorSaveQueue`：唯一的远端正文写入状态机。
- `useEditorPersistence`：草稿写入、离页 flush 和本地存储故障提示。
- `useAutosaveScheduler`：idle/max-wait 自动保存和恢复在线后的重试。
- `EditorShell`：页面可见结构，只接收 `session`、`commands`、`ui` 三组显式契约。
- `EditorOverlayHost`：AI、预览、快速打开、相似文档、文档上下文抽屉和格式弹层。
- `EditorContextRail` / `EditorContextDrawer`：宽屏布局内右栏和窄屏抽屉的两种外壳，共用 Outline / Details 互斥内容结构。
- `useEditorContextRail`：维护 Outline / Details 视图、Details tab、抽屉和折叠偏好；切换文档时重置视图与 tab。
- `DetailsPanelContent` / `DetailsShareContent`：Summary、History、Share、导出和删除的纯内容组件，不自行创建定位外壳。
- `SplitPane`：桌面分栏比例、像素最小宽度和键盘/指针交互。
- `editor-contracts.ts`：页面组合层与渲染层之间的显式接口，组件 Props 不依赖 Hook 推断返回类型。

AI、标签、分享、相似文档继续使用独立 Hook，不进入编辑会话状态，避免光标或正文变化引起无关功能重算。

## 3. 正文真源和派生状态

CodeMirror 文档是编辑器挂载后的交互真源。所有输入入口最终都必须通过 `publishContent` 发布当前正文，包括键盘输入、格式命令、双链、AI 应用、上传占位替换、撤销重做和版本恢复。

发布正文时同步更新：

- `contentRef.current`，供离页、保存和异步回调读取最新值；
- React 正文快照；
- 与最近服务端确认正文比较得到的 dirty 状态；
- 从正文推导的标题；
- 本地草稿写入计划；
- 预览和统计更新计划。

dirty 不依赖预览防抖。用户输入发生后，同一轮 React 更新内保存按钮即可进入可用状态，离页处理也能从 ref 读取最新正文。

标题取第一条非空行：ATX 一级标题去除 `# `，Setext 标题识别下一行的 `=`，其他首行作为标题。无有效标题时仍保留本地草稿，但不自动同步到服务器，并在状态栏提示补充标题。

词数优先使用 `Intl.Segmenter` 的 word 粒度和 `isWordLike`；运行环境不支持时回退空白分词。字符数按 JavaScript 字符串长度计算。

## 4. 加载与草稿恢复

草稿存储 Key 为 `mnote:draft:{documentId}`。当前 schema 为 v2：

```json
{
  "version": 2,
  "docId": "document-id",
  "content": "",
  "baseRevision": 17,
  "baseContentHash": "sha256",
  "updatedAt": 1784350000
}
```

空字符串是有效正文，不能用 truthy 判断草稿是否存在。读取草稿时校验 schema、文档 ID 和字段类型；损坏或属于其他文档的数据不进入编辑器。

加载后的决策规则：

1. 草稿内容与服务端正文相同：删除冗余草稿，使用服务端正文。
2. v2 草稿的 base revision/hash 与服务端当前基准一致：恢复草稿并标记本地修改。
3. base 不一致：显示不可跳过的恢复对话框，由用户选择本地版本或服务端版本，也可先下载本地 Markdown。
4. 旧 schema 草稿：由于缺少可靠基准，进入同一恢复对话框，不自动覆盖服务器。

恢复对话框出现前不挂载编辑器，避免未决正文被后台自动保存。

## 5. 本地持久化和离页保护

dirty 正文变化后，草稿在短延迟内写入 `localStorage`。以下事件不等待定时器，直接从 ref flush：

- `pagehide`；
- 页面进入 `hidden`；
- 编辑器会话卸载；
- 编辑页内部路由跳转动作执行前。

远端确认的正文与当前最新正文一致后才能删除草稿。保存请求进行期间继续输入时，成功响应只确认请求快照，不得删除较新的本地草稿。

存储配额、权限或序列化失败不会阻止继续编辑。页面显示“本地备份不可用”，并在用户关闭页面前启用浏览器离开确认。下一次草稿写入成功后解除该故障状态。

## 6. 保存协议

### 6.1 请求与响应

HTTP `PUT /api/v1/documents/:id` 的正文写入请求包含：

```json
{
  "title": "Document title",
  "content": "# Document title\n...",
  "base_revision": 17,
  "save_seq": 18
}
```

`base_revision` 是并发正确性的依据，表示用户编辑所基于的服务端修订。`save_seq` 仅用于滚动升级兼容，不承担乐观锁语义。

服务端在事务和文档行锁内比较基准：

- 基准等于当前 `content_revision`：接受写入，由服务端生成 `current + 1` 的新修订。
- 基准不等：不修改文档、版本、标签、链接、资产关系或异步处理状态，返回 `accepted=false` 和 `reason=revision_conflict`。

成功与冲突响应只返回修订、hash 和时间等元数据，不回传正文。冲突对话框通过独立 GET 获取当前服务端正文。

Web 请求缺少正数 `base_revision` 时，服务端返回业务码 `10000015`（`editor client update required`）且不写库。内部可信写入可不提供 base，由服务端持锁后递增修订。

### 6.2 保存状态机

编辑器同步状态只有以下六种：

| 状态 | 含义 | 行为 |
|---|---|---|
| `SYNCED` | 当前正文已被服务端确认 | 保存按钮禁用 |
| `LOCAL_CHANGES` | 有本地修改，尚无请求 | 安排自动保存，允许手动保存 |
| `SAVING` | 一个请求在途 | 保持可编辑 |
| `QUEUED` | 在途期间产生了更新快照 | 当前请求结束后只发送最新快照 |
| `ERROR` | 网络、鉴权或服务器失败 | 暂停定时保存，显示 Retry |
| `CONFLICT` | base revision 落后 | 停止队列和自动保存，等待明确决策 |

同一会话最多一个正文保存请求在途。新的请求只替换待发送快照，不建立并发写入通道。

网络错误保留失败快照和本地草稿。用户可手动 Retry；浏览器从离线恢复 online 时自动重试一次。冲突不能通过提高序号自动重试。

### 6.3 冲突决策

冲突对话框不可通过 Escape 或背景点击关闭，提供：

- 使用服务端版本：替换编辑器正文，更新本地基准并清理草稿。
- 保留我的版本：先以 GET 取得的服务端元数据重新同步基准，再把当前本地正文作为一次新保存提交；如果期间再次冲突，重新进入冲突状态。
- 下载我的版本：导出本地 Markdown，不改变状态。

在用户完成选择前，页面保持可编辑且持续更新本地草稿，但不向服务器 drain。

## 7. 自动保存

自动保存与手动保存共用同一个保存队列：

- 停止输入约两秒后触发 idle 保存；
- 持续输入时最长约十秒触发一次 max-wait 保存；
- `ERROR` 和 `CONFLICT` 暂停自动保存；
- 无标题内容只保存在本地；
- 自动保存始终从 `contentRef` 读取最新正文。

`Ctrl/Cmd + S` 触发同一队列，不能绕过 base revision 或建立第二条保存链路。

## 8. 编辑与格式命令

Markdown 命令实现集中在 `commands/markdown-commands.ts`。工具栏和斜杠菜单调用同一语义命令，不直接叠加字符串前缀。

重要规则：

- H1/H2/H3 互相替换，再次点击同级标题时移除标题标记。
- bullet、ordered、task 和 quote 按各自语义转换，列表标记不叠加。
- ordered list 在多行选区内连续编号。
- 选区结束位置位于下一行行首时，不修改下一行。
- 无选区的行内命令插入成对 marker，并把光标放到可输入位置。
- Link、代码块和表格使用固定占位与光标映射。
- 所有修改通过 CodeMirror transaction 进行，保留 selection、撤销栈和输入法状态。

颜色和字号属于现有 Markdown HTML 扩展，通过受控的 legacy wrap 入口生成 `<span>`，不扩散为通用字符串格式化接口。

## 9. 预览与滚动同步

预览和统计与 dirty 更新分离：

- 普通正文约 200ms 防抖；
- 超过 50,000 字符的正文约 500ms 防抖；
- React 派生视图通过 transition 更新；
- 更新超过 250ms 时，预览顶部显示非遮挡式进度提示。

Markdown 预览的 `h1-h6`、`p`、`li`、`pre`、`blockquote`、`table` 和 `hr` 带 `data-source-line`，用于渲染诊断和其他源码关联能力。滚动同步不直接依赖这些属性：`[toc]` 展开、提示块转换等预处理会改变传给 Markdown AST 的行号，因此同步锚点必须使用原始正文派生的 Outline 行号。

滚动同步默认开启，可由用户关闭。同步开启的 Split 模式采用编辑器单一主进度模型：

- 编辑区垂直中线对应的源码行同时决定当前 Outline 章节和预览目标，不再分别使用“编辑区顶部”和“预览区顶部”两个基准。
- `buildOutline` 从原始 Markdown 派生稳定 `id` 与 `sourceLine`；同步时按 `id` 找到实际预览标题 DOM，以相邻标题线性插值，并把目标位置对齐到预览区垂直中线。末节补充文档末尾锚点；无可用标题时回退为两个窗格的归一化中线进度。
- 鼠标位于右侧预览区时，垂直滚轮事件阻止预览器原生滚动，并把 pixel、line 或 page 模式的增量换算后施加到 CodeMirror 滚动容器；随后仍由编辑器驱动预览。`Ctrl+滚轮` 保留浏览器缩放语义。
- 同步开启时直接拖动预览滚动条不会反向移动编辑器，预览会按编辑器当前中线重新对齐，避免两个进度源互相拉扯。
- 预览正文外层由 `ResizeObserver` 观察。Mermaid 异步渲染、图片或其他媒体改变预览高度后，在编辑器位置不变的前提下重新计算预览位置。
- 高频事件使用单个 `requestAnimationFrame` 合并；程序化预览滚动的 source lock 至少保持两个 animation frame，覆盖浏览器延迟滚动事件并防止回环。
- Preview 模式始终独立滚动。Split 模式关闭同步后也允许预览独立滚动；这两种情况下预览滚动只更新 Outline，不移动隐藏或可见的编辑器。

文档上下文栏的 Outline 同时维护当前章节，不依赖滚动同步开关，也不依赖正文是否包含 `[toc]`：

- `buildOutline` 一次派生 `level`、可见标题文本、稳定 `id` 和原始 `sourceLine`；内联目录、右侧 Outline、源码定位和 Split 同步复用该结构。
- `[toc]` / `[TOC]` 只控制正文中是否插入内联目录。只要正文含标题，右侧 Outline 默认展示；无标题时仍保留整栏 Outline 并显示空状态。
- Edit 模式以及同步开启的 Split 模式点击 Outline 时，使用 `EditorView.scrollIntoView` 定位原始 `sourceLine`，不移动光标；CodeMirror 完成测量后再从编辑器中线同步预览。
- Preview 模式以及同步关闭的 Split 模式点击 Outline 时，只定位预览标题 id，不移动编辑器。
- 编辑器作为主进度时，以编辑区垂直中线对应源码行之前最近的 Markdown 标题作为当前章节。独立预览滚动时使用顶部下方 32～96px 的激活线，滚动到底部时选择最后一个标题。
- 重复标题按出现顺序追加稳定序号。当前项使用 `aria-current="location"`；仅当当前项离开 Outline 自身可视区域时，才最小幅度滚动右栏。

## 10. 响应式布局

页面使用动态视口高度并禁止页面级横向滚动。

桌面端支持 Edit、Split、Preview 三种模式。文档上下文是主工作区的 flex sibling，不使用 fixed、absolute 或补偿 margin：

- 视口不小于 `1280px` 时常驻最右侧；展开宽度为 `304px`，折叠图标栏宽度为 `52px`。
- 默认视图为整栏 Outline，并默认展开；折叠偏好使用 `mnote:editor-context-rail:collapsed:v1` 持久化，当前视图和 Details tab 不跨文档持久化。
- Mentions 和 Graph 当前不提供可见入口。顶部 Details 按钮把同一物理右栏切换为 Summary、History、Share，并隐藏 Outline；按钮随后变为 Show outline，点击后原位恢复 Outline。Details 切换不是折叠操作，右栏折叠由独立按钮控制。
- 同一文档内切到 Outline 时保留 Details 组件实例、当前 tab 和已加载数据；再次打开 Details 不重复加载已保留的 History 或 Share。通过顶部 Details 从 Outline 进入时默认定位 Summary；切换文档时重置为 Outline / Summary。
- `1024px–1279px` 使用最大宽度 `384px` 的右侧 Dialog drawer；小于 `1024px` 时同一 drawer 铺满可用宽度。窄屏顶部的 Outline 和 Details 入口打开同一个 drawer，内容仍互斥；Outline 选中章节后关闭 drawer。断点进入宽屏会关闭 drawer，退出宽屏不会自动弹出。

Split 的静态比例边界为 30%～70%，编辑器和预览器的像素最小宽度均为 `420px`。`SplitPane` 从主工作区实测宽度扣除 `6px` 分隔条后收紧有效比例；视口变化只 clamp 本次展示值，不覆盖已保存比例，只有用户主动拖动或按键时才保存新比例。分隔条支持指针拖动、方向键、Home/End 和双击恢复 50%。

小于桌面断点时只提供 Edit/Preview 切换，不显示被压缩的双栏。页面根据媒体查询只挂载一个 CodeMirror 实例；不能同时渲染桌面和移动实例后再用 CSS 隐藏。移动工具栏保留高频操作，其他命令进入 More 对话框。

## 11. 菜单、弹层与可访问性

通用 `Dialog` 提供：

- `role=dialog`、`aria-modal`、标题关联；
- 初始焦点和 Tab/Shift+Tab 焦点循环；
- 可配置 Escape/背景关闭；
- 关闭后恢复触发点焦点；
- 打开期间 body scroll lock。

删除、预览、文档预览、快速打开、AI、移动 More、文档上下文 drawer、草稿恢复和冲突对话框使用同一实现。草稿恢复和冲突对话框禁止 Escape 与背景关闭，其余对话框允许关闭。

Slash/Wikilink 菜单使用 listbox/option 语义，编辑器暴露 `aria-controls`、`aria-expanded` 和 `aria-activedescendant`。异步结果尚未加载或为空时，Enter 不执行选择。

工具栏图标按钮都有可访问名称。弹层位置按视口 clamp；下方空间不足时向上翻转，两侧空间都不足时限制高度并内部滚动。

## 12. 标签、双链、上传和辅助功能

- 标签写入使用独立接口，不混入正文保存 DTO。
- `[[` 查询文档并通过 CodeMirror transaction 插入内部链接。
- 正文保存事务重建出链、反向链接和资产引用。
- 粘贴文件先插入唯一占位；上传完成后按占位内容替换，不依赖过期字符偏移。
- AI 生成或润色的应用也经过统一正文发布入口。
- AI、相似文档、摘要、分享、导出或关系查询失败时，不改变同步状态和本地草稿。

## 13. 发布与回滚

发布时先确保 Web 同时发送 `base_revision` 和 `save_seq`，再启用后端严格 base 校验。已打开的旧页面收到客户端升级错误后不会写库，本地草稿仍保留；刷新页面即可进入新协议。

需要回滚 Web 时必须先回滚严格后端，再回滚 Web，确保旧页面的无 base 请求不会被拒绝。如果必须回滚后端乐观锁，需认识到旧的序号协议无法防止多标签页静默覆盖；回滚窗口内应监控保存拒绝、冲突和草稿恢复情况，并尽快恢复严格协议。

## 14. 不可破坏的约束

- 基于旧 revision 的客户端不能静默覆盖新正文。
- 冲突前后都保留本地正文和可下载副本。
- 空字符串草稿是有效数据。
- 草稿仅在服务器确认当前最新正文后清理。
- 任意响应式分支同时只挂载一个 CodeMirror。
- dirty、离页保护和保存按钮不依赖预览防抖。
- 所有正文修改进入统一发布入口和 CodeMirror transaction。
- 正文保存、版本、链接、资产关系和异步处理状态保持事务一致。
- 正式代码和文档不依赖临时设计文档。

## 15. 验证原则

修改编辑器时至少验证与改动相关的以下路径：

- 加载、即时 dirty、手动保存、自动保存和刷新后一致性；
- 快速离页、空正文、旧草稿、损坏草稿和存储失败；
- 同一基准的双客户端保存、三种冲突动作和二次冲突；
- 网络错误、Retry 和恢复在线；
- 桌面三模式、420px 分栏边界、默认 Outline、Outline/Details 原位切换、常驻/折叠右栏、断点切换和移动 drawer；
- 标题/列表互转、选区边界、撤销重做、输入法和双链菜单；
- Outline 标题锚点单向同步、编辑区中线对齐、预览区滚轮委托、Mermaid/媒体布局变化后重新校准、关闭同步、无 `[toc]` 的默认 Outline、三种模式定位、当前章节高亮和 Outline 自身跟随；
- 全键盘 Dialog/Menu 流程、焦点恢复和控件可访问名称；
- 大正文连续输入期间不丢字符，预览最终收敛。
