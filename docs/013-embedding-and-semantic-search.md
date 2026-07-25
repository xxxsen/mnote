# Embedding 索引与语义检索

## 1. 功能边界

mnote 只保留以下 Embedding 能力：

- 文档保存后的异步向量索引；
- 文档库语义搜索；
- 基于已索引正文的相似文档推荐；
- 同一向量空间内多个兼容 Provider 端点的故障切换；
- 索引全量重建、原子切换、回滚和退役。

系统不提供摘要、内容生成、正文润色或 AI 标签。Provider 不可用、索引正在重建或 Embedding 被关闭时，
文档编辑、保存、普通搜索、版本、标签、分享、资产、导入和导出均不依赖远程模型。

## 2. Profile 与 Generation

Embedding V2 使用两个不可混淆的身份：

- Profile 描述不可变向量空间，包含 `space_id`、模型、维度、距离度量、query/document task type 和
  `chunker_version`。这些字段按固定顺序计算 SHA-256 fingerprint；同一个 Profile ID 不允许改变
  fingerprint。
- Generation 是某个 Profile 的一次完整索引构建，状态为
  `building | active | standby | retired | failed`。查询只读取唯一 active Generation。

模型、维度、任务类型或分块规则变化时必须新建 Profile 和 Generation，不能把新向量覆盖到旧索引。旧
active 在切换后进入有效期默认 24 小时的 standby；保存事务在此期间同时维护 active、building 和有效
standby，因此可以无损回滚。

## 3. 配置

Embedding 开启后默认使用 V2。已有部署可以保留原来的单模型配置：

```json
{
  "ai_provider": [
    {
      "name": "gemini",
      "type": "gemini",
      "data": {"api_key": "${GEMINI_API_KEY}"}
    }
  ],
  "ai": {
    "enabled": true,
    "provider": "gemini",
    "model": "text-embedding-004",
    "embed": [{"provider": "gemini", "model": "text-embedding-004"}]
  }
}
```

配置加载时会把这种单模型配置解析为 ID 为 `default-v2` 的默认 Profile。Gemini 和
`text-embedding-004` 默认使用 768 维；OpenAI/OpenRouter 以及 OpenAI
`text-embedding-3-*`/`text-embedding-ada-002` 默认使用 1536 维。同一 `embed` 列表中只有与首项模型
一致且唯一存在的 Provider 会进入默认 Profile，顺序保持为故障切换顺序。未知 Provider 类型不会被
静默猜测；这类部署必须填写完整 Profile。

需要明确空间版本、非默认维度、多个 Profile 或后续模型切换时使用完整配置：

```json
{
  "ai_provider": [
    {
      "name": "embedding-primary",
      "type": "openai",
      "data": {
        "api_key": "${EMBEDDING_API_KEY}",
        "base_url": "https://api.openai.com/v1"
      }
    },
    {
      "name": "embedding-backup",
      "type": "openai",
      "data": {
        "api_key": "${BACKUP_EMBEDDING_API_KEY}",
        "base_url": "https://backup.example.com/v1"
      }
    }
  ],
  "ai": {
    "enabled": true,
    "profiles": [
      {
        "id": "notes-embedding-v2",
        "space_id": "text-embedding-3-small@2024-01",
        "model": "text-embedding-3-small",
        "dimensions": 1536,
        "metric": "cosine",
        "chunker_version": 2,
        "query_task_type": "RETRIEVAL_QUERY",
        "document_task_type": "RETRIEVAL_DOCUMENT",
        "min_score": 0.55,
        "providers": ["embedding-primary", "embedding-backup"]
      }
    ],
    "request_timeout_seconds": 30,
    "worker_concurrency": 2,
    "batch_size": 16,
    "index_delay_seconds": 300,
    "lease_seconds": 120,
    "lease_renew_seconds": 30,
    "max_attempts": 10,
    "standby_hours": 24
  }
}
```

约束如下：

- Profile 至少引用一个唯一存在的 Provider，顺序是同空间兼容端点的故障切换顺序；
- 支持的维度为 384、768、1024 和 1536，度量固定为 cosine，V2 分块版本固定为 2；
- `request_timeout_seconds` 范围 5–120，`worker_concurrency` 范围 1–16，`batch_size` 范围 1–64；
- lease 至少是请求超时两倍，并大于续租间隔三倍；
- `index_delay_seconds` 范围 0–3600，默认 300；兼容期未填写时继承
  `ai_job.embedding_delay_seconds`，两处显式配置不一致会拒绝启动；
- `min_score` 是 `[-1, 1]` 内的相关度阈值，不是概率；
- 配置严格拒绝未知字段。

