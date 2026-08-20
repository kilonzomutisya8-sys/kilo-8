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

/* ---------- Download printable product catalog (PDF) ---------- */
/*
   A simple printable list: every product's name, part number, brand,
   and category/subcategory (the closest thing this catalogue has to
   a "car make" — e.g. German Parts products are filed under a
   subcategory like "BMW Parts" or "Mercedes-Benz Parts"). No prices,
   photos, or descriptions — just enough to skim or hand to someone
   over the counter. Includes every product (including ones hidden
   from the live site), sorted alphabetically by name.
*/
function exportCatalogPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('The PDF library failed to load (check your internet connection) — try refreshing the page and again.');
    return;
  }
  if (!allProducts || allProducts.length === 0) {
    alert('No products to export yet.');
    return;
  }

  const rows = allProducts
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p, i) => [
      i + 1,
      p.name || '',
      p.partNumber || '—',
      p.brand || '—',
      p.subcategory || p.category || '—'
    ]);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('Kilo Auto Spares Ltd — Product Catalog', 40, 40);
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text(`Generated ${new Date().toLocaleDateString()} — ${rows.length} products — Witu Rd, Brunei House, Nairobi`, 40, 56);

  doc.autoTable({
    startY: 72,
    head: [['#', 'Product Name', 'Part Number', 'Brand', 'Category / Make']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 26, halign: 'right' },
      1: { cellWidth: 190 },
      2: { cellWidth: 90 },
      3: { cellWidth: 90 },
      4: { cellWidth: 110 }
    },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${pageCount}`, doc.internal.pageSize.getWidth() - 80, doc.internal.pageSize.getHeight() - 20);
    }
  });

  doc.save(`kilo-auto-spares-catalog-${new Date().toISOString().slice(0, 10)}.pdf`);
}
window.exportCatalogPDF = exportCatalogPDF;

/* ---------- Bulk upload (XLSX / CSV) ---------- */

async function processBulkFile(file) {
  try {
    const defaultCategory = document.getElementById('pCategory').value;
    const defaultSubcategory = document.getElementById('pSubcategory').value.trim();

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    // Normalizes a header/cell for comparison: lowercase, trim, and
    // strip all spaces/punctuation, so "Product Name", "product_name",
    // "PRODUCT-NAME" and "ProductName" are all treated as identical.
    const normalizeHeader = (s) => (s === null || s === undefined ? '' : s.toString()).trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    const NAME_ALIASES = ['name', 'product', 'productname', 'part', 'partname', 'item', 'itemname', 'title', 'partdescription'];
    const PRICE_ALIASES = ['price', 'sellingprice', 'unitprice', 'cost', 'amount', 'rate', 'retailprice'];

    // Workbooks sometimes have every product on one sheet, but they can
    // also be organized with one sheet per category (e.g. "Air Filters",
    // "Brake Pads", "Fan Belt"...) — that's a normal way to lay out a
    // parts catalog. Reading only the first sheet would silently drop
    // every other tab, so every sheet in the workbook is scanned and
    // their rows combined into one list before anything is imported.
    const rows = [];
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];

      // Some real-world spreadsheets have a title/logo row (or a blank
      // row) above the actual column headers. Scan the first several
      // rows for the first one that looks like a real header row — i.e.
      // it has a cell matching a Name alias AND a cell matching a Price
      // alias — and use that as the header row instead of always
      // assuming row 1 is it.
      const rawGrid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (rawGrid.length === 0) return; // empty sheet/tab — nothing to read

      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(10, rawGrid.length); i++) {
        const normCells = (rawGrid[i] || []).map(normalizeHeader);
        const hasName = normCells.some(c => NAME_ALIASES.includes(c));
        const hasPrice = normCells.some(c => PRICE_ALIASES.includes(c));
        if (hasName && hasPrice) { headerRowIndex = i; break; }
      }
      if (headerRowIndex === -1) return; // this sheet has no Name+Price header row — skip it, not an error

      const sheetRows = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: '' });
      sheetRows.forEach((row, i) => {
        // Tag each row with where it came from so skip/error messages
        // below can point back to the right sheet and row number,
        // even though rows from every sheet are now processed together.
        row.__rowLabel = workbook.SheetNames.length > 1
          ? `Sheet "${sheetName}", row ${i + headerRowIndex + 2}`
          : `Row ${i + headerRowIndex + 2}`;
        rows.push(row);
      });
    });

    if (rows.length === 0) {
      alert('No sheet in that file has both a product-name column and a price column with data underneath it, so nothing could be imported.');
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

    rows.forEach((row) => {
      const rowLabel = row.__rowLabel || 'Row';
      const name = getField(row, 'Name', 'Product', 'Product Name', 'Part', 'Part Name', 'Item', 'Item Name', 'Title');
      const priceRaw = getField(row, 'Price', 'Selling Price', 'Unit Price', 'Cost', 'Amount', 'Rate', 'Retail Price');
      const price = parsePrice(priceRaw);

      if (!name && (priceRaw === '' || priceRaw === undefined)) {
        skipped.push(`${rowLabel}: this row looks empty (no name or price found)`);
        return;
      }
      if (!name) {
        skipped.push(`${rowLabel}: missing a product name`);
        return;
      }
      if (priceRaw === '' || priceRaw === undefined) {
        skipped.push(`${rowLabel} ("${name}"): missing a price`);
        return;
      }
      if (isNaN(price)) {
        skipped.push(`${rowLabel} ("${name}"): price "${priceRaw}" isn't a valid number`);
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
      const headers = Object.keys(rows[0] || {}).filter(k => k !== '__rowLabel');
      alert(
        'No rows could be imported.\n\n' +
        (skipped[0] || '') +
        (skipped.length > 1 ? `\n(and ${skipped.length - 1} more similar issue${skipped.length - 1 === 1 ? '' : 's'})` : '') +
        `\n\nColumns detected in your file: ${headers.length ? headers.join(', ') : '(none found)'}\n\n` +
        'Make sure your file has a column for the product name (e.g. "Name") and a column for the price (e.g. "Price"), with the header text in the very first row of data.'
      );
      return;
    }

    // Sort the incoming rows alphabetically by name before anything
    // else, so duplicates that only differ in row order still end up
    // next to each other and the import/skip messages read in a
    // predictable, easy-to-scan order.
    toImport.sort((a, b) => a.name.trim().toLowerCase().localeCompare(b.name.trim().toLowerCase()));

    // Match against products already on the site — by normalized name
    // (ignoring case, spacing and punctuation, so "NT30(KD1735)" and
    // "NT30 (KD1735)" count as the same product) AND by part number
    // (also punctuation/case-insensitive), whichever matches first.
    // This catches near-duplicates, not just character-for-character
    // identical names. Anything that matches — on the site, or
    // repeated earlier in this same file — is treated as a duplicate
    // and is NOT written to the site at all (no insert, no update).
    const existingByName = new Map();
    const existingByPartNo = new Map();
    allProducts.forEach(p => {
      const nameKey = idNormalizeText(p.name);
      if (nameKey) existingByName.set(nameKey, p);
      const pnKey = idNormalizePartNo(p.partNumber);
      if (pnKey) existingByPartNo.set(pnKey, p);
    });

    const seenNameInFile = new Set();
    const seenPartNoInFile = new Set();
    const toInsert = [];
    const duplicates = [];
    const autoHidden = [];
    toImport.forEach(product => {
      const nameKey = idNormalizeText(product.name);
      const pnKey = idNormalizePartNo(product.partNumber);

      const existingMatch = (pnKey && existingByPartNo.get(pnKey)) || existingByName.get(nameKey);
      if (existingMatch) {
        const via = pnKey && existingByPartNo.get(pnKey) ? `part number "${product.partNumber}"` : 'name';
        duplicates.push(`"${product.name}": matches "${existingMatch.name}" already on the site (by ${via}) — skipped, not added.`);
        return;
      }
      if ((pnKey && seenPartNoInFile.has(pnKey)) || seenNameInFile.has(nameKey)) {
        duplicates.push(`"${product.name}": appears more than once in this file (same name or part number) — only the first one was kept.`);
        return;
      }
      seenNameInFile.add(nameKey);
      if (pnKey) seenPartNoInFile.add(pnKey);

      const hideReason = getAutoHideReason(product);
      if (hideReason) {
        product.active = false;
        autoHidden.push(`"${product.name}": ${hideReason}`);
      }
      toInsert.push(product);
    });

    if (toInsert.length > 0) await sbInsertProducts(toInsert);

    await refreshProducts();
    closeProductModal();

    let msg = '';
    if (toInsert.length > 0) msg += `Added ${toInsert.length} new product${toInsert.length === 1 ? '' : 's'} (each with its name and description).\n`;
    if (duplicates.length > 0) {
      msg += `\n\n🚫 ${duplicates.length} duplicate row(s) were refused and NOT added to the site:\n` + duplicates.slice(0, 15).join('\n');
      if (duplicates.length > 15) msg += `\n...and ${duplicates.length - 15} more`;
    }
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

