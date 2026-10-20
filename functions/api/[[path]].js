import { neon } from '@neondatabase/serverless';

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
const fail = (msg, status = 400) => json({ error: msg }, status);

// ---- oturum (HMAC imzalı cookie) ----
const enc = new TextEncoder();
async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]));
}
async function makeToken(secret) {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 7;
  return `${exp}.${await sign(String(exp), secret)}`;
}
async function isAdmin(request, env) {
  const m = /(?:^|;\s*)session=([^;]+)/.exec(request.headers.get('cookie') || '');
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || Number(exp) < Date.now()) return false;
  return sig === (await sign(exp, env.SESSION_SECRET));
}

const TODAY = `(now() AT TIME ZONE 'Europe/Istanbul')::date`;
const onSale = `(p.sale_price IS NOT NULL AND p.sale_price < p.price AND (p.sale_start IS NULL OR ${TODAY} >= p.sale_start) AND (p.sale_end IS NULL OR ${TODAY} <= p.sale_end))`;
const currentPrice = `(CASE WHEN ${onSale} THEN p.sale_price ELSE p.price END)::float`;
const productCols = `p.id, p.name, p.description, p.details, p.price::float AS price, p.sale_price::float AS sale_price,
  p.sale_start::text AS sale_start, p.sale_end::text AS sale_end, ${onSale} AS on_sale, ${currentPrice} AS current_price,
  p.stock, p.category_id, c.name AS category, p.image_id, p.gallery, p.active,
  p.size_label, p.colors, p.sizes, p.variants`;
