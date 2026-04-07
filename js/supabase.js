/**
 * supabase.js
 * Lightweight Supabase client — no npm, pure fetch
 */

const SUPABASE_URL = "https://rszsdwuaxuleyeisuyfu.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZxLxEnBynM9628ewiOvsDg_5RoZ9CkK";

const SB = {
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },

  async getProducts() {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?order=created_at.asc`,
      {
        headers: this.headers,
      },
    );
    if (!res.ok) throw new Error(`Supabase read error: ${res.status}`);
    return res.json();
  },

  async upsertProduct(product) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
      method: "POST",
      headers: {
        ...this.headers,
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(product),
    });
    if (!res.ok) {
      const e = await res.text();
      throw new Error(e);
    }
    return res.json();
  },

  async updateProduct(id, patch) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const e = await res.text();
      throw new Error(e);
    }
    return res.json();
  },

  async deleteProduct(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
      method: "DELETE",
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`Delete error: ${res.status}`);
  },

  async uploadImage(file, productId) {
    const ext = file.name.split(".").pop();
    const path = `products/${productId}/${Date.now()}.${ext}`;
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/product-images/${path}`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": file.type,
          "Cache-Control": "3600",
        },
        body: file,
      },
    );
    if (!res.ok) {
      const e = await res.text();
      throw new Error(e);
    }
    return `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
  },
};
