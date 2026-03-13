# Open Chat Circle

一个面向朋友小圈子的聊天 App，核心目标是“接口开放、可自由接入 API”，避免被单一平台能力边界卡住。

## 架构

- `Flutter` 客户端：覆盖 iOS、Android、Windows、macOS 和 Web。
- `Node.js` 开放后端：提供 REST API、WebSocket 实时通道和 OpenAPI 文档。
- `JSON / PostgreSQL 双存储`：默认用 JSON 文件方便本地跑通；生产环境可切到 PostgreSQL。

## 为什么改成自建开放 API

之前的 `腾讯云 Chat + CloudBase` 更适合快速起步，但如果你希望：

- 任何服务都能直接调用聊天 API
- 可以自由做机器人、自动化、第三方集成
- 不受平台 SDK、审核策略、能力开放度限制

那更合适的做法是把核心接口掌握在我们自己手里。

## 当前仓库包含

- Flutter 客户端骨架
- Node 开放后端
- OpenAPI 3.1 文档
- 基础认证、邀请码、1 对 1 / 群聊、文本消息、图片消息元数据、已读状态
- WebSocket 事件广播

## 本地启动

### 最简单方式（推荐）

Windows 下直接双击项目根目录里的：

- `Start-Chat-App.cmd`：启动聊天服务并自动打开网页
- `Stop-Chat-App.cmd`：关闭聊天服务
- `Share-Chat-App.cmd`：启动聊天服务并生成公网访问链接
- `Stop-Share-Chat-App.cmd`：关闭公网访问链接

启动后直接访问：

`http://localhost:8787/app/`

### 1. 启动后端

```bash
cd backend
npm install
npm run dev
```

默认地址：`http://localhost:8787`

### 1.1 切到 PostgreSQL

如果你准备让朋友长期使用，建议尽快切到 PostgreSQL：

```bash
cd backend
docker compose up -d
copy .env.example .env
```

把 `.env` 里的 `STORE_DRIVER` 改成 `postgres`，然后执行：

```bash
npm install
npm run db:init
npm run dev
```

### 2. 启动 Flutter

当前机器未安装 Flutter SDK，所以这个仓库还没有执行 `flutter create .` 生成平台壳目录。安装 Flutter 后执行：

```bash
flutter create .
flutter pub get
flutter run
```

然后通过 `--dart-define` 注入后端地址：

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:8787
```

## API 文档

- OpenAPI 规范：`docs/openapi.yaml`
- 健康检查：`GET /health`
- 健康检查会返回当前存储驱动：`json` 或 `postgres`
- WebSocket：`ws://localhost:8787/ws?token=<sessionToken>`

## 云部署

- Sealos Cloud 部署：`docs/sealos-deployment.md`
- 固定域名 Cloudflare Tunnel 方案：`docs/fixed-domain-deployment.md`

## 生产化建议

- 把当前“整集合 JSONB”存储进一步拆成正式业务表
- 使用 JWT + 刷新令牌
- 把图片真实上传到 MinIO / S3 / COS，而不是只记录元数据
- 为 WebSocket 增加多实例广播层
## Sealos Image

If Sealos asks for an image name, use:

`ghcr.io/imlandway/open-chat-circle-backend:latest`
