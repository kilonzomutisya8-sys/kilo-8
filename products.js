/* =========================================================
   Kilo Auto Spares Ltd — Product Data Layer
   ---------------------------------------------------------
   THE SINGLE SOURCE OF TRUTH FOR THE LIVE SITE IS NOW YOUR
   SUPABASE "products" TABLE (see supabase.js for the
   connection details and SUPABASE_SETUP.md for how the table
   is structured).

   Every page — Home, Shop, About, Contact — calls
   loadProducts() below, which fetches straight from Supabase.
   Because that's a live database, ANY change made in Admin
   (single product or bulk upload) is visible to every visitor
   immediately — no export/upload-to-GitHub step needed anymore.

   loadProducts() is now ASYNC (it has to be — it's a network
   call), so anywhere in the site that used to say:
       const products = loadProducts();
   now says:
       const products = await loadProducts();
   ========================================================= */

// Category > Subcategory structure, mirrors the mega-menu and
// the "Shop by Category" grid on the homepage.
const CATEGORY_STRUCTURE = {
  "Suspension Parts": [
    "Ball Joints", "Boot Struts", "Brake Discs", "Center Bearing Assembly",
    "Coil Springs", "Control Arms", "CV Joints", "Drive Shafts",
    "Engine Mounts", "Oil Seals", "Power Steering Pumps", "Power Steering Rack",
    "Rubber Arm Bushes", "Rubber Boots", "Shock Absorbers", "Shock Mounts",
    "Stabilizer Links", "Steering Knuckle", "Steering Rack End",
    "Steering Tie Rod End", "Suspension Airbag", "Wheel Bearings", "Wheel Hubs"
  ],
  "Service Parts": [
    "Air Filters", "Brake Adjuster Kit", "Brake Calipers", "Brake Cylinders",
    "Brake Fluid", "Brake Pad Sensor", "Brake Pads", "Brake Shoes",
    "Cabin Filter", "Cooling System", "Diesel Filter", "Engine Oil",
    "Fan Belt", "Fan Belt Tensioner", "Fuel Filters",
    "Gear Box Transmission Oil ATF CVT", "Ignition Coils", "Oil Filter",
    "Radiator Coolant", "Spark Plugs", "Timing Belt", "Timing Kits",
    "Transmission Filters", "Wheel Rings & Caps", "Wipers"
  ],
  "Engine Parts": [
    "Coolant Reservoir", "Engine Radiators", "Engine Sumps",
    "Gasket Head Cover", "Gasket Rubber", "Gear Parts", "Hoses",
    "Oil Pumps", "Oxygen Sensor", "Pulleys", "Radiator Cap", "Sensors",
    "Starter Motor", "Transmission Filters", "Turbo Valves", "Water Pumps"
  ],
  "German Parts": ["BMW Parts", "Mercedes-Benz Parts", "Audi & VW Parts", "Porsche Parts"],
  "Service Kits": ["German Cars", "Japanese Cars", "Korean Cars"],
  "Car Batteries": ["12V Maintenance-Free Batteries", "Heavy-Duty Batteries", "DIN Standard Batteries", "Deep Cycle Batteries"],
  "Tyres": ["Passenger Car Tyres", "SUV & 4x4 Tyres", "Van & Light Truck Tyres", "All-Season Tyres"]
};

const CATEGORIES = Object.keys(CATEGORY_STRUCTURE);

// Turns any messy spreadsheet/DB text into a stable comparison key:
// lowercase, trim, collapse whitespace/punctuation to single spaces,
// and drop a trailing "s" so singular/plural variants match (e.g.
// "Ball Joint", "ball-joints", "  Ball   Joints " all normalize the
// same way). Used everywhere we match a subcategory string against
// the canonical CATEGORY_STRUCTURE list.
function normalizeCategoryKey(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/s$/, '');
}

