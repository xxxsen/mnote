# API 契约、安全与错误处理

## 1. 功能范围

后端 HTTP API 统一位于 `/api/v1`。本文记录响应信封、鉴权、用户隔离、公开接口、错误码、CORS、限流和输入边界。前端和后端都依赖这些契约。

## 2. 路由分组

### 2.1 公开路由

- 系统属性。
- 注册、验证码、登录和 OAuth 登录流程。
- 公开分享详情、评论读取和受权限控制的评论写入。
- 文件读取。

公开路由不代表无约束：分享接口依赖 Token、密码和权限，文件接口依赖安全 Key，注册依赖系统开关和速率限制。

### 2.2 鉴权路由

- 密码和 OAuth 绑定设置。
- 文档、版本、标签和分享管理。
- 文件上传、资产和引用。
- 待办、模板、导入、导出。
- Embedding 驱动的语义搜索和相似文档。

鉴权中间件解析 Bearer JWT 并写入用户上下文。Handler 不接受请求体中的用户 ID 作为授权依据。

`POST /ai/polish`、`POST /ai/generate`、`POST /ai/summary`、`POST /ai/tags` 和
`PUT /documents/:id/summary` 不属于当前 API，必须保持 404。`GET /documents/summary` 是首页聚合，
`GET /tags/summary` 是标签计数，两者名称中的 summary 不表示文档内容摘要，继续保留。

## 3. 响应信封

JSON 响应统一包含：

- `code`：业务码。
- `message`：面向调用方的稳定说明。
- `data`：成功数据或空值。

前端统一 API 客户端先检查 HTTP 网络层，再解析业务码。成功不能只按 HTTP 2xx 判断，业务失败也不能被当作普通数据。

文件下载、ZIP、HTML 和媒体流属于非 JSON 响应，由对应调用方直接处理响应头和字节流。

Handler 使用显式 Response DTO 和逐字段 mapper，不直接序列化 Repository 持久化 Model。为兼容
现有前端，文档的 `content_hash`、`content_mtime`、`content_revision` 等既有字段仍属于公开契约；
文档对象不包含 `summary`。分享管理列表使用必填 `content_preview`，公开分享文档也不包含摘要。
邮箱规范化值、密码摘要、资产内部状态、租约、重试错误等字段只存在持久化层。新增数据库列不会自动
进入 API，新增响应字段必须同时修改 DTO、mapper、前端类型和契约测试。

### 3.1 文档关联聚合

`GET /api/v1/documents/{id}/links` 位于 JWT 鉴权路由，查询参数如下：

- `include` 省略时同时包含 `incoming,outgoing`；可传一个方向或逗号分隔的两个方向，重复值允许，
  空分段和未知值拒绝；
- `limit` 默认为 20，合法范围为 1～50；
- `incoming_cursor`、`outgoing_cursor` 分别只允许在 include 对应方向时出现；
- `offset` 不受支持，出现即拒绝；
- cursor 最长 512 字节，是包含版本、`mtime` 和文档 ID 的 URL-safe Base64 不透明值。坏 Base64、
  未知字段、未知版本、非正时间或空 ID 都属于无效请求。

成功 `data` 的稳定结构为：

```json
{
  "counts": {"incoming": 2, "outgoing": 1, "unique": 2},
  "incoming": {
    "items": [
      {"id": "doc-id", "title": "Title", "mtime": 1700000000, "mutual": true}
    ],
    "next_cursor": ""
  },
  "outgoing": {"items": [], "next_cursor": ""}
}
```

counts 始终表示完整结果；被 include 的方向始终返回非 null 数组和字符串游标，未 include 的方向字段
省略。当前文档不存在、属于其他用户或已删除统一按未找到处理。响应不包含正文、关系表内部字段或完整
cursor 日志。历史 `GET /documents/{id}/backlinks` 保持原契约供旧客户端使用；新编辑器只使用聚合接口。

## 4. 错误模型

Service 把输入错误、未授权、未找到、冲突、限流、不可用和内部错误转换为项目业务错误。Repository 的 SQL 文本、表名细节和驱动错误不得直接返回前端。

约束冲突需要映射为可操作错误，例如：

- 邮箱或标签名称已存在。
- 编辑器请求缺少基准修订（业务码 `10000015`），或正文基准修订冲突。
- 最后一种登录方式不能移除。
- 分享已过期或密码错误。
- Embedding 未配置或上游暂不可用；`/ai/search` 沿用已发布的 unavailable 业务码。

内部日志保留请求 ID 和错误链，响应只给稳定消息。

Embedding Provider 的错误归一为 `invalid_config`、`invalid_request`、`unauthorized`、`rate_limited`、
`timeout`、`transport`、`upstream_5xx`、`invalid_response` 和 `canceled`。上游响应正文不得进入 API、
持久化错误或日志；401/403 等永久错误不由备用端点掩盖。

