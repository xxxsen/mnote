# 前端 Dialog 与浮层系统

## 1. 功能范围

前端所有会阻断当前页面操作的 Modal、Command Palette、Bottom Sheet、Drawer 和 Fullscreen Preview 使用同一套 Dialog 系统。该系统统一处理 Portal、可访问语义、焦点、键盘关闭、背景滚动锁、浮层堆叠、响应式形态、视觉规格和异步关闭策略。

普通页面导航、固定工具栏、非阻断式悬浮面板和页面内下拉菜单不属于 Dialog；但它们必须遵守本文的层级边界，不能覆盖已经打开的阻断式浮层。

## 2. 代码边界

基础实现位于：

- `web/src/components/ui/dialog.tsx`：公共属性、五种变体、可访问语义、焦点圈定、关闭策略和结构组件。
- `web/src/components/ui/dialog-stack.ts`：浮层栈、最上层判定和 `body` 滚动锁引用计数。
- `web/src/components/ui/dialog-status.tsx`：加载、错误、成功和提示状态。

业务组件只能声明任务意图并组合以下结构：

- `Dialog`
- `DialogHeader`
- `DialogTitle`
- `DialogDescription`
- `DialogBody`
- `DialogFooter`
- `DialogCloseButton`
- `DialogStatus`

业务组件不得自行创建全屏遮罩、焦点圈定、全局 Escape 监听或 `body` 滚动锁，也不得通过自由面板样式把普通 Modal 改造成 Sheet 或 Drawer。

## 3. 公共契约

`Dialog` 的稳定属性包括：

- `open`：是否处于打开状态。
- `title`：必填的可访问标题。
- `description`：可选的可访问说明。
- `variant`：`modal`、`command`、`sheet`、`drawer` 或 `fullscreen`。
- `size`：`sm`、`md`、`lg` 或 `xl`。
- `drawerWidth`：仅 Drawer 使用的语义宽度，`default` 为标准宽度，`compact` 在 `1024px` 及以上使用 `384px` 上限；更窄视口铺满。
- `dismissPolicy`：`always`、`when-idle` 或 `explicit`。
- `busy`：当前是否有不可关闭的提交。
- `role`：普通任务使用 `dialog`，不可逆确认使用 `alertdialog`。
- `initialFocusRef`：打开后优先聚焦的控件。
- `returnFocusRef`：关闭后优先恢复焦点的控件。
- `onClose`：接收 `escape`、`backdrop`、`close-button`、`cancel-button` 或 `completed` 关闭原因。

面板和遮罩不提供业务层自由覆盖入口。新增形态应先判断是否属于现有语义变体；只有多个业务场景都需要同一行为时，才能扩展公共契约。

## 4. DOM、焦点与滚动

Dialog 通过 Portal 渲染到 `document.body`，避免被页面的 `overflow` 或 stacking context 裁切。打开状态具备：

- `role="dialog"` 或 `role="alertdialog"`。
- `aria-modal="true"`。
- 与隐藏事实标题、可选说明关联的 `aria-labelledby` 和 `aria-describedby`。
- 打开后按 `initialFocusRef`、首个可交互控件、面板自身的顺序选择焦点。
- Tab 和 Shift+Tab 只能在最上层 Dialog 内循环。
- 关闭后优先返回 `returnFocusRef`，否则返回打开前的活动元素。

Portal readiness 使用服务端 snapshot 为 false 的 hydration-safe 外部存储判定。服务端输出和
客户端 hydration 首帧都不创建 Portal，挂载完成后才渲染 Dialog。不得通过
`suppressHydrationWarning` 隐藏首帧差异。

每个打开的 Dialog 都向全局栈注册。只有栈顶响应 Escape 和遮罩操作。滚动锁使用引用计数：打开首个 Dialog 时保存并覆盖 `body.style.overflow`，关闭最后一个 Dialog 时恢复原值。关闭下层 Dialog 或关闭上层后仍有其他 Dialog 时，不得提前解锁背景。

