# 固定域名正式部署

目标效果：把聊天应用发布到固定域名，例如 `chat.example.com`，并让它长期在线。

## 你需要准备

- 一个已经接入 Cloudflare DNS 的域名
- Cloudflare `Account ID`
- Cloudflare `Zone ID`
- 一个 API Token
  - 需要账户级隧道编辑权限
  - 需要 DNS 编辑权限
- 一台长期在线的 Windows/Linux 服务器
- 服务器上安装 Docker

## 1. 生成固定域名 Tunnel

在项目根目录执行：

```powershell
set CLOUDFLARE_API_TOKEN=你的Token
set CLOUDFLARE_ACCOUNT_ID=你的AccountId
set CLOUDFLARE_ZONE_ID=你的ZoneId
set CHAT_APP_PUBLIC_HOSTNAME=chat.example.com
node deploy/setup-cloudflare-tunnel.mjs
```

执行后会完成三件事：

- 创建或复用一个命名 Tunnel
- 把 `chat.example.com` 绑定到这个 Tunnel
- 生成 `deploy/.env.production`

## 2. 启动正式版

```powershell
cd deploy
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
```

## 3. 访问

浏览器打开：

`https://chat.example.com`

## 4. 停止

```powershell
cd deploy
docker compose -f docker-compose.production.yml --env-file .env.production down
```

## 5. 更新代码后重发版

```powershell
cd deploy
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
```

## 注意

- 如果你使用的是多级子域名，例如 `chat.app.example.com`，Cloudflare 文档提示可能需要额外的证书配置。
- 当前上传图片还是存储在容器挂载卷中，已经比临时版稳定，但要做多机高可用时，建议换到 S3 / R2 / COS。
- 当前数据库已经切到 PostgreSQL，适合长期使用。
