# Lumen Atelier 摄影作品集

这是一个可运行的全栈摄影作品集网站，包含前台作品展示、用户注册/登录、个人作品上传、征稿提交、征稿进度查看、联系表单和 SQLite 数据存储。

## 启动

```bash
npm install
npm start
```

## 访问

- 前台：http://localhost:4173
- 用户中心：http://localhost:4173/admin.html
- 用户需要自行注册账号。每个用户只能在用户中心看到自己的作品和征稿记录。

## 数据

- SQLite 数据库：`data/studio.sqlite`
- 上传图片目录：`public/uploads`

公开部署前建议通过环境变量修改 JWT 密钥：

```bash
JWT_SECRET=your-secret npm start
```
