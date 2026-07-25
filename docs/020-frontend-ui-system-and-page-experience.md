# 前端 UI 系统与页面体验

## 1. 功能范围

本文定义 Micro Note 前端已经采用的视觉语言、页面分类、共享组件、响应式行为、异步状态、可访问性和维护边界。适用范围包括：

- 入口与认证：`/`、`/login`、`/register`、`/oauth/callback`。
- 已登录管理页：`/docs`、`/tags`、`/todos`、`/templates`、`/assets`、`/settings`。
- 专注工作页：`/docs/[id]`、`/docs/[id]/revert`。
- 公开阅读页：`/share/[token]`。

内部的 `/test-editor` 和 `/test-markdown` 用于开发验证，不作为产品页面模板，但共享组件变更不得破坏它们。

前端统一的目标不是让所有路由使用同一种外壳，而是让不同任务共享同一组设计令牌、控件语义、反馈规则和输入方式。管理页、编辑器和公开阅读页保留各自适合的内容层级。

## 2. 页面类型

### 2.1 已登录应用页

Tags、Tasks、Templates、Assets 和 Settings 使用 `AppPage`：

- 顶栏高度为 `56px`。
- 桌面显示返回 Notes 的入口，窄屏显示应用导航按钮。
- 标题、说明、次要操作和主要操作可以自动换行，不得挤出视口。
- 内容区使用统一的移动、平板和桌面边距。
- 普通内容页由 body 滚动；明确需要固定工作区的主从页可以在内容区域内设置唯一滚动容器。

Docs 因为需要常驻筛选、Recent 和 Tags，使用专用页面壳，但复用同一应用导航、按钮、输入、菜单、状态和反馈组件。

### 2.2 专注工作页

Editor 和 Revert 使用 `h-dvh` 工作区与内部滚动：

- 页面不挂载应用侧栏。
- 顶栏优先展示返回、文档身份、同步状态和高频操作。
- Editor 保留 Edit、Split、Preview、Outline 和 Details。
- Revert 在桌面显示双栏差异，在窄屏显示堆叠差异。
- 页面本身禁止横向滚动；代码、表格、超长 URL 和 diff token 只能在局部容器内滚动。

### 2.3 认证与公开页

Login、Register 和 OAuth callback 使用 `AuthShell` 或同一认证状态结构。Share 使用阅读优先布局。它们不显示已登录应用导航，但继续复用语义令牌、表单、Button、Dialog、PageState、Toast 和 ReadingSurface。

## 3. 设计令牌

全局令牌位于 `web/src/app/globals.css`。页面业务代码应使用语义，不应自行建立一套产品颜色。

### 3.1 颜色

稳定语义包括：

| 令牌 | 用途 |
| --- | --- |
| `background` / `foreground` | 页面画布与主文本 |
| `card` / `card-foreground` | 表单、列表和阅读面板 |
| `muted` / `muted-foreground` | 次级背景和说明文字 |
| `primary` / `primary-foreground` | 主操作与强选中状态 |
| `secondary` / `secondary-foreground` | 次要控件与弱标签 |
| `accent` / `accent-foreground` | hover、focus 和弱选中背景 |
| `destructive` | 删除、断开连接和不可逆动作 |
| `success` | 保存完成、创建成功和已连接 |
| `warning` | 本地草稿、需要注意和即将失效 |
| `info` | 处理中和普通信息提示 |
| `border` / `input` / `ring` | 边框、输入和焦点环 |

状态不能只靠颜色表达，还要使用文本、图标、形状或 ARIA 状态。Markdown 语法高亮、代码主题、第三方品牌图标和图表节点可以使用领域颜色，不应反向污染页面控件。

### 3.2 圆角、阴影和层级

- 菜单项和小标签使用小圆角。
- Input、Button 和搜索框使用 `rounded-md`。
- 列表、卡片和日历容器使用中等圆角。
- Dialog、Drawer、阅读面板使用大圆角；移动全屏形态按组件契约移除圆角。
- Avatar、状态点和真正的 pill tag 才使用完整圆角。
- 普通内容容器以边框分层，默认不使用重阴影。
- Menu、Dialog 和 Toast 使用统一浮层阴影。
- 页面导航和普通菜单低于 Dialog，Dialog 内浮层高于 Dialog 内容，全局 Toast 位于最上层反馈区。

业务组件不得通过任意 z-index 绕过浮层层级。

### 3.3 字体与尺寸

