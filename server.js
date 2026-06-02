const express = require("express");
const path = require("path");
const fs = require("fs");
const initSqlJs = require("sql.js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 4173;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-before-public-deploy";

const root = __dirname;
const dataDir = process.env.DATA_DIR || path.join(root, "data");
const publicDir = path.join(root, "public");
const uploadDir = process.env.UPLOAD_DIR || path.join(publicDir, "uploads");
const dbPath = process.env.DB_PATH || path.join(dataDir, "studio.sqlite");

for (const dir of [dataDir, publicDir, uploadDir]) fs.mkdirSync(dir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({ storage });

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

let db;

function persist() {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function run(sql, params = []) {
  db.run(sql, params);
  persist();
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function one(sql, params = []) {
  return all(sql, params)[0] || null;
}

function hasColumn(table, column) {
  return all(`PRAGMA table_info(${table})`).some((row) => row.name === column);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "请先登录。" });
  }
}

function normalizeProject(row) {
  return {
    ...row,
    featured: Boolean(row.featured),
    published: Boolean(row.published),
    tags: row.tags ? row.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
  };
}

function publicUploadUrl(file) {
  if (!file) return "";
  if (uploadDir.startsWith(publicDir)) {
    return `/uploads/${file.filename}`;
  }
  const target = path.join(publicDir, "uploads", file.filename);
  fs.copyFileSync(file.path, target);
  return `/uploads/${file.filename}`;
}

async function initDb() {
  const SQL = await initSqlJs();
  db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      year TEXT NOT NULL,
      location TEXT NOT NULL,
      client TEXT,
      description TEXT NOT NULL,
      cover_url TEXT NOT NULL,
      tags TEXT,
      featured INTEGER DEFAULT 0,
      published INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      project_type TEXT NOT NULL,
      brief TEXT NOT NULL,
      budget TEXT,
      preferred_date TEXT,
      status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'unread',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  if (!hasColumn("projects", "user_id")) db.run("ALTER TABLE projects ADD COLUMN user_id INTEGER");
  if (!hasColumn("submissions", "user_id")) db.run("ALTER TABLE submissions ADD COLUMN user_id INTEGER");

  if (!one("SELECT id FROM projects LIMIT 1")) {
    const seed = [
      ["雾色婚礼纪实", "wedding", "2026", "杭州西湖", "Lake House", "清晨薄雾中的户外婚礼，保留真实情绪与自然光的层次。", "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1600&q=85", "婚礼,纪实,自然光", 1],
      ["城市天台肖像", "portrait", "2025", "上海", "Private", "在天台与玻璃幕墙之间完成的一组都市职业肖像。", "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1600&q=85", "肖像,商业,城市", 1],
      ["青瓷静物", "commercial", "2025", "景德镇", "Materia", "为器物品牌拍摄的产品视觉，强调釉面细节、肌理和留白。", "https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=1600&q=85", "产品,静物,品牌", 0],
      ["山海之间", "editorial", "2024", "福建霞浦", "Open Field", "一次关于潮汐、渔排和旅人孤独感的编辑拍摄。", "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=85", "旅行,编辑,风景", 1],
      ["午夜爵士现场", "event", "2024", "广州", "Blue Note", "低照度现场摄影，捕捉舞台光、汗水和观众的沉浸感。", "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1600&q=85", "活动,现场,音乐", 0],
      ["极简空间样本", "interior", "2026", "深圳", "North Studio", "室内空间样板拍摄，用克制构图呈现材料和动线。", "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=85", "空间,建筑,商业", 0],
    ];
    for (const item of seed) {
      db.run(
        "INSERT INTO projects (title, slug, category, year, location, client, description, cover_url, tags, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [item[0], slugify(item[0]), item[1], item[2], item[3], item[4], item[5], item[6], item[7], item[8]]
      );
    }
  }
  persist();
}

app.get("/api/site", (_req, res) => {
  const projects = all("SELECT * FROM projects WHERE published = 1 ORDER BY featured DESC, created_at DESC").map(normalizeProject);
  res.json({
    studio: {
      name: "Lumen Atelier",
      tagline: "成熟、安静、带有呼吸感的摄影作品集",
      email: "hello@lumen.example",
      phone: "+86 138 0000 2026",
      city: "Shanghai / Hangzhou / Remote",
    },
    projects,
  });
});

app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: "请填写姓名、邮箱和密码。" });
  if (String(password).length < 6) return res.status(400).json({ error: "密码至少需要 6 位。" });
  if (one("SELECT id FROM users WHERE email = ?", [email])) return res.status(409).json({ error: "这个邮箱已经注册过。" });

  run("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)", [name, email, bcrypt.hashSync(password, 10)]);
  const user = one("SELECT id, name, email FROM users WHERE email = ?", [email]);
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = one("SELECT * FROM users WHERE email = ?", [email]);
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) return res.status(401).json({ error: "邮箱或密码不正确。" });
  const safeUser = { id: user.id, name: user.name, email: user.email };
  const token = jwt.sign(safeUser, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: safeUser });
});

app.get("/api/account", auth, (req, res) => {
  const projects = all("SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]).map(normalizeProject);
  const submissions = all("SELECT * FROM submissions WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
  res.json({
    user: req.user,
    stats: {
      projects: projects.length,
      submissions: submissions.length,
      reviewing: submissions.filter((item) => item.status === "reviewing").length,
    },
    projects,
    submissions,
  });
});

app.post("/api/submissions", auth, (req, res) => {
  const { name, email, phone, projectType, brief, budget, preferredDate } = req.body;
  if (!name || !email || !projectType || !brief) return res.status(400).json({ error: "请填写姓名、邮箱、项目类型和需求说明。" });
  run("INSERT INTO submissions (user_id, name, email, phone, project_type, brief, budget, preferred_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
    req.user.id, name, email, phone || "", projectType, brief, budget || "", preferredDate || "",
  ]);
  res.json({ ok: true });
});

app.post("/api/messages", (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message) return res.status(400).json({ error: "请填写完整联系信息。" });
  run("INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)", [name, email, subject, message]);
  res.json({ ok: true });
});

app.post("/api/projects", auth, upload.single("image"), (req, res) => {
  const body = req.body;
  const title = body.title || "未命名作品";
  const cover = req.file ? publicUploadUrl(req.file) : body.coverUrl;
  if (!cover) return res.status(400).json({ error: "请提供封面图片或图片链接。" });
  run(
    "INSERT INTO projects (user_id, title, slug, category, year, location, client, description, cover_url, tags, featured, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [req.user.id, title, `${slugify(title)}-${Date.now()}`, body.category || "portfolio", body.year || "2026", body.location || "", body.client || "", body.description || "", cover, body.tags || "", 0, body.published === "off" ? 0 : 1]
  );
  res.json({ ok: true });
});

app.patch("/api/projects/:id", auth, (req, res) => {
  const { published } = req.body;
  run("UPDATE projects SET published = COALESCE(?, published) WHERE id = ? AND user_id = ?", [
    published === undefined ? null : Number(Boolean(published)),
    req.params.id,
    req.user.id,
  ]);
  res.json({ ok: true });
});

app.delete("/api/projects/:id", auth, (req, res) => {
  run("DELETE FROM projects WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  res.json({ ok: true });
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "接口不存在。" });
  res.sendFile(path.join(publicDir, "index.html"));
});

initDb().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Photography portfolio running at http://localhost:${PORT}`);
  });
});
