/* =========================================================
   Kilo Auto Spares Ltd — Admin Panel Logic
   ---------------------------------------------------------
   Everything here reads/writes your Supabase "products" table
   directly (see supabase.js). There is no local draft anymore —
   every save is live on the site immediately.
   ========================================================= */

// CHANGE THIS before you rely on this page — it's the password
// that gates the whole Admin panel. It lives in this file, so
// anyone who views the page source can find it; that's fine for
// keeping casual visitors out, but don't treat it as strong
// security. Ask your developer about Supabase Auth if you need
// real staff accounts later.
const ADMIN_PASSWORD = 'kiloadmin2026';
const ADMIN_SESSION_KEY = 'kilo_admin_session';

let allProducts = [];
let selectedImageFile = null;
let bulkPhotoFile = null;
let bulkPhotoSelectedIds = new Set();

/* ---------- Auto-hide rules for newly added products ---------- */
// These mirror the default rules in cleanup-products.html. When a
// brand-new product is added — via bulk upload or the Add Product
// form — and it matches one of these, it's saved as hidden (active:
// false) right away instead of appearing live for a moment first.
// It never touches products that already exist. If you change the
// rules in cleanup-products.html, update these lists to match so
// new uploads get treated the same way.
const AUTO_HIDE_KEEP_BRANDS = ['suzuki', 'mazda', 'mitsubishi', 'toyota', 'nissan', 'honda', 'subaru'];
const AUTO_HIDE_OTHER_CAR_BRANDS = ['bmw', 'mercedes-benz', 'mercedes', 'audi', 'volkswagen', 'vw', 'ford', 'hyundai', 'kia', 'chevrolet', 'peugeot', 'renault', 'land rover', 'range rover', 'jeep', 'volvo', 'isuzu', 'daihatsu', 'mini', 'lexus', 'infiniti', 'acura', 'chrysler', 'dodge', 'fiat', 'skoda', 'seat', 'opel', 'citroen', 'jaguar', 'porsche', 'tesla', 'mg', 'proton', 'ssangyong'];
const AUTO_HIDE_CATEGORIES = ['tyres', 'german parts', 'service kits'];
const AUTO_HIDE_BRAND_KEYWORDS = ['liqui moly', 'liquimolly', 'liqui-moly'];

// Whole-word / substring match, same approach as the cleanup tool —
// "bmw" matches "BMW Genuine Parts" but not "minibus" matching "mini".
function autoHideTextMatchesAny(textLower, list) {
  return list.some(term => {
    if (!term) return false;
    if (textLower === term) return true;
    const re = new RegExp('(^|[^a-z0-9])' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)', 'i');
    return re.test(textLower);
  });
}

// Returns a short human-readable reason if a brand-new product should
// be auto-hidden on arrival, or null if it should stay visible.
// Products with no brand set are never auto-hidden by the brand
// rules — same "keep blank brand" protection the cleanup tool has.
function getAutoHideReason(product) {
  if (!product.name || !product.name.toString().trim()) return 'missing a product name';
  if (product.price === null || product.price === undefined || isNaN(Number(product.price)) || Number(product.price) === 0) {
    return 'missing or zero price';
  }

  const brandLower = (product.brand || '').trim().toLowerCase();
  const categoryLower = (product.category || '').trim().toLowerCase();

  if (brandLower) {
    if (autoHideTextMatchesAny(brandLower, AUTO_HIDE_BRAND_KEYWORDS)) {
      return `brand "${product.brand}" is on the always-hide brand list`;
    }
    if (!AUTO_HIDE_KEEP_BRANDS.includes(brandLower) && autoHideTextMatchesAny(brandLower, AUTO_HIDE_OTHER_CAR_BRANDS)) {
      return `brand "${product.brand}" is a competing car brand`;
    }
  }
  if (AUTO_HIDE_CATEGORIES.includes(categoryLower)) {
    return `category "${product.category}" is on the always-hide category list`;
  }
  return null;
}

/* ---------- Login ---------- */

function attemptLogin() {
  const input = document.getElementById('adminPassword');
  const error = document.getElementById('loginError');
  if (input.value === ADMIN_PASSWORD) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
    showDashboard();
  } else {
    error.classList.remove('hidden');
  }
}
window.attemptLogin = attemptLogin;

function showDashboard() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('adminDashboard').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');
  initAdmin();
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  location.reload();
});

/* ---------- Setup ---------- */

let adminInitialized = false;

if (sessionStorage.getItem(ADMIN_SESSION_KEY) === '1') {
  showDashboard();
}

async function initAdmin() {
  populateCategorySelects();
  document.getElementById('adminSearch').addEventListener('input', renderTable);
  document.getElementById('adminCategoryFilter').addEventListener('change', renderTable);
  document.getElementById('miSearch').addEventListener('input', () => { miPage = 0; renderMissingImagesList(); });
  document.getElementById('pCategory').addEventListener('change', updateSubcategoryOptions);
  document.getElementById('pImageFile').addEventListener('change', handleImageFileChange);
  document.getElementById('pImageUrl').addEventListener('input', handleImageUrlChange);
  document.getElementById('productForm').addEventListener('submit', handleProductFormSubmit);
  document.getElementById('pBulkExcelInput').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) processBulkFile(file);
  });
  setupDropZone(document.getElementById('pImageDropZone'), files => {
    const file = [...files].find(f => f.type.startsWith('image/'));
    if (file) applyImageFile(file);
  });
  setupDropZone(document.getElementById('pBulkDropZone'), files => {
    const file = [...files][0];
    if (file) processBulkFile(file);
  });
  document.getElementById('productModal').addEventListener('paste', e => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) { applyImageFile(file); e.preventDefault(); }
        return;
      }
    }
  });

  document.getElementById('bpCategory').addEventListener('change', updateBulkPhotoSubcategoryOptions);
  document.getElementById('bpSubcategory').addEventListener('change', renderBulkPhotoProductList);
  document.getElementById('bpSearch').addEventListener('input', renderBulkPhotoProductList);
  document.getElementById('bpProductList').addEventListener('change', e => {
    const checkbox = e.target.closest('input[type="checkbox"][data-product-id]');
    if (!checkbox) return;
    const id = Number(checkbox.dataset.productId);
    if (checkbox.checked) bulkPhotoSelectedIds.add(id);
    else bulkPhotoSelectedIds.delete(id);
    updateBulkPhotoMatchCount();
  });
  document.getElementById('bpImageFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) applyBulkImageFile(file);
  });
  document.getElementById('bpImageUrl').addEventListener('input', e => {
    if (bulkPhotoFile) return; // a picked file takes priority in the preview
    const url = e.target.value.trim();
    if (url) {
      document.getElementById('bpImagePreview').src = url;
      document.getElementById('bpImagePreview').classList.remove('hidden');
    }
  });
  setupDropZone(document.getElementById('bpImageDropZone'), files => {
    const file = [...files].find(f => f.type.startsWith('image/'));
    if (file) applyBulkImageFile(file);
  });
  document.getElementById('bulkPhotoModal').addEventListener('paste', e => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) { applyBulkImageFile(file); e.preventDefault(); }
        return;
      }
    }
  });

  if (!adminInitialized) {
    adminInitialized = true;
  }
  await refreshProducts();
  await initPricesToggle();
}

/* ---------- Show/Hide Prices toggle ---------- */
// Controls a single site_settings row that every visitor-facing page
// reads (via loadProducts() in products.js). This admin table always
// shows real prices no matter what this is set to — the toggle only
// hides prices from visitors on Home/Shop/Quick View/Cart/WhatsApp.