- 页面标题、正文、按钮和输入使用 sans。
- 等宽字体只用于代码、ID、行列号和需要对齐的数值。
- 页面标题为 `20/28px`，正文和控件为 `14/20px`，辅助文字为 `12/18px`。
- 用户可见的关键信息不使用小于 `12px` 的字号。
- 桌面标准控件高度为 `40px`；移动关键操作和 Dialog 主要操作至少 `44px`。
- 常规图标为 `16px`，页面级图标为 `20px`。

### 3.4 动效

- hover 和 focus 只使用短时颜色过渡。
- Menu、Dialog 和 Drawer 使用短时进入/退出过渡。
- 不使用循环 marquee 表达长文本。
- `prefers-reduced-motion: reduce` 下关闭位移、缩放、脉冲和自动平滑滚动。
- 动画不能延迟焦点进入、请求状态或关闭策略。

## 4. 共享组件边界

### 4.1 `Button` 与 `IconButton`

`web/src/components/ui/button.tsx` 提供 default、destructive、outline、secondary、ghost 和 link 视觉，以及 default、sm、lg 和 icon 尺寸。

`isLoading` 同时设置 `aria-busy`、禁用重复操作并保留原按钮宽度。业务写请求还要使用同步 ref 或请求锁，不能只依赖下一次 React render 后的 disabled。

纯图标动作使用 `IconButton`，必须提供唯一 `label`。切换状态使用 `aria-pressed`，展开状态使用 `aria-expanded`。Tooltip 或 `title` 只作补充，不承担唯一名称。

导航应使用 `Link` 或 `a` 并复用 `buttonVariants` 外观，不允许 `a > button`、`Link > button` 或其他嵌套交互。

### 4.2 `Input` 与 `Field`

- Input 默认高度、字体、圆角和焦点环由共享组件控制。
- 每个可见字段都要有通过 `htmlFor` 关联的 label。
- 错误文本通过 `aria-describedby` 和 `aria-invalid` 关联。
- 搜索使用 `type="search"`，存在清空动作时必须有可访问名称。
- 密码字段明确设置 `current-password` 或 `new-password` autocomplete。
- 提交型字段位于 `form` 中，Enter 与点击主按钮执行同一逻辑。

### 4.3 `Dialog`

所有阻断式 Modal、Alert Dialog、Sheet、Drawer、Command 和 Fullscreen Preview 复用 Dialog 系统。服务端和客户端 hydration 首帧都不创建 Portal；挂载完成后才渲染到 `document.body`，避免 hydration mismatch。

Dialog 统一负责：

- `dialog` / `alertdialog` 语义和标题说明关联。
- 初始焦点、Tab 圈定、Escape、背景点击和焦点归还。
- 多层 Dialog 只允许最上层响应关闭。
- 引用计数式 body 滚动锁。
- `always`、`when-idle` 和 `explicit` 关闭策略。
- 动态视口、软键盘、安全区和 reduced motion。

业务代码不得自行创建全屏遮罩、全局 Escape 监听或 body 滚动锁。

### 4.4 `Menu` 与 `Combobox`

`Menu` 用于离散动作：

- Trigger 暴露 `aria-haspopup`、`aria-expanded` 和 `aria-controls`。
- Panel/Item 使用 `menu` / `menuitem`。
- 支持方向键、Home、End、Enter、Space、Escape、外部点击和焦点恢复。
- 子菜单可以点击或 ArrowRight 打开，ArrowLeft 返回；不依赖 hover。
- 同层只允许一个 Menu 打开，面板位置限制在视口内。

`Combobox` 用于可输入的结果选择：

- Input 使用 combobox 语义并关联 listbox。
- 活动项使用 `aria-activedescendant`。
- 结果使用 option 语义。
- 搜索请求防抖并取消旧请求；过期结果不能覆盖新条件。

### 4.5 `PageState`

`PageState` 统一 loading、empty 和 error：

- 首次加载失败显示页内 error 和 Retry，不能伪装为空数据。
- 增量加载失败保留已有内容，在列表尾部显示 inline Retry。
- 空状态说明原因，并只在存在明确下一步时提供操作。
- Toast 用于动作结果，不替代首次页面错误。

### 4.6 `Toast`

全站只使用 `ToastProvider`：

- 默认和 success 使用礼貌的 status live region。
- error 使用 assertive alert。
- 移动端位于底部并避让 safe area，桌面位于右上。
- 同时只显示有限数量；短时间内相同 variant 和 description 合并。
- hover 和焦点进入时暂停自动关闭。
- 关闭按钮可键盘操作。
- 用户文案不拼接后端内部业务码。

### 4.7 页面结构组件

