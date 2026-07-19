# 数据模型与数据库迁移

## 1. 功能范围

PostgreSQL 是账户、文档、关系、分享、导入、摘要、资产状态和向量索引的事实源。数据库结构和一次性
数据演进只允许由 `internal/db/migrations/*.sql` 定义；后端 Go 代码只负责发现、排序、校验并执行
这些 SQL，不包含 DDL 字符串、业务表探测或历史数据库特判。

## 2. 核心实体

### 2.1 用户与登录

- `users` 保存原始邮箱、规范化邮箱、密码摘要和时间字段；`email_normalized` 在有效账户中唯一。
- `email_verification_codes` 使用 `pending|sent|used|failed` 状态记录邮件发送和消费结果。
- OAuth 绑定表把 Provider 外部身份唯一映射到本地用户。
- `oauth_one_time_tokens` 保存 OAuth state 和登录 exchange code 的摘要、用途、上下文、有效期和消费时间；
  明文凭据不落库。

邮箱比较统一使用去空格、小写后的规范值。密码摘要可以为空以支持 OAuth-only 账户，但删除 OAuth
绑定时必须在事务内确认账户仍保留密码或其他登录方式。

### 2.2 文档、版本和关系

- `documents` 保存标题、正文、状态、置顶、收藏、内容修订号、内容哈希和内容更新时间。
- `document_versions` 保存每次被接受正文的版本快照。
- `document_summaries` 保存摘要、源正文哈希、`pending|running|succeeded|failed` 状态、租约和退避信息。
- `document_links` 保存同一用户下源文档与目标文档关系。
- `tags` 和 `document_tags` 保存用户标签及文档标签关系。

关系写入不仅校验 ID 存在，还校验两端属于同一用户。数据库外键、唯一约束和 Service 事务共同保护
关系完整性；标签已删除或属于其他用户时，模板和文档写入明确返回无效请求，不静默忽略。

### 2.3 分享与评论

- `shares` 保存文档、随机 Token、状态、权限、密码摘要、有效期和下载开关。
- 每篇文档最多存在一个活动分享，由 partial unique index 保证；创建新分享在文档行锁事务内撤销旧分享。
- `share_comments` 保存根评论、回复目标、作者、正文和状态；回复目标必须属于同一个活动分享。

### 2.4 模板、待办和资产

- `templates` 保存用户模板和默认标签 JSON；Repository 对 JSON 编解码错误必须返回带记录上下文的内部错误。
- `todos` 保存用户、内容、无时区 `YYYY-MM-DD` 日期和完成状态。
- `assets` 保存对象 Key、客户端 URL、元数据以及 `pending|ready|failed` 状态、清理租约和稳定错误。
- `document_assets` 保存正文对 ready 资产的引用关系。

`Asset.FileKey` 始终是存储 Provider 的对象 Key，`Asset.URL` 始终是客户端可使用的 URL，不允许按
Provider 混用语义。

### 2.5 导入

- `import_jobs` 保存格式、`parsing|ready|running|done|failed` 状态、冲突模式、进度、租约、领取次数、
  下次重试时间和有限错误报告。
- `import_job_notes` 保存解析后的条目和 `pending|done|failed|skipped` 状态、目标文档与稳定结果。

上传解析完成后，Job、全部 Note 和 ready 状态在一个短事务中提交。确认只执行 `ready -> running`
条件更新；后台 Worker 每条 Note 使用独立事务，因此崩溃发生在提交前会整体回滚，提交后重试不会
重复创建该条文档。

### 2.6 向量

- `document_embeddings` 保存每篇文档的内容哈希、处理状态、租约、重试和错误信息。
- `chunk_embeddings` 保存文档分块、类型、文本、Token 估算和向量。
- `embedding_cache` 使用模型、任务类型和输入哈希定位缓存向量。

向量维度是数据库列与 Provider 模型的共同契约。切换模型或维度必须提供迁移或全量重建方案。

## 3. 标识与时间

- 用户、文档、Token、对象 Key 和后台任务 ID 由密码学安全随机生成器产生；随机源失败必须中止操作。
- 业务时间主要使用 Unix 秒；待办日期是无时区日期字符串。
- 同一字段不能在秒和毫秒之间混用；新增字段必须在类型、SQL 和接口文档中明确单位。
- OAuth state、exchange code 和验证码只保存不可逆摘要或密码摘要。

## 4. 事务与并发规则

以下流程必须使用真实 `Transactor`，Service 构造器不接受 `nil DB` 或隐式无事务回退：

- 注册时消费验证码并创建用户。
- OAuth 创建用户、绑定、解绑和一次性凭据消费。
- 文档正文、版本、标签、链接、摘要状态和资产引用。
- 创建或替换活动分享。
- 导入 staging 创建与每条正式文档写入。

并发写入使用行锁、条件更新、唯一约束、`FOR UPDATE SKIP LOCKED` 租约或内容哈希 CAS。外部 Mail、
AI 和对象存储调用不能放入长数据库事务；它们通过短事务状态机或明确补偿与数据库收敛。

## 5. 迁移清单与演进

