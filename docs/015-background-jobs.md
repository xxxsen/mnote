# 后台任务与调度

## 1. 功能范围

后台执行分为周期 Scheduler 和常驻 Worker。Scheduler 负责文档向量、Embedding 缓存和导入历史清理；
常驻 Worker 负责可恢复导入和失败资产收敛。任务在 HTTP 服务进程内运行，数据库状态是唯一事实源。

## 2. 生命周期

服务启动完成依赖初始化后注册定时任务，调度器开始运行。服务关闭时：

1. 停止接受新调度。
2. 等待或取消可安全中断的任务。
3. 释放数据库、存储和 Provider 资源。

任务统一使用应用级 context，不从 HTTP 请求派生 goroutine。`SIGINT/SIGTERM` 或监听失败会撤销
Worker context，停止领取新记录，等待当前短事务结束，并在超时内关闭 Scheduler、HTTP Server 和
数据库。HTTP readiness 只有应用启动完成且数据库可 Ping 时返回成功。

## 3. 向量任务

未激活 V2 Generation 时保留 V1 分钟级扫描。首次激活后，常驻 V2 Worker 只处理
`embedding_jobs`：

- 文档创建和正文保存事务为 active、building 和有效 standby 写入目标内容哈希，并按
  `index_delay_seconds` 防抖；
- Worker 通过 CTE、`FOR UPDATE SKIP LOCKED` 和 `UPDATE ... RETURNING` 原子领取，每次生成新的
  UUID claim token；
- running 状态带租约；续租条件包含 claim token，续租失败会取消正在进行的 Provider 请求；
- Provider 调用前读取当前内容，提交时在短事务内重新校验 token、目标哈希、文档状态和当前哈希；
- 完成事务原子替换当前 Generation 的 chunks、index 和 centroid，再标记 succeeded；
- stale 结果不算失败，可重试错误指数退避，永久错误和达到重试上限的任务进入 dead；
- 新正文覆盖 running Job 时会撤销旧 claim，旧 Worker 不能提交过期结果。

Worker 限制每文档批量和全局外部并发。并发大于 1 时保留 building 配额；并发为 1 时在 active、
building 和 standby 间公平轮询。数据库 claim token 和租约保证多实例不会正常并发提交同一任务。

配置了 V2 Profile 但设置 `ai.enabled=false` 时不启动 Worker，也不初始化远程 Provider；文档事务仍以
queue-only 模式维护 active、building 和未过期 standby Job。这样关闭远程能力不会让 desired 状态与正文
继续漂移，恢复后可以从持久化队列续跑。若已有 active V2，该模式不会重新启用 V1 Worker 或 V1 写入。

Worker 完成前不仅校验 claim token 和正文哈希，还校验 Generation 仍为 active/building 或未过期
standby，并校验 Profile ID/fingerprint 与领取快照一致。building 被 `--restart` 替换、standby 被手工
或定时退役时，相关 running Job 会被 fence 为 dead 并清除 claim/lease；旧请求即使稍后返回也不能写入。

向量任务只调用 Embedding Provider。Markdown 分块保留原文，长代码块不会触发文本生成或摘要调用。
标题和正文均为空时仍以零分块 index 表示成功，而不是形成永久重试。

## 4. Embedding 维护与缓存清理

小时级 V2 维护任务：

- 自动把超过有效期的 standby 标记为 retired；
- 只在 retired/failed 保留期届满后分批删除 Job、index 和 chunk 派生数据；
- 分批删除超过 TTL 的 `embedding_cache_v2`；
- 刷新 Job 数、最旧可领取任务、覆盖率和 Provider cooldown 指标。

V1 缓存清理在兼容期保留。V2 进程内 LRU 自行按 TTL 淘汰，DB 缓存读取失败 fail-open。所有清理查询
都有批次上限，删除不影响文档主数据；后续请求可以重新生成。

## 5. 导入 Worker 与清理

