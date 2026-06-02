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
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "photo2026";

const root = __dirname;
const dataDir = path.join(root, "data");
const publicDir = path.join(root, "public");
const uploadDir = path.join(publicDir, "uploads");
const dbPath = path.join(dataDir, "studio.sqlite");

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

function persist() {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
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
    res.status(401).json({ error: "请先登录后台。" });
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

async function initDb() {
  const SQL = await initSqlJs();
  db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

  if (!one("SELECT id FROM admins WHERE username = ?", [ADMIN_USER])) {
    db.run("INSERT INTO admins (username, password_hash) VALUES (?, ?)", [
      ADMIN_USER,
      bcrypt.hashSync(ADMIN_PASSWORD, 10),
    ]);
  }

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

app.post("/api/submissions", (req, res) => {
  const { name, email, phone, projectType, brief, budget, preferredDate } = req.body;
  if (!name || !email || !projectType || !brief) return res.status(400).json({ error: "请填写姓名、邮箱、项目类型和需求说明。" });
  run("INSERT INTO submissions (name, email, phone, project_type, brief, budget, preferred_date) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    name, email, phone || "", projectType, brief, budget || "", preferredDate || "",
  ]);
  res.json({ ok: true });
});

app.post("/api/messages", (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message) return res.status(400).json({ error: "请填写完整联系信息。" });
  run("INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)", [name, email, subject, message]);
  res.json({ ok: true });
});

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  const admin = one("SELECT * FROM admins WHERE username = ?", [username]);
  if (!admin || !bcrypt.compareSync(password || "", admin.password_hash)) return res.status(401).json({ error: "账号或密码不正确。" });
  const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, username: admin.username });
});

app.get("/api/admin/dashboard", auth, (_req, res) => {
  res.json({
    stats: {
      projects: one("SELECT COUNT(*) AS count FROM projects").count,
      submissions: one("SELECT COUNT(*) AS count FROM submissions").count,
      unread: one("SELECT COUNT(*) AS count FROM messages WHERE status = 'unread'").count,
    },
    projects: all("SELECT * FROM projects ORDER BY created_at DESC").map(normalizeProject),
    submissions: all("SELECT * FROM submissions ORDER BY created_at DESC"),
    messages: all("SELECT * FROM messages ORDER BY created_at DESC"),
  });
});

app.post("/api/admin/projects", auth, upload.single("image"), (req, res) => {
  const body = req.body;
  const title = body.title || "未命名作品";
  const cover = req.file ? `/uploads/${req.file.filename}` : body.coverUrl;
  if (!cover) return res.status(400).json({ error: "请提供封面图片或图片链接。" });
  run(
    "INSERT INTO projects (title, slug, category, year, location, client, description, cover_url, tags, featured, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [title, `${slugify(title)}-${Date.now()}`, body.category || "portfolio", body.year || "2026", body.location || "", body.client || "", body.description || "", cover, body.tags || "", body.featured ? 1 : 0, body.published === "off" ? 0 : 1]
  );
  res.json({ ok: true });
});

app.patch("/api/admin/projects/:id", auth, (req, res) => {
  const { featured, published } = req.body;
  run("UPDATE projects SET featured = COALESCE(?, featured), published = COALESCE(?, published) WHERE id = ?", [
    featured === undefined ? null : Number(Boolean(featured)),
    published === undefined ? null : Number(Boolean(published)),
    req.params.id,
  ]);
  res.json({ ok: true });
});

app.delete("/api/admin/projects/:id", auth, (req, res) => {
  run("DELETE FROM projects WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

app.patch("/api/admin/submissions/:id", auth, (req, res) => {
  run("UPDATE submissions SET status = ? WHERE id = ?", [req.body.status || "reviewing", req.params.id]);
  res.json({ ok: true });
});

app.delete("/api/admin/submissions/:id", auth, (req, res) => {
  run("DELETE FROM submissions WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

app.patch("/api/admin/messages/:id", auth, (req, res) => {
  run("UPDATE messages SET status = ? WHERE id = ?", [req.body.status || "read", req.params.id]);
  res.json({ ok: true });
});

app.delete("/api/admin/messages/:id", auth, (req, res) => {
  run("DELETE FROM messages WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "接口不存在。" });
  res.sendFile(path.join(publicDir, "index.html"));
});

initDb().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Photography portfolio running at http://localhost:${PORT}`);
    console.log(`Admin login: ${ADMIN_USER} / ${ADMIN_PASSWORD}`);
  });
});
