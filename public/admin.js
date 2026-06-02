let token = localStorage.getItem("studioToken") || "";
let account = null;

const qs = (selector) => document.querySelector(selector);
const titles = { overview: "总览", projects: "我的作品", submissions: "征稿进度" };
const statusNames = { new: "已提交", reviewing: "跟进中", done: "已完成" };

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function loadAccount() {
  account = await api("/api/account");
  qs("#userLabel").textContent = `${account.user.name} / ${account.user.email}`;
  renderStats();
  renderProjects();
  renderSubmissions();
}

function showAdmin() {
  qs("#loginView").classList.add("hidden");
  qs("#adminView").classList.remove("hidden");
}

function showLogin() {
  qs("#loginView").classList.remove("hidden");
  qs("#adminView").classList.add("hidden");
}

function renderStats() {
  qs("#stats").innerHTML = `
    <div class="stat"><span>我的作品</span><strong>${account.stats.projects}</strong></div>
    <div class="stat"><span>征稿记录</span><strong>${account.stats.submissions}</strong></div>
    <div class="stat"><span>跟进中</span><strong>${account.stats.reviewing}</strong></div>
  `;
}

function renderProjects() {
  qs("#projectsTable").innerHTML = `
    <thead><tr><th>封面</th><th>作品</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>
      ${account.projects.map((item) => `
        <tr>
          <td><img class="thumb" src="${item.cover_url}" alt="${item.title}"></td>
          <td><strong>${item.title}</strong><br>${item.category} / ${item.year} / ${item.location}<br>${item.description}</td>
          <td>${item.published ? "已发布" : "已隐藏"}</td>
          <td class="row-actions">
            <button class="mini" data-action="publish" data-id="${item.id}" data-value="${item.published ? 0 : 1}">${item.published ? "隐藏" : "发布"}</button>
            <button class="mini danger" data-action="delete" data-id="${item.id}">删除</button>
          </td>
        </tr>
      `).join("") || `<tr><td colspan="4">还没有上传作品。</td></tr>`}
    </tbody>
  `;
}

function renderSubmissions() {
  qs("#submissionsTable").innerHTML = `
    <thead><tr><th>项目</th><th>需求</th><th>进度</th><th>提交时间</th></tr></thead>
    <tbody>
      ${account.submissions.map((item) => `
        <tr>
          <td><strong>${item.project_type}</strong><br>${item.budget || "预算未填"} / ${item.preferred_date || "日期未定"}</td>
          <td>${item.brief}<br><small>${item.name} / ${item.email}</small></td>
          <td><span class="status-badge">${statusNames[item.status] || item.status}</span></td>
          <td>${item.created_at}</td>
        </tr>
      `).join("") || `<tr><td colspan="4">还没有提交征稿需求。</td></tr>`}
    </tbody>
  `;
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.add("hidden"));
  qs(`#${name}Tab`).classList.remove("hidden");
  qs("#tabTitle").textContent = titles[name];
  document.querySelectorAll(".sidebar button[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
}

async function authenticate(url, form, statusEl) {
  statusEl.textContent = "处理中...";
  try {
    const data = await api(url, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    token = data.token;
    localStorage.setItem("studioToken", token);
    form.reset();
    showAdmin();
    await loadAccount();
  } catch (error) {
    statusEl.textContent = error.message;
  }
}

qs("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  authenticate("/api/auth/login", event.currentTarget, qs("#loginStatus"));
});

qs("#registerForm").addEventListener("submit", (event) => {
  event.preventDefault();
  authenticate("/api/auth/register", event.currentTarget, qs("#registerStatus"));
});

qs("#projectForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  qs("#projectStatus").textContent = "保存中...";
  const formData = new FormData(form);
  if (!formData.get("published")) formData.set("published", "off");
  try {
    const res = await fetch("/api/projects", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "保存失败");
    form.reset();
    form.querySelector("[name='published']").checked = true;
    qs("#projectStatus").textContent = "作品已保存。";
    await loadAccount();
  } catch (error) {
    qs("#projectStatus").textContent = error.message;
  }
});

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (target.matches("[data-auth-tab]")) {
    const mode = target.dataset.authTab;
    document.querySelectorAll("[data-auth-tab]").forEach((button) => button.classList.toggle("active", button === target));
    qs("#loginForm").classList.toggle("hidden", mode !== "login");
    qs("#registerForm").classList.toggle("hidden", mode !== "register");
  }
  if (target.matches("[data-tab]")) switchTab(target.dataset.tab);
  if (target.id === "logoutBtn") {
    localStorage.removeItem("studioToken");
    token = "";
    account = null;
    showLogin();
  }
  if (target.dataset.action) {
    const id = target.dataset.id;
    if (target.dataset.action === "delete" && !confirm("确认删除这条作品？")) return;
    if (target.dataset.action === "delete") await api(`/api/projects/${id}`, { method: "DELETE" });
    if (target.dataset.action === "publish") await api(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ published: Number(target.dataset.value) }) });
    await loadAccount();
  }
});

if (token) {
  showAdmin();
  loadAccount().catch(() => {
    localStorage.removeItem("studioToken");
    token = "";
    showLogin();
  });
}
