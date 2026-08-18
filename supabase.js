/* =========================================================
   Kilo Auto Spares Ltd — Supabase Connection
   ---------------------------------------------------------
   This file holds your Supabase project details and a small
   set of helper functions every other file uses to talk to
   your database. You should NOT need to edit anything below
   the config block unless Anthropic/Supabase support tells
   you to.

   IMPORTANT: the key below is a "publishable" (anon) key,
   which is SAFE to expose in front-end code like this — it's
   the same key type Supabase expects you to ship in a public
   website. It can only do what your table's Row Level
   Security (RLS) policies allow it to do. See SUPABASE_SETUP.md
   for the exact policies this site expects.
   ========================================================= */

const SUPABASE_URL = 'https://rzhftdmumvfjspijynfd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JlwCsJ-u6Ge47XRQEfhB4A_Sddc_Tb6';

const SUPABASE_REST = `${SUPABASE_URL}/rest/v1`;
const SUPABASE_STORAGE = `${SUPABASE_URL}/storage/v1`;
const PRODUCT_IMAGE_BUCKET = 'product-images';

function sbHeaders(extra) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra
  };
}

async function sbRequest(path, options = {}) {
  const res = await fetch(`${SUPABASE_REST}${path}`, {
    ...options,
    headers: sbHeaders({ 'Content-Type': 'application/json', ...(options.headers || {}) })
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch (e) { /* ignore */ }
    throw new Error(`Supabase request failed (${res.status}) ${detail}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* ---------- Products table ---------- */

// Convert a database row (snake_case) into the shape the rest
// of the site already expects (camelCase, matches old JSON file).
function dbRowToProduct(row) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand || '',
    // Defaults to '' if the "part_number" column doesn't exist yet, so
    // nothing breaks on a site that hasn't run the migration in
    // SUPABASE_SETUP.md yet.
    partNumber: row.part_number || '',
    category: row.category,
    subcategory: row.subcategory || '',
    price: Number(row.price),
    originalPrice: row.original_price !== null && row.original_price !== undefined ? Number(row.original_price) : null,
    image: row.image || '',
    description: row.description || '',
    // Defaults to true (visible) if the "active" column doesn't exist yet
    // or is null, so nothing changes on sites that haven't added it.
    active: row.active !== false
  };
}

// Convert a product object (camelCase) into a database row for
// inserting/updating.
function productToDbRow(p) {
  return {
    name: p.name,
    brand: p.brand || null,
    part_number: p.partNumber || null,
    category: p.category,
    subcategory: p.subcategory || null,
    price: p.price,
    original_price: (p.originalPrice === undefined || p.originalPrice === null || p.originalPrice === '') ? null : Number(p.originalPrice),
    image: p.image || null,
    description: p.description || null,
    active: p.active === false ? false : true
  };
}

async function sbGetProducts() {
  const rows = await sbRequest('/products?select=*&order=id.asc');
  return rows.map(dbRowToProduct);
}

async function sbInsertProduct(product) {
  const rows = await sbRequest('/products', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(productToDbRow(product))
  });
  return dbRowToProduct(rows[0]);
}

// Bulk insert — used by the Admin "Upload XLSX/CSV" flow.
async function sbInsertProducts(products) {
  const rows = await sbRequest('/products', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(products.map(productToDbRow))
  });
  return rows.map(dbRowToProduct);
}

async function sbUpdateProduct(id, product) {
  const rows = await sbRequest(`/products?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(productToDbRow(product))
  });
  return dbRowToProduct(rows[0]);
}

async function sbDeleteProduct(id) {
  await sbRequest(`/products?id=eq.${id}`, { method: 'DELETE' });
}

// Deletes many products at once, in chunks (PostgREST/URL length gets
// unhappy with huge "in.()" lists, so this mirrors sbSetProductsActive
// below and sends at most `chunkSize` ids per request). Used by the
// Bulk Delete Products tool in Admin.
async function sbDeleteProducts(ids) {
  const chunkSize = 50;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    await sbRequest(`/products?id=in.(${chunk.join(',')})`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });
  }
}