const productFrom = `FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

class Bad extends Error {}
const dateOrNull = v => {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Bad('Tarih biçimi geçersiz');
  return v;
};

function cleanProduct(b) {
  const name = String(b.name || '').trim();
  const price = Number(b.price);
  if (!name) throw new Bad('Ürün adı gerekli');
  if (!(price >= 0) || b.price === '' || b.price == null) throw new Bad('Geçerli bir fiyat girin');
  const gallery = [...new Set((Array.isArray(b.gallery) ? b.gallery : []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
  let sale_price = b.sale_price === '' || b.sale_price == null ? null : Number(b.sale_price);
  let sale_start = dateOrNull(b.sale_start), sale_end = dateOrNull(b.sale_end);
  if (sale_price != null) {
    if (!(sale_price >= 0) || sale_price >= price) throw new Bad('İndirimli fiyat, normal fiyattan düşük olmalı');
    if (sale_start && sale_end && sale_end < sale_start) throw new Bad('İndirim bitiş tarihi başlangıçtan önce olamaz');
  } else { sale_start = null; sale_end = null; }
  // renk / boy seçenekleri: renk×boy kombinasyonları sunucuda üretilir
  const colors = [], seen = new Set();
  for (const c of Array.isArray(b.colors) ? b.colors : []) {
    const cn = String(c?.name || '').trim().slice(0, 40);
    if (!cn || seen.has(cn.toLowerCase())) continue;
    seen.add(cn.toLowerCase());
    colors.push({ name: cn, gallery: [...new Set((Array.isArray(c.gallery) ? c.gallery : []).map(Number).filter(n => Number.isInteger(n) && n > 0))] });
  }
  const sizes = [...new Set((Array.isArray(b.sizes) ? b.sizes : []).map(x => String(x).trim().slice(0, 40)).filter(Boolean))];
  const given = new Map((Array.isArray(b.variants) ? b.variants : []).map(v => [`${v.color || ''}|${v.size || ''}`, Math.max(0, parseInt(v.stock, 10) || 0)]));
  const variants = [];
  if (colors.length || sizes.length)
    for (const c of colors.length ? colors.map(c => c.name) : ['']) for (const z of sizes.length ? sizes : [''])
      variants.push({ color: c, size: z, stock: given.get(`${c}|${z}`) || 0 });
  const mainImg = gallery[0] || colors.find(c => c.gallery.length)?.gallery[0] || null;
  return {
    name,
    colors, sizes, variants,
    size_label: String(b.size_label || '').trim().slice(0, 30) || 'Boy',
    description: String(b.description || '').trim(),
    details: String(b.details || '').trim(),
    price, sale_price, sale_start, sale_end,
    stock: variants.length ? variants.reduce((a, v) => a + v.stock, 0) : Math.max(0, parseInt(b.stock, 10) || 0),
    category_id: b.category_id ? Number(b.category_id) : null,
    gallery,
    image_id: mainImg,
    active: b.active !== false,
  };
}

const imagesOf = p => [...(p?.gallery || []), ...(p?.colors || []).flatMap(c => c.gallery || [])];
async function dropOrphanImages(sql, ids) {
  if (!ids || !ids.length) return;
  await sql`DELETE FROM images WHERE id = ANY(${ids})
    AND id NOT IN (SELECT unnest(gallery) FROM products)
    AND id NOT IN (SELECT image_id FROM categories WHERE image_id IS NOT NULL)
    AND id NOT IN (SELECT g::int FROM products, jsonb_array_elements(colors) c, jsonb_array_elements_text(c->'gallery') g)`;
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = request.method;
  const route = parts.join('/');

  if (!env.DATABASE_URL || !env.ADMIN_PASSWORD || !env.SESSION_SECRET)
    return fail('Sunucu ayarları eksik (DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET)', 500);
  const sql = neon(env.DATABASE_URL);
  const body = async () => { try { return await request.json(); } catch { return {}; } };

  try {
    // ---------- herkese açık ----------
    if (route === 'login' && method === 'POST') {
      const { password } = await body();
      if (!password || password !== env.ADMIN_PASSWORD) return fail('Şifre hatalı', 401);
      const token = await makeToken(env.SESSION_SECRET);
      return json({ ok: true }, 200, {
        'set-cookie': `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`,
      });
    }
    if (route === 'logout' && method === 'POST')
      return json({ ok: true }, 200, { 'set-cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });

    if (route === 'categories' && method === 'GET')
      return json(await sql`SELECT c.id, c.name,
        COALESCE(c.image_id, (SELECT p.image_id FROM products p WHERE p.category_id = c.id AND p.active AND p.image_id IS NOT NULL ORDER BY p.created_at DESC LIMIT 1)) AS image_id,
        (SELECT count(*)::int FROM products p WHERE p.category_id = c.id AND p.active) AS n
        FROM categories c ORDER BY c.name`);

    if (route === 'products' && method === 'GET') {
      const q = url.searchParams.get('q');
      const cat = url.searchParams.get('category');
      const rows = await sql.query(
        `SELECT ${productCols} ${productFrom}
         WHERE p.active AND ($1::text IS NULL OR p.name ILIKE '%' || $1 || '%' OR p.description ILIKE '%' || $1 || '%')
           AND ($2::int IS NULL OR p.category_id = $2::int)
         ORDER BY p.created_at DESC`,
        [q || null, cat || null]
      );
      return json(rows);
    }

    if (parts[0] === 'products' && parts[1] && method === 'GET') {
      const rows = await sql.query(`SELECT ${productCols} ${productFrom} WHERE p.active AND p.id = $1`, [Number(parts[1]) || 0]);
      return rows[0] ? json(rows[0]) : fail('Ürün bulunamadı', 404);
    }

    if (parts[0] === 'images' && parts[1] && method === 'GET') {
      const [img] = await sql`SELECT mime, data FROM images WHERE id = ${Number(parts[1])}`;
      if (!img) return new Response('Yok', { status: 404 });
      const bin = Uint8Array.from(atob(img.data), c => c.charCodeAt(0));
      return new Response(bin, { headers: { 'content-type': img.mime, 'cache-control': 'public, max-age=31536000, immutable' } });
    }

    if (route === 'orders' && method === 'POST') {
      const b = await body();
      const name = String(b.customer_name || '').trim();
      const phone = String(b.phone || '').trim();
      const address = String(b.address || '').trim();
      if (!name || !phone || !address) return fail('Ad, telefon ve adres gerekli');
      if (!Array.isArray(b.items) || !b.items.length) return fail('Sepet boş');
      const lines = new Map();
      for (const it of b.items) {
        const id = Number(it.id), qty = parseInt(it.qty, 10), color = String(it.color || ''), size = String(it.size || '');
        if (!id || !(qty > 0)) continue;
        const k = `${id}|${color}|${size}`;
        lines.set(k, { id, color, size, qty: (lines.get(k)?.qty || 0) + qty });
      }
      const rows = await sql.query(`SELECT p.id, p.name, ${currentPrice} AS price, p.stock, p.size_label, p.variants FROM products p WHERE p.active AND p.id = ANY($1::int[])`, [[...new Set([...lines.values()].map(l => l.id))]]);
      const items = [], touched = new Map();
      let total = 0;
      for (const l of lines.values()) {
        const p = rows.find(r => r.id === l.id);
        if (!p) return fail('Sepetteki bir ürün artık satışta değil');
        const t = touched.get(p.id) || { p, dec: new Map(), qty: 0 };
        touched.set(p.id, t);
        let left = p.stock;
        if (p.variants.length) {
          const v = p.variants.find(v => v.color === l.color && v.size === l.size);
          if (!v) return fail(`"${p.name}" için seçilen seçenek artık mevcut değil`);
          left = v.stock;
          t.dec.set(`${l.color}|${l.size}`, l.qty);
        }
        t.qty += l.qty;
        if (l.qty > left) return fail(`"${p.name}${l.color ? ' · ' + l.color : ''}${l.size ? ' · ' + l.size : ''}" için yeterli stok yok (kalan: ${left})`);
        items.push({ id: p.id, name: p.name, price: p.price, qty: l.qty, color: l.color, size: l.size, size_label: p.size_label });
        total += p.price * l.qty;
      }
      for (const t of touched.values()) if (!t.p.variants.length && t.qty > t.p.stock) return fail(`"${t.p.name}" için yeterli stok yok (kalan: ${t.p.stock})`);
      const [order] = await sql`INSERT INTO orders (customer_name, phone, address, note, items, total)
        VALUES (${name}, ${phone}, ${address}, ${String(b.note || '').trim()}, ${JSON.stringify(items)}::jsonb, ${total})
        RETURNING id`;
      for (const t of touched.values()) {
        if (t.p.variants.length) {
          const vs = t.p.variants.map(v => ({ ...v, stock: Math.max(0, v.stock - (t.dec.get(`${v.color}|${v.size}`) || 0)) }));
          await sql`UPDATE products SET variants = ${JSON.stringify(vs)}::jsonb, stock = ${vs.reduce((a, v) => a + v.stock, 0)} WHERE id = ${t.p.id}`;
        } else await sql`UPDATE products SET stock = GREATEST(stock - ${t.qty}, 0) WHERE id = ${t.p.id}`;
      }
      return json({ ok: true, id: order.id }, 201);
    }

    // ---------- yönetici ----------
    if (parts[0] === 'admin') {
      if (!(await isAdmin(request, env))) return fail('Giriş gerekli', 401);
      const [, res, id] = parts;

      if (res === 'me') return json({ ok: true });

      if (res === 'products') {
        if (!id && method === 'GET')
          return json(await sql.query(`SELECT ${productCols} ${productFrom} ORDER BY p.created_at DESC`));
        if (!id && method === 'POST') {
          const p = cleanProduct(await body());
          const [row] = await sql`INSERT INTO products (name, description, details, price, sale_price, sale_start, sale_end, stock, category_id, image_id, gallery, active, size_label, colors, sizes, variants)
            VALUES (${p.name}, ${p.description}, ${p.details}, ${p.price}, ${p.sale_price}, ${p.sale_start}, ${p.sale_end}, ${p.stock}, ${p.category_id}, ${p.image_id}, ${p.gallery}, ${p.active}, ${p.size_label}, ${JSON.stringify(p.colors)}::jsonb, ${JSON.stringify(p.sizes)}::jsonb, ${JSON.stringify(p.variants)}::jsonb) RETURNING id`;
          return json(row, 201);
        }
        if (id && method === 'PUT') {
          const p = cleanProduct(await body());
          const [old] = await sql`SELECT gallery, colors FROM products WHERE id=${Number(id)}`;
          await sql`UPDATE products SET name=${p.name}, description=${p.description}, details=${p.details}, price=${p.price},
            sale_price=${p.sale_price}, sale_start=${p.sale_start}, sale_end=${p.sale_end}, stock=${p.stock},
            category_id=${p.category_id}, image_id=${p.image_id}, gallery=${p.gallery}, active=${p.active},
            size_label=${p.size_label}, colors=${JSON.stringify(p.colors)}::jsonb, sizes=${JSON.stringify(p.sizes)}::jsonb, variants=${JSON.stringify(p.variants)}::jsonb WHERE id=${Number(id)}`;
          const keep = new Set(imagesOf(p));
          await dropOrphanImages(sql, imagesOf(old).filter(g => !keep.has(g)));
          return json({ ok: true });
        }
        if (id && method === 'DELETE') {
          const [old] = await sql`SELECT gallery, colors FROM products WHERE id=${Number(id)}`;
          await sql`DELETE FROM products WHERE id=${Number(id)}`;
          await dropOrphanImages(sql, imagesOf(old));
          return json({ ok: true });
        }
      }

      if (res === 'categories') {
        if (!id && method === 'POST') {
          const b = await body();
          const name = String(b.name || '').trim();
          if (!name) return fail('Kategori adı gerekli');
          const [row] = await sql`INSERT INTO categories (name, image_id) VALUES (${name}, ${Number(b.image_id) || null}) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name, image_id = COALESCE(EXCLUDED.image_id, categories.image_id) RETURNING id, name`;
          return json(row, 201);
        }
        if (id && method === 'PUT') {
          const b = await body();
          const [old] = await sql`SELECT image_id FROM categories WHERE id=${Number(id)}`;
          if (!old) return fail('Kategori bulunamadı', 404);
          const name = String(b.name || '').trim();
          const img = b.image_id === null ? null : (Number(b.image_id) || old.image_id);
          await sql`UPDATE categories SET name = COALESCE(NULLIF(${name}, ''), name), image_id = ${img} WHERE id=${Number(id)}`;
          if (old.image_id && old.image_id !== img) await dropOrphanImages(sql, [old.image_id]);
          return json({ ok: true });
        }
        if (id && method === 'DELETE') {
          const [old] = await sql`SELECT image_id FROM categories WHERE id=${Number(id)}`;
          await sql`DELETE FROM categories WHERE id=${Number(id)}`;
          if (old?.image_id) await dropOrphanImages(sql, [old.image_id]);
          return json({ ok: true });
        }
      }

      if (res === 'images' && method === 'POST') {
        const { mime, data } = await body();
        if (!/^image\/(jpeg|png|webp)$/.test(mime || '') || !data) return fail('Geçersiz görsel');
        if (data.length > 2_000_000) return fail('Görsel çok büyük');
        const [row] = await sql`INSERT INTO images (mime, data) VALUES (${mime}, ${data}) RETURNING id`;
        return json(row, 201);
      }

      if (res === 'orders') {
        if (!id && method === 'GET')
          return json(await sql`SELECT id, customer_name, phone, address, note, items, total::float AS total, status, created_at
            FROM orders ORDER BY created_at DESC LIMIT 200`);
        if (id && method === 'PUT') {
          const status = String((await body()).status || '');
          if (!['yeni', 'hazırlanıyor', 'kargoda', 'teslim edildi', 'iptal'].includes(status)) return fail('Geçersiz durum');
          await sql`UPDATE orders SET status=${status} WHERE id=${Number(id)}`;
          return json({ ok: true });
        }
      }
    }

    return fail('Bulunamadı', 404);
  } catch (e) {
    return fail(e.message || 'Sunucu hatası', e instanceof Bad ? 400 : 500);
  }
}
