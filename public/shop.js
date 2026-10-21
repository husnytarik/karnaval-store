// Mağaza sayfalarının ortak kodu: üst menü, sepet çekmecesi, alt bilgi
const $ = s => document.querySelector(s);
const tl = n => Number(n).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// stok yazısı: sınırsız = "Stokta var"; adet ≤ 2 ise "Son bir/iki ürün"
const stockText = (stock, unlimited) => (!unlimited && stock <= 0) ? 'Tükendi' : (!unlimited && stock === 1) ? 'Son bir ürün' : (!unlimited && stock === 2) ? 'Son iki ürün' : 'Stokta var';
const imgUrl = id => `/api/images/${id}`;
const discountPct = p => Math.round((1 - p.current_price / p.price) * 100);
const priceHtml = p => p.on_sale
  ? `<span class="price">${tl(p.current_price)}</span> <s class="old">${tl(p.price)}</s>`
  : `<span class="price">${tl(p.price)}</span>`;

function toast(m) { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 2800); }

// ---- sepet: { ['ürünId|renk|boy']: { id, c: renk, s: boy, q: adet, n: ad, p: fiyat, i: görselId } } ----
let cart = {};
try {
  const raw = JSON.parse(localStorage.getItem('cart2') || '{}');
  for (const [k, v] of Object.entries(raw)) if (v && v.q > 0) cart[k] = { id: +k.split('|')[0], c: '', s: '', ...v };
} catch {}
function saveCart() { try { localStorage.setItem('cart2', JSON.stringify(cart)); } catch {} renderCart(); }
function addToCart(p, qty = 1, v) {
  const key = `${p.id}|${v?.color || ''}|${v?.size || ''}`;
  const stock = (v ? v.unlimited : p.unlimited) ? Infinity : (v ? v.stock : p.stock);
  const cur = cart[key]?.q || 0;
  if (cur + qty > stock) return toast(`Stokta yalnızca ${stock} adet var`);
  cart[key] = { id: p.id, c: v?.color || '', s: v?.size || '', q: cur + qty, n: p.name, p: p.current_price, i: v?.image || p.image_id };
  saveCart(); toast('Sepete eklendi');
}
function renderCart() {
  const ids = Object.keys(cart);
  const n = ids.reduce((a, i) => a + cart[i].q, 0);
  const badge = $('#cartCount');
  badge.textContent = n; badge.style.display = n ? '' : 'none';
  let total = 0;
  $('#cartLines').innerHTML = ids.length ? ids.map(id => {
    const c = cart[id]; total += c.p * c.q;
    return `<div class="line">
      <a href="/urun.html?id=${c.id}" class="lthumb ${c.i ? '' : 'ph'}" ${c.i ? `style="background-image:url(${imgUrl(c.i)})"` : ''}></a>
      <span class="n">${esc(c.n)}${c.c || c.s ? `<br><small>${esc([c.c, c.s].filter(Boolean).join(' · '))}</small>` : ''}<br><small>${tl(c.p)}</small></span>
      <span class="qty"><button data-dec="${esc(id)}">−</button>${c.q}<button data-inc="${esc(id)}">+</button></span></div>`;
  }).join('') : '<div class="empty">Sepetiniz boş.</div>';
  $('#cartTotal').textContent = tl(total);
  $('#checkoutBtn').style.display = ids.length ? '' : 'none';
}

// ---- ortak iskelet ----
document.body.insertAdjacentHTML('afterbegin', `
<header class="top"><div class="wrap">
  <a class="logo" href="/"><img src="/logo.png" alt="Karnaval Kırtasiye"></a>
  <nav class="nav"><a href="/">Anasayfa</a><a href="/#kategoriler">Kategoriler</a><a href="/#urunler">Ürünler</a><a href="/takip">Sipariş takip</a><a href="#iletisim">İletişim</a></nav>
  <div class="tools">
    <input class="search" id="q" type="search" placeholder="Ürün ara…">
    <button class="icon-btn" id="searchBtn" aria-label="Ara"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></button>
    <button class="icon-btn" id="cartBtn" aria-label="Sepet"><svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 016 0v2"/></svg><span class="count" id="cartCount">0</span></button>
  </div>
</div></header>`);
document.body.insertAdjacentHTML('beforeend', `
<footer class="foot" id="iletisim"><div class="wrap">
  <div class="cols">
    <div><img src="/logo.png" alt="Karnaval Kırtasiye"><br>Kalem, defter ve okul-ofis malzemeleri.</div>
    <div><b>Hızlı bağlantılar</b><a href="/">Anasayfa</a><a href="/#kategoriler">Kategoriler</a><a href="/#urunler">Ürünler</a><a href="/takip">Sipariş takip</a></div>
    <div><b>İletişim</b>Sipariş ve bilgi için bizimle iletişime geçin.</div>
  </div>
  <div class="copy">© ${new Date().getFullYear()} Karnaval Kırtasiye</div>
</div></footer>
<div class="drawer" id="drawer"><aside>
  <div class="row"><h2>Sepetim</h2><button class="btn ghost sm" id="closeCart">Kapat</button></div>
  <div id="cartLines"></div>
  <div class="row"><strong>Toplam</strong><span class="price" id="cartTotal"></span></div>
  <a class="btn" id="checkoutBtn" href="/siparis" style="justify-content:center">Siparişi tamamla</a>
  <p class="hint" style="margin:0;text-align:center">Ödeme kapıda yapılır. Adres bilgilerini bir sonraki adımda gireceksiniz.</p>
</aside></div>
<div class="toast" id="toast"></div>`);

document.addEventListener('click', e => {
  const t = e.target.closest('[data-inc],[data-dec]'); if (!t) return;
  const d = t.dataset;
  if (d.inc) cart[d.inc].q++;
  if (d.dec && --cart[d.dec].q <= 0) delete cart[d.dec];
  saveCart();
});
$('#cartBtn').onclick = () => { renderCart(); $('#drawer').classList.add('open'); };
$('#closeCart').onclick = () => $('#drawer').classList.remove('open');
$('#drawer').onclick = e => { if (e.target.id === 'drawer') e.target.classList.remove('open'); };
$('#searchBtn').onclick = () => { $('#q').classList.toggle('open'); if ($('#q').classList.contains('open')) $('#q').focus(); };
// ana sayfada arama canlı filtreler (index.html); diğer sayfalarda ana sayfaya yönlendirir
$('#q').addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.body.dataset.page !== 'home') location.href = '/?q=' + encodeURIComponent(e.target.value.trim()) + '#urunler';
});

renderCart();