// Flips the "active" (visible-on-site) flag on one product WITHOUT
// touching anything else about it. Used by the Admin table's
// Show/Hide button and by the Cleanup tool's "Hide" action.
async function sbSetProductActive(id, active) {
  await sbRequest(`/products?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ active: !!active })
  });
}

// Same, but for many products at once (chunked, like deletes).
async function sbSetProductsActive(ids, active) {
  const chunkSize = 50;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    await sbRequest(`/products?id=in.(${chunk.join(',')})`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ active: !!active })
    });
  }
}

/* ---------- Site settings (e.g. show/hide prices) ---------- */

// Single row (id = 1) holding site-wide toggles. If the row or
// table doesn't exist yet (before SUPABASE_SETUP.md's site_settings
// step has been run), this safely defaults to "show prices" so the
// site behaves exactly as before until the admin sets it up.
async function sbGetShowPrices() {
  try {
    const rows = await sbRequest('/site_settings?select=show_prices&id=eq.1');
    if (rows && rows.length > 0 && rows[0].show_prices !== null && rows[0].show_prices !== undefined) {
      return rows[0].show_prices !== false;
    }
    return true;
  } catch (e) {
    console.warn('Could not load the show-prices setting — defaulting to showing prices.', e);
    return true;
  }
}

async function sbSetShowPrices(value) {
  await sbRequest('/site_settings?id=eq.1', {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ show_prices: !!value })
  });
}

/* ---------- Category images (Homepage "Shop by Category" tiles) ---------- */
// Backed by a small `category_images` table: one row per category
// name, holding the image URL admin picked for that tile. Categories
// with no row (or a null image) just show a fallback icon on the
// homepage instead — nothing breaks if this table hasn't been
// created yet or a category hasn't been given a photo.

async function sbGetCategoryImages() {
  try {
    const rows = await sbRequest('/category_images?select=category,image');
    const map = {};
    (rows || []).forEach(r => { if (r.image) map[r.category] = r.image; });
    return map;
  } catch (e) {
    console.warn('Could not load category images — homepage will show icons instead.', e);
    return {};
  }
}

// Upserts (insert-or-update) a single category's image by category
// name, which is the table's primary key.
async function sbSetCategoryImage(category, imageUrl) {
  await sbRequest('/category_images', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ category, image: imageUrl || null })
  });
}

/* ---------- Storage (product photo uploads) ---------- */

// Uploads a File object the admin picked from their computer and
// returns a public URL you can save straight into a product's
// "image" field.
async function sbUploadImage(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${Date.now()}-${safeName}`;
  const res = await fetch(`${SUPABASE_STORAGE}/object/${PRODUCT_IMAGE_BUCKET}/${path}`, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': file.type || 'application/octet-stream' }),
    body: file
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch (e) { /* ignore */ }
    throw new Error(`Image upload failed (${res.status}) ${detail}`);
  }
  return `${SUPABASE_STORAGE}/object/public/${PRODUCT_IMAGE_BUCKET}/${path}`;
}

// Lists every file currently sitting in the product-images storage
// bucket (paginated under the hood so it also works once you have
// hundreds of uploads, not just the first page).
async function sbListAllImages() {
  const names = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const res = await fetch(`${SUPABASE_STORAGE}/object/list/${PRODUCT_IMAGE_BUCKET}`, {
      method: 'POST',
      headers: sbHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix: '', limit, offset, sortBy: { column: 'name', order: 'asc' } })
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch (e) { /* ignore */ }
      throw new Error(`Could not list uploaded images (${res.status}) ${detail}`);
    }
    const page = await res.json();
    if (!page || page.length === 0) break;
    page.forEach(f => { if (f && f.name) names.push(f.name); });
    if (page.length < limit) break;
    offset += limit;
  }
  return names;
}

// Permanently deletes a batch of files from the product-images
// storage bucket by name. Supabase's bulk-delete endpoint accepts
// up to ~1000 paths per call, so this chunks large lists.
async function sbDeleteImages(paths) {
  const chunkSize = 500;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);
    const res = await fetch(`${SUPABASE_STORAGE}/object/${PRODUCT_IMAGE_BUCKET}`, {
      method: 'DELETE',
      headers: sbHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: chunk })
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch (e) { /* ignore */ }
      throw new Error(`Could not delete uploaded images (${res.status}) ${detail}`);
    }
  }
}

// Clears the photo off every product WITHOUT touching anything
// else about the product (name, price, category, description, etc.
// all stay exactly as they are) and without deleting any product
// rows. Used by the Admin "Delete All Images" button.
async function sbClearAllProductImages() {
  await sbRequest('/products?id=not.is.null', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ image: null })
  });
}

// Clears the photo off every homepage category tile, leaving the
// categories themselves (and everything else) untouched.
async function sbClearAllCategoryImages() {
  await sbRequest('/category_images?category=not.is.null', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ image: null })
  });
}