/* =========================================================
   Import Descriptions from PDF
   ---------------------------------------------------------
   Reads a PDF where every product is laid out like:

       12. Product Title Here
       Part No. ABC123
       Brand Some Brand
       Category Some Category
       Fits Some Vehicle
       A paragraph of description text...

   (exactly what the "Download Catalog" companion tool / a
   generated product-description catalog produces), matches each
   entry to a product already in the catalogue by part number or
   name, and lets you review every match before anything is
   saved. Only the `description` field is ever touched — nothing
   else about a product (name, price, image, category) changes.
   ========================================================= */

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.worker.min.js';
}

let idEntries = [];       // parsed PDF entries: { num, title, partNo, brand, category, fits, description }
let idMatches = new Map(); // entry num -> { productId: number|null, confidence: 'partno'|'exact'|'fuzzy'|'none', selected: boolean }
let idPage = 0;
const ID_PAGE_SIZE = 25;
let idComboOpenFor = null; // entry num currently showing the "change match" search dropdown

function openImportDescModal() {
  idEntries = [];
  idMatches = new Map();
  idPage = 0;
  document.getElementById('idUploadStep').classList.remove('hidden');
  document.getElementById('idReviewStep').classList.add('hidden');
  document.getElementById('idUploadError').classList.add('hidden');
  document.getElementById('idStatusLabel').textContent = 'Upload a PDF to begin.';
  document.getElementById('idFileInput').value = '';
  document.getElementById('importDescModal').classList.remove('hidden');
}
window.openImportDescModal = openImportDescModal;

