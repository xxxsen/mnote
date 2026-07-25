# Embedding 与语义检索

## 1. 功能边界

mnote 只保留与 Embedding 直接相关的模型能力：

- 文档保存后的异步向量索引；
- 文档分块向量的持久化与缓存；
- 文档库语义搜索；
- 编辑器中的相似文档推荐；
- 多个 Embedding Provider 的顺序故障切换。

系统不提供文档摘要、内容生成、正文润色或标签建议，也不会向模型发送写作 Prompt 或调用
chat/content-generation 接口。模型不可用时，文档编辑、保存、普通搜索、标签、分享、导入和导出仍可用。

## 2. 对外接口

语义检索保留已发布的兼容路径：

```http
GET /api/v1/ai/search?q={query}&limit={limit}&offset={offset}&exclude_id={document_id}
Authorization: Bearer {token}
```

参数约束：

- `q` 去除首尾空白后不能为空；
- `limit` 由服务端限制到安全范围；
- `offset` 当前只允许为 `0`，非零值返回参数错误；
- `exclude_id` 可选，相似文档查询用它排除当前文档。

响应中的 `items` 是当前用户有权读取的文档，每个元素通过 `score` 字段携带语义匹配分数。接口沿用
`ErrAIUnavailable` 兼容错误码；内部实现和日志使用 embedding/semantic 命名。普通标题/正文搜索不调用
该接口，也不依赖向量服务。

## 3. 配置

`ai.enabled` 是 Embedding 总开关。启用时可以通过默认 `provider`/`model` 配置单个来源，也可以通过
`embed` 数组配置有序故障切换：

```json
{
  "ai_provider": [
    {
      "name": "primary",
      "type": "openai",
      "data": {
        "api_key": "${EMBEDDING_API_KEY}",
        "base_url": "https://api.openai.com/v1"
      }
    }
  ],
  "ai": {
    "enabled": true,
    "provider": "primary",
    "model": "text-embedding-3-small",
    "embed": [
      {
        "provider": "primary",
        "model": "text-embedding-3-small"
      }
    ]
  },
  "ai_job": {
    "embedding_delay_seconds": 300
  }
}
```

`ai_provider[].name` 是本地引用名，`type` 选择 Gemini、OpenAI-compatible 或 OpenRouter 适配器。
`ai.embed` 的顺序就是故障切换顺序。配置使用严格未知字段校验，已移除的文本生成、摘要、标签建议开关和
任务参数会使进程拒绝启动，部署时必须先清理旧配置。

关闭能力时使用：

```json
{
  "ai": {
    "enabled": false
  },
  "ai_job": {
    "embedding_delay_seconds": 300
  }
}
```

## 4. 启动装配

`cmd/mnote` 只初始化 `ai.embed` 引用的 Provider。每个 Provider 被包装为 `IEmbedder`，多个 Embedder
组成 `GroupEmbedder`。调用时按配置顺序尝试，首个成功结果生效；全部失败才向业务层返回错误。

Embedder 外层依次叠加：

1. 数据库 Embedding 缓存，跨进程复用相同模型和输入的结果；
2. 进程内 LRU/TTL 缓存，减少热点请求的数据库与上游开销。

缓存键包含模型标识和规范化输入，切换模型不会错误复用旧向量。Provider 的运行时接口只包含 `Name` 和
`Embed`；不得重新引入 Generator、文本结果缓存或生成式 Manager。

## 5. 文档索引数据流

既有文档正文变化时，保存事务更新 `content_hash`、`content_mtime`、版本、标签、链接和资产引用，并
调用 `MarkEmbeddingPending` 记录待处理状态。新建文档尚无 Embedding 行，由扫描器的“缺少索引”分支纳入
首次处理。远程向量请求不在数据库事务中执行。

后台任务按以下流程收敛状态：

1. 扫描内容哈希与成功索引不一致的文档；
2. 原子领取任务并写入带期限的租约；
3. 在事务外按 Markdown 结构分块并请求向量；
4. 提交时锁定文档并再次核对预期内容哈希；
5. 哈希一致时替换分块并标记成功；
6. 哈希已变化时丢弃过期结果，让最新正文重新进入 pending；
7. 可重试失败记录错误和下次重试时间，限流错误释放租约后等待后续轮次。

状态机使用 `pending | running | succeeded | failed`。领取、租约和提交均由 Repository 的原子 SQL 或短
事务完成，支持多实例 Worker 并发运行。

## 6. Markdown 分块

`Chunker` 按标题、普通文本和代码块生成带位置的原文分块，并为较长内容保留必要 overlap。长代码块直接
按原文切分；分块过程不会调用模型生成代码摘要，也不会产生特殊的生成内容块。空文档不会创建无意义向量。

每个分块保存：

- 文档和用户标识；
- 原文内容及位置；
- 分块类型；
- 向量。

正文内容哈希保存在文档级 `document_embeddings` 行，并在整批分块提交时做一致性校验，不重复写入每个
分块。

修改分块规则时必须验证标题层级、混合文本/代码、长代码和 overlap，并确保不会改变保存事务或引入远程
生成调用。

## 7. 语义排序

查询文本使用检索任务类型生成向量，Repository 从当前用户的分块中召回候选。Service 按文档聚合多个
分块得分、过滤低于阈值的结果、排除 `exclude_id`，再读取文档实体并保持得分顺序。数据库查询必须包含
用户隔离条件；不能依赖前端过滤其他用户的数据。

文档库把语义结果作为独立结果区域展示，不替换普通列表。相似文档使用同一接口，查询当前文档内容并排除
自身。请求被取消或新查询开始时，前端取消旧请求并忽略过期响应。

## 8. 缓存清理与观测

Scheduler 注册：

- `ai_embedding`：推进待处理向量任务；
- `embedding_cache_cleanup`：清理过期数据库缓存。

不注册任何摘要或文本生成任务。日志记录领取数量、成功/失败、过期提交、限流冷却和语义召回数量，不记录
完整正文、查询文本、API Key 或向量内容。监控至少关注 pending 积压、失败率、处理延迟、Provider
限流和缓存命中情况。

## 9. 安全与维护约束

- 所有语义检索请求必须经过认证并使用服务端用户标识；
- Provider Key 只能来自部署配置或环境变量，不进入日志、响应和导出；
- 对上游调用设置超时并传播客户端取消；
- 向量和查询文本按敏感用户内容处理；
- 模型输出仅作为数值向量使用，不渲染为 HTML 或写入文档正文；
- Provider 配置严格解析，未知键必须报错；
- 文档正文保存不得等待上游模型；
- 新增 Provider 时只能实现 Embedding 接口，不得扩展文本生成能力。

## 10. 验证

修改该能力后至少验证：

- Provider 正常、失败、超时和顺序故障切换；
- 缓存键包含模型，缓存命中和过期行为正确；
- 标题、文本、代码和超长代码分块均产生原文分块；
- pending、领取、租约过期、失败退避、哈希漂移和 CAS 提交；
- 用户隔离、阈值、排序、分页和 `exclude_id`；
- 文档保存不被 Provider 失败阻断；
- `GET /api/v1/ai/search` 保持可达，已删除的生成式接口保持 404；
- 禁用配置时不初始化 Provider、不注册 Embedding 任务，普通功能正常。
