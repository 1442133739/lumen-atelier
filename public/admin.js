let token = localStorage.getItem("studioToken") || "";
let dashboard = null;

const qs = (selector) => document.querySelector(selector);
const titles = { overview: "总览", projects: "作品管理", submissions: "征稿管理", messages: "留言管理" };

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function loadDashboard() {
  dashboard = await api("/api/admin/dashboard");
  renderStats();
  renderProjects();
  renderSubmissions();
  renderMessages();
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
    <div class="stat"><span>作品数量</span><strong>${dashboard.stats.projects}</strong></div>
    <div class="stat"><span>征稿需求</span><strong>${dashboard.stats.submissions}</strong></div>
    <div class="stat"><span>未读留言</span><strong>${dashboard.stats.unread}</strong></div>
  `;
}

function renderProjects() {
  qs("#projectsTable").innerHTML = `
    <thead><tr><th>封面</th><th>作品</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>
      ${dashboard.projects.map((item) => `
        <tr>
          <td><img class="thumb" src="${item.cover_url}" alt="${item.title}"></td>
          <td><strong>${item.title}</strong><br>${item.category} / ${item.year} / ${item.location}<br>${item.description}</td>
          <td>${item.featured ? "精选" : "普通"} / ${item.published ? "已发布" : "已隐藏"}</td>
          <td class="row-actions">
            <button class="mini" data-action="feature" data-id="${item.id}" data-value="${item.featured ? 0 : 1}">${item.featured ? "取消精选" : "设为精选"}</button>
            <button class="mini" data-action="publish" data-id="${item.id}" data-value="${item.published ? 0 : 1}">${item.published ? "隐藏" : "发布"}</button>
            <button class="mini danger" data-action="delete" data-id="${item.id}">删除</button>
          </td>
        </tr>
      `).join("")}
    </tbody>
  `;
}

function renderSubmissions() {
  qs("#submissionsTable").innerHTML = `
    <thead><tr><th>客户</th><th>需求</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>
      ${dashboard.submissions.map((item) => `
        <tr>
          <td><strong>${item.name}</strong><br>${item.email}<br>${item.phone || ""}</td>
          <td>${item.project_type} / ${item.budget || "预算未填"} / ${item.preferred_date || "日期未定"}<br>${item.brief}<br><small>${item.created_at}</small></td>
          <td>${item.status}</td>
          <td class="row-actions">
            <button class="mini" data-submission="${item.id}" data-status="reviewing">跟进中</button>
            <button class="mini" data-submission="${item.id}" data-status="done">已完成</button>
            <button class="mini danger" data-delete-submission="${item.id}">删除</button>
          </td>
        </tr>
      `).join("")}
    </tbody>
  `;
}

function renderMessages() {
  qs("#messagesTable").innerHTML = `
    <thead><tr><th>发件人</th><th>内容</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>
      ${dashboard.messages.map((item) => `
        <tr>
          <td><strong>${item.name}</strong><br>${item.email}</td>
          <td><strong>${item.subject}</strong><br>${item.message}<br><small>${item.created_at}</small></td>
          <td>${item.status}</td>
          <td class="row-actions">
            <button class="mini" data-message="${item.id}" data-status="read">标为已读</button>
            <button class="mini danger" data-delete-message="${item.id}">删除</button>
          </td>
        </tr>
      `).join("")}
    </tbody>
  `;
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.add("hidden"));
  qs(`#${name}Tab`).classList.remove("hidden");
  qs("#tabTitle").textContent = titles[name];
  document.querySelectorAll(".sidebar button[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
}

qs("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  qs("#loginStatus").textContent = "登录中...";
  try {
    const data = await api("/api/admin/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    token = data.token;
    localStorage.setItem("studioToken", token);
    showAdmin();
    await loadDashboard();
  } catch (error) {
    qs("#loginStatus").textContent = error.message;
  }
});

qs("#projectForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  qs("#projectStatus").textContent = "保存中...";
  const formData = new FormData(event.currentTarget);
  try {
    const res = await fetch("/api/admin/projects", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "保存失败");
    event.currentTarget.reset();
    qs("#projectStatus").textContent = "作品已保存。";
    await loadDashboard();
  } catch (error) {
    qs("#projectStatus").textContent = error.message;
  }
});

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (target.matches("[data-tab]")) switchTab(target.dataset.tab);
  if (target.id === "logoutBtn") {
    localStorage.removeItem("studioToken");
    token = "";
    showLogin();
  }
  if (target.dataset.action) {
    const id = target.dataset.id;
    if (target.dataset.action === "delete" && !confirm("确认删除这条作品？")) return;
    if (target.dataset.action === "delete") await api(`/api/admin/projects/${id}`, { method: "DELETE" });
    if (target.dataset.action === "feature") await api(`/api/admin/projects/${id}`, { method: "PATCH", body: JSON.stringify({ featured: Number(target.dataset.value) }) });
    if (target.dataset.action === "publish") await api(`/api/admin/projects/${id}`, { method: "PATCH", body: JSON.stringify({ published: Number(target.dataset.value) }) });
    await loadDashboard();
  }
  if (target.dataset.submission) {
    await api(`/api/admin/submissions/${target.dataset.submission}`, { method: "PATCH", body: JSON.stringify({ status: target.dataset.status }) });
    await loadDashboard();
  }
  if (target.dataset.deleteSubmission) {
    if (!confirm("确认删除这条征稿？")) return;
    await api(`/api/admin/submissions/${target.dataset.deleteSubmission}`, { method: "DELETE" });
    await loadDashboard();
  }
  if (target.dataset.message) {
    await api(`/api/admin/messages/${target.dataset.message}`, { method: "PATCH", body: JSON.stringify({ status: target.dataset.status }) });
    await loadDashboard();
  }
  if (target.dataset.deleteMessage) {
    if (!confirm("确认删除这条留言？")) return;
    await api(`/api/admin/messages/${target.dataset.deleteMessage}`, { method: "DELETE" });
    await loadDashboard();
  }
});

if (token) {
  showAdmin();
  loadDashboard().catch(() => {
    localStorage.removeItem("studioToken");
    showLogin();
  });
}
