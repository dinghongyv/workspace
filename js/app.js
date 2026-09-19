/* ═══════════════════════════════════════════════
   家具改动报告工作台 · app.js
   上海看样改动报告 + 山东评审意见 → 合并 Word / PDF
   ═══════════════════════════════════════════════ */
"use strict";

/* ───────── 状态 ───────── */
const defaultState = () => ({
  meta: { type: "样品改动", spu: "", material: "", channel: "", product: "", date: today(), dept: "产品设计部" },
  newChanges: [],           // [{id, date, text}]
  sections: [],             // [{id, category, entries:[{id,title,desc,photos:[{id,src,caption}]}]}]
  sdHtml: ""                // 山东评审 HTML
});
let state = defaultState();
let uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function today() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function fmtDate(iso) { if (!iso) return today(); const [y, m, d] = iso.split("-"); return `${y}-${parseInt(m)}-${parseInt(d)}`; }
function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function escAttr(s) { return esc(s).replace(/'/g, "&#39;"); }

/* ───────── Toast ───────── */
let toastTimer;
function toast(msg, isErr) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), 2600);
}

/* ───────── IndexedDB 草稿 ───────── */
const DB_NAME = "furniture-report-db", STORE = "draft";
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
let saveTimer;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const db = await openDB();
      await new Promise((res, rej) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(JSON.parse(JSON.stringify(state)), "current");
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
      const hint = document.getElementById("saveHint");
      const t = new Date();
      hint.textContent = `✓ 已自动保存 ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
    } catch (e) { console.warn("保存草稿失败", e); }
  }, 700);
}
async function loadDraft() {
  try {
    const db = await openDB();
    const v = await new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get("current");
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    if (v && typeof v === "object") state = Object.assign(defaultState(), v);
  } catch (e) { console.warn("读取草稿失败", e); }
}
async function clearDraft() {
  state = defaultState();
  try { const db = await openDB(); const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete("current"); } catch (e) {}
}

/* ───────── 步骤导航 ───────── */
const STEP_ORDER = ["meta", "shanghai", "shandong", "preview"];
function gotoStep(step) {
  document.querySelectorAll(".step-panel").forEach(p => p.classList.remove("active"));
  document.getElementById("panel-" + step).classList.add("active");
  document.querySelectorAll(".step-btn").forEach(b => b.classList.toggle("active", b.dataset.step === step));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (step === "preview") renderPreview();
}
document.querySelectorAll(".step-btn").forEach(b => b.addEventListener("click", () => gotoStep(b.dataset.step)));
document.addEventListener("click", e => {
  const n = e.target.closest("[data-goto]");
  if (n) gotoStep(n.dataset.goto);
});
function updateStepDone() {
  const done = {
    meta: !!(state.meta.spu || state.meta.product),
    shanghai: state.sections.some(s => s.entries.length),
    shandong: !!state.sdHtml
  };
  document.querySelectorAll(".step-btn").forEach(b => b.classList.toggle("done", !!done[b.dataset.step]));
}

/* ───────── 第1步：产品信息 ───────── */
function bindMeta() {
  const map = { mType: "type", mSpu: "spu", mMaterial: "material", mChannel: "channel", mProduct: "product", mDate: "date", mDept: "dept" };
  for (const [id, key] of Object.entries(map)) {
    const el = document.getElementById(id);
    el.value = state.meta[key] || "";
    el.addEventListener("input", () => { state.meta[key] = el.value; scheduleSave(); updateStepDone(); });
  }
  if (!document.getElementById("mDate").value) document.getElementById("mDate").value = todayISO();
  if (!state.meta.date) state.meta.date = todayISO();
}

/* 新增改动 */
function renderNewChanges() {
  const list = document.getElementById("newChangeList");
  list.innerHTML = "";
  state.newChanges.forEach((nc, i) => {
    const div = document.createElement("div");
    div.className = "nc-item";
    div.innerHTML = `
      <span class="nc-date">${esc(fmtDate(nc.date))}</span>
      <div class="nc-text">${esc(nc.text).replace(/\n/g, "<br>")}</div>
      <div class="row-actions">
        <button class="btn icon danger" data-del-nc="${i}" title="删除">✕</button>
      </div>`;
    list.appendChild(div);
  });
}
document.getElementById("btnAddNewChange").addEventListener("click", () => {
  const dateEl = document.getElementById("ncDate");
  const textEl = document.getElementById("ncContent");
  const text = textEl.value.trim();
  if (!text) { toast("请先填写新增改动内容", true); return; }
  state.newChanges.unshift({ id: uid(), date: dateEl.value || todayISO(), text });
  textEl.value = "";
  renderNewChanges(); scheduleSave(); updateStepDone();
  toast("已添加，最新改动呈现在最前端");
});
document.getElementById("newChangeList").addEventListener("click", e => {
  const b = e.target.closest("[data-del-nc]");
  if (b) { state.newChanges.splice(+b.dataset.delNc, 1); renderNewChanges(); scheduleSave(); }
});

/* ───────── 第2步：看样改动 ───────── */
const tplSection = document.getElementById("tplSection");
const tplEntry = document.getElementById("tplEntry");
const tplPhoto = document.getElementById("tplPhoto");

function renderSections() {
  const list = document.getElementById("sectionList");
  list.innerHTML = "";
  state.sections.forEach((sec, si) => {
    const node = tplSection.content.cloneNode(true);
    node.querySelector(".sec-category").value = sec.category;
    node.querySelector(".sec-category").addEventListener("change", e => { sec.category = e.target.value; scheduleSave(); renderPreviewDebounced(); });

    const upBtn = node.querySelector(".up"), downBtn = node.querySelector(".down");
    upBtn.disabled = si === 0; downBtn.disabled = si === state.sections.length - 1;
    upBtn.addEventListener("click", () => { if (si > 0) { [state.sections[si - 1], state.sections[si]] = [state.sections[si], state.sections[si - 1]]; renderSections(); scheduleSave(); } });
    downBtn.addEventListener("click", () => { if (si < state.sections.length - 1) { [state.sections[si + 1], state.sections[si]] = [state.sections[si], state.sections[si + 1]]; renderSections(); scheduleSave(); } });
    node.querySelector(".del-section").addEventListener("click", () => {
      if (!confirm(`确定删除「${sec.category}」整节（含 ${sec.entries.length} 条改动）？`)) return;
      state.sections.splice(si, 1); renderSections(); scheduleSave(); updateStepDone();
    });

    const entryList = node.querySelector(".entry-list");
    sec.entries.forEach((en, ei) => entryList.appendChild(buildEntry(en, sec, ei)));
    node.querySelector(".add-entry").addEventListener("click", () => {
      sec.entries.push({ id: uid(), title: "", desc: "", photos: [] });
      renderSections(); scheduleSave();
      const nodes = list.querySelectorAll(".sh-section")[si];
      nodes.querySelectorAll(".entry")[sec.entries.length - 1]?.querySelector(".entry-title").focus();
    });

    list.appendChild(node);
  });
  updateStepDone();
}

function buildEntry(en, sec, ei) {
  const node = tplEntry.content.cloneNode(true);
  const titleEl = node.querySelector(".entry-title");
  const descEl = node.querySelector(".entry-desc");
  titleEl.value = en.title || "";
  descEl.value = en.desc || "";
  titleEl.addEventListener("input", () => { en.title = titleEl.value; scheduleSave(); renderPreviewDebounced(); });
  descEl.addEventListener("input", () => { en.desc = descEl.value; scheduleSave(); renderPreviewDebounced(); });

  const upBtn = node.querySelector(".up"), downBtn = node.querySelector(".down");
  upBtn.disabled = ei === 0; downBtn.disabled = ei === sec.entries.length - 1;
  upBtn.addEventListener("click", () => { if (ei > 0) { [sec.entries[ei - 1], sec.entries[ei]] = [sec.entries[ei], sec.entries[ei - 1]]; renderSections(); scheduleSave(); } });
  downBtn.addEventListener("click", () => { if (ei < sec.entries.length - 1) { [sec.entries[ei + 1], sec.entries[ei]] = [sec.entries[ei], sec.entries[ei + 1]]; renderSections(); scheduleSave(); } });
  node.querySelector(".del-entry").addEventListener("click", () => {
    if (!confirm("确定删除该条改动？")) return;
    sec.entries.splice(ei, 1); renderSections(); scheduleSave();
  });

  const grid = node.querySelector(".photo-grid");
  en.photos.forEach(ph => grid.appendChild(buildPhoto(ph, en, grid)));
  /* 2-3 张图片自动缩小并排同一行 */
  const applyPhotoCols = () => {
    const n = en.photos.length;
    grid.style.gridTemplateColumns = (n >= 2 && n <= 3) ? "repeat(" + n + ", minmax(0, 1fr))" : "";
  };
  applyPhotoCols();

  /* 说明输入框支持同时粘贴文字与图片：文字入输入框，图片自动加入图组 */
  descEl.addEventListener("paste", async e => {
    const cd = e.clipboardData;
    if (!cd) return;
    const imgItems = [...cd.items].filter(i => i.type.startsWith("image/"));
    if (!imgItems.length) return; /* 纯文字走默认粘贴 */
    e.preventDefault();
    const text = cd.getData("text/plain") || "";
    if (text) {
      const s = descEl.selectionStart ?? descEl.value.length;
      const t = descEl.selectionEnd ?? descEl.value.length;
      descEl.setRangeText(text, s, t, "end");
      en.desc = descEl.value;
    }
    let n = 0;
    for (const it of imgItems) {
      const f = it.getAsFile();
      if (!f) continue;
      try {
        const src = await compressImage(f);
        en.photos.push({ id: uid(), src, caption: "" });
        n++;
      } catch (err) { /* 忽略 */ }
    }
    renderSections(); scheduleSave();
    toast(n ? `已粘贴 ${n} 张图片到「${sec.category}」，请为图片补充文字说明` : "已粘贴内容");
  });

  const handleFiles = async files => {
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const src = await compressImage(f);
        en.photos.push({ id: uid(), src, caption: "" });
      } catch (err) { toast("图片处理失败：" + f.name, true); }
    }
    renderSections(); scheduleSave();
    toast("图片已添加，请为每张图片填写文字说明");
  };
  node.querySelector(".photo-input").addEventListener("change", e => { handleFiles(e.target.files); e.target.value = ""; });
  node.querySelector(".photo-input-cam").addEventListener("change", e => { handleFiles(e.target.files); e.target.value = ""; });
  return node;
}

function buildPhoto(ph, en, grid) {
  const node = tplPhoto.content.cloneNode(true);
  const img = node.querySelector("img");
  img.src = ph.src;
  const cap = node.querySelector(".photo-caption");
  cap.value = ph.caption || "";
  cap.addEventListener("input", () => { ph.caption = cap.value; scheduleSave(); renderPreviewDebounced(); });
  node.querySelector(".photo-del").addEventListener("click", () => {
    const idx = en.photos.indexOf(ph);
    if (idx > -1) en.photos.splice(idx, 1);
    renderSections(); scheduleSave();
  });
  node.querySelector(".photo-anno").addEventListener("click", () => openAnno(ph));
  img.addEventListener("dblclick", () => openAnno(ph));
  return node;
}

/* ───────── 图片标注编辑器（放大 + 箭头/圆圈/画笔） ───────── */
const anno = { ph: null, img: null, shapes: [], tool: "arrow", color: "#e60000", drawing: null, scale: 1 };
const annoOverlay = document.getElementById("annoOverlay");
const annoCanvas = document.getElementById("annoCanvas");
const annoCtx = annoCanvas.getContext("2d");

function openAnno(ph) {
  anno.ph = ph; anno.shapes = []; anno.drawing = null;
  const im = new Image();
  im.onload = () => {
    anno.img = im;
    annoOverlay.hidden = false;
    fitAnnoCanvas();
    drawAnno();
  };
  im.src = ph.src;
}
function closeAnno() { annoOverlay.hidden = true; anno.ph = null; anno.img = null; }

function fitAnnoCanvas() {
  const maxW = Math.min(window.innerWidth - 32, 1200);
  const maxH = window.innerHeight - 110;
  const k = Math.min(maxW / anno.img.naturalWidth, maxH / anno.img.naturalHeight, 1);
  annoCanvas.width = anno.img.naturalWidth;
  annoCanvas.height = anno.img.naturalHeight;
  annoCanvas.style.width = Math.round(anno.img.naturalWidth * k) + "px";
  annoCanvas.style.height = Math.round(anno.img.naturalHeight * k) + "px";
}
function drawShape(c, s, lw) {
  c.strokeStyle = s.color; c.fillStyle = s.color;
  c.lineWidth = lw; c.lineCap = "round"; c.lineJoin = "round";
  if (s.tool === "pen") {
    if (s.pts.length < 2) return;
    c.beginPath();
    s.pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.stroke();
  } else if (s.tool === "circle") {
    const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2);
    const w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);
    c.beginPath();
    c.ellipse(x + w / 2, y + h / 2, w / 2 || lw, h / 2 || lw, 0, 0, Math.PI * 2);
    c.stroke();
  } else if (s.tool === "arrow") {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const head = Math.max(lw * 4, Math.min(len * 0.25, annoCanvas.width / 20));
    const px = -uy, py = ux;
    c.beginPath();
    c.moveTo(s.x1, s.y1);
    c.lineTo(s.x2 - ux * head * 0.7, s.y2 - uy * head * 0.7);
    c.stroke();
    c.beginPath();
    c.moveTo(s.x2, s.y2);
    c.lineTo(s.x2 - ux * head + px * head * 0.45, s.y2 - uy * head + py * head * 0.45);
    c.lineTo(s.x2 - ux * head - px * head * 0.45, s.y2 - uy * head - py * head * 0.45);
    c.closePath();
    c.fill();
  }
}
function drawAnno() {
  annoCtx.clearRect(0, 0, annoCanvas.width, annoCanvas.height);
  annoCtx.drawImage(anno.img, 0, 0);
  const lw = Math.max(4, annoCanvas.width / 250);
  anno.shapes.forEach(s => drawShape(annoCtx, s, lw));
  if (anno.drawing) drawShape(annoCtx, anno.drawing, lw);
}
function annoPoint(e) {
  const r = annoCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * annoCanvas.width / r.width,
    y: (e.clientY - r.top) * annoCanvas.height / r.height
  };
}
annoCanvas.addEventListener("pointerdown", e => {
  if (!anno.img) return;
  e.preventDefault();
  annoCanvas.setPointerCapture(e.pointerId);
  const p = annoPoint(e);
  anno.drawing = anno.tool === "pen"
    ? { tool: "pen", color: anno.color, pts: [p] }
    : { tool: anno.tool, color: anno.color, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
  drawAnno();
});
annoCanvas.addEventListener("pointermove", e => {
  if (!anno.drawing) return;
  const p = annoPoint(e);
  if (anno.drawing.tool === "pen") anno.drawing.pts.push(p);
  else { anno.drawing.x2 = p.x; anno.drawing.y2 = p.y; }
  drawAnno();
});
annoCanvas.addEventListener("pointerup", () => {
  if (anno.drawing) { anno.shapes.push(anno.drawing); anno.drawing = null; drawAnno(); }
});
document.querySelectorAll(".anno-toolbar .tool-btn").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".anno-toolbar .tool-btn").forEach(x => x.classList.toggle("active", x === b));
  anno.tool = b.dataset.tool;
}));
document.getElementById("annoColor").addEventListener("input", e => { anno.color = e.target.value; });
document.getElementById("annoUndo").addEventListener("click", () => { anno.shapes.pop(); drawAnno(); });
document.getElementById("annoCancel").addEventListener("click", closeAnno);
document.getElementById("annoSave").addEventListener("click", () => {
  if (!anno.img || !anno.ph) return;
  if (anno.drawing) { anno.shapes.push(anno.drawing); anno.drawing = null; }
  if (!anno.shapes.length) { toast("尚未添加任何标注", true); return; }
  const off = document.createElement("canvas");
  off.width = anno.img.naturalWidth; off.height = anno.img.naturalHeight;
  const octx = off.getContext("2d");
  octx.drawImage(anno.img, 0, 0);
  const lw = Math.max(4, off.width / 250);
  anno.shapes.forEach(s => drawShape(octx, s, lw));
  anno.ph.src = off.toDataURL("image/jpeg", 0.9);
  closeAnno();
  renderSections(); scheduleSave();
  toast("标注已保存到图片");
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !annoOverlay.hidden) closeAnno();
});

document.getElementById("btnAddSection").addEventListener("click", () => {
  const used = new Set(state.sections.map(s => s.category));
  const def = ["实木改动", "软包改动", "五金改动", "结构改动", "其他改动"].find(c => !used.has(c)) || "其他改动";
  state.sections.push({ id: uid(), category: def, entries: [] });
  renderSections(); scheduleSave();
});

/* 图片压缩：最长边 1600px，JPEG 0.85 */
function compressImage(file, maxSide = 1600, quality = 0.85) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (Math.max(w, h) > maxSide) {
          const k = maxSide / Math.max(w, h);
          w = Math.round(w * k); h = Math.round(h * k);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        res(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = rej;
      img.src = reader.result;
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

/* ───────── 第3步：山东评审导入 ───────── */
/* ───────── 山东评审格式标准化：去表格、统一标题/图片样式 ───────── */
function normalizeShandongHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  if (!root) return "";
  /* 清理脚本/样式与所有内联属性（内容不丢，样式交由标准格式控制） */
  root.querySelectorAll("script,style,meta,link").forEach(el => el.remove());
  root.querySelectorAll("*").forEach(el => {
    [...el.attributes].forEach(a => {
      const n = a.name.toLowerCase();
      if (n !== "src" && n !== "alt") el.removeAttribute(a.name);
    });
  });
  /* 表格 → 纯文本段落 + 保留图片（内容完整保留，表格结构去除） */
  root.querySelectorAll("table").forEach(t => {
    const frag = doc.createDocumentFragment();
    /* 只处理本层表格的行，嵌套表随外层单元格一起提取 */
    t.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr").forEach(tr => {
      tr.querySelectorAll(":scope > td, :scope > th").forEach(td => {
        td.querySelectorAll("img").forEach(img => {
          const fig = doc.createElement("figure");
          fig.className = "sd-fig";
          img.replaceWith(fig);
          fig.appendChild(img);
          frag.appendChild(fig);
        });
        const txt = td.textContent.trim();
        if (txt) {
          const p = doc.createElement("p");
          p.textContent = txt;
          frag.appendChild(p);
        }
      });
    });
    t.replaceWith(frag);
  });
  /* 标题层级统一为标准格式：大标题→h3，小标题→h4 */
  const rename = (el, tag) => { const n = doc.createElement(tag); n.innerHTML = el.innerHTML; el.replaceWith(n); };
  root.querySelectorAll("h1,h2").forEach(h => rename(h, "h3"));
  root.querySelectorAll("h4,h5,h6").forEach(h => rename(h, "h4"));
  /* 图片统一为居中标准图 */
  root.querySelectorAll("img").forEach(img => {
    const fig = doc.createElement("figure");
    fig.className = "sd-fig";
    img.replaceWith(fig);
    fig.appendChild(img);
  });
  /* 空段落清理 */
  root.querySelectorAll("p,div").forEach(p => {
    if (!p.textContent.trim() && !p.querySelector("img")) p.remove();
  });
  root.querySelectorAll("figure").forEach(f => { if (!f.querySelector("img")) f.remove(); });
  return root.innerHTML;
}

const docInput = document.getElementById("docInput");
const importZone = document.getElementById("importZone");
const importStatus = document.getElementById("importStatus");
const sdEditorWrap = document.getElementById("sdEditorWrap");
const sdEditor = document.getElementById("sdEditor");

docInput.addEventListener("change", () => { if (docInput.files[0]) importDocx(docInput.files[0]); docInput.value = ""; });
importZone.addEventListener("dragover", e => { e.preventDefault(); importZone.classList.add("dragover"); });
importZone.addEventListener("dragleave", () => importZone.classList.remove("dragover"));
importZone.addEventListener("drop", e => {
  e.preventDefault(); importZone.classList.remove("dragover");
  const f = e.dataTransfer.files[0];
  if (f) importDocx(f);
});

async function importDocx(file) {
  importStatus.className = "import-status";
  if (!/\.docx$/i.test(file.name)) {
    importStatus.textContent = "✕ 仅支持 .docx 格式（旧版 .doc 请先用 Word 另存为 .docx）";
    importStatus.classList.add("err");
    return;
  }
  importStatus.textContent = "正在解析「" + file.name + "」…";
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer }, {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh"
      ]
    });
    let html = normalizeShandongHtml(result.value || "");
    if (!html.trim()) throw new Error("文档内容为空");
    state.sdHtml = html;
    sdEditor.innerHTML = html;
    sdEditorWrap.hidden = false;
    importStatus.textContent = "✓ 导入成功：" + file.name + "（可在大纲中直接编辑）";
    importStatus.classList.add("ok");
    scheduleSave(); updateStepDone(); renderPreviewDebounced();
    toast("山东评审意见导入成功");
  } catch (err) {
    importStatus.textContent = "✕ 解析失败：" + (err.message || err);
    importStatus.classList.add("err");
  }
}
sdEditor.addEventListener("input", () => { state.sdHtml = sdEditor.innerHTML; scheduleSave(); renderPreviewDebounced(); });

/* 直接粘贴导入：外部复制的文字 + 图片，统一按标准格式插入 */
function insertHtmlAtCaret(html) {
  const sel = window.getSelection();
  if (sel && sel.rangeCount && sdEditor.contains(sel.anchorNode)) {
    document.execCommand("insertHTML", false, html);
  } else {
    sdEditor.insertAdjacentHTML("beforeend", html);
  }
}
sdEditor.addEventListener("paste", async e => {
  const cd = e.clipboardData;
  if (!cd) return;
  const items = [...cd.items];
  const imgItems = items.filter(i => i.type.startsWith("image/"));
  const hasHtml = cd.types.includes("text/html");
  const text = cd.getData("text/plain") || "";
  if (!imgItems.length && !hasHtml && !text) return;
  e.preventDefault();
  const sel = window.getSelection();
  const savedRange = (sel && sel.rangeCount) ? sel.getRangeAt(0).cloneRange() : null;

  let insertHtml = "";
  if (hasHtml) {
    insertHtml = normalizeShandongHtml(cd.getData("text/html"));
  } else if (text) {
    insertHtml = text.split(/\r?\n/).map(l => "<p>" + esc(l) + "</p>").join("");
  }
  if (insertHtml) insertHtmlAtCaret(insertHtml);

  let n = 0;
  for (const it of imgItems) {
    const f = it.getAsFile();
    if (!f) continue;
    try {
      const src = await compressImage(f);
      if (savedRange && sel) { sel.removeAllRanges(); sel.addRange(savedRange); }
      insertHtmlAtCaret('<figure class="sd-fig"><img src="' + src + '"></figure>');
      n++;
    } catch (err) { /* 跳过无法读取的图片项 */ }
  }
  state.sdHtml = sdEditor.innerHTML;
  scheduleSave(); renderPreviewDebounced();
  toast(n ? `已粘贴 ${n} 张图片，文字与图片已按山东评审标准格式统一` : "粘贴内容已按标准格式统一");
});
document.getElementById("btnReimport").addEventListener("click", () => docInput.click());
document.getElementById("btnClearSd").addEventListener("click", () => {
  if (!confirm("确定移除已导入的山东评审内容？")) return;
  state.sdHtml = ""; sdEditor.innerHTML = ""; sdEditorWrap.hidden = true;
  importStatus.textContent = ""; scheduleSave(); updateStepDone();
});

/* ───────── 第4步：合并预览 ───────── */
let previewTimer;
function renderPreviewDebounced() { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 500); }

function buildReportTitle() {
  const m = state.meta;
  const left = [m.spu, m.material].filter(Boolean).join("#");
  const right = m.product || "产品名称";
  const mid = left ? left + "-" : "";
  return `【${m.type || "样品改动"}】${mid}${right} 改动报告${fmtDate(m.date)}`;
}
function buildFileName(ext) {
  const m = state.meta;
  const left = [m.spu, m.material].filter(Boolean).join("#");
  const chan = m.channel ? `[${m.channel}]` : "";
  let name = `【${m.type || "样品改动"}】${left ? left + "-" : ""}${chan}${m.product || "产品名称"} 改动报告${fmtDate(m.date)}`;
  return name.replace(/[\\/:*?"<>|]/g, "_") + ext;
}

function renderPreview() {
  const m = state.meta;
  const parts = [];
  const hasShanghai = state.sections.some(s => s.entries.some(e => e.title || e.desc || e.photos.length));
  const hasAny = state.newChanges.length || hasShanghai || state.sdHtml || m.spu || m.product;

  parts.push(`<p class="doc-title">${esc(buildReportTitle())}</p>`);
  const subBits = [];
  if (m.dept) subBits.push("部门：" + esc(m.dept));
  if (m.channel) subBits.push("渠道：" + esc(m.channel));
  subBits.push("日期：" + esc(fmtDate(m.date)));
  parts.push(`<p class="doc-subtitle">${subBits.join("　｜　")}</p>`);

  if (state.newChanges.length) {
    parts.push(`<h2>新增改动</h2>`);
    state.newChanges.forEach(nc => {
      parts.push(`<h3>新增改动${esc(fmtDate(nc.date))}</h3>`);
      parts.push(`<p>${esc(nc.text).replace(/\n/g, "<br>")}</p>`);
    });
  }

  if (hasShanghai) {
    parts.push(`<h2>上海评审——看样改动</h2>`);
    state.sections.forEach(sec => {
      const entries = sec.entries.filter(e => e.title || e.desc || e.photos.length);
      if (!entries.length) return;
      parts.push(`<h3>${esc(sec.category)}</h3>`);
      entries.forEach((en, i) => {
        if (en.title) parts.push(`<h4 style="margin:8pt 0 4pt;font-weight:bold;">${i + 1}. ${esc(en.title)}</h4>`);
        if (en.desc) parts.push(`<p>${esc(en.desc).replace(/\n/g, "<br>")}</p>`);
        en.photos.forEach((ph, pi) => {
          const cap = ph.caption ? esc(ph.caption) : `图${pi + 1}`;
          parts.push(`<figure><img src="${ph.src}" alt=""><figcaption>▲ ${cap}</figcaption></figure>`);
        });
      });
    });
  }

  if (state.sdHtml) {
    parts.push(`<h2>山东技术评审</h2>`);
    parts.push(state.sdHtml);
  }

  if (m.dept || m.date) {
    parts.push(`<table class="doc-meta-table">
      <tr><td style="font-weight:bold;background:#f0f4f8;">部门</td><td>${esc(m.dept)}</td></tr>
      <tr><td style="font-weight:bold;background:#f0f4f8;">日期</td><td>${esc(fmtDate(m.date))}</td></tr>
    </table>`);
  }

  const box = document.getElementById("docPreview");
  if (!hasAny) {
    box.innerHTML = `<p class="doc-empty">暂无内容 —— 请先在「产品信息」和「看样改动」中填写内容，此处将实时生成合并预览</p>`;
  } else {
    box.innerHTML = parts.join("");
  }
}

/* ───────── Word 导出（HTML → docx） ───────── */
const MAX_IMG_W = 440; // 96dpi 像素，适配 A4 版心

function dataUrlToUint8(dataUrl) {
  const [head, b64] = dataUrl.split(",");
  const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return { data: arr, mime };
}
function mimeToType(mime) {
  if (/jpe?g/.test(mime)) return "jpg";
  if (/png/.test(mime)) return "png";
  if (/gif/.test(mime)) return "gif";
  if (/bmp/.test(mime)) return "bmp";
  return "png";
}

async function collectImages(root) {
  const map = new Map();
  const imgs = root.querySelectorAll("img");
  const jobs = [...imgs].map(img => new Promise(res => {
    const src = img.getAttribute("src") || "";
    if (!src.startsWith("data:")) { res(); return; }
    const probe = new Image();
    probe.onload = () => {
      const { data, mime } = dataUrlToUint8(src);
      let w = probe.naturalWidth || 400, h = probe.naturalHeight || 300;
      if (w > MAX_IMG_W) { h = Math.round(h * MAX_IMG_W / w); w = MAX_IMG_W; }
      map.set(img, { data, type: mimeToType(mime), w, h });
      res();
    };
    probe.onerror = () => res();
    probe.src = src;
  }));
  await Promise.all(jobs);
  return map;
}

function imageRun(info) {
  return new docx.ImageRun({ data: info.data, type: info.type, transformation: { width: info.w, height: info.h } });
}

/* 行内节点 → TextRun / ImageRun 数组 */
function inlineRuns(node, fmt, imgMap) {
  const runs = [];
  const walk = (n, f) => {
    if (n.nodeType === 3) {
      const text = n.textContent;
      if (text) runs.push(new docx.TextRun({ text, bold: f.bold, italics: f.italic, underline: f.underline ? {} : undefined, break: f.break || 0 }));
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toUpperCase();
    if (tag === "BR") { runs.push(new docx.TextRun({ break: 1 })); return; }
    if (tag === "IMG") {
      const info = imgMap.get(n);
      if (info) runs.push(imageRun(info));
      return;
    }
    const nf = {
      bold: f.bold || tag === "B" || tag === "STRONG" || tag === "TH",
      italic: f.italic || tag === "I" || tag === "EM",
      underline: f.underline || tag === "U",
      break: f.break
    };
    n.childNodes.forEach(c => walk(c, nf));
  };
  node.childNodes.forEach(c => walk(c, fmt));
  return runs;
}

function listItemRuns(li, imgMap) {
  const runs = [];
  li.childNodes.forEach(c => {
    if (c.nodeType === 1 && c.tagName.toUpperCase() === "UL") return;
    runs.push(...inlineRuns(c.parentNode === li ? { childNodes: [c] } : li, {}, imgMap));
  });
  return runs;
}

/* 简化：li 内容整体转 runs */
function liToRuns(li, imgMap) {
  const cloneRuns = inlineRuns(li, {}, imgMap);
  return cloneRuns;
}

function convertBlocks(root, imgMap) {
  const out = [];
  const pushPara = (opts) => out.push(new docx.Paragraph(opts));

  const handleEl = el => {
    const tag = el.tagName ? el.tagName.toUpperCase() : "";
    switch (tag) {
      case "P": {
        const cls = el.className || "";
        const runs = inlineRuns(el, {}, imgMap);
        if (cls.includes("doc-title")) {
          pushPara({ children: runs, alignment: docx.AlignmentType.CENTER, spacing: { after: 120 } });
        } else if (cls.includes("doc-subtitle")) {
          pushPara({ children: runs, alignment: docx.AlignmentType.CENTER, spacing: { after: 240 } });
        } else if (cls.includes("doc-empty")) {
          /* skip */
        } else {
          pushPara({ children: runs.length ? runs : [new docx.TextRun({ text: "" })] });
        }
        break;
      }
      case "DIV": {
        const hasBlock = [...el.children].some(c => /^(P|DIV|UL|OL|TABLE|H[1-6]|FIGURE|BLOCKQUOTE)$/i.test(c.tagName));
        if (!hasBlock) {
          const runs = inlineRuns(el, {}, imgMap);
          if (runs.length) pushPara({ children: runs });
        } else {
          el.childNodes.forEach(c => { if (c.nodeType === 1) handleEl(c); });
        }
        break;
      }
      case "H1": pushPara({ children: inlineRuns(el, {}, imgMap), heading: docx.HeadingLevel.HEADING_1 }); break;
      case "H2": pushPara({ children: inlineRuns(el, {}, imgMap), heading: docx.HeadingLevel.HEADING_1 }); break;
      case "H3": pushPara({ children: inlineRuns(el, {}, imgMap), heading: docx.HeadingLevel.HEADING_2 }); break;
      case "H4": case "H5": case "H6":
        pushPara({ children: inlineRuns(el, { bold: true }, imgMap), spacing: { before: 120, after: 60 } });
        break;
      case "FIGURE": {
        const img = el.querySelector("img");
        const cap = el.querySelector("figcaption");
        if (img) {
          const info = imgMap.get(img);
          if (info) pushPara({ children: [imageRun(info)], alignment: docx.AlignmentType.CENTER, spacing: { before: 120, after: 40 } });
        }
        if (cap) pushPara({ children: inlineRuns(cap, {}, imgMap), alignment: docx.AlignmentType.CENTER, spacing: { after: 160 } });
        break;
      }
      case "UL":
        el.querySelectorAll(":scope > li").forEach(li => pushPara({ children: liToRuns(li, imgMap), bullet: { level: 0 } }));
        break;
      case "OL": {
        let n = 1;
        el.querySelectorAll(":scope > li").forEach(li => {
          pushPara({ children: [new docx.TextRun({ text: n + ". ", bold: false }), ...liToRuns(li, imgMap)] });
          n++;
        });
        break;
      }
      case "IMG": {
        const info = imgMap.get(el);
        if (info) pushPara({ children: [imageRun(info)], alignment: docx.AlignmentType.CENTER, spacing: { before: 120, after: 40 } });
        break;
      }
      case "BLOCKQUOTE":
        el.querySelectorAll("p").forEach(p => pushPara({ children: inlineRuns(p, {}, imgMap), indent: { left: 480 }, italics: true }));
        if (!el.querySelector("p")) pushPara({ children: inlineRuns(el, {}, imgMap), indent: { left: 480 } });
        break;
      case "TABLE": out.push(convertTable(el, imgMap)); break;
      default:
        if (el.childNodes) el.childNodes.forEach(c => { if (c.nodeType === 1) handleEl(c); });
    }
  };

  root.childNodes.forEach(c => { if (c.nodeType === 1) handleEl(c); });
  return out;
}

function convertTable(tableEl, imgMap) {
  const rows = [];
  tableEl.querySelectorAll("tr").forEach(tr => {
    const cells = [];
    tr.querySelectorAll("td,th").forEach(td => {
      const paras = [];
      const childEls = [...td.children].filter(c => /^(P|UL|OL|H[1-6])$/i.test(c.tagName));
      if (childEls.length) {
        childEls.forEach(p => paras.push(new docx.Paragraph({ children: inlineRuns(p, {}, imgMap) })));
      } else {
        paras.push(new docx.Paragraph({ children: inlineRuns(td, {}, imgMap) }));
      }
      cells.push(new docx.TableCell({
        children: paras.length ? paras : [new docx.Paragraph({ children: [] })],
        width: { size: Math.floor(9360 / Math.max(tr.querySelectorAll("td,th").length, 1)), type: docx.WidthType.DXA },
        margins: { top: 60, bottom: 60, left: 100, right: 100 }
      }));
    });
    if (cells.length) rows.push(new docx.TableRow({ children: cells, tableHeader: !!tr.querySelector("th") }));
  });
  const isMeta = (tableEl.className || "").includes("doc-meta-table");
  return new docx.Table({
    rows,
    width: { size: isMeta ? 5000 : 9360, type: docx.WidthType.DXA },
    alignment: isMeta ? docx.AlignmentType.CENTER : docx.AlignmentType.LEFT
  });
}

function applyDocTitleFonts(children, titleText) {
  /* 标题段落加粗大字（doc-title 的 P 无 heading 样式，这里替换首段） */
  if (children.length) {
    children[0] = new docx.Paragraph({
      alignment: docx.AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new docx.TextRun({ text: titleText, bold: true, size: 32, font: { ascii: "Arial", eastAsia: "黑体" } })]
    });
  }
}

async function exportDocx() {
  const preview = document.getElementById("docPreview");
  if (preview.querySelector(".doc-empty")) { toast("暂无可导出的内容", true); return; }
  toast("正在生成 Word 文档…");
  try {
    const titleText = buildReportTitle();
    const imgMap = await collectImages(preview);
    const children = convertBlocks(preview, imgMap);
    applyDocTitleFonts(children, titleText);

    const doc = new docx.Document({
      creator: state.meta.dept || "产品设计部",
      title: titleText,
      styles: {
        default: {
          document: {
            run: { font: { ascii: "Times New Roman", eastAsia: "宋体", hAnsi: "Times New Roman" }, size: 21 },
            paragraph: { spacing: { line: 320 } }
          },
          heading1: {
            run: { font: { ascii: "Arial", eastAsia: "黑体" }, size: 28, bold: true, color: "1F4E79" },
            paragraph: { spacing: { before: 240, after: 120 } }
          },
          heading2: {
            run: { font: { ascii: "Arial", eastAsia: "黑体" }, size: 24, bold: true, color: "333333" },
            paragraph: { spacing: { before: 180, after: 80 } }
          }
        }
      },
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 },          // A4
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } // 2cm
          }
        },
        children
      }]
    });

    const blob = await docx.Packer.toBlob(doc);
    window.__lastBlob = blob; // 供测试/调试获取导出结果
    downloadBlob(blob, buildFileName(".docx"));
    toast("Word 文档已保存：" + buildFileName(".docx"));
  } catch (err) {
    console.error(err);
    toast("生成失败：" + (err.message || err), true);
  }
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}

document.getElementById("btnSaveDocx").addEventListener("click", exportDocx);
document.getElementById("btnExportPdf").addEventListener("click", () => {
  renderPreview();
  if (document.getElementById("docPreview").querySelector(".doc-empty")) { toast("暂无可导出的内容", true); return; }
  toast("在打印窗口中选择「另存为 PDF」，并确认已选「彩色」+勾选「背景图形」");
  setTimeout(() => window.print(), 350);
});

/* ───────── 清空草稿 ───────── */
document.getElementById("btnClearDraft").addEventListener("click", async () => {
  if (!confirm("确定清空当前草稿？所有已填写内容与照片将丢失（不影响已导出的文件）。")) return;
  await clearDraft();
  location.reload();
});

/* ───────── 初始化 ───────── */
(async function init() {
  await loadDraft();
  bindMeta();
  document.getElementById("ncDate").value = todayISO();
  if (state.sdHtml) { sdEditor.innerHTML = state.sdHtml; sdEditorWrap.hidden = false; importStatus.textContent = "✓ 已恢复上次导入的评审内容"; importStatus.classList.add("ok"); }
  renderNewChanges();
  renderSections();
  updateStepDone();
  gotoStep("meta");
})();
