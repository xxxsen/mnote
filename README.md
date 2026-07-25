# MNote

MNote 是一个现代化 Markdown 笔记系统，采用 Go + Next.js 构建。除了完备的笔记管理能力外，它通过 Embedding 提供语义搜索和相似笔记发现，让知识检索更加高效。

---

## 功能概览

### 笔记编辑与管理

- 基于 CodeMirror 的 Markdown 编辑器，支持实时预览、图片粘贴上传、代码高亮
- 支持 GFM、KaTeX 数学公式、Mermaid 图表渲染
- 斜杠命令 (Slash Commands) 快速插入模板、代码块等常用结构
- 双链语法 (Wikilink) 与关联笔记图谱
- 多维组织：置顶 (Pin)、收藏 (Star)、标签 (Tag) 管理
- 版本控制：自动记录变更历史，支持查看与回滚任意版本
- 快速跳转 (Quick Open)：全局搜索并快速切换笔记

### Embedding 与语义检索

- **语义搜索**：基于 `pgvector` 向量索引，支持跨语言的上下文意图搜索
- **相似笔记推荐**：基于向量相似度自动推荐关联内容
- **多 Provider 支持**：原生集成 Gemini、OpenRouter、OpenAI 兼容接口，可配置 Embedding 模型故障切换

### 分享与协作

- 生成公开分享链接，支持密码保护与权限控制 (只读/可评论)
- 分享页面支持匿名评论与回复
- 支持 Markdown 文件导出下载

### 待办事项 (Todos)

- 独立的待办事项管理模块
- 支持日历视图与按日期筛选

### 模板系统

- 创建与管理笔记模板，快速初始化新笔记
- 模板支持标签预设

### 用户系统

- 邮箱验证码注册与 JWT 认证
- 第三方登录：GitHub / Google OAuth
- 个人设置：头像、密码修改、OAuth 账号绑定

### 存储与部署

- 文件存储支持本地文件系统或 S3 兼容的对象存储
- 支持从 HedgeDoc (Markdown zip) 或 JSON 格式导入/导出笔记
- 完整的 Docker Compose 一键部署方案

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Go 1.24, Gin, PostgreSQL + pgvector, sqlx, JWT, Uber-zap |
| 前端 | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, CodeMirror |
| Embedding | Gemini SDK, OpenRouter, OpenAI 兼容接口 |
| 测试 | Go testing + sqlmock（后端覆盖率 >= 80%），Vitest + Testing Library（Web 覆盖率 >= 30%，聚焦关键路径） |
| CI/CD | GitHub Actions (lint / build / test, Docker 镜像自动发布) |
| 部署 | Docker, Docker Compose, Nginx 反向代理 |

---

## 快速开始

### 环境要求

- Docker 与 Docker Compose

### 部署步骤

1. 克隆仓库：

```bash
git clone https://github.com/xxxsen/mnote.git
cd mnote
```

2. 编辑配置文件：

```bash
cd docker/mnote
# 修改 config.json，至少更新以下字段：
#   - jwt_secret: 替换为你自己的密钥
#   - ai_provider: 填入对应的 API Key 以启用 Embedding 与语义检索
#   - mail: 如需邮箱注册，配置 SMTP 信息
```

3. 启动服务：

```bash
cd docker
docker compose up -d
```

启动完成后访问 `http://localhost:8000` 即可使用。

默认部署包含四个服务：

| 服务 | 说明 |
|------|------|
| mnote-backend | Go 后端 API 服务 (端口 8080) |
| mnote-web | Next.js 前端 (端口 3000) |
| mnote-db | PostgreSQL + pgvector 数据库 |
| mnote-gateway | Nginx 反向代理 (对外端口 8000) |

---

## 配置说明

### Embedding 配置

`ai_provider` 数组定义可用的 Embedding 供应商，`ai` 对象指定默认供应商、模型和故障切换顺序：

```json
{
  "ai_provider": [
    { "name": "gemini", "type": "gemini", "data": { "api_key": "..." } },
    { "name": "openrouter", "type": "openrouter", "data": { "api_key": "..." } }
  ],
  "ai": {
    "enabled": true,
    "provider": "gemini",
    "model": "text-embedding-004",
    "embed": [{ "provider": "gemini", "model": "text-embedding-004" }]
  },
  "ai_job": {
    "embedding_delay_seconds": 300
  }
}
```

`enabled` 是 Embedding 总开关。`embed` 中每一项未指定的字段会继承顶层
`provider` / `model`；列表顺序同时也是 Provider 故障切换顺序。关闭后不会初始化
Embedding Provider，也不会注册向量同步后台任务。