- `AppPage`：管理页顶栏、标题、返回、应用导航和内容宽度。
- `ResponsiveMasterDetail`：Templates 和 Assets 的响应式主从布局；桌面同时显示，窄屏一次只显示列表或详情。
- `ReadingSurface`：Editor Preview、模板预览和 Share 正文共享的阅读容器；业务数据和权限逻辑仍由页面自行管理。
- `AuthShell`：认证页的品牌、标题、说明、状态和单任务表单宽度。
- `SegmentedControl`：互斥视图切换，使用可识别的当前状态和键盘操作。

## 5. 应用导航与返回

应用导航顺序固定为：

1. All Notes
2. Starred
3. Shared
4. Tasks
5. Templates
6. Assets
7. Tags
8. Settings

当前路由或筛选使用文字、背景和 `aria-current`，不能只依赖图标颜色。

Docs 在宽桌面显示常驻侧栏，并附加 Recent 和 Tags。窄屏 Drawer 提供相同主导航、有限 Recent、有限 Tags 和 Manage all。选择筛选后 Drawer 关闭并恢复到触发点或进入目标内容。

所有 `return` 查询参数都经过 `getSafeInternalReturn`：

- 只接受单斜杠开头的站内路径。
- 拒绝 `//`、反斜杠、scheme、空值和不可解析编码。
- 未通过校验时回到 `/docs` 或调用方明确指定的站内 fallback。

Editor 返回 Docs，Revert 返回当前 Editor。Templates 和 Assets 的移动详情返回列表，不离开当前路由。

## 6. 会话边界

Docs、Tags、Tasks、Templates、Assets 和 Settings 的 layout 复用 `AuthenticatedBoundary`。Token 状态分为：

- `undefined`：服务端或 hydration 尚未得到客户端快照，显示统一 session loading。
- 有效字符串：渲染私有页面，接口继续由后端验证真实性。
- `null`：使用 `replace` 进入 `/login?return=<safe current path>`，不先挂载业务请求。

`AuthenticatedBoundary` 只是首屏体验和请求抑制，不能替代后端鉴权。受保护 API 返回未授权时，统一 API 客户端清理本地会话并使用 `location.replace` 进入登录页。

## 7. 响应式契约

| CSS 视口 | 页面行为 |
| --- | --- |
| `<640px` | 手机单列、应用 Drawer、关键触控目标至少 44px |
| `640–767px` | 大手机或小平板，保持单列并增加留白 |
| `768–1023px` | 管理页可进入主从双栏；Docs 仍使用 Drawer |
| `>=1024px` | Docs 常驻侧栏，管理页使用标准桌面宽度 |
| `>=1280px` | Editor 常驻最右侧 Outline/Details rail |

断点按 CSS 像素计算。浏览器放大造成可用宽度下降时应自然进入窄屏布局。

所有产品路由必须满足 body 不产生横向溢出。允许局部横向滚动的内容只有 Markdown 代码块、表格、长 URL 和 diff token，且滚动范围不能扩散到页面。

全屏工作区使用 `h-dvh`，普通长页使用 `min-h-dvh`。固定底部内容和移动 Toast 使用 safe-area inset。响应式分支如果包含有状态编辑器，只挂载当前可见的一个实例，不能通过 CSS 同时隐藏另一份实例。

## 8. 页面实现

### 8.1 入口、登录、注册和 OAuth

- `/` 在读取 token 时显示稳定 loading，再使用 replace 分流。
- Login 和 Register 共享 AuthShell、Input、Button、密码可见切换和通用错误视觉。
- 登录、注册、发送验证码和 OAuth 开始请求均有同步防重复锁。
- 注册验证码成功通过 live status 播报，冷却时间阻止重复发送。
- OAuth callback 的 loading 和 error 复用认证状态结构。
- 页面错误不展示数据库信息或内部业务码。

### 8.2 Docs

- 桌面保留常驻侧栏，移动和平板通过 Drawer 获得完整导航。
- 移动顶栏只保留导航、可伸缩搜索、New 和用户菜单；Assets 位于导航中。
- 文档卡片主体是 Link，Star、Pin 和分享复制是同级 Button，不存在交互嵌套。
- 卡片显示标题、最多两行正文摘录、更新时间和标签；普通卡片读取 `content`，分享卡片读取
  `content_preview`，两者使用同一 Markdown 清理逻辑。
- 搜索、标签、Starred、Shared 和语义结果拥有独立状态；切换条件时旧响应不得覆盖。
- 首次错误、追加错误、空列表和筛选无结果分别显示可恢复状态。
- 页面级标题随 All notes、Starred、Shared 和 Tag 筛选变化。

### 8.3 Tags