let currentShowPrices = true;

async function initPricesToggle() {
  const btn = document.getElementById('pricesToggleBtn');
  try {
    currentShowPrices = await sbGetShowPrices();
  } catch (e) {
    currentShowPrices = true;
  }
  renderPricesToggle();
  btn.disabled = false;
}

function renderPricesToggle() {
  const btn = document.getElementById('pricesToggleBtn');
  const icon = document.getElementById('pricesToggleIcon');
  const label = document.getElementById('pricesToggleLabel');
  if (currentShowPrices) {
    btn.classList.remove('bg-red-600/20', 'border-red-500/40', 'text-red-300');
    btn.classList.add('bg-emerald-600/20', 'border-emerald-500/40', 'text-emerald-300');
    icon.className = 'fa-solid fa-eye';
    label.textContent = 'Prices: Visible to Visitors';
  } else {
    btn.classList.remove('bg-emerald-600/20', 'border-emerald-500/40', 'text-emerald-300');
    btn.classList.add('bg-red-600/20', 'border-red-500/40', 'text-red-300');
    icon.className = 'fa-solid fa-eye-slash';
    label.textContent = 'Prices: Hidden From Visitors';
  }
}

async function togglePricesVisibility() {
  const btn = document.getElementById('pricesToggleBtn');
  const next = !currentShowPrices;
  btn.disabled = true;
  try {
    await sbSetShowPrices(next);
    currentShowPrices = next;
    renderPricesToggle();
    invalidateProductsCache();
  } catch (e) {
    alert('Could not update the prices setting. If this is the first time you\'re using this, make sure the site_settings table has been created — see SUPABASE_SETUP.md.\n\n' + e.message);
  } finally {
    btn.disabled = false;
  }
}
window.togglePricesVisibility = togglePricesVisibility;

function populateCategorySelects() {
  const filterSelect = document.getElementById('adminCategoryFilter');
  const formSelect = document.getElementById('pCategory');
  CATEGORIES.forEach(cat => {
    filterSelect.insertAdjacentHTML('beforeend', `<option value="${cat}">${cat}</option>`);
    formSelect.insertAdjacentHTML('beforeend', `<option value="${cat}">${cat}</option>`);
  });
  updateSubcategoryOptions();
}

function updateSubcategoryOptions() {
  const cat = document.getElementById('pCategory').value;
  const list = document.getElementById('pSubcategoryOptions');
  const subs = CATEGORY_STRUCTURE[cat] || [];
  list.innerHTML = subs.map(s => `<option value="${s}"></option>`).join('');
}

/* ---------- Loading & rendering the table ---------- */

async function refreshProducts() {
  invalidateProductsCache();
  try {
    allProducts = await loadAllProductsIncludingHidden();
  } catch (e) {
    alert('Could not load products from Supabase. Check your connection and supabase.js config.\n\n' + e.message);
    allProducts = [];
  }
  renderTable();
}
window.refreshProducts = refreshProducts;

function renderTable() {
  const tbody = document.getElementById('adminProductTable');
  const search = document.getElementById('adminSearch').value.toLowerCase();
  const catFilter = document.getElementById('adminCategoryFilter').value;

  const filtered = allProducts.filter(p => {
    if (p.active === false) return false; // hidden products never show in Admin
    const matchesCat = catFilter === 'all' || p.category === catFilter;
    const haystack = `${p.name} ${p.brand || ''}`.toLowerCase();
    return matchesCat && haystack.includes(search);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-500">No products found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => `
    <tr class="hover:bg-slate-900/50 ${p.active === false ? 'opacity-50' : ''}">
      <td class="px-4 py-3"><img src="${p.image || ''}" alt="${p.name}" class="w-12 h-12 rounded object-cover bg-slate-900 border border-slate-800" onerror="this.style.opacity=0.2"></td>
      <td class="px-4 py-3 text-white font-medium">${p.name}<div class="text-xs text-slate-500">${p.partNumber ? 'Part# ' + p.partNumber + ' &middot; ' : ''}${p.category}${p.subcategory ? ' &middot; ' + p.subcategory : ''}</div></td>
      <td class="px-4 py-3 text-slate-400">${p.brand || '—'}</td>
      <td class="px-4 py-3 text-slate-400">${p.category}</td>
      <td class="px-4 py-3 text-slate-200 font-semibold">${p.price.toLocaleString()}${p.originalPrice ? `<span class="text-slate-600 line-through ml-2 text-xs">${p.originalPrice.toLocaleString()}</span>` : ''}</td>
      <td class="px-4 py-3">
        ${p.active === false
          ? '<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-1 rounded-full"><i class="fa-solid fa-eye-slash"></i> Hidden</span>'
          : '<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded-full"><i class="fa-solid fa-eye"></i> Visible</span>'}
      </td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        <button onclick="toggleProductActive(${p.id}, ${p.active === false})" class="text-slate-400 hover:text-white px-2" title="${p.active === false ? 'Show on site' : 'Hide from site'}"><i class="fa-solid ${p.active === false ? 'fa-eye' : 'fa-eye-slash'}"></i></button>
        <button onclick="openProductModal(${p.id})" class="text-slate-400 hover:text-white px-2" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button onclick="deleteProductClick(${p.id})" class="text-slate-400 hover:text-red-400 px-2" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

// Flips a single product between visible and hidden. Hidden products
// stay in Supabase exactly as they are — they just stop appearing on
// Home/Shop/About/Contact/Cart until switched back.
async function toggleProductActive(id, makeActive) {
  try {
    await sbSetProductActive(id, makeActive);
    const p = allProducts.find(x => x.id === id);
    if (p) p.active = makeActive;
    renderTable();
  } catch (err) {
    alert('Could not update this product\'s visibility.\n\n' + err.message);
  }
}
window.toggleProductActive = toggleProductActive;

/* ---------- Add / Edit modal ---------- */

function openProductModal(id) {
  const modal = document.getElementById('productModal');
  const form = document.getElementById('productForm');
  form.reset();
  selectedImageFile = null;
  document.getElementById('pImagePreview').classList.add('hidden');

  if (id) {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    document.getElementById('modalTitle').textContent = 'Edit Product';
    document.getElementById('pId').value = p.id;
    document.getElementById('pName').value = p.name;
    document.getElementById('pPartNumber').value = p.partNumber || '';
    document.getElementById('pBrand').value = p.brand || '';
    document.getElementById('pPrice').value = p.price;
    document.getElementById('pOriginalPrice').value = p.originalPrice || '';
    document.getElementById('pCategory').value = p.category;
    updateSubcategoryOptions();
    document.getElementById('pSubcategory').value = p.subcategory || '';
    document.getElementById('pDescription').value = p.description || '';
    document.getElementById('pImageUrl').value = p.image || '';
    if (p.image) {
      document.getElementById('pImagePreview').src = p.image;
      document.getElementById('pImagePreview').classList.remove('hidden');
    }
  } else {
    document.getElementById('modalTitle').textContent = 'Add Product';
    document.getElementById('pId').value = '';
    updateSubcategoryOptions();
  }

  modal.classList.remove('hidden');
}
window.openProductModal = openProductModal;

function closeProductModal() {
  document.getElementById('productModal').classList.add('hidden');
}
window.closeProductModal = closeProductModal;

// Opens image searches (Google Images / PartSouq) as a small window
// docked to the LEFT edge of the screen, instead of a full new tab, so
// it never sits on top of the Upload/Drop controls in the Admin panel
// (those live on the right-hand side of each row in Find Missing
// Images). The Admin window itself is slid over to the right side so
// both windows sit cleanly side by side. Slightly narrower than half
// the screen so Google's image grid reflows to fewer columns instead
// of cramming thumbnails in edge-to-edge and clipping them.
function openSideSearchWindow(url) {
  const screenW = window.screen.availWidth || 1280;
  const screenH = window.screen.availHeight || 800;
  const winW = Math.round(screenW * 0.46);
  const winH = screenH;
  const left = 0; // dock to the LEFT edge
  const top = 0;
  const features = `width=${winW},height=${winH},left=${left},top=${top},noopener`;
  const win = window.open(url, 'kiloImageSearch', features);
  if (win) {
    win.focus();
    // Try to slide/shrink the Admin window itself to the right side,
    // so both are visible side by side without overlapping (not all
    // browsers allow this on an existing window, but it's harmless
    // where it's blocked).
    try {
      window.resizeTo(screenW - winW, screenH);
      window.moveTo(winW, 0);
    } catch (e) { /* ignore if browser blocks resizing the main window */ }
  } else {
    // Popup blocked — fall back to a normal tab so the search still works.
    window.open(url, '_blank', 'noopener');
  }
  return false; // prevent the default full-tab navigation
}
window.openSideSearchWindow = openSideSearchWindow;

function setupDropZone(el, onFiles) {
  if (!el) return;
  ['dragenter', 'dragover'].forEach(evt => el.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('ring-2', 'ring-emerald-500');
  }));
  ['dragleave', 'drop'].forEach(evt => el.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('ring-2', 'ring-emerald-500');
  }));
  el.addEventListener('drop', e => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) onFiles(files);
  });
}