function closeImportDescModal() {
  document.getElementById('importDescModal').classList.add('hidden');
}
window.closeImportDescModal = closeImportDescModal;

/* ---- Step 1: read + parse the PDF ---- */

async function idHandlePdfFile(file) {
  const errEl = document.getElementById('idUploadError');
  errEl.classList.add('hidden');

  if (!file || file.type !== 'application/pdf') {
    errEl.textContent = 'That doesn\'t look like a PDF — please choose a .pdf file.';
    errEl.classList.remove('hidden');
    return;
  }
  if (typeof pdfjsLib === 'undefined') {
    errEl.textContent = 'The PDF reader library failed to load (check your internet connection) — try refreshing the page and again.';
    errEl.classList.remove('hidden');
    return;
  }

  document.getElementById('idStatusLabel').textContent = 'Reading PDF…';

  try {
    const text = await idExtractPdfText(file);
    const entries = idParseDescriptionsText(text);
    if (entries.length === 0) {
      errEl.textContent = 'Couldn\'t find any product entries in that PDF. It needs a "Part No." line under each product title, same as the generated description catalog format.';
      errEl.classList.remove('hidden');
      document.getElementById('idStatusLabel').textContent = 'Upload a PDF to begin.';
      return;
    }

    document.getElementById('idStatusLabel').textContent = 'Matching against your catalogue…';
    idEntries = entries;
    idMatches = new Map();
    const indexes = idBuildProductIndexes();
    idEntries.forEach(entry => {
      const result = idMatchEntry(entry, indexes);
      idMatches.set(entry.num, { productId: result.product ? result.product.id : null, confidence: result.confidence, selected: result.confidence === 'partno' || result.confidence === 'exact' });
    });

    idPage = 0;
    document.getElementById('idUploadStep').classList.add('hidden');
    document.getElementById('idReviewStep').classList.remove('hidden');
    idRenderReview();
  } catch (err) {
    errEl.textContent = 'Could not read that PDF.\n\n' + err.message;
    errEl.classList.remove('hidden');
    document.getElementById('idStatusLabel').textContent = 'Upload a PDF to begin.';
  }
}

// Extracts text page by page, inserting a newline whenever the
// vertical position jumps (i.e. a new line of text on the page),
// which approximates how the source PDF was laid out — needed
// because the parser below relies on each field sitting on its
// own line.
async function idExtractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY = null;
    let pageText = '';
    content.items.forEach(item => {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        pageText += '\n';
      } else if (lastY !== null) {
        pageText += ' ';
      }
      pageText += item.str;
      lastY = y;
    });
    fullText += pageText + '\n';
  }
  return fullText;
}

