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

const productCols = `p.id, p.name, p.description, p.price::float AS price, p.stock, p.category_id,
  c.name AS category, p.image_id, p.active`;
const productFrom = `FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

function cleanProduct(b) {
  const name = String(b.name || '').trim();
  const price = Number(b.price);
  if (!name) throw new Error('Ürün adı gerekli');
  if (!(price >= 0)) throw new Error('Geçerli bir fiyat girin');
  return {
    name,
    description: String(b.description || '').trim(),
    price,
    stock: Math.max(0, parseInt(b.stock, 10) || 0),
    category_id: b.category_id ? Number(b.category_id) : null,
    image_id: b.image_id ? Number(b.image_id) : null,
    active: b.active !== false,
  };
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
        (SELECT p.image_id FROM products p WHERE p.category_id = c.id AND p.active AND p.image_id IS NOT NULL ORDER BY p.created_at DESC LIMIT 1) AS image_id,
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
      const wanted = new Map();
      for (const it of b.items) {
        const id = Number(it.id), qty = parseInt(it.qty, 10);
        if (id && qty > 0) wanted.set(id, (wanted.get(id) || 0) + qty);
      }
      const rows = await sql`SELECT id, name, price::float AS price, stock FROM products WHERE active AND id = ANY(${[...wanted.keys()]})`;
      const items = [];
      let total = 0;
      for (const [id, qty] of wanted) {
        const p = rows.find(r => r.id === id);
        if (!p) return fail('Sepetteki bir ürün artık satışta değil');
        if (qty > p.stock) return fail(`"${p.name}" için yeterli stok yok (kalan: ${p.stock})`);
        items.push({ id, name: p.name, price: p.price, qty });
        total += p.price * qty;
      }
      const [order] = await sql`INSERT INTO orders (customer_name, phone, address, note, items, total)
        VALUES (${name}, ${phone}, ${address}, ${String(b.note || '').trim()}, ${JSON.stringify(items)}::jsonb, ${total})
        RETURNING id`;
      for (const it of items) await sql`UPDATE products SET stock = GREATEST(stock - ${it.qty}, 0) WHERE id = ${it.id}`;
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
          const [row] = await sql`INSERT INTO products (name, description, price, stock, category_id, image_id, active)
            VALUES (${p.name}, ${p.description}, ${p.price}, ${p.stock}, ${p.category_id}, ${p.image_id}, ${p.active}) RETURNING id`;
          return json(row, 201);
        }
        if (id && method === 'PUT') {
          const p = cleanProduct(await body());
          await sql`UPDATE products SET name=${p.name}, description=${p.description}, price=${p.price}, stock=${p.stock},
            category_id=${p.category_id}, image_id=${p.image_id}, active=${p.active} WHERE id=${Number(id)}`;
          return json({ ok: true });
        }
        if (id && method === 'DELETE') {
          await sql`DELETE FROM products WHERE id=${Number(id)}`;
          await sql`DELETE FROM images WHERE id NOT IN (SELECT image_id FROM products WHERE image_id IS NOT NULL)`;
          return json({ ok: true });
        }
      }

      if (res === 'categories') {
        if (!id && method === 'POST') {
          const name = String((await body()).name || '').trim();
          if (!name) return fail('Kategori adı gerekli');
          const [row] = await sql`INSERT INTO categories (name) VALUES (${name}) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name`;
          return json(row, 201);
        }
        if (id && method === 'DELETE') {
          await sql`DELETE FROM categories WHERE id=${Number(id)}`;
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
    return fail(e.message || 'Sunucu hatası', e instanceof Error && /gerekli|Geçerli/.test(e.message) ? 400 : 500);
  }
}