function applyImageFile(file) {
  selectedImageFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('pImagePreview').src = ev.target.result;
    document.getElementById('pImagePreview').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function handleImageFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  applyImageFile(file);
}

function handleImageUrlChange(e) {
  if (selectedImageFile) return; // a picked file takes priority in the preview
  const url = e.target.value.trim();
  if (url) {
    document.getElementById('pImagePreview').src = url;
    document.getElementById('pImagePreview').classList.remove('hidden');
  }
}

async function handleProductFormSubmit(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    const id = document.getElementById('pId').value;
    let imageUrl = document.getElementById('pImageUrl').value.trim();

    if (selectedImageFile) {
      imageUrl = await sbUploadImage(selectedImageFile);
    }

    const existing = id ? allProducts.find(p => p.id === Number(id)) : null;

    const originalPriceRaw = document.getElementById('pOriginalPrice').value.trim();

    const product = {
      name: document.getElementById('pName').value.trim(),
      partNumber: document.getElementById('pPartNumber').value.trim(),
      brand: document.getElementById('pBrand').value.trim(),
      price: Number(document.getElementById('pPrice').value),
      originalPrice: originalPriceRaw === '' ? null : Number(originalPriceRaw),
      category: document.getElementById('pCategory').value,
      subcategory: document.getElementById('pSubcategory').value.trim(),
      description: document.getElementById('pDescription').value.trim(),
      image: imageUrl || (existing ? existing.image : '')
    };

    if (id) {
      await sbUpdateProduct(Number(id), product);
    } else {
      // Same name-matching as bulk upload — if a product with this
      // exact name already exists anywhere on the site, update it
      // instead of creating a duplicate.
      const duplicate = allProducts.find(p => p.name.trim().toLowerCase() === product.name.toLowerCase());
      if (duplicate) {
        const useExistingImage = !imageUrl && duplicate.image;
        await sbUpdateProduct(duplicate.id, { ...product, image: useExistingImage ? duplicate.image : product.image });
        closeProductModal();
        await refreshProducts();
        alert(`"${product.name}" already existed — updated it instead of creating a duplicate.`);
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
        return;
      }
      const inserted = await sbInsertProduct(product);
      const hideReason = getAutoHideReason(product);
      if (hideReason) {
        await sbSetProductActive(inserted.id, false);
        closeProductModal();
        await refreshProducts();
        alert(`Saved — but this product matched your always-hide rules (${hideReason}), so it was saved hidden. It won't show on the live site or in this Admin list. Find and un-hide it from cleanup-products.html if that's not what you wanted.`);
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
        return;
      }
    }

    closeProductModal();
    await refreshProducts();
  } catch (err) {
    alert('Could not save this product.\n\n' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
}

async function deleteProductClick(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Delete "${p.name}"? This removes it from the live site immediately and can't be undone.`)) return;

  // Disable this row's Edit/Delete buttons while the request is in
  // flight so a double-click (or a slow connection) can't fire a
  // second delete for the same product.
  const row = [...document.querySelectorAll('#adminProductTable tr')]
    .find(tr => tr.querySelector(`[onclick="deleteProductClick(${id})"]`));
  const rowButtons = row ? row.querySelectorAll('button') : [];
  rowButtons.forEach(b => b.disabled = true);

  try {
    await sbDeleteProduct(id);
    await refreshProducts();
  } catch (err) {
    const hint = /401|403|permission|rls|policy/i.test(err.message)
      ? '\n\nThis usually means the "Public can write products" policy (see SUPABASE_SETUP.md, step 1) hasn\'t been created on your products table yet — that policy is what allows deleting, not just adding/editing.'
      : '';
    alert('Could not delete this product.\n\n' + err.message + hint);
    rowButtons.forEach(b => b.disabled = false);
  }
}
window.deleteProductClick = deleteProductClick;

/* ---------- Find Missing Images ---------- */
/*
   Shows every visible-catalogue product that has no photo yet
   (image is blank/null), so you can work through them and upload a
   photo per product. Nothing here searches the internet automatically
   — this is a fast manual-review queue: you find the right photo
   yourself (manufacturer site, your own stock photo, distributor
   catalogue, etc.), then drag/upload/paste it onto a row.

   Dropping a photo no longer saves instantly — it just "stages" it
   (shown as a Pending thumbnail on that row). Nothing actually writes
   to Supabase until you click Save All, so you can drop a dozen
   photos in a row without waiting on a network round trip each time.

   The list order is captured once, when the modal opens (miOrderIds),
   and never recomputed from scratch afterwards — rows only ever leave
   the list (once truly saved), they never shuffle position while
   you're mid-session.

   You also don't need to aim at a specific row: dropping anywhere in
   the modal (or anywhere on the page while it's open) that isn't
   exactly on a row's own "Upload / Drop" control automatically stages
   the image onto the last product in the list that doesn't have a
   photo yet AND isn't already staged — so repeated imprecise drops
   walk backwards up the list on their own.
*/

let miPage = 0;
const MI_PAGE_SIZE = 50;
let miPending = new Map(); // productId -> { file: File|null, url: string|null, previewSrc: string }
let miOrderIds = []; // frozen snapshot of missing-image product ids, captured when the modal opens

// Captures the current order of "no photo yet" products once, so the
// list has a stable backbone for the rest of this session — see note
// above.
function miSnapshotOrder() {
  miOrderIds = allProducts
    .filter(p => !p.image || !p.image.trim())
    .map(p => p.id);
}

function miGetMissingList() {
  const q = (document.getElementById('miSearch').value || '').trim().toLowerCase();
  return miOrderIds
    .map(id => allProducts.find(p => p.id === id))
    .filter(p => p && (!p.image || !p.image.trim())) // drop anything that's actually been saved since
    .filter(p => {
      if (!q) return true;
      const haystack = `${p.partNumber || ''} ${p.brand || ''} ${p.name || ''}`.toLowerCase();
      return haystack.includes(q);
    });
}

function openMissingImagesModal() {
  miPage = 0;
  miPending.clear();
  miSnapshotOrder();
  document.getElementById('miSearch').value = '';
  document.getElementById('missingImagesModal').classList.remove('hidden');
  renderMissingImagesList();
  miAttachGlobalDropHandler();
}
window.openMissingImagesModal = openMissingImagesModal;

function closeMissingImagesModal() {
  document.getElementById('missingImagesModal').classList.add('hidden');
  miDetachGlobalDropHandler();
}
window.closeMissingImagesModal = closeMissingImagesModal;

function renderMissingImagesList() {
  const totalProducts = allProducts.length;
  const missing = miGetMissingList();
  const totalMissing = missing.length;

  const start = miPage * MI_PAGE_SIZE;
  const pageItems = missing.slice(start, start + MI_PAGE_SIZE);

  const totalMissingUnfiltered = allProducts.filter(p => !p.image || !p.image.trim()).length;
  document.getElementById('miProgressLabel').textContent =
    `Searching: ${totalProducts - totalMissingUnfiltered} / ${totalProducts} products have a photo — ${totalMissingUnfiltered} still missing`;

  const list = document.getElementById('miList');
  if (pageItems.length === 0) {
    list.innerHTML = `<div class="text-center py-10 text-slate-500 text-sm">${totalMissing === 0 ? 'Every product matching your search already has a photo. 🎉' : 'No matches.'}</div>`;
  } else {
    list.innerHTML = pageItems.map(p => {
      const query = encodeURIComponent(`${p.partNumber || ''} ${p.name} ${p.brand || ''}`.trim().replace(/\s+/g, ' '));
      const googleImagesUrl = `https://www.google.com/search?tbm=isch&q=${query}`;
      const partSouqUrl = `https://partsouq.com/en/search/all?q=${query}`;
      const staged = miPending.get(p.id);
      return `
      <div class="p-3 flex flex-wrap items-center gap-3 bg-slate-950" data-mi-id="${p.id}">
        <img src="${staged ? staged.previewSrc : ''}" alt="" class="w-10 h-10 rounded object-cover bg-slate-900 border border-slate-800 shrink-0 mi-preview">
        <div class="flex-1 min-w-[160px]">
          <p class="text-sm text-white font-medium truncate">${p.name}</p>
          <p class="text-xs text-slate-500 truncate">${p.partNumber ? 'Part# ' + p.partNumber + ' &middot; ' : ''}${p.brand ? p.brand + ' &middot; ' : ''}${p.category}</p>
          <div class="flex gap-3 mt-1 flex-wrap">
            <a href="${googleImagesUrl}" onclick="return openSideSearchWindow(this.href);" class="text-[11px] text-blue-400 hover:text-blue-300 font-semibold whitespace-nowrap"><i class="fa-brands fa-google mr-1"></i>Google Images</a>
            <a href="${partSouqUrl}" onclick="return openSideSearchWindow(this.href);" class="text-[11px] text-amber-400 hover:text-amber-300 font-semibold whitespace-nowrap"><i class="fa-solid fa-magnifying-glass mr-1"></i>PartSouq</a>
          </div>
        </div>
        ${staged ? `
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1.5 rounded-lg whitespace-nowrap"><i class="fa-solid fa-clock mr-1"></i>Pending</span>
          <button type="button" class="text-slate-400 hover:text-rose-400 p-1.5 mi-unstage-btn" title="Remove this photo before saving"><i class="fa-solid fa-xmark"></i></button>
        </div>` : `
        <div class="flex items-center gap-2 shrink-0">
          <label class="text-xs bg-slate-800 hover:bg-slate-700 text-white font-semibold px-3 py-2 rounded-lg transition cursor-pointer mi-drop-zone" title="Click to browse, or drag an image here from another window">
            <i class="fa-solid fa-upload mr-1"></i> Upload / Drop
            <input type="file" accept="image/*" class="hidden mi-file-input">
          </label>
          <input type="text" placeholder="or paste image URL" class="w-36 px-2 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:border-red-500 outline-none transition mi-url-input">
        </div>`}
      </div>
    `;
    }).join('');

    pageItems.forEach(p => {
      const row = list.querySelector(`[data-mi-id="${p.id}"]`);

      if (miPending.has(p.id)) {
        row.querySelector('.mi-unstage-btn').addEventListener('click', () => miUnstage(p.id));
        return;
      }

      const fileInput = row.querySelector('.mi-file-input');
      const urlInput = row.querySelector('.mi-url-input');
      const dropZone = row.querySelector('.mi-drop-zone');

      fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) miStageFile(p.id, fileInput.files[0]);
      });

      // Drag an image straight out of another window (e.g. the Google
      // Images / PartSouq tab opened via the links above) and drop it
      // here. Depending on browser/OS, dragging an <img> from a webpage
      // sometimes arrives as an actual file, sometimes only as its URL
      // (text/uri-list) — handle both instead of assuming.
      setupDropZone(dropZone, files => {
        const imgFile = [...files].find(f => f.type.startsWith('image/'));
        if (imgFile) miStageFile(p.id, imgFile);
      });
      dropZone.addEventListener('drop', e => {
        const uri = e.dataTransfer && e.dataTransfer.getData('text/uri-list');
        if (uri) miStageUrl(p.id, uri);
      });

      // Staged on Enter or on leaving the field (not on every
      // keystroke) so typing/pasting isn't interrupted mid-way.
      urlInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const url = urlInput.value.trim();
          if (url) miStageUrl(p.id, url);
        }
      });
      urlInput.addEventListener('blur', () => {
        const url = urlInput.value.trim();
        if (url) miStageUrl(p.id, url);
      });
    });
  }

  document.getElementById('miPageLabel').textContent = totalMissing === 0
    ? ''
    : `Showing ${start + 1}\u2013${Math.min(start + MI_PAGE_SIZE, totalMissing)} of ${totalMissing}`;
  document.getElementById('miPrevBtn').disabled = miPage === 0;
  document.getElementById('miNextBtn').disabled = start + MI_PAGE_SIZE >= totalMissing;

  updateMiSaveAllUI();
}