### OAuth 配置

如需启用第三方登录，在 `oauth` 中填入对应的 Client ID 和 Client Secret，并在 `properties` 中设置 `enable_github_oauth` 或 `enable_google_oauth` 为 `true`。

OAuth 回调地址：
- GitHub: `https://<DOMAIN>/api/v1/auth/oauth/github/callback`
- Google: `https://<DOMAIN>/api/v1/auth/oauth/google/callback`

### 文件存储

默认使用本地存储。切换为 S3 兼容存储时修改 `file_store` 配置：

```json
{
  "file_store": {
    "type": "s3",
    "data": {
      "bucket": "your-bucket",
      "region": "us-east-1",
      "endpoint": "https://s3.amazonaws.com",
      "access_key_id": "...",
      "secret_access_key": "..."
    }
  }
}
```

---

## 本地开发

### 快速启动

首次安装前端依赖后，`make dev` 会启动一个独立的 pgvector 开发数据库和 Go 后端，
确认后端端口就绪后再启动 Next.js 前端：

```bash
make web-install
make dev
```

默认访问地址为 `http://localhost:3090`，后端为 `http://localhost:8850`，测试账号为
`test@test.com / test`。按 `Ctrl+C` 会停止本次后端、前端和数据库进程；数据库卷和
`.dev-data/` 中的上传文件会保留，便于下次快速启动。该命令使用独立的开发 Compose
项目和数据卷，不会复用 `docker/docker-compose.yml` 的部署数据。

可通过 `MNOTE_DEV_WEB_PORT`、`MNOTE_DEV_BACKEND_PORT`、`MNOTE_DEV_DB_PORT` 覆盖端口；
通过 `make dev CONFIG=path/to/config.json` 使用自定义配置。自定义外部数据库时可设置
`MNOTE_DEV_SKIP_DB=1`，需要退出后保留开发数据库进程时可设置
`MNOTE_DEV_KEEP_DB=1`。自动生成的开发配置不启用真实 Embedding Provider，语义检索需要使用
自定义配置。

### 后端

```bash
# 构建
make build

# 运行测试 (含覆盖率检查)
make backend-test

# Lint
make install-golangci-lint  # 首次需安装
make lint-go

# 启动服务
make run CONFIG=path/to/config.json
```

### 前端

```bash
cd web

# 安装依赖
npm ci

# 开发模式
npm run dev

# Lint + 类型检查
npm run lint
npx tsc --noEmit

# 单元测试 (含覆盖率)
npm run test:coverage

# 生产构建
npm run build
```

### 完整自检

```bash
# 后端
go fmt ./... && go mod tidy && make backend-test && make lint-go

# 前端
cd web && npm run lint && npx tsc --noEmit && npm run test:coverage
```

---

## 项目结构

```text
mnote/
  cmd/mnote/             后端服务入口
  internal/
    ai/                  Embedding 供应商适配层 (Gemini / OpenRouter / OpenAI)
    config/              配置加载与解析
    db/                  数据库初始化与迁移
    embedcache/          向量嵌入缓存
    filestore/           文件存储抽象 (Local / S3)
    handler/             HTTP API 处理器
    job/                 后台定时任务 (嵌入生成、导入清理)
    middleware/          Gin 中间件 (认证、限流、CORS)
    model/               数据模型定义
    oauth/               OAuth 客户端 (GitHub / Google)
    repo/                数据访问层
    schedule/            定时任务调度
    service/             业务逻辑层
  web/
    src/
      app/
        docs/            笔记列表与编辑器
        todos/           待办事项
        templates/       模板管理
        tags/            标签管理
        share/           公开分享页面
        settings/        用户设置
        login/           登录
        register/        注册
        oauth/           OAuth 回调
      components/        公共 UI 组件
      lib/               工具函数与 API 客户端
      types/             TypeScript 类型定义
  docker/                Docker Compose 部署配置
  scripts/               构建与运行脚本
  .github/workflows/     CI/CD 流水线
  Makefile               项目构建与管理入口
```

---

## CI/CD

项目配置了以下 GitHub Actions 工作流：

- **PR Check** (`pr-check.yml`): 每次 Pull Request 自动执行后端 lint / build / test 与前端 lint / test / build
- **Docker Image** (`docker-image.yml`): 推送 tag 时自动构建并发布 `mnote` (后端) 和 `mnote-web` (前端) Docker 镜像到 Docker Hub

---

## License

MIT License
