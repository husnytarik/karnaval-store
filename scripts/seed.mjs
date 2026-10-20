import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const vars = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const sql = neon(process.env.DATABASE_URL || vars.DATABASE_URL);

const data = {
  'Kalemler': [
    ['Kurşun Kalem 2B (12\'li)', 'Yumuşak uçlu, silgili kurşun kalem seti.', 89.9, 60],
    ['Tükenmez Kalem Mavi (10\'lu)', 'Akıcı yazı sağlayan 0.7 mm uçlu tükenmez kalem.', 74.5, 80],
    ['Keçeli Kalem 24 Renk', 'Yıkanabilir mürekkepli, canlı renkli keçeli kalem seti.', 129.0, 40],
    ['Fosforlu Kalem 6\'lı', 'Metin işaretlemek için eğik uçlu fosforlu kalem seti.', 98.0, 50],
  ],
  'Defter & Ajanda': [
    ['Çizgili Defter A4 80 Yaprak', 'Spiralli, sert kapaklı çizgili defter.', 64.9, 100],
    ['Kareli Defter A5 60 Yaprak', 'Matematik ve teknik çizim için kareli defter.', 42.5, 90],
    ['2027 Haftalık Ajanda', 'Termo kapaklı, lastik kapamalı haftalık ajanda.', 219.0, 25],
    ['Not Defteri Cep Boy', 'Cebe sığan, noktalı sayfa düzenli not defteri.', 35.0, 70],
  ],
  'Boya & Resim': [
    ['Pastel Boya 12 Renk', 'Yumuşak dokulu, kolay sürülen pastel boya.', 79.9, 45],
    ['Sulu Boya 12\'li + Fırça', 'Çocuklar için güvenli sulu boya seti, fırça hediyeli.', 69.0, 55],
    ['Kuru Boya 36 Renk', 'Altıgen gövdeli, kırılmaya dayanıklı kuru boya.', 159.0, 35],
    ['Resim Defteri A3 15 Yaprak', 'Kalın sayfalı resim ve çizim defteri.', 54.0, 40],
  ],
  'Okul Çantası & Kutu': [
    ['Kalemlik Fermuarlı', 'Geniş hacimli, yıkanabilir kumaş kalemlik.', 89.0, 30],
    ['Okul Çantası Lacivert', 'Ortopedik sırt destekli, su geçirmez okul çantası.', 749.0, 12],
    ['Beslenme Kutusu', 'Hava geçirmez kapaklı, 3 bölmeli beslenme kutusu.', 119.0, 28],
  ],
  'Ofis & Masa Gereçleri': [
    ['Zımba Makinesi + 1000 Tel', 'Metal gövdeli, 20 sayfa kapasiteli zımba.', 109.0, 22],
    ['Yapışkanlı Not Kağıdı 5\'li', 'Beş renk, her biri 100 yapraklı not kağıdı.', 49.5, 75],
    ['Dosya Klasörü A4', 'Geniş sırtlı, plastik kapaklı klasör.', 38.0, 65],
  ],
};

const [{ n }] = await sql`SELECT count(*)::int AS n FROM products`;
if (n > 0) { console.log(`Zaten ${n} ürün var, ekleme yapılmadı.`); process.exit(0); }

let count = 0;
for (const [cat, items] of Object.entries(data)) {
  const [c] = await sql`INSERT INTO categories (name) VALUES (${cat}) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  for (const [name, description, price, stock] of items) {
    await sql`INSERT INTO products (name, description, price, stock, category_id) VALUES (${name}, ${description}, ${price}, ${stock}, ${c.id})`;
    count++;
  }
}
console.log(`${Object.keys(data).length} kategori, ${count} ürün eklendi.`);