- 页面使用 AppPage 和行式列表。
- 搜索固定短防抖；清空搜索立即恢复默认查询。
- 请求使用 AbortController，旧结果不得覆盖新查询。
- 初次失败和追加失败分别提供 Retry。
- 删除使用 alertdialog，成功后更新列表并显示 success Toast。
- 返回地址使用安全站内校验。

### 8.4 Tasks

- 桌面为可滚动月份日历，日期格本身是非交互 section。
- 窄屏为完整月度日程列表，每日提供 Add task，有任务时提供 Details。
- 创建表单包含可编辑业务日期；页面 New 默认今天，日期行 New 默认对应日期。
- 完成状态使用 checkbox 语义、状态文字和删除线；长内容两行截断并可进入编辑。
- toggle 使用单项 pending 和乐观更新，失败完整回滚。
- 创建、编辑和删除使用统一 Dialog，并以同步 ref 防止重复提交。

### 8.5 Templates

- 页面使用 AppPage 和 ResponsiveMasterDetail。
- 元数据列表通过 `GET /templates/meta?limit=&offset=&q=` 进行服务端分页搜索。
- `q` 在服务端 trim，最多接受 100 个 Unicode 字符；按当前用户名称执行不区分大小写的字面量包含搜索，`%`、`_` 和反斜杠不作为 SQL 通配符。
- 前端搜索防抖、重置分页并取消旧请求；不能只过滤已加载的一页。
- 详情请求使用 AbortController 和请求序号，只有当前选择对应的最新响应可以写入草稿。
- dirty 时切换、创建、删除当前项、返回和移动详情返回都进入同一决策：Cancel、Discard and switch、Save and switch。
- 保存失败保留草稿和当前选择；保存期间禁止切换和重复保存。
- dirty 页面注册 beforeunload，保存后立即解除。
- 变量预览使用 MarkdownPreview 和 ReadingSurface，与创建后的文档展示一致。

### 8.6 Assets

- 页面使用 AppPage 和 ResponsiveMasterDetail。
- 列表通过现有 `q`、`limit` 和 `offset` 做服务端搜索与分页。
- 搜索、翻页和引用详情使用 AbortController/请求序号，防止选择竞态。
- 桌面同时显示列表和详情；移动选择后只显示全宽详情，并提供 Back to Assets。
- 详情分为 Preview、Details、复制、Open 和 References。
- 外链是单一 anchor，复制使用具备 fallback 的共享 clipboard helper。
- clipboard 拒绝时显示 error Toast；图片或媒体加载失败显示可理解的 fallback。
- References 拥有独立 loading、error、empty 和 retry。

### 8.7 Settings

- 页面使用 AppPage，不使用营销式渐变或 Hero。
- Connected accounts 和 Security 使用同一 Section 结构。
- Provider 操作由 `{ provider, action }` 标识 pending；同时只允许一个绑定动作。
- 解绑先显示 alertdialog，说明剩余登录方式的影响。
- 最后登录方式冲突映射为可操作文案，不显示内部错误码。
- 密码修改使用 form，包含 Current、New 和 Confirm new password，前端只校验必填和一致性。
- 成功后清空密码字段并显示 success Toast。

### 8.8 Editor

- 保留 Edit、Split、Preview、滚动同步、Outline/Details 互斥右栏和既有保存协议。
- Preview 使用 ReadingSurface；Scroll sync 位于预览工具区，不遮挡正文。
- `<1280px` 的 Outline/Details 使用同一 Drawer，宽屏使用主工作区 flex sibling rail。
- Mentions 和 Graph 不提供可见入口；Details 在同一右栏只显示 History 和 Share，首次打开默认
  History。
- 移动 Edit/Preview 使用 SegmentedControl，低频工具进入 More。
- Outline 当前章节由编辑器中线或预览激活线确定，不要求标题起点滚到页面顶部。
- 页面标题在加载时为稳定 Editor，加载后为 `<Document title> · Micro Note`。

### 8.9 Revert

- 桌面保留当前与历史版本双栏 diff。
- 窄屏按变更块先展示 Current 删除内容，再展示目标版本新增内容；未变内容为单列上下文。
- 页面顶栏在移动端分两行，Cancel 和 Restore 使用可触控尺寸。
- DiffNavigator 位于正文 sticky 工具区。
- 正文使用 break-words，超长无空格 token 只在当前块内滚动。
- 恢复使用当前 `content_revision` 作为 base；冲突时刷新比较并要求再次确认。
- 页面标题为 `Revert <Document title> · Micro Note`。

### 8.10 Share