启动时无论 `ai.enabled` 是否为 true，服务都会读取现有 Generation。所有 `active`、`building` 和
`standby` Generation 的 Profile ID 必须仍在配置中，且数据库内不可变 Profile 的 fingerprint 必须与
当前配置重新计算的值一致；缺失或漂移会拒绝启动，避免进程在无法解释现有向量空间时继续写入。

配置了 Profile 但显式设置 `ai.enabled=false` 时，服务进入 queue-only 模式：不初始化远程 Provider，
不启动 V2 Worker，语义搜索返回稳定的 unavailable/disabled 状态；文档事务仍维护 active、building 和
有效 standby 的 desired Job。重新启用后 Worker 可从数据库状态继续收敛，不需要重新保存文档。若已有
active V2，queue-only 模式也不会恢复 V1 写入或查询回退。

首次启动且数据库还没有任何 V2 Generation 时，服务为配置顺序中的第一个 Profile 自动创建
`reason=initial` 的 building Generation，种入全部 normal 文档并启动 Worker。覆盖率达到 100%、队列
无 pending/running/failed/dead/missing/hash drift、向量结构校验和 query/document Provider preflight
全部通过后，后台引导 Worker 原子激活该 Generation；失败只延后 V2 激活并保留 V1 查询，不阻塞文档等
非 Embedding 功能。进程重启会继续同一个 initial Generation，并幂等补种可能因上次退出而缺失的 Job，
不会重复创建 Generation。

迁移已有 V1 的部署会保留旧字段和旧索引，在首个 V2 Generation 构建期间继续提供 V1 查询。首个 V2
Generation 激活后，运行时停止 V1 入队、有效计算和查询回退，但保留 V1 表。纯 V2 显式配置可以不填写
旧 `ai.provider/model/embed`；此时 building 尚未激活前没有 V1 查询空间，语义搜索返回 unavailable，
全量构建仍会继续。

自动创建和自动激活只适用于数据库中的第一个 initial Generation。已有任意 Generation 后，模型、维度、
任务类型、分块规则或 Profile 的变化仍必须通过控制命令完成影子构建和显式切换，避免配置误改直接替换
线上向量空间。

## 4. 数据模型

Migration `015_embedding_index_v2.sql` 创建独立的 V2 数据面：

- `embedding_profiles`：不可变 Profile 及 fingerprint；
- `embedding_generations`：构建、激活、standby、失败和退役状态；
- `embedding_jobs`：每个 Generation/文档一行的 desired hash/revision、状态、claim token 和 lease；
- `document_embedding_indexes`：已提交的 indexed hash/revision、分块数和归一化 centroid；
- `chunk_embeddings_v2`：带 Generation、用户、位置、类型、原文和维度的分块向量；
- `embedding_cache_v2`：按 Profile、task type 和内容哈希隔离的向量缓存；
- `embedding_provider_cooldowns`：多实例共享的 Provider 429 cooldown。

向量维度通过表级 CHECK 和 384/768/1024/1536 四组部分 HNSW 表达式索引约束。chunk、centroid 和
缓存向量还必须具有大于零的范数，零向量、错误维度和非有限值均不能进入数据面。Job、索引和分块通过
复合外键校验文档所有权；物理删除由外键级联，软删除由文档事务主动清除 V2 派生数据。

## 5. 文档写入与 Job 状态机

文档创建和正文保存事务在本地数据全部成功后调用 `EnqueueContentChange`：

1. active、building 和未过期 standby Generation 都创建或更新 Job；
2. 新哈希设置 `pending`，重置 attempts/error/claim，并把 `available_at` 推迟到最新保存时间加防抖；
3. 哈希未变化时保留当前状态和 claim，只更新 desired revision；current index 同步更新 indexed revision；
4. 创建 Generation 时从 normal 文档按固定批次种入立即可处理的 Job；
5. 文档软删除在同一事务删除对应 V2 Job、document index 和 chunks。

Worker 使用单条 CTE、`FOR UPDATE SKIP LOCKED` 和 `UPDATE ... RETURNING` 原子领取任务。领取只匹配 normal
文档且 `documents.content_hash = desired_content_hash`。每次领取生成新的 UUID claim token 并原子增加
attempts；旧 Worker 即使在 lease 过期后返回，也不能覆盖新 Worker。

Worker 按 claim token 定期续租。续租影响零行会取消 Provider context。完成时在短事务内锁定 Job，重新
验证 token、desired hash、文档状态、当前 hash、Generation 状态、有效 standby 窗口、Profile ID 和
fingerprint，再替换当前 Generation 的 chunks、写入 document index 和 centroid，最后提交 succeeded。
revision 变化但 hash 相同允许完成，并记录提交时 revision。CAS 不匹配是 stale，不计失败。完成、stale
或 Generation fence 主动取消 claim context 时，与取消重叠的续租请求按正常结束处理；只有 context 仍
有效时发生的数据库续租错误才会终止 Worker。