// Parses text laid out as repeating blocks of:
//   N. Title (may wrap onto more than one line)
//   Part No. ...
//   Brand ...
//   Category ...
//   Fits ...
//   Description paragraph...
// Entry numbers are required to be strictly sequential (1, 2, 3...)
// so that a stray "2010." or similar mid-sentence number inside a
// description paragraph is never mistaken for a new entry — it's
// simply skipped because it doesn't continue the sequence.
function idParseDescriptionsText(text) {
  text = text.replace(/\r\n/g, '\n');

  const candidateRe = /^(\d+)\.\s/gm;
  const candidates = [];
  let m;
  while ((m = candidateRe.exec(text)) !== null) {
    candidates.push({ pos: m.index, num: parseInt(m[1], 10) });
  }

  const boundaries = [];
  let expected = 1;
  candidates.forEach(c => {
    if (c.num === expected) { boundaries.push(c.pos); expected += 1; }
  });

  const fieldRe = /^\d+\.\s+([\s\S]+?)\nPart No\.\s*([^\n]+)\nBrand\s*([^\n]+)\nCategory\s*([^\n]+)\nFits\s*([^\n]+)\n([\s\S]*)$/;

  const entries = [];
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i];
    const end = i + 1 < boundaries.length ? boundaries[i + 1] : text.length;
    const block = text.slice(start, end);
    const fm = fieldRe.exec(block);
    if (!fm) continue;
    entries.push({
      num: i + 1,
      title: fm[1].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(),
      partNo: fm[2].trim(),
      brand: fm[3].trim(),
      category: fm[4].trim(),
      fits: fm[5].trim(),
      description: idCleanDescription(fm[6])
    });
  }
  return entries;
}

// Strips a trailing subcategory-heading line that belongs to the
// NEXT entry (e.g. "Steering Tie Rod End") which otherwise ends up
// stuck onto this entry's description because it sits right before
// the next numbered title with no blank-line separator. Real
// description text always ends in sentence punctuation; a stray
// heading line doesn't.
function idCleanDescription(desc) {
  const lines = desc.replace(/^\n+|\n+$/g, '').split('\n');
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (/[.!?]\s*$/.test(last) || last.length >= 60) break;
    lines.pop();
  }
  return lines.map(l => l.trim()).filter(Boolean).join(' ').trim();
}

/* ---- Matching entries to existing products ---- */