当存在 active V2 但远程 Embedding 被显式关闭、当前 Profile 客户端未配置或 Provider 暂不可用时，
语义搜索返回既有 `ErrAIUnavailable` 业务码和 `ai unavailable` 稳定消息，不能静默回退到 V1 或其他
Profile。相似文档不需要生成 query vector；显式关闭时返回成功空列表及 `index_status: disabled`，
尚在构建、源文档未索引和可用状态分别返回 `building`、`pending` 和 `ready`。

## 5. JWT 和用户隔离

- JWT 包含服务端签发的用户身份和有效期。
- 密钥只来自后端配置。
- Repository 查询把用户 ID 放入 SQL 条件。
- 关系写入验证所有实体属于同一用户。
- 未授权业务码触发前端清理本地会话。

JWT 存于 `localStorage`，因此前端必须严格控制 XSS。系统不使用 Cookie 会话时不依赖传统 CSRF Token，但仍要限制危险 HTML 和脚本执行。

## 6. 可选鉴权

公开评论写入可选解析 JWT：

- 有有效 JWT 时关联登录用户。
- 无令牌时按匿名流程继续。
- 携带格式错误或过期令牌时，应按接口既定策略拒绝或降级，不能把攻击者传入的身份字段当作登录用户。

可选鉴权中间件不能影响分享 Token 的权限校验。

## 7. CORS

后端按配置的前端 Origin 列表返回 CORS 头。开发模式由 `make dev` 生成与前端端口匹配的 Origin。生产环境应配置明确 Origin；空配置或通配只适用于确有需要且不发送凭据的场景。

新增前端域名时同步更新 OAuth 回调地址和分享 URL 基址。

## 8. 限流

登录、验证码、OAuth、公开分享、评论和语义检索等高成本或可滥用接口按 IP、用户或路径限流。当前进程
内限流适合单实例；多实例需要网关或共享存储。

限流 Key 必须信任正确的代理链配置，不能直接接受任意伪造转发头。

## 9. 输入边界

- JSON Body 限制大小并执行字段校验。
- 分页参数有默认值和最大值。
- ID、版本号、时间和日期格式严格解析。
- 文本字段按 Unicode 字符和业务上限校验。
- 上传和 ZIP 同时限制原始大小、解压大小和条目数量。
- 文件 Key 拒绝目录跳转。
- URL 和 Markdown HTML 按不可信内容处理；Embedding 只作为数值向量使用，不能写入正文或渲染。

Handler 只完成协议层验证，跨实体约束由 Service 执行。正文保存的 `base_revision` 必须是正数；缺失时返回 `editor client update required` 且不得写库。基准不一致属于正常业务冲突，响应返回当前修订元数据但不回传正文。

## 10. 请求取消和超时

普通请求把客户端取消传给数据库和外部调用。Embedding 和文件操作设置显式超时。已经确认需要后台完成
的导入任务脱离单次 HTTP 请求，但受服务生命周期控制。

前端快速查询应取消旧请求或忽略旧响应，写请求则按业务序号和幂等规则处理，不能简单取消后假设服务端未执行。

## 11. 不可破坏的约束

- 业务 JSON 使用统一信封和稳定业务码。
- 所有私有资源在后端按用户隔离。
- 请求体用户 ID、邮箱或展示名不能成为授权依据。
- SQL、密钥、Token 和上游敏感响应不暴露给客户端。
- 公开接口仍执行资源范围、输入和限流校验。
- 非 JSON 响应明确设置内容类型、下载名和安全头。
- 新接口必须纳入统一中间件、错误和日志体系。
- 相似文档必须先校验源文档所有权；查询在 SQL 召回前按用户、normal 状态、active Generation 和当前
  内容哈希过滤，要求对应 Job 为 succeeded 且 desired hash 与 index hash 一致，并排除源文档。
- active Generation 在查询期间切换时完整重试一次；连续切换返回统一的 AI unavailable，不返回跨向量
  空间混合结果。

## 12. 验证要点

- 成功、验证失败、未授权、未找到、冲突、限流和内部错误均能被前端正确识别。
- 跨用户直接猜测 ID 无法读取或修改资源。
- 过期 JWT 和格式错误 Header 不会进入私有 Handler。
- CORS 只允许配置来源，预检请求正确。
- 上传、分页、文本和压缩包边界被后端执行。
- 日志可定位请求但不包含敏感正文或凭据。
- DTO 序列化测试确认密码摘要、规范化邮箱、资产内部状态、租约和内部错误不会进入响应。
- 文档关联接口验证 include/limit/cursor 边界、空数组、方向字段省略、稳定分页、自引用、软删除、
  Mutual、跨用户隔离、未找到和旧 backlinks 兼容性。
- 语义搜索和相似文档验证跨用户隔离、`exclude_id`、未索引/重建中状态、相关度阈值和响应字段兼容性。