`--restart` 替换 building Generation，以及手工或定时退役 standby 时，会把该 Generation 尚在 running
的 Job 原子标记为 dead 并清除 claim/lease。旧 Worker 随后的续租或完成都会因 Generation fence 或
claim token 不匹配而失败。

失败更新同样携带 claim token。可重试错误使用指数退避
`min(60s * 2^(attempts-1), 1h) + 0–20% jitter`；达到 `max_attempts` 进入 dead。配置错误、请求错误和
401/403 直接 dead。429 使用合法 Retry-After，缺失时按 60 秒，并写共享 cooldown。dead 只能通过 retry
或新 Generation 恢复。

单实例并发大于 1 时保留一个执行槽优先 building，其余优先 active；并发为 1 时按
`active, building, active, standby` 轮询，空队列立即让出配额。

## 6. Provider、缓存和分块

Profile Embedder 接收批量输入，并保证一个批次完全由同一兼容端点产生。Adapter 负责：

- 复用连接池和 Client，并传播显式请求超时与取消；
- 对支持的 API 发送批量输入和目标维度；
- OpenAI-compatible 响应提供 `index` 时按 index 还原输入顺序并拒绝重复、越界或部分缺失的 index；
  完全不提供 index 的旧兼容端点按响应顺序兼容；
- 验证输出数量、维度、非空和所有数值有限；
- 对成功响应和错误响应使用有界 Reader；
- 不把正文、查询、API Key 或上游响应正文写入错误、日志或指标。

稳定错误码为 `invalid_config`、`invalid_request`、`unauthorized`、`rate_limited`、`timeout`、
`transport`、`upstream_5xx`、`invalid_response` 和 `canceled`。只有 timeout、transport、5xx 和无效响应
会尝试下一个兼容端点；429 立即进入共享 cooldown；永久错误不由备用端点掩盖。连续瞬时错误还会触发
进程内短熔断。

缓存读取顺序为 LRU/TTL、DB Cache V2、singleflight、Provider。进入 singleflight 临界区后会再次检查
LRU，避免已经判定 miss、但调度较晚的并发调用在首次请求完成后再次调用 Provider。共享请求在释放等待者
前写入 LRU/DB，因此同 key 并发只产生一次上游调用。DB 读取失败 fail-open；维度、有限值或范数非法的
缓存项会被删除并回源。默认 TTL 为 30 天，清理由有上限的小批次完成。

Chunker V2 的单位是 UTF-8 字节，目标上限 400、硬上限 512、同章节 overlap 60。非空标题生成 title
块；正文块包含受上限约束的文档标题和 H1/H2/H3 breadcrumb。正文按段落、句子、行和 rune 边界递归
拆分，代码按行和 rune 边界拆分。overlap 不跨章节；位置从 0 连续递增且相同输入输出稳定。标题和正文都
为空时以零分块 index 行表示成功。

文档 centroid 在 Go 中对分块向量加权平均并 L2 归一化：title 1.2、text 1.0、mixed 0.9、code 0.7。

## 7. 语义搜索与相似文档 API

兼容语义搜索：

```http
GET /api/v1/ai/search?q={query}&limit={limit}&offset=0&exclude_id={document_id}
Authorization: Bearer {token}
```

查询使用 active Profile 的 query task。SQL 在召回前应用用户、normal 文档、Generation、
`exclude_id`、`embedding_jobs.status=succeeded`、Job desired hash 与 index hash 一致，以及 index hash
与当前文档 hash 一致等过滤，每篇文档最多保留三个最佳分块。召回量为
`clamp(limit * 20, 200, 1000)`。小于等于 20,000 个有效用户分块时事务内关闭向量 index scan，走精确
路径；更大数据集使用对应维度 HNSW 表达式索引，并在事务内启用 pgvector strict-order iterative scan。
最终分数 clamp 到 `[-1, 1]` 并应用 Profile `min_score`。

查询完成后会复核 active Generation。若控制面恰在一次语义或相似文档查询期间切换 Generation，读路径
丢弃旧空间结果并完整重试一次（语义搜索会按新 Profile 重新生成 query vector）；连续两次遇到切换时
返回稳定的 AI unavailable，不混合不同空间的向量，也不把正常切换暴露为普通内部错误。

响应元素除原有 `score` 外包含可为空的：

```json
{
  "matched_excerpt": "matched indexed content",
  "match_type": "title"
}
```

相似文档接口：

```http
GET /api/v1/documents/{id}/similar?limit=5
Authorization: Bearer {token}
```

服务端先验证源文档所有权，再在同用户、同 active Generation 的 current centroid 中排除自身并检索，
并使用 active Profile 的 `min_score` 过滤低相关结果。源文档尚未索引时返回成功空列表和
`index_status: pending`，不会临时上传标题或正文。状态还可能为 `ready`、`building` 或 `disabled`。