迁移版本使用完整文件名去掉 `.sql` 后的 stem。历史上存在两个 `002_*` 文件，因此数字前缀只用于
排序，不能作为唯一版本。当前后续迁移职责包括：

- `009_integrity_guardrails.sql`：所有权、孤儿关系、状态和活动分享数据审计与约束。
- `010_account_identity_and_one_time_tokens.sql`：规范化邮箱、验证码状态和 OAuth 一次性凭据。
- `011_import_worker_state.sql`：导入租约、重试、模式和 Note 终态。
- `012_summary_worker_state.sql`：摘要源哈希、状态、租约、退避以及既有文档待处理回填。
- `013_asset_upload_state.sql`：资产上传状态与清理索引。

已提交且已执行的 migration 不得修改、重命名或复用版本。修改结构必须新增 migration。

## 6. SQL-only 迁移器

启动迁移流程如下：

1. 从嵌入文件系统加载 `internal/db/migrations/*.sql`，拒绝空文件、非法命名、重复文件名和重复完整版本。
2. 从连接池固定取得一个 `*sql.Conn`。
3. 在该连接上取得 PostgreSQL session advisory lock。
4. 查询 `schema_migrations`；仅当 PostgreSQL 返回 undefined-table `42P01` 时执行
   `000_schema_migrations.sql`。
5. 校验数据库账本中的每个版本都存在于当前二进制，且 filename 和 SHA-256 checksum 与本地一致。
6. 每个待执行 SQL 文件使用独立事务；SQL 与账本 INSERT 同事务提交。
7. 释放 advisory lock；连接关闭是异常路径释放 session lock 的安全网。

Go 迁移器不得创建账本、拼接 DDL、维护业务表或列清单、检查 legacy 结构，也不得为未执行的 SQL
补写版本。`schema_migrations` 本身的 DDL 和未管理非空 schema 保护都位于
`000_schema_migrations.sql`。

## 7. 既有数据库接入规则

线上数据库接入新迁移器前必须只读核验：

- PostgreSQL 版本和当前 schema。
- `schema_migrations` 的 version、filename、checksum 是否与对应已执行 SQL 完全一致。
- 表、列、索引、约束和扩展是否符合已记录版本。
- 新约束引入前是否存在重复邮箱、多个活动分享、非法状态或孤儿关系。

已核验且已有完整账本的数据库直接运行最终迁移器。没有账本但包含业务表的 schema 被
`000_schema_migrations.sql` 拒绝，不能通过表名猜测、手工 INSERT 账本、删除账本或修改 checksum
绕过。处理方式是停止写流量，从可信备份恢复正确账本，或在独立发布流程中用已审计 SQL 完成迁移。

## 8. 编写 migration 的要求

- 新增非空列先提供默认值或回填，再收紧 `NOT NULL`。
- 增加 CHECK、外键或唯一约束前先用 SQL 审计旧数据；脏数据必须明确归档、修复或使迁移失败。
- 大表索引评估锁时间；需要 `CREATE INDEX CONCURRENTLY` 时不能放在普通 migration 事务中，必须设计
  单独且可验证的发布步骤。
- 删除列或表采用 expand/contract：先发布停止读写的代码，观察后再新增删除 migration。
- 状态列同时具备 Go 类型常量、数据库 CHECK、合法转换和未知值读路径错误。
- 一次 DELETE/UPDATE 必须控制批量，避免长事务和全表锁。

## 9. 持续门禁

- AST 测试扫描生产 Go 常量字符串，发现 DDL 即失败。
- `scripts/check-no-inline-ddl.sh` 扫描生产 Go、Shell、CI 和 Makefile，并拒绝 migrations 目录外的
  DDL 与未批准 SQL；唯一的运维审计 SQL 还会被单独检查为只读。
- `scripts/audit-db.sql` 在迁移完成后执行只读一致性审计，列出迁移账本，并检查重复身份、重复有效
  分享、孤儿关系和非法状态；除账本外的 `violations` 必须全部为零。
- 空 schema、未管理非空 schema、空账本加业务表、checksum 不一致、未知版本、迁移事务回滚和双实例
  并发都使用真实 PostgreSQL 验证。
- Repository/Service 集成测试覆盖关系所有权、事务回滚、并发领取、摘要过期结果和资产清理互斥。

## 10. 发布、回滚与验证

发布前备份数据库和本地文件，保存账本及结构核验结果。新二进制先完成迁移和依赖初始化，再将
readiness 置为可用。迁移失败必须阻止 HTTP 就绪。

新增列、索引和约束默认向前保留；二进制回滚不能编辑既有 migration 或删除账本。若新结构导致旧
二进制不兼容，应保持写流量关闭并恢复发布前备份，而不是伪造迁移状态。

每次结构变更至少验证：

- 空库完整迁移和二次启动幂等。
- 生产结构副本升级后数据、索引和约束正确。
- 包含孤儿关系和重复有效分享的旧结构能先归档脏数据再收敛到新约束。
- 两实例同时启动只有一个迁移执行器。
- checksum、未知版本和未管理 schema 明确失败。
- migration 中途错误同时回滚 DDL/DML 和账本记录。
- 关键唯一约束、用户隔离、事务与状态领取在并发下成立。