遮罩只在事件目标就是遮罩自身时请求关闭；面板内部不依赖大范围 `stopPropagation()`。

## 5. 关闭策略

### 5.1 `always`

用于只读预览、搜索、帮助、未修改表单和可取消读取请求。Escape、遮罩和关闭按钮均可关闭。

若存在网络请求，关闭处理必须调用 `AbortController.abort()`，递增请求序号，并忽略 AbortError 和过期响应。

### 5.2 `when-idle`

用于无法安全取消的服务端写入。`busy=true` 时 Escape、遮罩和关闭按钮统一失效，业务 Footer 的取消按钮也必须禁用，并在窗体内显示正在执行的动作。事件处理函数仍需同步 ref 防重，不能只依赖 React 的 disabled 更新。

失败后保持当前输入、步骤和确认目标；用户可以重试或在恢复空闲后关闭。成功后才能清理输入并关闭。

### 5.3 `explicit`

只用于草稿恢复、保存冲突等必须作出事实选择的流程。Escape、遮罩和通用关闭按钮不能退出，Header 不显示关闭入口。用户必须选择本地版本、服务器版本、覆盖、重载或下载安全副本等明确动作。

### 5.4 Dirty guard

普通表单发生未保存修改后，首次关闭在原 Dialog 内切换到放弃确认状态。不得再打开一个嵌套确认 Dialog。确认放弃后关闭；返回编辑时恢复原表单和输入焦点。

## 6. 响应式形态

- `modal`：桌面居中；手机贴底显示为 Bottom Sheet，最大高度基于 `dvh`。
- `command`：桌面和手机均靠近视口顶部，保留安全边距，搜索区固定。
- `sheet`：底部贴边，顶部圆角，内容区滚动。
- `drawer`：桌面从右侧进入且限制宽度；`drawerWidth="compact"` 用于文档上下文等窄辅助栏；手机铺满视口。
- `fullscreen`：桌面保留视口边距；手机铺满视口且无圆角。
- `lg` 和 `xl` 大型 Modal：手机铺满视口，桌面恢复对应尺寸的居中面板。

Header 和 Footer 不滚动，`DialogBody` 是窗体唯一主纵向滚动容器。Footer 在手机端默认使用两列等宽操作，单按钮或第三个主操作跨满整行，并保持 DOM 操作顺序；底部使用 `max(1rem, env(safe-area-inset-bottom))` 保护系统手势区。输入控件获得焦点时可使用 `scrollIntoView({ block: "nearest" })` 防止被软键盘遮挡。

## 7. 视觉与层级

公共层集中定义：

- 遮罩：深色半透明背景和 2px 模糊。
- 面板：白色背景、浅色边框、统一强阴影。
- 桌面 Modal：统一 2xl 圆角。
- Header：固定内边距和底部分隔线。
- Body：`min-h-0`、可滚动和统一内边距。
- Footer：实色背景、顶部分隔线和安全区。
- 关闭按钮及主要触屏控件：至少 44×44 px 热区。

层级约束：

- 页面固定导航和普通菜单：40–60。
- Dialog、Sheet、Drawer 和 Fullscreen：200。
- Dialog 内的 Popover、Select 和 Tooltip：220。
- 全局 Toast 和阻断级通知：300。

业务浮层不得新增任意 z-index。页面级非阻断悬浮面板必须低于 Dialog。

## 8. 状态反馈与异步一致性

`DialogStatus` 提供 `loading`、`error`、`success` 和 `info`。加载和成功消息使用礼貌播报，阻断性错误使用 alert 语义。

异步业务必须同时具备：

- 同步 ref 防止同一事件循环重复提交。
- 请求序号或等价 Token，拒绝旧响应覆盖新会话。
- 可取消请求的 AbortController。
- 失败后的输入、步骤或确认目标保留。
- 主操作按钮稳定宽度、loading 状态和明确动词。
- 不可取消写入期间一致的关闭禁用与原因说明。