// Lookup: a known subcategory (e.g. "Ball Joints") always maps back to
// its correct parent category (e.g. "Suspension Parts") and its exact
// canonical spelling, no matter how it was typed or what category value
// happens to be stored alongside it. Both the live-site display (below)
// and the Admin bulk XLSX/CSV upload use this same lookup, so a part is
// always filed under the right category AND the right subcategory
// bucket everywhere on the site.
const SUBCATEGORY_LOOKUP = {};
Object.entries(CATEGORY_STRUCTURE).forEach(([cat, subs]) => {
  subs.forEach(sub => {
    SUBCATEGORY_LOOKUP[normalizeCategoryKey(sub)] = { category: cat, subcategory: sub };
  });
});

// Given any subcategory text, returns { category, subcategory } using
// the canonical spelling if recognized (fuzzy on case/spacing/plural),
// otherwise null.
function resolveSubcategory(rawSubcategory) {
  return SUBCATEGORY_LOOKUP[normalizeCategoryKey(rawSubcategory)] || null;
}

// Corrects a product's category (and canonicalizes its subcategory
// spelling) to match its subcategory whenever the subcategory is
// recognized, leaving anything unrecognized as-is.
function normalizeProductCategory(product) {
  const match = resolveSubcategory(product.subcategory);
  if (match && (match.category !== product.category || match.subcategory !== product.subcategory)) {
    return { ...product, category: match.category, subcategory: match.subcategory };
  }
  return product;
}

// Icon shown on the homepage category tiles (Font Awesome class).
const CATEGORY_ICONS = {
  "Suspension Parts": "fa-solid fa-car-side",
  "Service Parts": "fa-solid fa-oil-can",
  "Engine Parts": "fa-solid fa-gears",
  "German Parts": "fa-solid fa-flag",
  "Service Kits": "fa-solid fa-toolbox",
  "Car Batteries": "fa-solid fa-car-battery",
  "Tyres": "fa-solid fa-circle-dot"
};

// Fallback only — used if Supabase can't be reached (e.g. no
// internet, wrong keys, or the "products" table isn't set up
// yet). Keeps the site from showing a blank page.
const DEFAULT_PRODUCTS = [
  { id: -1, name: "Sample Product — connect Supabase to replace this", brand: "", category: "Service Parts", subcategory: "", price: 0, originalPrice: null, image: "https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=600&q=80", description: "This placeholder shows because the site could not load live products from Supabase. Check supabase.js and SUPABASE_SETUP.md." }
];

// Simple in-memory cache so we don't re-fetch the whole catalogue
// on every render call within the same page view. Cleared on
// full page reload (e.g. after Admin publishes a change and the
// visitor refreshes).
let _productsCache = null;
let _productsPromise = null;

// Site-wide "show prices to visitors" flag. Defaults to true (current
// behavior) until it's fetched from Supabase. Admin can flip this from
// the Admin panel — when off, every visitor-facing page shows "Contact
// for Price" instead of a number, while Admin itself always shows real
// prices so staff can still manage the catalogue normally.
let SHOW_PRICES = true;

// Used by Home, Shop, About, Contact, Cart — always the live,
// published catalogue every visitor sees identically. Also refreshes
// the SHOW_PRICES flag from the same round trip.
// IMPORTANT: this is now async — call it with `await`.
async function loadProducts() {
  if (_productsCache) return _productsCache;
  if (_productsPromise) return _productsPromise;

  _productsPromise = Promise.all([sbGetProducts(), sbGetShowPrices()])
    .then(([products, showPrices]) => {
      // Visitor-facing pages never see products an admin has hidden
      // (active === false) — they still exist in Supabase, they're
      // just skipped here.
      _productsCache = products.filter(p => p.active !== false).map(normalizeProductCategory);
      SHOW_PRICES = showPrices;
      return _productsCache;
    })
    .catch(err => {
      console.warn('Could not load products from Supabase — showing fallback data instead.', err);
      _productsCache = DEFAULT_PRODUCTS.slice();
      return _productsCache;
    })
    .finally(() => { _productsPromise = null; });

  return _productsPromise;
}

