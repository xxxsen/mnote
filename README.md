# mnote

**重要说明：本项目完全由 AI 生成（包括前后端代码、数据库设计及所有配置文件）。**

一个简单的 Markdown 笔记工具。后端用 Go 写的，前端用 Next.js，支持自适应，手机电脑都能用。

## 主要功能

*   **Markdown 编辑**: 支持常见的 Markdown 语法，还有 Mermaid 图表和公式。
*   **全文搜索**: 搜索笔记内容很快，因为用了 SQLite 的 FTS5 搜索。
*   **版本记录**: 每次保存都会存一个版本，写错了能找回之前的。
*   **标签管理**: 可以给笔记打标签，方便分类找东西。
*   **简单分享**: 能生成个链接分享给别人看。
*   **数据导出**: 支持把所有笔记导出来。

## 用到的技术

*   **后端**: Go (Gin 框架), SQLite 数据库。
*   **前端**: Next.js, Tailwind CSS (样式), CodeMirror (编辑器)。

## 目录结构

```text
├── cmd/mnote/          # 后端程序入口
├── internal/           # 后端代码逻辑
├── web/                # 前端代码
├── docker/             # Docker 部署配置文件
└── Makefile            # 常用命令
```

## 怎么跑起来 (Docker)

最简单的办法是用 Docker 一键启动：

1.  把代码拉下来进入目录。
2.  运行命令：
    ```bash
    make run-dev-docker
    ```
3.  打开浏览器访问：`http://localhost:8000`。

## 本地开发

### 后端
1.  安装 Go 1.25 以上版本。
2.  复制一份配置：`cp config.example.json config.json`。
3.  运行：`go run ./cmd/mnote/main.go --config=config.json`。

### 前端
1.  进入 `web` 目录。
2.  安装依赖：`npm install`。
3.  运行：`npm run dev`。

## 部署建议

建议用 Nginx 把前后端包在一起：
- `/api/v1/*` 转发给后端服务。
- 其余路径转发给前端服务。
- 记得把 `./data` 目录持久化，不然数据库和图片重启就没了。

## 协议

MIT License