function miPrevPage() {
  if (miPage > 0) { miPage -= 1; renderMissingImagesList(); }
}
window.miPrevPage = miPrevPage;

function miNextPage() {
  miPage += 1;
  renderMissingImagesList();
}
window.miNextPage = miNextPage;

/* ---- Staging a photo onto a row (no network call yet) ---- */

function miStageFile(id, file) {
  const reader = new FileReader();
  reader.onload = ev => {
    miPending.set(id, { file, url: null, previewSrc: ev.target.result });
    renderMissingImagesList();
    miFlashRow(id);
  };
  reader.readAsDataURL(file);
}

function miStageUrl(id, url) {
  miPending.set(id, { file: null, url, previewSrc: url });
  renderMissingImagesList();
  miFlashRow(id);
}

function miUnstage(id) {
  miPending.delete(id);
  renderMissingImagesList();
}

// Briefly highlights + scrolls to a row so an auto-targeted drop is
// obviously confirmed even though it may have landed off-screen.
function miFlashRow(id) {
  const row = document.querySelector(`#miList [data-mi-id="${id}"]`);
  if (!row) return;
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  row.classList.add('ring-2', 'ring-emerald-500');
  setTimeout(() => row.classList.remove('ring-2', 'ring-emerald-500'), 900);
}