- 页面保留面向阅读的作者、权限、过期信息、正文、TOC 和 Comments 层级，不显示独立摘要区块。
- 正文使用 ReadingSurface，反馈使用全局 Toast。
- 密码输入有可见 label、`current-password` autocomplete 和 alert 错误。
- 复制、下载、目录、回顶部和评论图标按钮都有可访问名称。
- 导航 Link 不包裹 Button。
- 评论和回复提交有 pending、防重复、错误保留和字数边界。
- 分享加载、密码、失效和正常状态使用稳定公开页结构。
- 页面标题在获取正文后更新为公开文档标题。

## 9. 异步与竞态规则

所有页面动作遵守：

1. 请求开始时只锁定相关动作，不冻结无关区域。
2. 写操作使用同步 ref 或等价锁防止同一事件循环重复触发。
3. 搜索、主从详情和快速切换使用 AbortController 或递增请求序号。
4. 成功先更新本地事实状态，再显示 success；即将导航时可以省略 Toast。
5. 失败保留用户输入和已有数据，提供可理解的重试。
6. 乐观更新失败完整回滚；不能只回滚图标而遗漏计数、排序或详情。
7. 只有真实 dirty 的长表单注册离开保护。
8. 用户文案描述可执行下一步，不直接暴露后端业务码和数据库错误。

## 10. 语义与可访问性

- 管理页和认证页只有一个页面级 `h1`。
- Editor、Revert 和 Share 使用带名称的 `main`；Markdown 正文可以继续拥有自身标题层级。
- 导航使用 Link，动作使用 Button；不使用 clickable div、`span role=button` 或嵌套交互。
- 关键动作在触摸设备始终可见；桌面可以弱化，但 focus-visible 时必须出现。
- 图标按钮拥有唯一可访问名称，装饰图标使用 `aria-hidden`。
- Dialog、Drawer、Menu 和 Combobox 的焦点不能逃逸或在关闭后丢失。
- focus ring 不得被 overflow 裁切。
- loading、保存、成功、错误、Toast 和表单错误均可被辅助技术读出。
- 200% 缩放、键盘、触摸和鼠标必须能够完成相同关键流程。

## 11. 页面标题

根布局使用 `%s · Micro Note` 模板：

- 管理页：`<Page name> · Micro Note`。
- Docs 筛选：`All notes`、`Starred notes`、`Shared notes` 或 `<Tag> notes`。
- Editor：`<Document title> · Micro Note`。
- Revert：`Revert <Document title> · Micro Note`。
- Share：`<Public document title> · Micro Note`。

加载阶段使用稳定页面名，不生成 `undefined`、空标题或不同分隔符。Editor 在路由存活期间
保持文档标题优先于 App Router 延迟提交的父级 metadata，并在卸载时解除 head 监听。
新增客户端标题逻辑前必须搜索现有写入，避免多个 Effect 互相覆盖。

## 12. 测试与验证

共享组件需要覆盖 SSR/hydration、ARIA、焦点、键盘、stack、关闭策略、请求锁、过期响应和 live region。

页面测试需要覆盖：

- Loading、empty、首次 error、增量 error、retry 和 success。
- 移动与桌面布局、主从切换和 body 横向溢出。
- dirty、pending、失败保留、乐观回滚和重复提交。
- 菜单、Dialog、Drawer、表单和编辑器的键盘流程。
- 登录、Docs、Tags、Tasks、Templates、Assets、Settings、Editor、Revert 和 Share 的稳定视觉状态。

浏览器矩阵至少包含最窄手机、主流手机、平板、桌面、Editor Outline 断点和宽桌面。视觉测试固定时间、fixture 和动画；不得通过放宽截图阈值隐藏真实偏移。

修改前端后运行：

```bash
cd web
npm run lint
npx tsc --noEmit
npm run test:coverage
npm run build
npx playwright test
```

修改模板元数据搜索的后端契约后还要运行：

```bash
go fmt ./...
go mod tidy
go test ./...
make lint-go
make test-coverage
```

## 13. 维护约束

- 新页面先选择既有页面类型和共享组件，不复制页面私有 Menu、Toast、PageState 或 Dialog。
- 新增颜色先判断是否为已有语义；业务页面不直接引入另一套产品调色板。
- 不得重新加入产品路由 `h-screen`、关键 hover-only 入口、无名称图标按钮或交互嵌套。
- 修改断点时同时检查导航、主从布局、Editor rail、触控目标和 body overflow。
- 修改 API 查询时同步处理防抖、取消、过期响应、分页 total 和空查询兼容。
- 修改标题或路由时同步检查 metadata、动态标题和 safe return。
- 修改共享控件后必须回归所有接入页面，不能只验证组件自身。
- 任何正式行为变化都要同步更新本目录中的对应功能文档。