服务端后台任务一旦原子确认，不因前端关闭或卸载而取消。此时前端只中止轮询；任务事实仍由状态查询接口恢复。

## 9. 已接入的业务场景

文档库使用标准 Modal 承载导入和导出。上传解析与导出准备可取消；导入任务确认后禁止关闭，轮询结束后才进入完成或错误状态。

模板变量使用 Fullscreen，桌面为变量和预览双栏，手机为分段切换；Dirty guard 在原窗体内完成，创建文档期间防重复并保留失败输入。模板删除使用 Alert Dialog。

待办日视图、创建和编辑使用 Modal；创建与编辑具备 Dirty guard；删除使用可堆叠的 Alert Dialog，成功后同步更新月视图和日视图，失败时保留确认目标。

编辑器包含 Command Quick Open、Fullscreen 预览、显式草稿恢复和保存冲突、AI Modal、移动端 More Sheet、`1280px` 以下的文档上下文 Drawer 和删除 Alert Dialog。文档上下文 Drawer 使用 `compact` 语义宽度，并与宽屏布局内 Rail 共用 Outline / Details 互斥内容；默认显示 Outline，Details 在同一位置显示 Summary、History、Share，Mentions 和 Graph 不提供可见入口。两种外壳不得同时挂载；进入宽屏时关闭 Drawer，返回窄屏时不自动重开。AI 生成请求关闭时会真正中止网络请求，过期响应不能写回新会话；提示词变化会立即使旧结果失效，失败和结果态均提供重试或重新生成。应用摘要或标签属于写入阶段，期间统一禁用关闭与重复提交。

标签删除、Mermaid 全屏预览和公开分享页移动目录同样复用公共 Dialog。桌面文档上下文栏和桌面公开目录属于非阻断页面结构，不参与滚动锁。

## 10. 动效与降级

遮罩只改变透明度和可见性；Modal/Command 使用轻微位移与缩放，Sheet 使用纵向位移，Drawer 使用横向位移。动效时长短且不延迟焦点进入或请求状态更新。

所有位移和缩放提供 `motion-reduce` 降级。减少动态效果模式下不得依赖动画表达状态。

## 11. 维护约束

- 新业务浮层先选择语义变体，禁止复制遮罩和面板外壳。
- 不得重新加入面板或遮罩自由 className 入口。
- 不得在业务 hook 中监听全局 Escape。
- 不得使用 `window.confirm` 代替 Alert Dialog。
- 不得用嵌套 Dialog 实现 Dirty guard。
- 破坏性操作必须使用 `alertdialog` 和破坏性按钮。
- Header、Footer 固定，新增长内容只能进入 Body。
- 修改关闭策略时必须同步检查请求取消、防重复、过期响应和焦点返回。
- 新增 Dialog 内 Popover 时使用 220 层级；页面菜单不得覆盖 Dialog。

## 12. 验证原则

基础能力需要验证 Portal、ARIA 关联、初始焦点、焦点圈定、焦点恢复、三种关闭策略、关闭原因、栈顶关闭、滚动锁引用计数、变体样式和 reduced motion。

Dialog 的基础验证还必须包含 `renderToString + hydrateRoot`，并断言关闭状态和打开状态在
hydration 期间都没有 mismatch、pageerror 或 console error。

业务流程需要验证正常完成、失败保留、重复触发、关闭取消、过期响应、Dirty guard、破坏性确认和按钮顺序。响应式验收覆盖手机、平板、桌面和 200% 缩放；键盘验收覆盖打开、填写、确认、取消、关闭及焦点返回。

维护者还应确认：

- 业务代码不存在自建全屏遮罩或浏览器原生确认。
- Dialog 内 Popover、全局 Toast 和页面菜单遵守层级边界。
- 手机软键盘和安全区下主操作仍可到达。
- 显式冲突或恢复流程无法通过 Escape 或遮罩误退出。
