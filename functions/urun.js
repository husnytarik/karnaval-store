import { neon } from '@neondatabase/serverless';

// Ürün sayfası: paylaşılan bağlantıda (WhatsApp, Facebook...) ürün adı, açıklama ve fotoğrafı önizleme olarak çıksın diye
// sunucu tarafında og: etiketlerini ekler. Sayfanın kendisi urun.html'dir.
export async function onRequestGet({ request, env, next }) {
  const res = await next();
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id'), 10);
  if (!id || !(res.headers.get('content-type') || '').includes('text/html')) return res;
  let p;
  try {
    const sql = neon(env.DATABASE_URL);
    [p] = await sql`SELECT name, description, image_id FROM products WHERE id = ${id} AND active`;
  } catch { return res; }
  if (!p) return res;
  const title = `${p.name} · Karnaval Kırtasiye`;
  const desc = (p.description || 'Karnaval Kırtasiye').slice(0, 200);
  const img = p.image_id ? `${url.origin}/api/images/${p.image_id}` : `${url.origin}/logo.png`;
  const tags = [
    ['og:type', 'product'], ['og:site_name', 'Karnaval Kırtasiye'], ['og:title', title], ['og:description', desc],
    ['og:image', img], ['og:url', `${url.origin}/urun?id=${id}`],
  ].map(([k, v]) => `<meta property="${k}" content="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}">`).join('');
  return new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(title); } })
    .on('head', { element(e) { e.append(tags + '<meta name="twitter:card" content="summary_large_image">', { html: true }); } })
    .transform(res);
}
