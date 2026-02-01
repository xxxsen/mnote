# mnote

一个基于 AI 增强的现代化 Markdown 笔记系统。采用 Go + Next.js 构建，支持深度语义搜索与多种 AI 创作辅助。

## ✨ 核心功能

### 📝 笔记管理
- **Markdown 全功能支持**：集成 GFM、KaTeX 数学公式、Mermaid 图表渲染。
- **高效编辑**：基于 CodeMirror 的丝滑编辑体验，支持图片粘贴上传、代码高亮。
- **多维组织**：支持笔记置顶 (Pin)、收藏 (Star) 以及强大的标签 (Tag) 管理系统。
- **版本控制**：自动记录笔记变更历史，支持随时查看与回滚历史版本。

### 🤖 AI 增强
- **语义搜索 (Semantic Search)**：基于 `pgvector` 的向量索引，支持跨语言的上下文意图搜索，而非简单的关键词匹配。
- **内容润色 (Polish)**：一键优化文章遣词造句，提升表达质量。
- **自动摘要与标签**：AI 自动提取文章摘要并推荐合适的标签。
- **内容生成**：支持基于 Prompt 的内容续写与创作。
- **多模型驱动**：原生集成 Gemini、OpenRouter (OpenAI/Claude 等) 多个 AI 供应商。

### 🔐 系统特性
- **安全认证**：支持邮箱验证码注册与 JWT 认证。
- **第三方登录**：集成 GitHub 与 Google OAuth 登录及账号绑定。
- **灵活存储**：支持本地文件系统存储或 S3 兼容的对象存储。
- **无感迁移**：支持从 HedgeDoc (Markdown zip) 或通用 JSON 格式导入/导出笔记。

## 🛠 技术栈

- **后端**: Go (Gin Framework), PostgreSQL + `pgvector`, Uber-zap (Logging)
- **前端**: Next.js (App Router), React 19, TypeScript, Tailwind CSS 4
- **容器化**: Docker, Docker Compose

## 🚀 快速开始 (Docker)

### 1) 准备工作
1. 复制 `docker/mnote/config.json.example` (或参考示例) 为 `config.json`。
2. 重点修改 `jwt_secret` 以及 `ai_provider` 配置以启用 AI 功能。

### 2) 启动服务
使用 `docker-compose.yml` 一键启动完整环境（包含 Backend, Web, Postgres, Nginx）：

```bash
cd docker
docker compose up -d
```

启动后访问 `http://localhost:8000` 即可开始使用。

## ⚙️ OAuth 配置
如需启用第三方登录，请在配置文件中填入 Client ID/Secret，并将以下地址加入白名单：
- **GitHub**: `https://<DOMAIN>/api/v1/auth/oauth/github/callback`
- **Google**: `https://<DOMAIN>/api/v1/auth/oauth/google/callback`

## 📂 项目结构
```text
├── cmd/mnote/          # 后端服务入口
├── internal/           # 核心业务逻辑 (Repository, Service, Handler)
├── web/                # Next.js 前端工程
├── docker/             # Docker 部署与配置文件
└── Makefile            # 项目构建与管理脚本
```

## 📜 协议
MIT License
