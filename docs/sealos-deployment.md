# Sealos Cloud 部署指南

这套聊天应用可以直接部署到 Sealos Cloud。最省事的方式是：

- Sealos 托管 PostgreSQL
- Sealos App Launchpad 部署后端容器
- Sealos 提供公网访问
- 再在 App Launchpad 里绑定自定义域名

参考官方文档：
- [App Launchpad](https://sealos.io/docs/guides/app-launchpad)
- [Add a Domain](https://sealos.io/docs/guides/app-launchpad/add-a-domain/)
- [Deploy Guide](https://sealos.io/docs/guides/fundamentals/deploy/)
- [PostgreSQL](https://sealos.io/products/databases/)

## 准备

- 一个 Sealos Cloud 账号
- 一个 GitHub 仓库
- 一个你自己的域名（如果要固定域名）

## 1. 把代码传到 GitHub

把当前项目推到你自己的 GitHub 仓库。

## 2. 在 Sealos 创建 PostgreSQL

在 Sealos 控制台里创建一个 PostgreSQL 实例，记下连接串。

你最终需要的是：

- Host
- Port
- Database
- Username
- Password

拼成：

`postgres://用户名:密码@主机:端口/数据库名`

## 3. 在 Sealos 部署应用

进入 `App Launchpad`，创建一个新应用。

推荐配置：

- Port: `8787`
- Public Access: `开启`
- Image / Source: 指向你的 GitHub 仓库，或使用仓库里的 Dockerfile 构建

环境变量填这些：

- `PORT=8787`
- `API_BASE_URL=https://你的域名或Sealos分配域名`
- `CORS_ORIGIN=https://你的域名或Sealos分配域名`
- `SESSION_SECRET=一串随机长字符串`
- `STORE_DRIVER=postgres`
- `DATABASE_URL=你的Sealos PostgreSQL连接串`
- `SEED_ADMIN_PASSWORD=你想设的管理员密码`

如果 Sealos 支持直接从 Dockerfile 构建，使用项目里的：

`backend/Dockerfile`

## 4. 绑定域名

先让 Sealos 给应用分配一个公网地址，确认应用能打开。

然后按官方文档在 App Launchpad 里点 `Custom Domain`，填你的域名，比如：

`chat.example.com`

之后按 Sealos 提示，在你的域名 DNS 提供商处添加对应的 `CNAME`。

## 5. 登录

部署完成后，打开你的公网地址登录。

管理员账号：

- 账号：`captain`
- 密码：你在 `SEED_ADMIN_PASSWORD` 里设置的值

普通用户注册邀请码：

- `OPEN-CIRCLE-2026`

## 建议

- 第一版先用 Sealos 自动分配的公网域名，先确认服务跑通。
- 跑通以后再绑固定域名。
- 如果后面图片量变大，再把上传存储切到对象存储。