function idNormalizeText(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function idNormalizePartNo(s) {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function idBuildProductIndexes() {
  const byPartNo = new Map();
  const byName = new Map();
  allProducts.forEach(p => {
    const pn = idNormalizePartNo(p.partNumber);
    if (pn) byPartNo.set(pn, p);
    const nm = idNormalizeText(p.name);
    if (nm) byName.set(nm, p);
  });
  return { byPartNo, byName };
}

function idMatchEntry(entry, indexes) {
  const partNoRaw = (entry.partNo || '').trim();
  if (partNoRaw && partNoRaw.toUpperCase() !== 'N/A') {
    const pn = idNormalizePartNo(partNoRaw);
    if (pn) {
      const hit = indexes.byPartNo.get(pn);
      if (hit) return { product: hit, confidence: 'partno' };
    }
  }

  const titleNorm = idNormalizeText(entry.title);
  const exactHit = indexes.byName.get(titleNorm);
  if (exactHit) return { product: exactHit, confidence: 'exact' };

  // Fuzzy fallback: containment or token overlap against every product.
  // Only runs for entries the fast paths above missed.
  let best = null;
  let bestScore = 0;
  allProducts.forEach(p => {
    const pn = idNormalizeText(p.name);
    if (!pn) return;
    let score;
    if (titleNorm.includes(pn) || pn.includes(titleNorm)) {
      score = Math.min(pn.length, titleNorm.length) / Math.max(pn.length, titleNorm.length);
    } else {
      const a = new Set(pn.split(' '));
      const b = new Set(titleNorm.split(' '));
      let overlap = 0;
      a.forEach(t => { if (b.has(t)) overlap += 1; });
      score = overlap / Math.max(a.size, b.size, 1);
    }
    if (score > bestScore) { bestScore = score; best = p; }
  });
  if (best && bestScore >= 0.6) return { product: best, confidence: 'fuzzy' };
  return { product: null, confidence: 'none' };
}

/* ---- Review list rendering ---- */

function idGetFilteredEntries() {
  const q = (document.getElementById('idSearch').value || '').trim().toLowerCase();
  const filter = document.getElementById('idFilter').value;

  return idEntries.filter(entry => {
    const match = idMatches.get(entry.num);
    const product = match.productId ? allProducts.find(p => p.id === match.productId) : null;

    if (filter === 'confident' && !(match.confidence === 'partno' || match.confidence === 'exact')) return false;
    if (filter === 'fuzzy' && match.confidence !== 'fuzzy') return false;
    if (filter === 'none' && match.confidence !== 'none') return false;
    if (filter === 'selected' && !match.selected) return false;

    if (q) {
      const haystack = `${entry.title} ${entry.partNo} ${product ? product.name : ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function idUpdateCounts() {
  let partno = 0, exact = 0, fuzzy = 0, none = 0;
  idMatches.forEach(m => {
    if (m.confidence === 'partno') partno += 1;
    else if (m.confidence === 'exact') exact += 1;
    else if (m.confidence === 'fuzzy') fuzzy += 1;
    else none += 1;
  });
  document.getElementById('idCountPartNo').textContent = partno;
  document.getElementById('idCountExact').textContent = exact;
  document.getElementById('idCountFuzzy').textContent = fuzzy;
  document.getElementById('idCountNone').textContent = none;
}

const ID_CONFIDENCE_BADGE = {
  partno: '<span class="text-[10px] font-bold uppercase tracking-wide text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full whitespace-nowrap">Part #</span>',
  exact: '<span class="text-[10px] font-bold uppercase tracking-wide text-sky-400 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded-full whitespace-nowrap">Exact Name</span>',
  fuzzy: '<span class="text-[10px] font-bold uppercase tracking-wide text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full whitespace-nowrap">Review</span>',
  none: '<span class="text-[10px] font-bold uppercase tracking-wide text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-full whitespace-nowrap">No Match</span>'
};

function idRenderReview() {
  idUpdateCounts();

  const filtered = idGetFilteredEntries();
  const start = idPage * ID_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + ID_PAGE_SIZE);

  const list = document.getElementById('idList');
  if (pageItems.length === 0) {
    list.innerHTML = `<div class="text-center py-10 text-slate-500 text-sm">No entries match this filter.</div>`;
  } else {
    list.innerHTML = pageItems.map(entry => {
      const match = idMatches.get(entry.num);
      const product = match.productId ? allProducts.find(p => p.id === match.productId) : null;
      const badge = ID_CONFIDENCE_BADGE[match.confidence];

      return `
      <div class="p-3 flex flex-wrap items-start gap-3" data-id-entry="${entry.num}">
        <input type="checkbox" class="mt-1.5 w-4 h-4 accent-emerald-600 shrink-0 id-select-cb" ${match.selected ? 'checked' : ''} ${match.productId ? '' : 'disabled'}>
        <div class="flex-1 min-w-[220px]">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            ${badge}
            <span class="text-xs text-slate-500">PDF entry #${entry.num}${entry.partNo && entry.partNo.toUpperCase() !== 'N/A' ? ' · Part# ' + entry.partNo : ''}</span>
          </div>
          <p class="text-sm text-white font-medium">${entry.title}</p>
          <p class="text-xs text-slate-500 mt-1 line-clamp-2 id-desc-preview" title="${entry.description.replace(/"/g, '&quot;')}">${entry.description}</p>
        </div>
        <div class="w-full sm:w-64 shrink-0 id-match-area">
          ${product
            ? `<div class="bg-slate-900 border border-slate-700 rounded-lg p-2 flex items-center gap-2">
                 <img src="${product.image || ''}" alt="" class="w-9 h-9 rounded object-cover bg-slate-800 border border-slate-700 shrink-0" onerror="this.style.opacity=0.2">
                 <div class="flex-1 min-w-0">
                   <p class="text-xs text-white truncate">${product.name}</p>
                   <p class="text-[11px] text-slate-500 truncate">${product.partNumber ? 'Part# ' + product.partNumber : product.brand || product.category}</p>
                 </div>
                 <button type="button" class="text-slate-500 hover:text-sky-400 p-1 id-change-match-btn" title="Change matched product">
                   <i class="fa-solid fa-pen"></i>
                 </button>
               </div>`
            : `<button type="button" class="w-full text-xs bg-slate-800 hover:bg-slate-700 text-white font-semibold px-3 py-2.5 rounded-lg transition id-change-match-btn">
                 <i class="fa-solid fa-magnifying-glass mr-1"></i> Pick a product
               </button>`
          }
          <div class="id-combo-wrap relative"></div>
        </div>
      </div>`;
    }).join('');

    pageItems.forEach(entry => {
      const row = list.querySelector(`[data-id-entry="${entry.num}"]`);
      const cb = row.querySelector('.id-select-cb');
      cb.addEventListener('change', () => {
        idMatches.get(entry.num).selected = cb.checked;
        idUpdateApplyUI();
      });
      row.querySelector('.id-change-match-btn').addEventListener('click', () => idToggleCombo(entry.num, row));
    });
  }

  document.getElementById('idPageLabel').textContent = filtered.length === 0
    ? ''
    : `Showing ${start + 1}\u2013${Math.min(start + ID_PAGE_SIZE, filtered.length)} of ${filtered.length}`;
  document.getElementById('idPrevBtn').disabled = idPage === 0;
  document.getElementById('idNextBtn').disabled = start + ID_PAGE_SIZE >= filtered.length;

  idUpdateApplyUI();
}

function idPrevPage() {
  if (idPage > 0) { idPage -= 1; idRenderReview(); }
}
window.idPrevPage = idPrevPage;

function idNextPage() {
  idPage += 1;
  idRenderReview();
}
window.idNextPage = idNextPage;

// Opens a small inline search box under a row so you can pick a
// different product for that entry — reuses the same searchProducts()
// helper the live site's search bar uses.
function idToggleCombo(entryNum, row) {
  const wrap = row.querySelector('.id-combo-wrap');
  if (idComboOpenFor === entryNum) {
    wrap.innerHTML = '';
    idComboOpenFor = null;
    return;
  }
  idComboOpenFor = entryNum;
  wrap.innerHTML = `
    <div class="absolute right-0 mt-1 w-72 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-10 p-2">
      <input type="text" placeholder="Search products..." class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white outline-none focus:border-sky-500 id-combo-search">
      <div class="max-h-52 overflow-y-auto mt-2 space-y-1 id-combo-results"></div>
    </div>`;
  const input = wrap.querySelector('.id-combo-search');
  const results = wrap.querySelector('.id-combo-results');

  const renderResults = (query) => {
    const hits = query ? searchProducts(allProducts, query).slice(0, 15) : allProducts.slice(0, 15);
    results.innerHTML = hits.map(p => `
      <button type="button" data-pick-id="${p.id}" class="w-full text-left flex items-center gap-2 p-1.5 rounded hover:bg-slate-800 transition">
        <img src="${p.image || ''}" alt="" class="w-7 h-7 rounded object-cover bg-slate-800 border border-slate-700 shrink-0" onerror="this.style.opacity=0.2">
        <span class="flex-1 min-w-0">
          <span class="block text-xs text-white truncate">${p.name}</span>
          <span class="block text-[10px] text-slate-500 truncate">${p.partNumber ? 'Part# ' + p.partNumber : p.brand || p.category}</span>
        </span>
      </button>`).join('') || `<p class="text-xs text-slate-500 p-2 text-center">No products found.</p>`;
    results.querySelectorAll('[data-pick-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.pickId);
        const m = idMatches.get(entryNum);
        m.productId = id;
        m.confidence = 'fuzzy'; // manually picked — treat as needing-review tier for the counters, but pre-select it
        m.selected = true;
        idComboOpenFor = null;
        idRenderReview();
      });
    });
  };
  renderResults('');
  input.addEventListener('input', () => renderResults(input.value.trim()));
  input.focus();
}

function idUpdateApplyUI() {
  const selectedCount = [...idMatches.values()].filter(m => m.selected && m.productId).length;
  const btn = document.getElementById('idApplyBtn');
  const label = document.getElementById('idApplyBtnLabel');
  const applyLabel = document.getElementById('idApplyLabel');
  btn.disabled = selectedCount === 0;
  label.textContent = selectedCount > 0 ? `Apply Selected (${selectedCount})` : 'Apply Selected';
  applyLabel.textContent = selectedCount > 0
    ? `${selectedCount} description${selectedCount === 1 ? '' : 's'} will be saved.`
    : 'Tick the rows to apply, or select all confident matches at once.';
}

// Ticks every entry matched by Part Number or exact Name (the two
// high-confidence tiers) without touching fuzzy/no-match rows — those
// stay unticked so you consciously review them first.
function idSelectConfident() {
  idMatches.forEach(m => {
    if (m.productId && (m.confidence === 'partno' || m.confidence === 'exact')) m.selected = true;
  });
  idRenderReview();
}
window.idSelectConfident = idSelectConfident;

/* ---- Apply: writes selected descriptions to Supabase in one batch ---- */

async function idApplySelected() {
  const toApply = [...idMatches.entries()].filter(([, m]) => m.selected && m.productId);
  if (toApply.length === 0) return;

  const btn = document.getElementById('idApplyBtn');
  const label = document.getElementById('idApplyBtnLabel');
  btn.disabled = true;

  const failed = [];
  for (let i = 0; i < toApply.length; i++) {
    const [entryNum, m] = toApply[i];
    const entry = idEntries.find(e => e.num === entryNum);
    label.textContent = `Saving ${i + 1} of ${toApply.length}...`;
    try {
      const local = allProducts.find(x => x.id === m.productId);
      if (local) {
        await sbUpdateProduct(m.productId, { ...local, description: entry.description });
        local.description = entry.description;
      }
      idMatches.delete(entryNum);
      idEntries = idEntries.filter(e => e.num !== entryNum);
    } catch (err) {
      failed.push({ entryNum, message: err.message });
    }
  }

  invalidateProductsCache();
  renderTable();

  if (idEntries.length === 0) {
    closeImportDescModal();
    alert(`Done — saved ${toApply.length - failed.length} product description${toApply.length - failed.length === 1 ? '' : 's'}.`);
  } else {
    idPage = 0;
    idRenderReview();
  }

  if (failed.length > 0) {
    const names = failed.map(f => `• PDF entry #${f.entryNum}: ${f.message}`).join('\n');
    alert(`Saved everything except ${failed.length}, which stayed in the list so you can retry:\n\n${names}`);
  }
}
window.idApplySelected = idApplySelected;

/* ---- Wire up file input + drop zone + search/filter ---- */

(function idWireUpImportDescModal() {
  const fileInput = document.getElementById('idFileInput');
  const dropZone = document.getElementById('idDropZone');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) idHandlePdfFile(fileInput.files[0]);
    });
  }
  if (dropZone) {
    setupDropZone(dropZone, files => {
      const pdfFile = [...files].find(f => f.type === 'application/pdf');
      if (pdfFile) idHandlePdfFile(pdfFile);
    });
  }
  const idSearchEl = document.getElementById('idSearch');
  const idFilterEl = document.getElementById('idFilter');
  if (idSearchEl) idSearchEl.addEventListener('input', () => { idPage = 0; idRenderReview(); });
  if (idFilterEl) idFilterEl.addEventListener('change', () => { idPage = 0; idRenderReview(); });
})();

