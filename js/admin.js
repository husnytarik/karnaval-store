// admin.js
// Depends on: supabase.js (SB)

let products = [];
let confirmCallback = null;

const DEFAULT_COLORS = [
  { name: "Çelik Gri", hex: "#8e8e93", images: [], out_of_stock: false },
  { name: "Obsidyen", hex: "#2c2c2e", images: [], out_of_stock: false },
  { name: "Krem", hex: "#e8dcc8", images: [], out_of_stock: false },
];

// ── INIT ──────────────────────────────────────
async function init() {
  try {
    const raw = await SB.getProducts();
    products = raw.map((p) => ({
      ...p,
      colors: (p.colors || []).map((c) =>
        "images" in c
          ? c
          : {
              name: c.name || c,
              hex: c.hex || "#888",
              images: [],
              out_of_stock: false,
            },
      ),
    }));
    renderList();
    setSaveDot("saved");
  } catch (e) {
    showToast("Bağlantı hatası: " + e.message, "error");
  }
}

// ── SAVE DOT ──────────────────────────────────
function setSaveDot(state) {
  const el = document.getElementById("save-dot");
  el.className = "save-dot " + (state || "");
  el.textContent =
    state === "saving"
      ? "Kaydediliyor..."
      : state === "saved"
        ? "Kaydedildi ✓"
        : "Hazır";
}

async function save(id, patch) {
  setSaveDot("saving");
  try {
    await SB.updateProduct(id, patch);
    const p = products.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
    setSaveDot("saved");
    return true;
  } catch (e) {
    setSaveDot("");
    showToast("Kayıt hatası: " + e.message, "error");
    return false;
  }
}

