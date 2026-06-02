const state = { projects: [], category: "all" };

const categoryNames = {
  all: "全部",
  wedding: "婚礼",
  portrait: "肖像",
  commercial: "商业",
  editorial: "编辑",
  event: "活动",
  interior: "空间",
  portfolio: "作品",
};

const qs = (selector) => document.querySelector(selector);

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

function renderFilters() {
  const categories = ["all", ...new Set(state.projects.map((project) => project.category))];
  qs("#filters").innerHTML = categories.map((category) => (
    `<button class="${state.category === category ? "active" : ""}" data-category="${category}">${categoryNames[category] || category}</button>`
  )).join("");
  qs("#filters").querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      renderFilters();
      renderGallery();
    });
  });
}

function renderGallery() {
  const projects = state.category === "all" ? state.projects : state.projects.filter((project) => project.category === state.category);
  qs("#gallery").innerHTML = projects.map((project) => `
    <article class="project reveal" data-id="${project.id}">
      <img src="${project.cover_url}" alt="${project.title}" loading="lazy">
      <div class="project-info">
        <div class="tags">${project.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
        <h3>${project.title}</h3>
        <p>${project.year} / ${project.location}</p>
      </div>
    </article>
  `).join("");
  qs("#gallery").querySelectorAll(".project").forEach((card) => {
    card.addEventListener("click", () => openLightbox(state.projects.find((project) => String(project.id) === card.dataset.id)));
  });
  observeReveals();
}

function openLightbox(project) {
  qs("#lightboxImage").src = project.cover_url;
  qs("#lightboxTitle").textContent = project.title;
  qs("#lightboxText").textContent = `${project.description} ${project.client ? `客户：${project.client}。` : ""}`;
  qs("#lightbox").hidden = false;
}

function observeReveals() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("visible");
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
}

function animateCounters() {
  document.querySelectorAll("[data-count]").forEach((el) => {
    const target = Number(el.dataset.count);
    let frame = 0;
    const tick = () => {
      frame += 1;
      el.textContent = Math.round(target * Math.min(frame / 42, 1));
      if (frame < 42) requestAnimationFrame(tick);
    };
    tick();
  });
}

async function bindSubmissionForm() {
  qs("#submissionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = qs("#submissionStatus");
    const token = localStorage.getItem("studioToken");
    if (!token) {
      status.innerHTML = `请先到 <a href="/admin.html">用户中心</a> 注册或登录，登录后提交的征稿才能查看进度。`;
      return;
    }
    const payload = Object.fromEntries(new FormData(form));
    status.textContent = "正在提交...";
    try {
      await request("/api/submissions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      form.reset();
      status.innerHTML = `已保存，可到 <a href="/admin.html">用户中心</a> 查看征稿进度。`;
    } catch (error) {
      status.textContent = error.message;
    }
  });
}

async function bindMessageForm() {
  qs("#messageForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = qs("#messageStatus");
    const payload = Object.fromEntries(new FormData(form));
    status.textContent = "正在提交...";
    try {
      await request("/api/messages", { method: "POST", body: JSON.stringify(payload) });
      form.reset();
      status.textContent = "已发送，我们会尽快回复。";
    } catch (error) {
      status.textContent = error.message;
    }
  });
}

async function init() {
  const data = await request("/api/site");
  state.projects = data.projects;
  qs("#studioEmail").textContent = data.studio.email;
  qs("#studioPhone").textContent = data.studio.phone;
  qs("#studioCity").textContent = data.studio.city;
  renderFilters();
  renderGallery();
  observeReveals();
  animateCounters();
  bindSubmissionForm();
  bindMessageForm();
  qs("#closeLightbox").addEventListener("click", () => { qs("#lightbox").hidden = true; });
}

init().catch((error) => {
  document.body.innerHTML = `<main class="section"><h1>加载失败</h1><p>${error.message}</p></main>`;
});