前端把分数显示为 `Relevance N`，不把相关度表达成准确率百分比。普通搜索列表独立于语义请求；相似文档
只在用户打开面板时按文档 ID 请求，标题变化不会触发重复向量请求。

## 8. 重建、切换和回滚

控制面只通过 CLI 暴露：

```bash
mnote embedding status --config config.json
mnote embedding rebuild --config config.json --profile notes-embedding-v2 --reason model_change
mnote embedding retry --config config.json --generation <uuid> [--document <id>]
mnote embedding activate --config config.json --generation <uuid>
mnote embedding rollback --config config.json --generation <uuid>
mnote embedding retire --config config.json --generation <uuid>
```

首次 V2 构建由服务启动流程自动完成，不需要额外执行 `rebuild` 或 `activate`。以下命令用于后续模型
升级、重新分块、人工修复、回滚和退役。

`rebuild` 在创建 Job 前使用固定非用户文本分别执行 query/document task preflight；失败不创建 Generation。
同 Profile 已有 building 时默认返回现有 ID，`--restart` 才把旧 building 标成 failed 并重建。

`activate` 要求 building 的所有 normal 文档都有 current index，且不存在 pending/running/failed/dead、
missing 或 hash drift；Profile 必须仍在当前配置且 fingerprint 一致。命令还会抽样验证 chunk/centroid
维度和有限值，并完整验证 index `chunk_count` 与实际 chunk 数量及 orphan chunk；非零范数由表级 CHECK
保证。命令还执行 query/document preflight。通过后在 advisory lock 和表锁保护的事务内把旧 active
改为 standby，再把 building 改为 active。current 统计要求存在 desired hash 匹配的 succeeded Job，
不能仅凭 index 行通过激活门禁。

`rollback` 只接受尚未过期且覆盖率 100% 的 standby，并执行相同配置、向量和 Provider 健康检查。
`retire` 只接受已到期 standby。小时级维护任务自动退役超期 standby；retired 数据以及
`rebuild --restart` 留下的 failed Generation 数据保留 7 天后按小批次删除。

## 9. 可观测性与安全

根路径 `/metrics` 输出 Prometheus 文本，包含：

- `embedding_jobs{status,profile}`；
- `embedding_job_oldest_ready_seconds`；
- `embedding_index_coverage_ratio{generation}`；
- `embedding_job_duration_seconds`；
- `embedding_provider_requests_total{provider,result}`；
- `embedding_provider_latency_seconds{provider}`；
- `embedding_provider_cooldown_seconds{provider}`；
- `embedding_cache_requests_total{layer,result}`；
- `embedding_invalid_vectors_total{reason}`；
- `semantic_search_duration_seconds{path}`；
- `semantic_search_candidates_total`。

同一 Profile 存在多个在线 Generation 时，Job 数按 Profile/状态求和，最旧等待时间取最大值；同一
Provider 被多个 Profile 复用时，cooldown 取最长剩余时间。指标标签不得包含用户、文档或查询。日志不得
记录标题、正文、查询、命中片段、向量、API Key、Authorization Header 或 Provider 原始响应。部署层
应仅允许监控网络访问 `/metrics`。

`scripts/audit-db.sql` 按数据库 Profile 字段重新计算 fingerprint，并检查多 active/building、Job
所有权、current index 是否有匹配的 succeeded Job、desired/index/document 的 hash/revision 一致性、
index `chunk_count`、Profile/index/chunk/cache 维度、非零范数、孤儿 chunk、过期 lease 和超期
standby。可查询一致性检查只覆盖 active、building 和未过期 standby；retired/failed Generation 允许
处于 7 天保留期或有界分批清理的中间状态。

## 10. 维护与验证

涉及该能力的修改至少验证：

- Profile 不可变性和新 Profile 全量重建；
- Provider 批量数量、维度、NaN/Inf、超时、取消、fallback、429 和永久错误；
- LRU/DB/singleflight、TTL、DB fail-open 和损坏缓存回源；
- Chunker 标题、breadcrumb、长文本、长代码、Unicode、overlap、空文档和稳定输出；
- 并发领取、lease 续期、过期重领、旧 token 完成、保存竞态、软删除和失败退避；
- current hash、用户隔离、`exclude_id`、阈值、排序、精确/HNSW 路径和 centroid 相似文档；
- rebuild 幂等、activate 门禁、standby 持续维护、rollback 和 retired 分批清理；
- disabled、Provider 超时和 building 状态下所有非 Embedding 功能不等待远程服务。

数据库变更必须同时验证空库完整迁移和上一版本升级，并用 `EXPLAIN (ANALYZE, BUFFERS)` 确认大数据查询
命中对应维度 HNSW 表达式索引。