/* ---------- Reposition & Resize Logo (product photo watermark) ---------- */
// Drag the badge on the sample photo to set its top/left as a percent
// of the photo box (so it lands in the same relative spot on every
// card, whatever size the card renders at), and use the size box to
// set its pixel size. Saved to the same site_settings row as the
// Prices toggle, and read by every page via applyLogoWatermarkSettings()
// in layout.js — so once saved, it applies to every visitor immediately.

let lwState = { top: 4, left: 4, size: 34 }; // top/left in %, size in px
let lwDragging = false;

async function openLogoWatermarkModal() {
  document.getElementById('logoWatermarkModal').classList.remove('hidden');
  document.getElementById('logoWatermarkModal').classList.add('flex');
  document.getElementById('lwStatus').textContent = 'Loading current position…';
  try {
    lwState = await sbGetLogoWatermarkSettings();
  } catch (e) {
    lwState = { top: 4, left: 4, size: 34 };
  }
  document.getElementById('lwStatus').textContent = '';
  lwRenderHandle();
  document.getElementById('lwSizeInput').value = Math.round(lwState.size);
}
window.openLogoWatermarkModal = openLogoWatermarkModal;

function closeLogoWatermarkModal() {
  document.getElementById('logoWatermarkModal').classList.add('hidden');
  document.getElementById('logoWatermarkModal').classList.remove('flex');
}
window.closeLogoWatermarkModal = closeLogoWatermarkModal;

