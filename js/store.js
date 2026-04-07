// store.js
// Depends on: supabase.js (SB)

let allProducts = [];
let groups = {};
let solos = [];

let currentGroupId = null;
let currentProductId = null;
let selectedColor = null;
let selectedSize = null;
let selectedChips = {};
let currentImgIdx = 0;

function currentProduct() {
  return allProducts.find((p) => p.id === currentProductId);
}

// ── INIT ──────────────────────────────────────
async function init() {
  try {
    const raw = await SB.getProducts();
    allProducts = raw.map((p) => ({
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
    buildGroups();
    renderGrid();
  } catch (e) {
    document.getElementById("product-grid").innerHTML =
      `<div class="grid-empty">Ürünler yüklenemedi</div>`;
  }
}

function buildGroups() {
  groups = {};
  solos = [];
  allProducts.forEach((p) => {
    if (p.group_id) {
      if (!groups[p.group_id]) groups[p.group_id] = [];
      groups[p.group_id].push(p);
    } else {
      solos.push(p);
    }
  });
}

// ── GRID ──────────────────────────────────────
function renderGrid() {
  const grid = document.getElementById("product-grid");
  const cards = [];

  Object.entries(groups).forEach(([gid, prods]) => {
    const rep =
      prods.find((p) => !p.colors.every((c) => c.out_of_stock)) || prods[0];
    cards.push(makeCard(rep, gid, prods));
  });
  solos.forEach((p) => cards.push(makeCard(p, null, null)));

  if (!cards.length) {
    grid.innerHTML = `<div class="grid-empty">
      <div style="font-size:48px;margin-bottom:16px;opacity:.3">◈</div>
      <div style="font-family:var(--fd);font-size:20px">Henüz ürün eklenmemiş</div>
    </div>`;
    return;
  }
  grid.innerHTML = cards.join("");
}

function makeCard(p, gid, groupProds) {
  const allOos = gid
    ? groupProds.every((gp) => gp.colors.every((c) => c.out_of_stock))
    : p.colors.every((c) => c.out_of_stock);

  const src =
    (gid ? groupProds : [p])
      .flatMap((gp) => gp.colors)
      .find((c) => !c.out_of_stock && c.images && c.images[0])?.images[0] ||
    p.colors.find((c) => c.images && c.images[0])?.images[0];

  const imgHtml = src
    ? `<img src="${src}" alt="${p.name}">`
    : `<span>${p.emoji || "◈"}</span>`;

  const allColors = gid ? groupProds.flatMap((gp) => gp.colors) : p.colors;
  const dots = allColors
    .slice(0, 8)
    .map(
      (c) =>
        `<div class="dot" title="${c.name}" style="background:${c.hex};${c.out_of_stock ? "opacity:.3;" : ""}"></div>`,
    )
    .join("");

  const prices = gid ? groupProds.map((gp) => gp.price) : [p.price];
  const lo = Math.min(...prices),
    hi = Math.max(...prices);
  const priceStr =
    lo !== hi
      ? `₺${lo.toLocaleString("tr")} – ₺${hi.toLocaleString("tr")}`
      : `₺${p.price.toLocaleString("tr")}`;

  return `
    <div class="card${allOos ? " out-of-stock" : ""}"
      ${!allOos ? `onclick="openModal('${p.id}','${gid || ""}')"` : ""}>
      ${p.badge && !allOos ? `<div class="card-badge">${p.badge}</div>` : ""}
      ${gid ? `<div class="card-badge variant-count-badge">${groupProds.length} kapasite</div>` : ""}
      <div class="card-img">
        ${imgHtml}
        ${
          allOos
            ? `<div class="oos-overlay">
          <div class="oos-label">Stokta Yok</div>
          <div class="oos-sub">Yakında tekrar gelecek</div>
        </div>`
            : ""
        }
      </div>
      <div class="card-body">
        <div class="card-name">${p.name}</div>
        <div class="card-price${allOos ? " oos-price" : ""}">${priceStr}</div>
        ${dots ? `<div class="card-colors">${dots}</div>` : ""}
      </div>
    </div>`;
}

// ── MODAL ─────────────────────────────────────
function openModal(productId, gid) {
  currentGroupId = gid || null;
  currentProductId = productId;
  currentImgIdx = 0;
  initSelections(currentProduct());
  renderModal();
  document.getElementById("overlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function initSelections(p) {
  const first = p.colors.find((c) => !c.out_of_stock);
  selectedColor = first?.name || p.colors[0]?.name || null;
  selectedSize = p.sizes && p.sizes.length ? p.sizes[0] : null;
  selectedChips = {};
  (p.chips || []).forEach((c) => {
    if (c.values.length) selectedChips[c.label] = c.values[0];
  });
}

function closeModal() {
  document.getElementById("overlay").classList.remove("open");
  document.body.style.overflow = "";
}

function handleOverlayClick(e) {
  if (e.target === e.currentTarget) closeModal();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

function getSelectedColor() {
  const p = currentProduct();
  return p.colors.find((c) => c.name === selectedColor) || p.colors[0];
}

function renderModal() {
  const p = currentProduct();
  const color = getSelectedColor();
  const imgs = color?.images || [];

  // image
  const imgEl = document.getElementById("modal-img");
  if (imgs.length) {
    if (currentImgIdx >= imgs.length) currentImgIdx = 0;
    imgEl.innerHTML = `<img src="${imgs[currentImgIdx]}" alt="${p.name}">`;
  } else {
    imgEl.innerHTML = `<span>${p.emoji || "◈"}</span>`;
  }

  // thumbs
  const thumbsEl = document.getElementById("modal-thumbs");
  if (imgs.length > 1) {
    thumbsEl.innerHTML = imgs
      .map(
        (url, i) =>
          `<div class="thumb${i === currentImgIdx ? " active" : ""}" onclick="setImg(${i})">
        <img src="${url}" alt="">
      </div>`,
      )
      .join("");
    thumbsEl.style.display = "flex";
  } else {
    thumbsEl.style.display = "none";
  }

  // variant tabs
  let variantHtml = "";
  if (currentGroupId && groups[currentGroupId]?.length > 1) {
    const grp = groups[currentGroupId];
    variantHtml = `
      <div class="variant-block">
        <div class="variant-section-label">Kapasite</div>
        <div class="variant-tabs">
          ${grp
            .map((gp) => {
              const oos = gp.colors.every((c) => c.out_of_stock);
              return `<div class="variant-tab${gp.id === currentProductId ? " active" : ""}${oos ? " oos" : ""}"
              ${!oos ? `onclick="switchVariant('${gp.id}')"` : ""}
            >${gp.group_label || gp.name}</div>`;
            })
            .join("")}
        </div>
      </div>`;
  }

  // color opts
  let colorHtml = "";
  if (p.colors?.length) {
    colorHtml = `<div class="opt-section">
      <div class="opt-label">Renk <span>${selectedColor || ""}</span></div>
      <div class="color-opts">${p.colors
        .map(
          (c) => `
        <div class="color-opt${selectedColor === c.name ? " selected" : ""}"
          style="background:${c.hex}${c.out_of_stock ? ";opacity:.3" : ""}"
          title="${c.name}${c.out_of_stock ? " — Stokta Yok" : ""}"
          ${!c.out_of_stock ? `onclick="selColor('${c.name}')"` : ``}
        ></div>`,
        )
        .join("")}
      </div>
      ${color?.out_of_stock ? `<div class="color-oos-warning">⚠ Bu renk stokta yok</div>` : ""}
    </div>`;
  }

  // size opts
  let sizeHtml = "";
  if (p.sizes?.length) {
    sizeHtml = `<div class="opt-section">
      <div class="opt-label">Boyut <span>${selectedSize || ""}</span></div>
      <div class="size-opts">${p.sizes
        .map(
          (v) =>
            `<div class="size-opt${selectedSize === v ? " selected" : ""}" onclick="selSize('${v}')">${v}</div>`,
        )
        .join("")}</div>
    </div>`;
  }

  // chip opts
  const chipHtml = (p.chips || [])
    .map(
      (c) => `
    <div class="opt-section">
      <div class="opt-label">${c.label} <span>${selectedChips[c.label] || ""}</span></div>
      <div class="chip-opts">${c.values
        .map(
          (v) =>
            `<div class="chip-opt${selectedChips[c.label] === v ? " selected" : ""}"
          onclick="selChip('${c.label}','${v}')">${v}</div>`,
        )
        .join("")}</div>
    </div>`,
    )
    .join("");

  // engrave
  const nameHtml = p.name_engrave
    ? `
    <div class="name-section">
      <div class="name-header">
        <div class="name-icon">✏️</div>
        <div>
          <div class="name-title">Özel İsim Yazdır</div>
          <div class="name-subtitle">Lazer kazıma · Kalıcı · Türkçe karakter destekli</div>
        </div>
      </div>
      <input class="name-input" id="engrave-input" maxlength="20"
        placeholder="ADINIZI YAZIN..." oninput="updatePreview(this.value)" autocomplete="off">
      <div class="name-preview" id="engrave-preview">
        <span class="preview-hint">ön izleme</span>
      </div>
    </div>`
    : "";

  document.getElementById("modal-form").innerHTML = `
    ${variantHtml}
    <div class="modal-name">${p.name}
      ${p.group_label ? `<span class="modal-variant-label">${p.group_label}</span>` : ""}
    </div>
    <div class="modal-desc">${p.description || ""}</div>
    <div class="modal-price">₺${Number(p.price).toLocaleString("tr")}</div>
    ${colorHtml}${sizeHtml}${chipHtml}
    <hr class="modal-divider">
    ${nameHtml}
    <div class="cta-row">
      <button class="btn-primary" onclick="sendRequest()">Teklif Al →</button>
      <button class="btn-secondary" onclick="copySelections()">Paylaş</button>
    </div>`;
}

function switchVariant(productId) {
  currentProductId = productId;
  currentImgIdx = 0;
  initSelections(currentProduct());
  renderModal();
}

function setImg(i) {
  currentImgIdx = i;
  renderModal();
}

function selColor(name) {
  selectedColor = name;
  currentImgIdx = 0;
  const inp = document.getElementById("engrave-input");
  const prev = inp ? inp.value : "";
  renderModal();
  const inp2 = document.getElementById("engrave-input");
  if (inp2) {
    inp2.value = prev;
    updatePreview(prev);
  }
}

function selSize(v) {
  selectedSize = v;
  renderModal();
}
function selChip(label, v) {
  selectedChips[label] = v;
  renderModal();
}

function updatePreview(val) {
  const el = document.getElementById("engrave-preview");
  if (!el) return;
  if (val.trim()) {
    el.textContent = val.toUpperCase();
    el.style.color = "var(--accent)";
  } else {
    el.innerHTML = '<span class="preview-hint">ön izleme</span>';
  }
}

function sendRequest() {
  const p = currentProduct();
  const name = document.getElementById("engrave-input")?.value || "";
  let msg = `Stanley ${p.name}${p.group_label ? " " + p.group_label : ""} — ₺${Number(p.price).toLocaleString("tr")}\n`;
  if (selectedColor) msg += `• Renk: ${selectedColor}\n`;
  if (selectedSize) msg += `• Boyut: ${selectedSize}\n`;
  Object.entries(selectedChips).forEach(([k, v]) => {
    msg += `• ${k}: ${v}\n`;
  });
  if (name) msg += `• İsim Kazıma: ${name.toUpperCase()}\n`;
  // window.open(`https://wa.me/905xxxxxxxxx?text=${encodeURIComponent(msg)}`);
  showToast("Talebiniz alındı! Size ulaşacağız 📩");
  setTimeout(closeModal, 1600);
}

function copySelections() {
  const p = currentProduct();
  const name = document.getElementById("engrave-input")?.value || "";
  let txt = `${p.name}${p.group_label ? " " + p.group_label : ""} — ₺${Number(p.price).toLocaleString("tr")}\n`;
  if (selectedColor) txt += `Renk: ${selectedColor}\n`;
  if (selectedSize) txt += `Boyut: ${selectedSize}\n`;
  Object.entries(selectedChips).forEach(([k, v]) => {
    txt += `${k}: ${v}\n`;
  });
  if (name) txt += `İsim: ${name.toUpperCase()}\n`;
  navigator.clipboard?.writeText(txt).then(() => showToast("Kopyalandı!"));
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

init();