function updateMiSaveAllUI() {
  const btn = document.getElementById('miSaveAllBtn');
  const label = document.getElementById('miSaveAllLabel');
  const pendingLabel = document.getElementById('miPendingLabel');
  if (!btn) return;
  const count = miPending.size;
  btn.disabled = count === 0;
  label.textContent = count > 0 ? `Save All (${count})` : 'Save All';
  pendingLabel.textContent = count > 0
    ? `${count} photo${count === 1 ? '' : 's'} ready to save.`
    : 'Drop photos onto the list above — nothing is saved until you click Save All.';
}

/* ---- Auto-targeting: drop anywhere, it lands on the last product
   in the list that still needs a photo and isn't already staged ---- */

function miFindAutoTargetId() {
  const missing = miGetMissingList(); // respects the current search + frozen order
  for (let i = missing.length - 1; i >= 0; i--) {
    if (!miPending.has(missing[i].id)) return missing[i].id;
  }
  return null;
}

function miPageIndexForId(id) {
  const missing = miGetMissingList();
  const idx = missing.findIndex(p => p.id === id);
  return idx === -1 ? null : Math.floor(idx / MI_PAGE_SIZE);
}

function miJumpToPageFor(id) {
  const page = miPageIndexForId(id);
  if (page !== null && page !== miPage) {
    miPage = page;
    renderMissingImagesList();
  }
}

function miGlobalDragOver(e) {
  if (!miPending || document.getElementById('missingImagesModal').classList.contains('hidden')) return;
  e.preventDefault();
}

function miGlobalDrop(e) {
  if (document.getElementById('missingImagesModal').classList.contains('hidden')) return;
  e.preventDefault();

  const targetId = miFindAutoTargetId();
  if (targetId === null) return; // nothing left to target

  const files = e.dataTransfer && e.dataTransfer.files;
  const imgFile = files && [...files].find(f => f.type.startsWith('image/'));
  if (imgFile) {
    miJumpToPageFor(targetId);
    miStageFile(targetId, imgFile);
    return;
  }

  const uri = e.dataTransfer && e.dataTransfer.getData('text/uri-list');
  if (uri) {
    miJumpToPageFor(targetId);
    miStageUrl(targetId, uri);
  }
}

// Attached only while the modal is open, so it never interferes with
// drop zones elsewhere in Admin (e.g. the Add/Edit Product photo
// field). A row's own "Upload / Drop" control still stops this event
// from bubbling here (see setupDropZone), so aiming precisely at a
// specific row's control still targets that exact row — this handler
// only takes over for drops anywhere else.
function miAttachGlobalDropHandler() {
  document.addEventListener('dragover', miGlobalDragOver);
  document.addEventListener('drop', miGlobalDrop);
}
function miDetachGlobalDropHandler() {
  document.removeEventListener('dragover', miGlobalDragOver);
  document.removeEventListener('drop', miGlobalDrop);
}

/* ---- Save All: commits every staged photo in one batch ---- */

async function miSaveAll() {
  const entries = [...miPending.entries()];
  if (entries.length === 0) return;

  const btn = document.getElementById('miSaveAllBtn');
  const label = document.getElementById('miSaveAllLabel');
  btn.disabled = true;

  const failed = [];
  for (let i = 0; i < entries.length; i++) {
    const [id, staged] = entries[i];
    label.textContent = `Saving ${i + 1} of ${entries.length}...`;
    try {
      const imageUrl = staged.file ? await sbUploadImage(staged.file) : await sbFetchExternalImage(staged.url);
      const local = allProducts.find(x => x.id === id);
      if (local) {
        await sbUpdateProduct(id, { ...local, image: imageUrl });
        local.image = imageUrl;
      }
      miPending.delete(id);
    } catch (err) {
      failed.push({ id, message: err.message });
    }
  }

  invalidateProductsCache();
  renderTable();
  renderMissingImagesList(); // saved rows drop off; anything failed stays Pending so you can retry

  if (failed.length > 0) {
    const names = failed.map(f => {
      const p = allProducts.find(x => x.id === f.id);
      return `• ${p ? p.name : 'Product #' + f.id}: ${f.message}`;
    }).join('\n');
    alert(`Saved everything except ${failed.length} photo${failed.length === 1 ? '' : 's'}, which stayed in the list so you can retry:\n\n${names}`);
  }
}
window.miSaveAll = miSaveAll;

/* ---------- Bulk apply one photo to a whole subcategory ---------- */
/*
   Lets you upload (or paste/link) a single photo and stamp it onto
   every product currently in a chosen subcategory — e.g. you don't
   have individual photos for each "Coil Springs" listing yet, so you
   apply one generic coil-spring photo to all of them at once.

   You can always come back later, open a specific product with the
   pencil icon in the table, and upload/paste a photo just for that
   one — a normal single-product edit always overrides whatever the
   bulk tool set, and re-running the bulk tool with a new photo
   simply overwrites again (there's nothing separate to "delete" —
   uploading a new photo, either in bulk or on one product, replaces
   the old one).
*/

function openBulkPhotoModal() {
  bulkPhotoFile = null;
  bulkPhotoSelectedIds = new Set();
  document.getElementById('bpImagePreview').classList.add('hidden');
  document.getElementById('bpImagePreview').src = '';
  document.getElementById('bpImageUrl').value = '';
  document.getElementById('bpImageFile').value = '';
  document.getElementById('bpSearch').value = '';
  populateBulkPhotoCategorySelect();
  updateBulkPhotoSubcategoryOptions();
  document.getElementById('bulkPhotoModal').classList.remove('hidden');
}
window.openBulkPhotoModal = openBulkPhotoModal;

function closeBulkPhotoModal() {
  document.getElementById('bulkPhotoModal').classList.add('hidden');
}
window.closeBulkPhotoModal = closeBulkPhotoModal;

function populateBulkPhotoCategorySelect() {
  const select = document.getElementById('bpCategory');
  if (select.dataset.populated) return;
  CATEGORIES.forEach(cat => {
    select.insertAdjacentHTML('beforeend', `<option value="${cat}">${cat}</option>`);
  });
  select.dataset.populated = '1';
}

// The subcategory dropdown is built from the subcategory values that
// actually exist on your live products right now (not just the master
// CATEGORY_STRUCTURE list) — so it always lines up exactly with what's
// in the database, even if a product's subcategory text is a little
// off from the canonical spelling. This is just a FILTER now — it
// narrows which products show up below, it doesn't apply the photo
// to a whole subcategory by itself. You still tick the exact products
// you want (5, 10, 20, or any number) in the checklist underneath.
function updateBulkPhotoSubcategoryOptions() {
  const cat = document.getElementById('bpCategory').value;
  const select = document.getElementById('bpSubcategory');

  const subsSet = new Set();
  allProducts.forEach(p => {
    if (!p.subcategory) return;
    if (cat !== 'all' && p.category !== cat) return;
    subsSet.add(p.subcategory);
  });
  const subs = [...subsSet].sort();

  select.innerHTML = '<option value="all">All Subcategories</option>' +
    subs.map(s => `<option value="${s.replace(/"/g, '&quot;')}">${s}</option>`).join('');
  renderBulkPhotoProductList();
}

