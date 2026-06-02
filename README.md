# Lumen Atelier 摄影作品集

这是一个可运行的全栈摄影作品集网站，包含前台作品展示、征稿表单、联系表单、后台登录、作品管理、征稿管理、留言管理和 SQLite 数据存储。

## 启动

```bash
npm install
npm start
```

## 访问

- 前台：http://localhost:4173
- 后台：http://localhost:4173/admin.html
- 默认账号：admin
- 默认密码：photo2026

## 数据

- SQLite 数据库：`data/studio.sqlite`
- 上传图片目录：`public/uploads`

公开部署前建议通过环境变量修改后台密码和 JWT 密钥：

```bash
ADMIN_USER=admin ADMIN_PASSWORD=your-password JWT_SECRET=your-secret npm start
```