// ── HELPERS ───────────────────────────────────
function esc(s) {
  return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function toggleCard(id) {
  document.getElementById("card-" + id).classList.toggle("open");
}

// ── RENDER LIST ───────────────────────────────
function renderList() {
  const el = document.getElementById("prod-list");
  if (!products.length) {
    el.innerHTML = `<div class="empty-state">
      <div style="font-size:36px;margin-bottom:12px">◈</div>
      Henüz ürün yok — "Yeni Ürün" ekle
    </div>`;
    return;
  }

  const grouped = {};
  const order = [];
  products.forEach((p) => {
    const key = p.group_id || "solo_" + p.id;
    if (!grouped[key]) {
      grouped[key] = [];
      order.push(key);
    }
    grouped[key].push(p);
  });

  let html = "";
  order.forEach((key) => {
    const group = grouped[key];
    if (group.length > 1) {
      html += `<div class="group-header">
        ⬡ Grup: ${group[0].group_id} —
        ${group.map((p) => `<span>${p.group_label || p.name}</span>`).join(" · ")}
      </div>`;
    }
    group.forEach((p) => {
      html += renderCard(p);
    });
  });
  el.innerHTML = html;
}

function renderCard(p) {
  const firstImg = (p.colors || []).find((c) => c.images && c.images[0])
    ?.images[0];
  const thumb = firstImg
    ? `<img src="${firstImg}" alt="">`
    : `<span>${p.emoji || "◈"}</span>`;
  const hasOos = (p.colors || []).some((c) => c.out_of_stock);
  const allOos =
    (p.colors || []).length > 0 &&
    (p.colors || []).every((c) => c.out_of_stock);
  const dots = (p.colors || [])
    .slice(0, 6)
    .map(
      (c) =>
        `<span class="color-dot" title="${c.name}" style="background:${c.hex};${c.out_of_stock ? "opacity:.3;" : ""}"></span>`,
    )
    .join("");
  const groupBadge = p.group_id
    ? `<span class="group-badge">⬡ ${p.group_id} · ${p.group_label || "?"}</span>`
    : "";

  return `
  <div class="prod-card${allOos ? " oos" : ""}" id="card-${p.id}">
    <div class="card-head" onclick="toggleCard('${p.id}')">
      <div class="prod-thumb">${thumb}</div>
      <div class="prod-info">
        <div class="prod-row-name">${p.name}${groupBadge}</div>
        <div class="prod-row-meta">
          ₺${Number(p.price).toLocaleString("tr")} ${dots}
          ${
            allOos
              ? '<span class="oos-pill">Tüm Renkler Stokta Yok</span>'
              : hasOos
                ? '<span class="oos-pill warning">Bazı Renkler Stokta Yok</span>'
                : ""
          }
        </div>
      </div>
      <button class="expand-btn">▾</button>
    </div>
    <div class="card-body">

      <div class="field-group">
        <label class="field-label">Temel Bilgiler</label>
        <div class="two-col" style="margin-bottom:8px">
          <input class="edit-field" id="en-${p.id}" value="${esc(p.name)}" placeholder="Ürün adı">
          <input class="edit-field" id="ee-${p.id}" value="${esc(p.emoji || "")}" placeholder="Emoji 🥤" style="font-size:18px">
        </div>
        <textarea class="edit-field textarea" id="ed-${p.id}" placeholder="Açıklama...">${esc(p.description || "")}</textarea>
        <div class="two-col" style="margin-top:8px">
          <div class="price-row">
            <span class="price-prefix">₺</span>
            <input class="edit-field price-field" id="ep-${p.id}" type="number" value="${p.price}" style="flex:1">
          </div>
          <input class="edit-field" id="eb-${p.id}" value="${esc(p.badge || "")}" placeholder="Rozet">
        </div>
        <input class="edit-field" id="es-${p.id}" value="${(p.sizes || []).join(", ")}" placeholder="Boy: 1.2 L, 0.9 L" style="margin-top:8px">
        <div style="display:flex;gap:8px;margin-top:8px">
          <input class="edit-field" id="ecl-${p.id}" value="${p.chips && p.chips[0] ? esc(p.chips[0].label) : ""}" placeholder="Ek seçenek başlığı" style="flex:.8">
          <input class="edit-field" id="ecv-${p.id}" value="${p.chips && p.chips[0] ? (p.chips[0].values || []).join(", ") : ""}" placeholder="Değerler (virgülle)" style="flex:2">
        </div>
      </div>

      <div class="group-section">
        <div class="group-section-title">⬡ Varyant Grubu</div>
        <div class="two-col">
          <div>
            <label class="field-label">Grup ID</label>
            <input class="edit-field" id="egid-${p.id}" value="${esc(p.group_id || "")}" placeholder="aerolight-mug">
          </div>
          <div>
            <label class="field-label">Bu Ürünün Etiketi</label>
            <input class="edit-field" id="egl-${p.id}" value="${esc(p.group_label || "")}" placeholder="0.35 L">
          </div>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
        <label class="check-label">
          <input type="checkbox" id="eeng-${p.id}" ${p.name_engrave ? "checked" : ""} style="accent-color:var(--accent)">
          İsim kazıma seçeneği
        </label>
        <button class="inline-save-btn" onclick="saveBasicInfo('${p.id}')">Kaydet</button>
      </div>

      <hr class="section-divider">

      <div class="field-group">
        <label class="field-label">Renkler & Görseller</label>
        <div id="colors-${p.id}">${renderColorCards(p)}</div>
        <button class="add-color-card-btn" onclick="addColor('${p.id}')">+ Yeni Renk Ekle</button>
      </div>

      <hr class="section-divider">

      <div class="card-actions">
        <button class="btn-danger"
          onclick="askConfirm('Ürünü Sil','Bu ürün kalıcı olarak silinecek.',()=>deleteProduct('${p.id}'))">
          Ürünü Sil
        </button>
      </div>
    </div>
  </div>`;
}

function renderColorCards(p) {
  return (p.colors || []).map((c, i) => renderColorCard(p.id, c, i)).join("");
}

function renderColorCard(pid, c, i) {
  const imgRows = (c.images || [])
    .map(
      (url, j) => `
    <div class="color-img-row">
      <img class="color-img-thumb" src="${url}" onerror="this.style.display='none'">
      <span class="color-img-url" title="${url}">${url}</span>
      <button class="img-del" onclick="removeColorImage('${pid}',${i},${j})">✕</button>
    </div>`,
    )
    .join("");

  return `
  <div class="color-card" id="ccard-${pid}-${i}">
    <div class="color-card-head">
      <div class="color-card-swatch" style="background:${c.hex}">
        <input type="color" value="${c.hex}" oninput="updateColorHex('${pid}',${i},this.value,this.parentElement)">
      </div>
      <input class="color-card-name" value="${esc(c.name)}"
        onchange="updateColorName('${pid}',${i},this.value)" placeholder="Renk adı">
      <button class="img-del" style="margin-left:auto"
        onclick="askConfirm('Rengi Sil','Bu renk ve görselleri silinecek.',()=>deleteColor('${pid}',${i}))">✕</button>
    </div>
    <div class="color-card-body">
      <div class="field-label" style="margin-bottom:6px">Görseller</div>
      <div class="color-img-list" id="cimglist-${pid}-${i}">
        ${imgRows || '<div class="empty-imgs">Henüz görsel yok</div>'}
      </div>
      <div class="img-add-row">
        <input class="field-input" id="cimgurl-${pid}-${i}" placeholder="https://... URL yapıştır"
          onkeydown="if(event.key==='Enter') addColorImageUrl('${pid}',${i})">
        <button class="btn-upload" onclick="addColorImageUrl('${pid}',${i})">URL</button>
        <button class="btn-upload" onclick="triggerColorUpload('${pid}',${i})">⬆ Yükle</button>
      </div>
      <input type="file" id="cfile-${pid}-${i}" multiple accept="image/*" style="display:none"
        onchange="handleColorFileUpload('${pid}',${i},this)">
      <div id="cuprog-${pid}-${i}" class="upload-progress"></div>
      <div class="color-oos-row">
        <span class="color-oos-label">Stokta Yok</span>
        <label class="toggle">
          <input type="checkbox" ${c.out_of_stock ? "checked" : ""}
            onchange="toggleColorStock('${pid}',${i},this.checked)">
          <div class="toggle-track"></div>
          <div class="toggle-knob"></div>
        </label>
      </div>
    </div>
  </div>`;
}

// ── SAVE BASIC INFO ───────────────────────────
async function saveBasicInfo(id) {
  const name = document.getElementById(`en-${id}`).value.trim();
  const price = parseInt(document.getElementById(`ep-${id}`).value);
  if (!name) {
    showToast("İsim boş olamaz", "error");
    return;
  }
  if (isNaN(price)) {
    showToast("Geçerli fiyat gir", "error");
    return;
  }
  const sizes = document
    .getElementById(`es-${id}`)
    .value.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const cl = document.getElementById(`ecl-${id}`).value.trim();
  const cv = document
    .getElementById(`ecv-${id}`)
    .value.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const gid = document.getElementById(`egid-${id}`).value.trim();
  const gl = document.getElementById(`egl-${id}`).value.trim();
  const patch = {
    name,
    price,
    emoji: document.getElementById(`ee-${id}`).value.trim(),
    description: document.getElementById(`ed-${id}`).value.trim(),
    badge: document.getElementById(`eb-${id}`).value.trim(),
    sizes,
    chips: cl && cv.length ? [{ label: cl, values: cv }] : [],
    name_engrave: document.getElementById(`eeng-${id}`).checked,
    group_id: gid || null,
    group_label: gl || null,
  };
  const ok = await save(id, patch);
  if (ok) {
    renderList();
    showToast("Kaydedildi ✓", "success");
  }
}

// ── COLOR OPS ─────────────────────────────────
async function updateColorName(pid, i, val) {
  const p = products.find((x) => x.id === pid);
  if (!p || !p.colors[i]) return;
  p.colors[i].name = val;
  await save(pid, { colors: p.colors });
}

async function updateColorHex(pid, i, val, swatchEl) {
  const p = products.find((x) => x.id === pid);
  if (!p || !p.colors[i]) return;
  p.colors[i].hex = val;
  swatchEl.style.background = val;
  await save(pid, { colors: p.colors });
}

async function toggleColorStock(pid, i, checked) {
  const p = products.find((x) => x.id === pid);
  if (!p || !p.colors[i]) return;
  p.colors[i].out_of_stock = checked;
  await save(pid, { colors: p.colors });
  refreshCardMeta(pid);
  showToast(checked ? "Stokta yok işaretlendi" : "Güncellendi ✓");
}

function refreshCardMeta(pid) {
  const p = products.find((x) => x.id === pid);
  if (!p) return;
  const hasOos = p.colors.some((c) => c.out_of_stock);
  const allOos = p.colors.length > 0 && p.colors.every((c) => c.out_of_stock);
  document.getElementById("card-" + pid).classList.toggle("oos", allOos);
  const meta = document.querySelector(`#card-${pid} .prod-row-meta`);
  const dots = p.colors
    .slice(0, 6)
    .map(
      (c) =>
        `<span class="color-dot" style="background:${c.hex};${c.out_of_stock ? "opacity:.3;" : ""}"></span>`,
    )
    .join("");
  const pill = allOos
    ? '<span class="oos-pill">Tüm Renkler Stokta Yok</span>'
    : hasOos
      ? '<span class="oos-pill warning">Bazı Renkler Stokta Yok</span>'
      : "";
  meta.innerHTML = `₺${Number(p.price).toLocaleString("tr")} ${dots}${pill}`;
}

// ── COLOR IMAGES ──────────────────────────────
async function addColorImageUrl(pid, i) {
  const inp = document.getElementById(`cimgurl-${pid}-${i}`);
  const url = inp.value.trim();
  if (!url) return;
  const p = products.find((x) => x.id === pid);
  if (!p || !p.colors[i]) return;
  p.colors[i].images = [...(p.colors[i].images || []), url];
  inp.value = "";
  const ok = await save(pid, { colors: p.colors });
  if (ok) {
    refreshColorImgList(pid, i, p.colors[i].images);
    refreshThumb(pid, p);
    showToast("Görsel eklendi ✓");
  }
}

async function removeColorImage(pid, i, j) {
  const p = products.find((x) => x.id === pid);
  if (!p || !p.colors[i]) return;
  p.colors[i].images.splice(j, 1);
  const ok = await save(pid, { colors: p.colors });
  if (ok) {
    refreshColorImgList(pid, i, p.colors[i].images);
    refreshThumb(pid, p);
  }
}

function triggerColorUpload(pid, i) {
  document.getElementById(`cfile-${pid}-${i}`).click();
}

async function handleColorFileUpload(pid, i, input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  const prog = document.getElementById(`cuprog-${pid}-${i}`);
  const p = products.find((x) => x.id === pid);
  if (!p || !p.colors[i]) return;
  p.colors[i].images = p.colors[i].images || [];
  for (let f = 0; f < files.length; f++) {
    prog.textContent = `Yükleniyor ${f + 1}/${files.length}...`;
    try {
      const url = await SB.uploadImage(files[f], `${pid}-c${i}`);
      p.colors[i].images.push(url);
    } catch (e) {
      showToast("Yükleme hatası: " + e.message, "error");
    }
  }
  prog.textContent = "";
  input.value = "";
  const ok = await save(pid, { colors: p.colors });
  if (ok) {
    refreshColorImgList(pid, i, p.colors[i].images);
    refreshThumb(pid, p);
    showToast("Yüklendi ✓", "success");
  }
}

function refreshColorImgList(pid, i, images) {
  const el = document.getElementById(`cimglist-${pid}-${i}`);
  if (!el) return;
  el.innerHTML =
    images && images.length
      ? images
          .map(
            (url, j) => `
        <div class="color-img-row">
          <img class="color-img-thumb" src="${url}" onerror="this.style.display='none'">
          <span class="color-img-url" title="${url}">${url}</span>
          <button class="img-del" onclick="removeColorImage('${pid}',${i},${j})">✕</button>
        </div>`,
          )
          .join("")
      : '<div class="empty-imgs">Henüz görsel yok</div>';
}

function refreshThumb(pid, p) {
  const th = document.querySelector(`#card-${pid} .prod-thumb`);
  if (!th) return;
  const img = p.colors.find((c) => c.images && c.images[0])?.images[0];
  th.innerHTML = img
    ? `<img src="${img}" alt="">`
    : `<span>${p.emoji || "◈"}</span>`;
}

// ── ADD / DELETE COLOR ────────────────────────
async function addColor(pid) {
  const p = products.find((x) => x.id === pid);
  if (!p) return;
  p.colors = [
    ...(p.colors || []),
    { name: "Yeni Renk", hex: "#6b7280", images: [], out_of_stock: false },
  ];
  const ok = await save(pid, { colors: p.colors });
  if (ok) {
    const el = document.getElementById(`colors-${pid}`);
    el.insertAdjacentHTML(
      "beforeend",
      renderColorCard(pid, p.colors[p.colors.length - 1], p.colors.length - 1),
    );
  }
}

async function deleteColor(pid, i) {
  const p = products.find((x) => x.id === pid);
  if (!p) return;
  if (p.colors.length <= 1) {
    showToast("En az 1 renk kalmalı");
    return;
  }
  p.colors.splice(i, 1);
  const ok = await save(pid, { colors: p.colors });
  if (ok) {
    document.getElementById(`colors-${pid}`).innerHTML = renderColorCards(p);
    refreshThumb(pid, p);
    refreshCardMeta(pid);
  }
}

// ── NEW PRODUCT MODAL ─────────────────────────
function openNewProductModal() {
  [
    "m-name",
    "m-emoji",
    "m-desc",
    "m-price",
    "m-badge",
    "m-sizes",
    "m-chip-label",
    "m-chip-vals",
    "m-group-id",
    "m-group-label",
  ].forEach((id) => {
    document.getElementById(id).value = "";
  });
  document.getElementById("m-engrave").checked = true;
  document.getElementById("product-modal").classList.add("open");
}

function closeProductModal() {
  document.getElementById("product-modal").classList.remove("open");
}

async function saveNewProduct() {
  const name = document.getElementById("m-name").value.trim();
  const price = parseInt(document.getElementById("m-price").value);
  if (!name) {
    showToast("Ürün adı zorunlu", "error");
    return;
  }
  if (isNaN(price)) {
    showToast("Geçerli bir fiyat gir", "error");
    return;
  }
  const sizes = document
    .getElementById("m-sizes")
    .value.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const cl = document.getElementById("m-chip-label").value.trim();
  const cv = document
    .getElementById("m-chip-vals")
    .value.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const gid = document.getElementById("m-group-id").value.trim();
  const gl = document.getElementById("m-group-label").value.trim();
  const p = {
    id: "prod-" + Date.now(),
    name,
    emoji: document.getElementById("m-emoji").value.trim() || "◈",
    description: document.getElementById("m-desc").value.trim(),
    price,
    badge: document.getElementById("m-badge").value.trim(),
    out_of_stock: false,
    name_engrave: document.getElementById("m-engrave").checked,
    colors: JSON.parse(JSON.stringify(DEFAULT_COLORS)),
    sizes,
    chips: cl && cv.length ? [{ label: cl, values: cv }] : [],
    group_id: gid || null,
    group_label: gl || null,
  };
  setSaveDot("saving");
  try {
    await SB.upsertProduct(p);
    products.push(p);
    renderList();
    closeProductModal();
    setSaveDot("saved");
    showToast("Ürün eklendi ✓", "success");
    setTimeout(() => {
      const card = document.getElementById("card-" + p.id);
      if (card) {
        card.classList.add("open");
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 120);
  } catch (e) {
    setSaveDot("");
    showToast("Kayıt hatası: " + e.message, "error");
  }
}

// ── DELETE PRODUCT ────────────────────────────
async function deleteProduct(id) {
  setSaveDot("saving");
  try {
    await SB.deleteProduct(id);
    products = products.filter((p) => p.id !== id);
    renderList();
    setSaveDot("saved");
    showToast("Ürün silindi");
  } catch (e) {
    setSaveDot("");
    showToast("Silme hatası: " + e.message, "error");
  }
}

// ── CONFIRM ───────────────────────────────────
function askConfirm(title, sub, cb) {
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-sub").textContent = sub;
  confirmCallback = cb;
  document.getElementById("confirm-overlay").classList.add("open");
}

document.getElementById("confirm-action-btn").onclick = () => {
  document.getElementById("confirm-overlay").classList.remove("open");
  if (confirmCallback) {
    confirmCallback();
    confirmCallback = null;
  }
};

// ── TOAST ─────────────────────────────────────
function showToast(msg, type) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast " + (type || "");
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}

// ── KEYBOARD ──────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeProductModal();
    document.getElementById("confirm-overlay").classList.remove("open");
  }
});

init();