function lwRenderHandle() {
  const handle = document.getElementById('lwLogoHandle');
  handle.style.top = lwState.top + '%';
  handle.style.left = lwState.left + '%';
  handle.style.width = lwState.size + 'px';
  handle.style.height = lwState.size + 'px';
}

// Clamp so the badge always stays fully inside the preview box,
// converting its pixel size into a percent of the box for the check.
function lwClampPosition(box) {
  const wPct = (lwState.size / box.width) * 100;
  const hPct = (lwState.size / box.height) * 100;
  lwState.left = Math.min(Math.max(lwState.left, 0), 100 - wPct);
  lwState.top = Math.min(Math.max(lwState.top, 0), 100 - hPct);
  if (lwState.left < 0) lwState.left = 0;
  if (lwState.top < 0) lwState.top = 0;
}

function lwPointFromEvent(e) {
  if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function lwStartDrag(e) {
  lwDragging = true;
  e.preventDefault();
}

function lwOnMove(e) {
  if (!lwDragging) return;
  const previewBox = document.getElementById('lwPreviewBox');
  const box = previewBox.getBoundingClientRect();
  const pt = lwPointFromEvent(e);
  const left = ((pt.x - box.left) / box.width) * 100;
  const top = ((pt.y - box.top) / box.height) * 100;
  // Position is set relative to where you grabbed/dropped, centering
  // the badge under the pointer.
  const wPct = (lwState.size / box.width) * 100;
  const hPct = (lwState.size / box.height) * 100;
  lwState.left = left - wPct / 2;
  lwState.top = top - hPct / 2;
  lwClampPosition(box);
  lwRenderHandle();
}

function lwEndDrag() {
  lwDragging = false;
}

function lwStepSize(delta) {
  const input = document.getElementById('lwSizeInput');
  let next = (parseInt(input.value, 10) || lwState.size) + delta;
  next = Math.min(Math.max(next, 16), 120);
  input.value = next;
  lwApplySizeFromInput();
}
window.lwStepSize = lwStepSize;

function lwApplySizeFromInput() {
  const input = document.getElementById('lwSizeInput');
  let size = parseInt(input.value, 10);
  if (isNaN(size)) return;
  size = Math.min(Math.max(size, 16), 120);
  lwState.size = size;
  const previewBox = document.getElementById('lwPreviewBox');
  const box = previewBox.getBoundingClientRect();
  lwClampPosition(box);
  lwRenderHandle();
}

function lwResetDefault() {
  lwState = { top: 4, left: 4, size: 34 };
  document.getElementById('lwSizeInput').value = 34;
  lwRenderHandle();
  document.getElementById('lwStatus').textContent = '';
}
window.lwResetDefault = lwResetDefault;

async function saveLogoWatermarkSettings() {
  const btn = document.getElementById('lwSaveBtn');
  const status = document.getElementById('lwStatus');
  btn.disabled = true;
  status.className = 'text-xs min-h-[1rem] text-slate-400';
  status.textContent = 'Saving…';
  try {
    await sbSetLogoWatermarkSettings(lwState);
    status.className = 'text-xs min-h-[1rem] text-emerald-400';
    status.textContent = 'Saved — the logo is updated on the live site for every visitor.';
    if (typeof applyLogoWatermarkSettings === 'function') applyLogoWatermarkSettings();
  } catch (e) {
    status.className = 'text-xs min-h-[1rem] text-red-400';
    status.textContent = 'Could not save. If this is the first time, make sure the logo_top/logo_left/logo_size columns have been added to site_settings — see SUPABASE_SETUP.md.';
  } finally {
    btn.disabled = false;
  }
}
window.saveLogoWatermarkSettings = saveLogoWatermarkSettings;

(function lwWireUpDragEvents() {
  const handle = document.getElementById('lwLogoHandle');
  if (!handle) return;
  handle.addEventListener('mousedown', lwStartDrag);
  handle.addEventListener('touchstart', lwStartDrag, { passive: false });
  document.addEventListener('mousemove', lwOnMove);
  document.addEventListener('touchmove', lwOnMove, { passive: false });
  document.addEventListener('mouseup', lwEndDrag);
  document.addEventListener('touchend', lwEndDrag);

  const sizeInput = document.getElementById('lwSizeInput');
  if (sizeInput) sizeInput.addEventListener('input', lwApplySizeFromInput);
})();
