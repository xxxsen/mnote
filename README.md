# mnote

一个简单的 Markdown 笔记工具。后端是 Go，前端是 Next.js，手机和电脑都能用。

## 组成

- mnote-backend：Go API 服务，SQLite 存储
- mnote-web：Next.js 前端
- mnote-gateway：Nginx 反向代理，统一入口

## 部署（Docker）

以下是参考 `docker/` 目录的配置，手动运行三个镜像：nginx、mnote、mnote-web。

### 1) 准备配置与目录

请选择自己机器上的目录保存配置与数据，`docker/` 仅提供示例文件：

- 参考 `docker/mnote/config.json`，复制到自己的配置目录并修改（至少修改 `jwt_secret`）
- 数据目录用于保存数据库和上传文件

### 2) 配置 nginx

使用 `docker/nginx/nginx.conf`，核心规则如下：

- `/api/v1/` 代理到 `mnote-backend:8080`
- `/` 代理到 `mnote-web:3000`

### 3) 使用 docker-compose 启动

复制以下内容保存为 `docker-compose.yml`，确保容器在同一网络内，并且只对外暴露 nginx 端口：

```yaml
services:
  mnote-backend:
    image: xxxsen/mnote:latest
    container_name: mnote-backend
    volumes:
      - /path/to/your/config:/config
      - /path/to/your/data:/data
    expose:
      - "8080"
    command: run --config=/config/config.json
    networks:
      - mnote
    restart: always

  mnote-web:
    image: xxxsen/mnote-web:latest
    container_name: mnote-web
    expose:
      - "3000"
    depends_on:
      - mnote-backend
    networks:
      - mnote
    restart: always

  mnote-gateway:
    image: nginx:alpine
    container_name: mnote-gateway
    ports:
      - "80:80"
    volumes:
      - /path/to/your/nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - mnote-web
      - mnote-backend
    networks:
      - mnote
    restart: always

networks:
  mnote:
    name: mnote_network
```

启动：

```bash
docker compose up -d
```

访问：`http://localhost`。

## 路由与端口

- `http://localhost` 是统一入口
- `/api/v1/*` 由 mnote-backend 处理
- 其他路径由 mnote-web 处理

## 数据持久化

把你选择的数据目录挂载到后端容器的 `/data`，用于保存数据库和上传文件。

## 目录结构

```text
├── cmd/mnote/          # 后端程序入口
├── internal/           # 后端代码逻辑
├── web/                # 前端代码
├── docker/             # Docker 部署配置文件
└── Makefile            # 常用命令
```

## 协议

MIT License