确认仅把 ready Job 原子切为 running。常驻 `ImportWorker` 领取 running 或租约过期 Job，每条 Note
使用独立事务写正式文档和终态。崩溃后租约恢复，单条输入错误不阻止其余 Note。

导入清理按小时、每批最多 500 个删除超过保留期的 done/failed Job，Note 通过外键级联删除。
parsing、ready、running 不按普通过期条件删除。

## 6. 资产清理 Worker

上传先建立 pending 资产，再保存对象，最后标记 ready；保存失败标记 failed。常驻资产 Worker 每小时
最多处理 500 条超过一小时的 pending/failed 记录，通过行租约互斥删除对象和记录。ready 资产以及
租约未过期的上传不会被清理；对象删除失败保存稳定错误并释放租约供以后重试。

## 7. 重叠和多实例

同一进程内的定时任务应避免前一轮未结束时重叠启动。跨实例互斥不能只依赖进程内锁，必须通过数据库领取、租约、advisory lock 或幂等清理条件实现。

各任务采用不同保护策略：

- 向量：按记录租约和内容哈希提交保护。
- V2 向量：按 Generation/文档唯一行、claim token、租约和内容哈希提交保护。
- 导入：任务租约、Note 行锁和 Note 终态。
- 资产：记录租约和 ready 状态保护。
- 清理：按过期条件幂等删除。

## 8. 可观测性

日志记录任务名称、Generation、批次 ID、扫描数量、成功/失败数量、耗时和归一化错误。不得记录文档
标题、正文、查询文本、命中片段、向量、Provider 原始响应、Provider 密钥或验证码。

永久失败和连续重试应可被运维发现。单条数据错误不应让整批任务退出，除非数据库或配置处于系统性不可用状态。
`/metrics` 提供按状态和 Profile 聚合的 Job、覆盖率、延迟、Provider、cooldown、缓存、非法向量和语义
查询指标；同一 Profile 的多个在线 Generation 按状态求和，等待时间取最旧值，同一 Provider 的多个
cooldown 取最长剩余时间；标签不得包含用户、文档或查询。

## 9. 不可破坏的约束

- 后台任务不在用户请求事务中调用长时间外部服务。
- 向量任务提交结果前检查内容哈希。
- 服务重启后租约过期任务可以恢复。
- 同一记录的并发处理通过数据库状态协调。
- 清理任务只删除可再生成或明确过期的数据。
- 任务停止和服务关闭有确定的取消边界。
- Embedding 失败不影响正文保存和读取。
- Scheduler 不得注册文本生成或文档摘要任务。
- Generation 切换和回滚只由控制面命令执行，后台维护不能自动激活 building。

## 10. 验证要点

- 正常周期可以领取、处理并更新状态。
- Embedding Provider 失败触发持久化退避，不形成热循环。
- 向量处理期间正文变化时旧结果被丢弃。
- 向量和导入进程崩溃后租约过期记录可重新处理。
- 多实例下向量、导入和资产领取保持互斥。
- V2 lease 过期重领会产生新 token，旧 Worker 的续租、成功和失败更新都被拒绝。
- 重启 building、退役或 standby 到期后，旧 token 的续租和完成均被 Generation fence 拒绝。
- claim 正常完成或被 fence 后主动取消 context，不会把重叠的 `context canceled` 续租误报为 Worker
  系统故障；真实数据库续租错误仍会终止 Worker 并交由进程监督。
- queue-only 模式继续维护 desired Job，同时不调用 Provider、不写 V1 且语义接口返回稳定禁用状态。
- active 切换后 standby 继续接收正文变更，并能在有效期内完成覆盖率门禁后回滚。
- retired/failed Generation 和缓存数据按小批次清理，不形成长事务或删除文档主数据。
- 清理任务不会删除运行中任务或主业务数据。
- 服务关闭后不再启动新任务，已有任务按约定结束。