// Products currently visible in the checklist based on the
// Category / Subcategory / Search filters — NOT the same as which
// products are selected to receive the photo.
function bulkPhotoFilteredProducts() {
  const cat = document.getElementById('bpCategory').value;
  const sub = document.getElementById('bpSubcategory').value;
  const q = document.getElementById('bpSearch').value.trim().toLowerCase();

  return allProducts.filter(p => {
    if (cat !== 'all' && p.category !== cat) return false;
    if (sub !== 'all' && p.subcategory !== sub) return false;
    if (q) {
      const haystack = `${p.name} ${p.brand || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// Renders the checklist of filtered products. Selection state
// (bulkPhotoSelectedIds) persists across re-filtering, so you can
// narrow the list, tick a few, narrow again, and tick more — the
// earlier ticks stay checked even once they scroll out of view.
function renderBulkPhotoProductList() {
  const listEl = document.getElementById('bpProductList');
  const filtered = bulkPhotoFilteredProducts();

  if (filtered.length === 0) {
    listEl.innerHTML = `<p class="text-xs text-slate-500 p-4 text-center">No products match these filters.</p>`;
  } else {
    listEl.innerHTML = filtered.map(p => `
      <label class="flex items-center gap-3 px-3 py-2 hover:bg-slate-800/60 cursor-pointer">
        <input type="checkbox" data-product-id="${p.id}" ${bulkPhotoSelectedIds.has(p.id) ? 'checked' : ''} class="w-4 h-4 accent-emerald-600 shrink-0">
        <img src="${p.image}" alt="" class="w-9 h-9 rounded object-cover bg-slate-800 border border-slate-700 shrink-0">
        <span class="flex-1 min-w-0">
          <span class="block text-xs text-white truncate">${p.brand ? p.brand + ' — ' : ''}${p.name}</span>
          <span class="block text-[11px] text-slate-500 truncate">${p.subcategory || p.category}</span>
        </span>
      </label>
    `).join('');
  }

  updateBulkPhotoMatchCount();
}

function bulkPhotoSelectAllVisible() {
  bulkPhotoFilteredProducts().forEach(p => bulkPhotoSelectedIds.add(p.id));
  renderBulkPhotoProductList();
}
window.bulkPhotoSelectAllVisible = bulkPhotoSelectAllVisible;

function bulkPhotoClearSelection() {
  bulkPhotoSelectedIds.clear();
  renderBulkPhotoProductList();
}
window.bulkPhotoClearSelection = bulkPhotoClearSelection;

function bulkPhotoMatches() {
  return allProducts.filter(p => bulkPhotoSelectedIds.has(p.id));
}

function updateBulkPhotoMatchCount() {
  const countEl = document.getElementById('bpMatchCount');
  const count = bulkPhotoSelectedIds.size;
  countEl.textContent = count > 0
    ? `This will set the photo on the ${count} product${count === 1 ? '' : 's'} you've selected.`
    : 'Tick the products above that should get this photo.';
}

function applyBulkImageFile(file) {
  bulkPhotoFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('bpImagePreview').src = ev.target.result;
    document.getElementById('bpImagePreview').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

async function applyBulkPhoto() {
  const urlInput = document.getElementById('bpImageUrl').value.trim();
  if (!bulkPhotoFile && !urlInput) { alert('Add a photo — upload a file, drag one in, paste it, or paste an image URL.'); return; }

  const matches = bulkPhotoMatches();
  if (matches.length === 0) { alert('Tick at least one product in the list first.'); return; }

  if (!confirm(`Set this photo on the ${matches.length} selected product${matches.length === 1 ? '' : 's'}? This replaces their current photos.`)) return;

  const btn = document.getElementById('bpApplyBtn');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Applying...';

  try {
    // Upload once, reuse the same resulting URL for every matching product.
    let imageUrl = urlInput;
    if (bulkPhotoFile) {
      imageUrl = await sbUploadImage(bulkPhotoFile);
    }

    await Promise.all(matches.map(p => sbUpdateProduct(p.id, { ...p, image: imageUrl })));

    await refreshProducts();
    closeBulkPhotoModal();
    alert(`Done — updated the photo on ${matches.length} selected product${matches.length === 1 ? '' : 's'}.`);
  } catch (err) {
    alert('Could not apply this photo to the selected products.\n\n' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}
window.applyBulkPhoto = applyBulkPhoto;

/* ---------- Auto-Fix Categories ---------- */

// Keyword fallback for products whose Subcategory is missing/unrecognized
// (so resolveSubcategory() in products.js can't fix them) AND whose
// Category text doesn't exactly match a canonical category either — e.g.
// products imported with "Battery" or "Tyre" typed as the category, which
// the old bulk-upload bug silently filed under the wrong category. Each
// entry is checked in order against the product's name + brand +
// description; the first match wins. Keep these terms unambiguous —
// don't add generic words like "wheel" (matches Wheel Bearings too).
const CATEGORY_KEYWORD_RULES = [
  { category: 'Car Batteries', terms: ['battery', 'batteries'] },
  { category: 'Tyres', terms: ['tyre', 'tyres', 'tire', 'tires'] },
];

function guessCategoryFromKeywords(product) {
  const haystack = `${product.name} ${product.brand || ''} ${product.description || ''}`.toLowerCase();
  for (const rule of CATEGORY_KEYWORD_RULES) {
    if (rule.terms.some(t => haystack.includes(t))) return rule.category;
  }
  return null;
}

// Scans every product in the database (not just what's loaded/cached) and
// works out its correct category:
//   1. If its Subcategory is a recognized one (e.g. "Coil Springs"), that
//      always wins — the category is corrected to match, same logic the
//      live site already uses for display, except this SAVES it back to
//      Supabase instead of just fixing it in memory for one page view.
//   2. Otherwise, if its name/brand/description contains an unambiguous
//      keyword (e.g. "battery", "tyre"), file it under that category.
//   3. Otherwise, leave it alone — nothing is guessed if there's no
//      reasonably confident signal.
// Only products whose corrected category differs from what's saved are
// updated. Shows a summary of every change made.
async function autoFixCategories(btn) {
  if (!confirm('Scan every product and automatically fix any filed under the wrong category? This updates your live database directly.')) return;

  const originalLabel = btn ? btn.innerHTML : null;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Scanning...';
  }

  try {
    invalidateProductsCache();
    const rows = await sbGetProducts(); // raw, unnormalized — what's actually saved

    const fixes = [];
    rows.forEach(p => {
      let correctedCategory = null;
      let correctedSubcategory = p.subcategory;

      const subMatch = p.subcategory && resolveSubcategory(p.subcategory);
      if (subMatch) {
        correctedCategory = subMatch.category;
        correctedSubcategory = subMatch.subcategory;
      } else if (!CATEGORIES.includes(p.category)) {
        // Category text itself isn't even a recognized category name —
        // try a keyword-based guess.
        correctedCategory = guessCategoryFromKeywords(p);
      }

      if (correctedCategory && (correctedCategory !== p.category || correctedSubcategory !== p.subcategory)) {
        fixes.push({
          id: p.id,
          name: p.name,
          from: `${p.category}${p.subcategory ? ' / ' + p.subcategory : ''}`,
          to: `${correctedCategory}${correctedSubcategory ? ' / ' + correctedSubcategory : ''}`,
          product: { ...p, category: correctedCategory, subcategory: correctedSubcategory }
        });
      }
    });

    if (fixes.length === 0) {
      alert('Scanned every product — nothing needed fixing. All categories already match a recognized category/subcategory.');
      return;
    }

    await Promise.all(fixes.map(f => sbUpdateProduct(f.id, f.product)));
    await refreshProducts();

    let msg = `Fixed ${fixes.length} product${fixes.length === 1 ? '' : 's'}:\n\n` +
      fixes.slice(0, 25).map(f => `"${f.name}": ${f.from}  →  ${f.to}`).join('\n');
    if (fixes.length > 25) msg += `\n...and ${fixes.length - 25} more`;
    alert(msg);
  } catch (err) {
    alert('Could not auto-fix categories.\n\n' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalLabel;
    }
  }
}
window.autoFixCategories = autoFixCategories;

/* ---------- Export backup ---------- */

function exportProducts() {
  const blob = new Blob([JSON.stringify(allProducts, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `products-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
window.exportProducts = exportProducts;

/* ---------- Delete All Images ---------- */
/*
   Wipes every photo off the live site: deletes every file sitting
   in the product-images storage bucket, then clears the "image"
   field on every product and every category tile so nothing points
   at a now-deleted file. Nothing else is touched — no product,
   name, price, category, or description is added, changed, or
   removed. Products simply go back to showing their placeholder
   icon instead of a photo, exactly like a brand-new product that
   hasn't had a photo added yet.
*/
async function deleteAllImages(btn) {
  const sure = confirm(
    'Delete EVERY image on the site?\n\n' +
    'This removes every uploaded photo from storage and clears the photo ' +
    'off every product and every category tile. Products themselves are ' +
    'NOT deleted — only their photos. This cannot be undone.'
  );
  if (!sure) return;

  const originalLabel = btn ? btn.innerHTML : null;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';
  }

  // Each step below only ever touches the `image` column (or storage
  // files) — never name, brand, category, price, or description — and
  // each step is wrapped independently so a failure in one (e.g. a
  // missing storage delete permission) can't stop the others from
  // completing. That way "Delete All Images" always clears every photo
  // reference it possibly can, even if actual file deletion from
  // storage fails.
  let filesDeletedCount = 0;
  let storageError = null;
  let productsCleared = false;
  let productsError = null;
  let categoriesCleared = false;

  // 1) Delete the actual uploaded files from storage.
  try {
    const files = await sbListAllImages();
    if (files.length > 0) {
      await sbDeleteImages(files);
    }
    filesDeletedCount = files.length;
  } catch (e) {
    storageError = e;
    console.warn('Could not delete files from storage.', e);
  }

  // 2) Clear the image field on every product (products stay put —
  //    name/brand/category/price/description are untouched).
  try {
    await sbClearAllProductImages();
    productsCleared = true;
  } catch (e) {
    productsError = e;
    console.warn('Could not clear product image fields.', e);
  }

  // 3) Clear category tile photos too, if that table exists yet.
  try {
    await sbClearAllCategoryImages();
    categoriesCleared = true;
  } catch (e) {
    console.warn('Skipped clearing category tile images (table may not exist yet).', e);
  }

  invalidateProductsCache();
  await refreshProducts();

  try {
    let msg = productsCleared
      ? `Done. Cleared the photo field on every product${categoriesCleared ? ' and every category tile' : ''}. All product names, prices, and descriptions are untouched.`
      : `Could not clear product photo fields.\n\n${productsError ? productsError.message : ''}`;

    if (storageError) {
      const hint = /401|403|permission|rls|policy/i.test(storageError.message)
        ? ' This is usually because the storage bucket is missing its DELETE policy — see the "Public can delete product images" policy in SUPABASE_SETUP.md, step 4.'
        : '';
      msg += `\n\nHowever, the uploaded photo files themselves could NOT be deleted from storage (they'll no longer show anywhere on the site, but still take up storage space).${hint}\n\n(${storageError.message})`;
    } else {
      msg += `\n\nDeleted ${filesDeletedCount} uploaded photo${filesDeletedCount === 1 ? '' : 's'} from storage.`;
    }

    alert(msg);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalLabel;
    }
  }
}
window.deleteAllImages = deleteAllImages;

/* ---------- Bulk upload (XLSX / CSV) ---------- */

async function processBulkFile(file) {
  try {
    const defaultCategory = document.getElementById('pCategory').value;
    const defaultSubcategory = document.getElementById('pSubcategory').value.trim();

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // Normalizes a header/cell for comparison: lowercase, trim, and
    // strip all spaces/punctuation, so "Product Name", "product_name",
    // "PRODUCT-NAME" and "ProductName" are all treated as identical.
    const normalizeHeader = (s) => (s === null || s === undefined ? '' : s.toString()).trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    const NAME_ALIASES = ['name', 'product', 'productname', 'part', 'partname', 'item', 'itemname', 'title', 'partdescription'];
    const PRICE_ALIASES = ['price', 'sellingprice', 'unitprice', 'cost', 'amount', 'rate', 'retailprice'];

    // Some real-world spreadsheets have a title/logo row (or a blank
    // row) above the actual column headers. Scan the first several
    // rows for the first one that looks like a real header row — i.e.
    // it has a cell matching a Name alias AND a cell matching a Price
    // alias — and use that as the header row instead of always
    // assuming row 1 is it.
    const rawGrid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rawGrid.length === 0) {
      alert('That file has no rows to import.');
      return;
    }
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(10, rawGrid.length); i++) {
      const normCells = (rawGrid[i] || []).map(normalizeHeader);
      const hasName = normCells.some(c => NAME_ALIASES.includes(c));
      const hasPrice = normCells.some(c => PRICE_ALIASES.includes(c));
      if (hasName && hasPrice) { headerRowIndex = i; break; }
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: '' });

    if (rows.length === 0) {
      alert('That file has a header row but no data rows underneath it to import.');
      return;
    }

    // Best-effort: pull any pictures embedded/pasted directly into
    // the workbook (xl/media/*) and hand them out, in order, to
    // rows that don't already have an Image column value.
    let embeddedImageUrls = [];
    try {
      embeddedImageUrls = await extractEmbeddedImages(file);
    } catch (imgErr) {
      console.warn('Could not extract embedded images from the file.', imgErr);
    }
    let embeddedIndex = 0;

    // Recognizing a Subcategory (e.g. "Coil Springs", or messy variants
    // like "coil-spring" / "Coil  Springs ") tells us the right Category
    // ("Suspension Parts") even if the file's Category column is missing,
    // blank, or worded differently — see resolveSubcategory() in products.js.
    const canonicalCategoryByLower = {};
    CATEGORIES.forEach(c => { canonicalCategoryByLower[c.toLowerCase()] = c; });

    const getField = (row, ...names) => {
      const normNames = names.map(normalizeHeader);
      for (const key of Object.keys(row)) {
        if (normNames.includes(normalizeHeader(key))) {
          const v = row[key];
          return typeof v === 'string' ? v.trim() : v;
        }
      }
      return '';
    };

    // Strips currency symbols, thousands separators, and stray text
    // from a price cell (e.g. "KES 6,000", "Ksh. 6000/=", " 6000 ")
    // down to a plain number. Returns NaN if nothing numeric is left.
    const parsePrice = (raw) => {
      if (raw === '' || raw === null || raw === undefined) return NaN;
      if (typeof raw === 'number') return raw;
      const cleaned = raw.toString().replace(/[^0-9.\-]/g, '');
      return cleaned === '' ? NaN : Number(cleaned);
    };

    const toImport = [];
    const skipped = [];
    const recategorized = [];

    rows.forEach((row, i) => {
      const name = getField(row, 'Name', 'Product', 'Product Name', 'Part', 'Part Name', 'Item', 'Item Name', 'Title');
      const priceRaw = getField(row, 'Price', 'Selling Price', 'Unit Price', 'Cost', 'Amount', 'Rate', 'Retail Price');
      const price = parsePrice(priceRaw);

      if (!name && (priceRaw === '' || priceRaw === undefined)) {
        skipped.push(`Row ${i + headerRowIndex + 2}: this row looks empty (no name or price found)`);
        return;
      }
      if (!name) {
        skipped.push(`Row ${i + headerRowIndex + 2}: missing a product name`);
        return;
      }
      if (priceRaw === '' || priceRaw === undefined) {
        skipped.push(`Row ${i + headerRowIndex + 2} ("${name}"): missing a price`);
        return;
      }
      if (isNaN(price)) {
        skipped.push(`Row ${i + headerRowIndex + 2} ("${name}"): price "${priceRaw}" isn't a valid number`);
        return;
      }

      const rawCategory = getField(row, 'Category', 'Type', 'Section');
      const rawSubcategory = getField(row, 'Subcategory', 'Sub-category', 'Sub Category', 'SubCategory');

      let category = '';
      let subcategory = '';

      // 1. A recognized subcategory always wins — it uniquely identifies
      //    the category, so "Coil Springs" correctly lands under
      //    Suspension Parts even with no/blank Category column, and even
      //    if the file's Category column says something else entirely.
      const subMatch = rawSubcategory && resolveSubcategory(rawSubcategory);
      if (subMatch) {
        category = subMatch.category;
        subcategory = subMatch.subcategory;
      } else if (rawCategory && canonicalCategoryByLower[rawCategory.trim().toLowerCase()]) {
        category = canonicalCategoryByLower[rawCategory.trim().toLowerCase()];
        subcategory = rawSubcategory || '';
      } else if (rawCategory) {
        // Category cell has a value, but it's not one we recognize.
        // Rather than silently dropping the whole row, file it under
        // whatever was picked above the upload button and keep going —
        // a mismatched category shouldn't block a valid product import.
        // BUT: this is exactly the "silently wrong" case the help text
        // warns about, so we record it and report it after the upload
        // instead of saying nothing.
        category = defaultCategory;
        subcategory = rawSubcategory || defaultSubcategory;
        recategorized.push(`"${name}": category "${rawCategory}" didn't match any existing category — filed under "${defaultCategory}" instead.`);
      } else {
        // Nothing usable in the row itself — fall back to whatever
        // was picked above the upload button.
        category = defaultCategory;
        subcategory = rawSubcategory || defaultSubcategory;
      }

      const originalPriceRaw = getField(row, 'OriginalPrice', 'Original Price');
      const originalPrice = parsePrice(originalPriceRaw);

      let image = getField(row, 'Image', 'Image URL', 'Photo', 'Picture');
      if (!image && embeddedIndex < embeddedImageUrls.length) {
        image = embeddedImageUrls[embeddedIndex];
        embeddedIndex += 1;
      }

      toImport.push({
        name,
        partNumber: getField(row, 'Part Number', 'PartNumber', 'Part No', 'PartNo', 'SKU', 'MPN', 'OE Number', 'OENumber'),
        brand: getField(row, 'Brand', 'Make', 'Manufacturer'),
        price,
        originalPrice: isNaN(originalPrice) ? null : originalPrice,
        category,
        subcategory,
        description: getField(row, 'Description', 'Details'),
        image
      });
    });

    if (toImport.length === 0) {
      const headers = Object.keys(rows[0] || {});
      alert(
        'No rows could be imported.\n\n' +
        (skipped[0] || '') +
        (skipped.length > 1 ? `\n(and ${skipped.length - 1} more similar issue${skipped.length - 1 === 1 ? '' : 's'})` : '') +
        `\n\nColumns detected in your file: ${headers.length ? headers.join(', ') : '(none found)'}\n\n` +
        'Make sure your file has a column for the product name (e.g. "Name") and a column for the price (e.g. "Price"), with the header text in the very first row of data.'
      );
      return;
    }

    // Match against products already on the site by name (case/space
    // insensitive) so re-uploading the same file — e.g. after filling
    // in Image links you didn't have the first time — updates the
    // existing product instead of creating a duplicate.
    const existingByName = new Map();
    allProducts.forEach(p => existingByName.set(p.name.trim().toLowerCase(), p));

    const toInsert = [];
    const toUpdate = [];
    const autoHidden = [];
    toImport.forEach(product => {
      const existing = existingByName.get(product.name.trim().toLowerCase());
      if (existing) {
        toUpdate.push({ id: existing.id, product });
      } else {
        const hideReason = getAutoHideReason(product);
        if (hideReason) {
          product.active = false;
          autoHidden.push(`"${product.name}": ${hideReason}`);
        }
        toInsert.push(product);
      }
    });

    if (toInsert.length > 0) await sbInsertProducts(toInsert);
    if (toUpdate.length > 0) await Promise.all(toUpdate.map(u => sbUpdateProduct(u.id, u.product)));

    await refreshProducts();
    closeProductModal();

    let msg = '';
    if (toInsert.length > 0) msg += `Added ${toInsert.length} new product${toInsert.length === 1 ? '' : 's'}.\n`;
    if (toUpdate.length > 0) msg += `Updated ${toUpdate.length} existing product${toUpdate.length === 1 ? '' : 's'} (matched by name) — no duplicates created.\n`;
    if (autoHidden.length > 0) {
      msg += `\n\n🙈 ${autoHidden.length} new product${autoHidden.length === 1 ? '' : 's'} matched your always-hide rules and ${autoHidden.length === 1 ? 'was' : 'were'} saved hidden (not shown on the live site or in this Admin list). Find and un-hide them from cleanup-products.html if any of these were wrong:\n` + autoHidden.slice(0, 15).join('\n');
      if (autoHidden.length > 15) msg += `\n...and ${autoHidden.length - 15} more`;
    }
    if (recategorized.length > 0) {
      msg += `\n\n⚠️ ${recategorized.length} row(s) had a Category that didn't match any existing category and were filed under "${defaultCategory}" instead:\n` + recategorized.slice(0, 15).join('\n');
      if (recategorized.length > 15) msg += `\n...and ${recategorized.length - 15} more`;
      msg += `\n\nGo to those products and fix their Category if "${defaultCategory}" isn't right.`;
    }
    if (skipped.length > 0) {
      msg += `\n\nSkipped ${skipped.length} row(s):\n` + skipped.slice(0, 15).join('\n');
      if (skipped.length > 15) msg += `\n...and ${skipped.length - 15} more`;
    }
    alert(msg);
  } catch (err) {
    alert('Could not process that file.\n\n' + err.message);
  }
}

// Reads pictures pasted directly into a workbook's cells (stored
// inside xl/media/*) and uploads each one to Supabase Storage,
// returning their public URLs in the same order they appear in
// the file. This is a best-effort match — if you need a picture
// tied to an exact row, use the Image URL column instead.
async function extractEmbeddedImages(file) {
  if (typeof JSZip === 'undefined') return [];
  const zip = await JSZip.loadAsync(file);
  const mediaFiles = Object.keys(zip.files)
    .filter(name => /^xl\/media\//.test(name))
    .sort();

  const urls = [];
  for (const name of mediaFiles) {
    const blob = await zip.files[name].async('blob');
    const ext = name.split('.').pop();
    const asFile = new File([blob], name.split('/').pop(), { type: blob.type || `image/${ext}` });
    const url = await sbUploadImage(asFile);
    urls.push(url);
  }
  return urls;
}