// Call this right after Admin adds/edits/deletes/bulk-uploads (or
// toggles the prices setting) so the next loadProducts() call fetches
// fresh data instead of the cached copy.
function invalidateProductsCache() {
  _productsCache = null;
  _productsPromise = null;
}

// Admin-only loader: returns EVERY product, including ones hidden
// from the public site (active === false), so staff can find and
// un-hide them. Never cached, so Admin always sees the latest state.
async function loadAllProductsIncludingHidden() {
  const rows = await sbGetProducts();
  return rows.map(normalizeProductCategory);
}

// Same caching pattern as loadProducts(), but for the homepage
// "Shop by Category" tile photos. Returns a plain object keyed by
// category name (e.g. { "Suspension Parts": "https://..." }) —
// categories with no saved photo are simply absent from the object,
// and the homepage falls back to an icon tile for those.
let _categoryImagesCache = null;
let _categoryImagesPromise = null;

async function loadCategoryImages() {
  if (_categoryImagesCache) return _categoryImagesCache;
  if (_categoryImagesPromise) return _categoryImagesPromise;

  _categoryImagesPromise = sbGetCategoryImages()
    .then(map => { _categoryImagesCache = map; return _categoryImagesCache; })
    .catch(() => { _categoryImagesCache = {}; return _categoryImagesCache; })
    .finally(() => { _categoryImagesPromise = null; });

  return _categoryImagesPromise;
}

// Call this right after Admin saves a category image so the next
// loadCategoryImages() call fetches the fresh photo instead of the
// cached copy.
function invalidateCategoryImagesCache() {
  _categoryImagesCache = null;
  _categoryImagesPromise = null;
}

// Shared price markup for product cards / quick view, used on every
// visitor-facing page. Returns "Contact for Price" instead of a number
// whenever SHOW_PRICES is off. `sizeClass` lets a caller bump up the
// font size (e.g. in Quick View) without duplicating the discount logic.
function priceHTML(product, sizeClass) {
  const size = sizeClass || 'text-base';
  if (!SHOW_PRICES) {
    return `<span class="text-red-600 font-extrabold ${size}">Contact for Price</span>`;
  }
  const pct = discountPercent(product);
  return `${pct > 0 ? `<span class="text-slate-400 line-through text-xs mr-2">KES ${product.originalPrice.toLocaleString()}</span>` : ''}<span class="text-red-600 font-extrabold ${size}">KES ${product.price.toLocaleString()}</span>`;
}

// Price fragment to append to a WhatsApp inquiry message, e.g.
// " (KES 6,000)" — empty string when prices are turned off, so
// visitors aren't quoted a number that isn't shown on the site.
function priceForWhatsApp(product) {
  return SHOW_PRICES ? ` (KES ${product.price.toLocaleString()})` : '';
}

// Percentage discount, rounded — returns 0 if there's no valid original price.
function discountPercent(product) {
  if (!product.originalPrice || product.originalPrice <= product.price) return 0;
  return Math.round((1 - product.price / product.originalPrice) * 100);
}

/* ---------------------------------------------------------
   Search — the site's ONLY way to find products now that
   there's no category browsing. Matches against name, brand,
   category and subcategory (category/subcategory are hidden
   fields — never shown as clickable filters, just used here
   to make search smarter, e.g. typing "brake pads" or
   "suspension" reliably surfaces the right parts).
   --------------------------------------------------------- */
function searchProducts(products, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return products;
  const terms = q.split(/\s+/).filter(Boolean);
  return products.filter(p => {
    const haystack = `${p.name} ${p.brand || ''} ${p.category || ''} ${p.subcategory || ''} ${p.description || ''}`.toLowerCase();
    return terms.every(term => haystack.includes(term));
  });
}

// Used by the homepage category tiles + Shop page's ?category= link —
// an exact match against a product's top-level category.
function filterByCategory(products, category) {
  if (!category) return products;
  return products.filter(p => p.category === category);
}
