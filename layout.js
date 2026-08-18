/* =========================================================
   Kilo Auto Spares Ltd — Shared Layout
   Injects the top bar, header/nav, footer, cart drawer and
   floating WhatsApp button into every page so they stay
   identical without copy-pasting HTML five times.
   ========================================================= */

const WHATSAPP_NUMBER = "254725789415";

function waLink(text) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

const NAV_LINKS = [
  { href: "index.html", label: "Home" },
  { href: "shop.html", label: "Shop" },
  { href: "about.html", label: "About Us" },
  { href: "contact.html", label: "Contact" }
];

function renderTopBars() {
  return `
  <div class="bg-red-600 text-white text-xs py-2 px-4 text-center font-medium tracking-wide flex flex-wrap justify-center items-center gap-4">
      <span><i class="fa-solid fa-location-dot mr-1"></i> Witu Road, Off Lusaka Road, Brunei House, Nairobi</span>
      <span><i class="fa-solid fa-phone mr-1"></i> Direct Line: 0725 789 415</span>
  </div>
  <div class="bg-emerald-600 text-white overflow-hidden py-2 px-4 shadow-inner">
      <div class="animate-marquee flex items-center space-x-12 text-sm font-bold uppercase tracking-wider">
          <span><i class="fa-solid fa-truck-fast mr-2"></i> Free Delivery Available on Select Orders Across Nairobi!</span>
          <span><i class="fa-solid fa-shield-check mr-2"></i> Home of Quality, Durable and Affordable Parts</span>
          <span><i class="fa-solid fa-truck-fast mr-2"></i> Free Delivery Available on Select Orders Across Nairobi!</span>
          <span><i class="fa-solid fa-shield-check mr-2"></i> Home of Quality, Durable and Affordable Parts</span>
      </div>
  </div>`;
}

// Navigates to the Shop page with the given search term applied.
// This is how people find products now — there is no category
// menu anywhere on the site.
function goToSearch(query) {
  const q = (query || '').trim();
  window.location.href = `shop.html${q ? '?q=' + encodeURIComponent(q) : ''}`;
}
window.goToSearch = goToSearch;

// Search bar markup, reused in both the desktop header and the
// mobile menu so it's genuinely on every page. `idSuffix` keeps
// element IDs unique when both copies are in the DOM at once.
function renderSearchBar(idSuffix) {
  return `
      <form id="searchForm${idSuffix}" class="relative w-full" onsubmit="return false;">
          <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
              <i class="fa-solid fa-magnifying-glass text-sm"></i>
          </span>
          <input type="text" id="searchInput${idSuffix}" placeholder="Search for a part, e.g. brake pads, shock absorber..." class="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition">
      </form>`;
}

function renderHeader(activePage) {
  const links = NAV_LINKS.map(l => {
    const isActive = l.href === activePage;
    return `<a href="${l.href}" class="text-sm font-semibold transition ${isActive ? 'text-red-500' : 'text-slate-300 hover:text-white'}">${l.label}</a>`;
  }).join('');

  const mobileLinks = NAV_LINKS.map(l => {
    const isActive = l.href === activePage;
    return `<a href="${l.href}" class="block text-lg font-bold py-3 px-2 rounded-lg transition ${isActive ? 'text-red-500 bg-slate-900' : 'text-slate-200 hover:text-white hover:bg-slate-900'}">${l.label}</a>`;
  }).join('');

  return `
  <header class="bg-slate-950 border-b border-slate-800 shadow-md">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 md:gap-8 min-w-0">
              <a href="index.html" class="flex items-center space-x-3 shrink-0 min-w-0">
                  <div class="bg-red-600 text-white p-2 rounded-lg font-black text-xl tracking-wider shrink-0">
                      <i class="fa-solid fa-car-wrench"></i>
                  </div>
                  <div class="min-w-0">
                      <span class="text-base sm:text-xl font-bold tracking-tight text-white block leading-tight truncate">KILO AUTO SPARES LTD</span>
                      <span class="text-xs text-red-500 font-semibold tracking-widest uppercase truncate block">Garage & Spares</span>
                  </div>
              </a>

              <nav class="hidden md:flex items-center space-x-6">
                  ${links}
              </nav>
          </div>

          <div class="flex items-center space-x-2 sm:space-x-3 shrink-0">
              <a href="${waLink('Hello, I would like to confirm availability for auto parts at Witu Rd Brunei House.')}" target="_blank" rel="noopener" class="hidden lg:inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition">
                  <i class="fa-brands fa-whatsapp text-base"></i>
                  <span>Chat on WhatsApp</span>
              </a>
              <button id="cartBtn" class="relative p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition flex items-center space-x-2">
                  <i class="fa-solid fa-cart-shopping"></i>
                  <span class="hidden sm:inline text-sm font-medium">Cart</span>
                  <span id="cartCount" class="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">0</span>
              </button>
              <button id="mobileMenuBtn" class="md:hidden p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition">
                  <i class="fa-solid fa-bars"></i>
              </button>
          </div>
      </div>

      <nav id="mobileMenu" class="md:hidden hidden border-t border-slate-800 bg-slate-950 px-4 py-3 flex flex-col space-y-1">
          ${mobileLinks}
      </nav>

      <!-- Search bar: on every page, this is the only way to find products -->
      <div class="border-t border-slate-800 bg-slate-900/60 px-4 sm:px-6 lg:px-8 py-3">
          <div class="max-w-3xl mx-auto">${renderSearchBar('Header')}</div>
      </div>
  </header>`;
}

function renderFooter() {
  return `
  <footer class="bg-slate-950 border-t border-slate-800 mt-16 py-10 text-sm text-slate-500">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div>
              <p class="text-slate-200 font-bold text-base mb-1">Kilo Auto Spares Ltd</p>
              <p class="text-xs text-red-400 italic mb-3">Home of Quality, Durable and Affordable Parts</p>
              <p>Witu Road, Off Lusaka Road,<br>Brunei House, Nairobi</p>
          </div>
          <div>
              <p class="text-slate-200 font-semibold mb-2">Quick Links</p>
              <div class="flex flex-col space-y-1">
                  <a href="index.html" class="hover:text-red-400 transition">Home</a>
                  <a href="shop.html" class="hover:text-red-400 transition">Shop</a>
                  <a href="about.html" class="hover:text-red-400 transition">About Us</a>
                  <a href="contact.html" class="hover:text-red-400 transition">Contact</a>
              </div>
          </div>
          <div>
              <p class="text-slate-200 font-semibold mb-2">Get In Touch</p>
              <p>Call / WhatsApp: <a href="tel:0725789415" class="text-red-400 font-bold">0725 789 415</a></p>
              <a href="${waLink('Hello, I would like to inquire about auto spares availability.')}" target="_blank" rel="noopener" class="inline-flex items-center space-x-2 mt-3 text-emerald-400 hover:text-emerald-300 font-semibold">
                  <i class="fa-brands fa-whatsapp"></i><span>Chat on WhatsApp</span>
              </a>
          </div>
      </div>
      <p class="text-center text-xs text-slate-600 mt-8">&copy; 2026 Kilo Auto Spares Ltd. All Rights Reserved. &middot; <a href="admin.html" class="hover:text-slate-400">Admin</a></p>
  </footer>`;
}

function renderCartDrawer() {
  return `
  <div id="cartDrawer" class="fixed inset-0 z-50 overflow-hidden hidden">
      <div id="cartOverlay" class="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
      <div class="absolute inset-y-0 right-0 max-w-full flex pl-10">
          <div class="w-screen max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col">
              <div class="p-6 flex items-center justify-between border-b border-slate-800">
                  <h3 class="text-lg font-bold text-white flex items-center space-x-2">
                      <i class="fa-solid fa-cart-shopping text-red-500"></i>
                      <span>Parts Inquiry Cart</span>
                  </h3>
                  <button id="closeCartBtn" class="text-slate-400 hover:text-white text-xl"><i class="fa-solid fa-xmark"></i></button>
              </div>
              <div id="cartItemsContainer" class="flex-1 overflow-y-auto p-6 space-y-4"></div>
              <div class="border-t border-slate-800 p-6 bg-slate-950 space-y-3">
                  <div class="flex justify-between text-base font-semibold text-white mb-2">
                      <p>Total Estimated</p>
                      <p id="cartSubtotal" class="text-red-500">KES 0</p>
                  </div>
                  <button onclick="checkoutWhatsApp()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-lg font-bold transition shadow-lg flex items-center justify-center space-x-2">
                      <i class="fa-brands fa-whatsapp text-xl"></i>
                      <span>Confirm Availability via WhatsApp</span>
                  </button>
                  <a href="tel:0725789415" class="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-lg font-bold transition flex items-center justify-center space-x-2 text-sm">
                      <i class="fa-solid fa-phone text-red-500"></i>
                      <span>Call Direct: 0725 789 415</span>
                  </a>
              </div>
          </div>
      </div>
  </div>`;
}

function renderQuickViewModal() {
  return `
  <div id="quickViewModal" class="fixed inset-0 z-50 hidden items-center justify-center p-4">
      <div id="quickViewOverlay" class="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
      <div class="relative bg-slate-950 border border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden">
          <button id="closeQuickViewBtn" class="absolute top-3 right-3 z-10 text-slate-400 hover:text-white bg-slate-900/80 rounded-full w-8 h-8 flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>
          <div id="quickViewBody" class="grid grid-cols-1 sm:grid-cols-2"></div>
      </div>
  </div>`;
}

async function openQuickView(productId) {
  const products = await loadProducts();
  const product = products.find(p => p.id === productId);
  if (!product) return;
  const pct = discountPercent(product);
  document.getElementById('quickViewBody').innerHTML = `
      <div class="h-64 sm:h-full bg-slate-900 relative">
          <img src="${product.image}" alt="${product.name}" class="w-full h-full object-contain">
          ${pct > 0 ? `<span class="absolute top-3 left-3 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded">-${pct}%</span>` : ''}
      </div>
      <div class="p-6 flex flex-col">
          <span class="text-xs text-red-400 font-bold uppercase tracking-wider">${product.category}${product.subcategory ? ' &middot; ' + product.subcategory : ''}</span>
          ${product.brand ? `<span class="text-xs text-slate-500 font-semibold uppercase mt-1">${product.brand}</span>` : ''}
          <h3 class="font-bold text-white text-xl mt-2 mb-2 leading-snug">${product.name}</h3>
          ${product.description ? `<p class="text-sm text-slate-400 mb-4">${product.description}</p>` : ''}
          <div class="mb-5">${priceHTML(product, 'text-2xl')}</div>
          <div class="mt-auto space-y-2">
              <button onclick="addToCart(${product.id})" class="w-full bg-slate-800 hover:bg-red-600 text-white py-2.5 px-3 rounded-lg text-sm font-semibold transition flex items-center justify-center space-x-2">
                  <i class="fa-solid fa-cart-plus"></i><span>Add to Inquiry Cart</span>
              </button>
              <a href="${waLink(`Hello, is this part available? - ${product.name}${priceForWhatsApp(product)}`)}" target="_blank" rel="noopener" class="w-full bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white py-2.5 px-3 rounded-lg text-sm font-semibold transition flex items-center justify-center space-x-2 border border-emerald-500/30">
                  <i class="fa-brands fa-whatsapp"></i><span>Confirm Availability</span>
              </a>
          </div>
      </div>`;
  document.getElementById('quickViewModal').classList.remove('hidden');
  document.getElementById('quickViewModal').classList.add('flex');
}
window.openQuickView = openQuickView;

function closeQuickView() {
  document.getElementById('quickViewModal').classList.add('hidden');
  document.getElementById('quickViewModal').classList.remove('flex');
}

function initQuickView() {
  document.getElementById('closeQuickViewBtn').addEventListener('click', closeQuickView);
  document.getElementById('quickViewOverlay').addEventListener('click', closeQuickView);
}

function renderFloatingWhatsApp() {
  return `
  <a href="${waLink('Hello, I would like to inquire about auto spares availability at Witu Road, Brunei House.')}"
     target="_blank" rel="noopener"
     class="fixed bottom-6 right-6 z-50 bg-emerald-600 hover:bg-emerald-500 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform hover:scale-110 group"
     title="Confirm Availability via WhatsApp">
      <i class="fa-brands fa-whatsapp text-3xl"></i>
      <span class="absolute right-16 bg-slate-900 text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition whitespace-nowrap border border-emerald-500/30">
          Confirm Availability via WhatsApp
      </span>
  </a>`;
}

function initLayout(activePage) {
  document.getElementById('topBars').innerHTML = renderTopBars();
  document.getElementById('siteHeader').innerHTML = renderHeader(activePage);
  document.getElementById('siteFooter').innerHTML = renderFooter();
  document.getElementById('cartDrawerContainer').innerHTML = renderCartDrawer();
  document.getElementById('floatingWhatsApp').innerHTML = renderFloatingWhatsApp();

  pinNavToTop();

  const quickViewContainer = document.getElementById('quickViewContainer');
  if (quickViewContainer) {
    quickViewContainer.innerHTML = renderQuickViewModal();
    initQuickView();
  }

  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  mobileMenuBtn.addEventListener('click', () => mobileMenu.classList.toggle('hidden'));

  // Header search bar — Enter (or the icon) sends you to Shop with
  // the query applied. On the Shop page itself, its own on-page
  // search box (see shop.html) takes over live filtering instead.
  const headerSearchForm = document.getElementById('searchFormHeader');
  const headerSearchInput = document.getElementById('searchInputHeader');
  if (headerSearchForm && headerSearchInput) {
    headerSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      goToSearch(headerSearchInput.value);
    });
    // Pre-fill from ?q= if present, so it's obvious what you searched for.
    const params = new URLSearchParams(window.location.search);
    if (params.get('q')) headerSearchInput.value = params.get('q');
  }

  initCart();
}

// Keeps the header (logo/nav + search bar) permanently pinned to the
// top of the viewport with true position:fixed — guaranteed to stay
// visible the entire time you scroll, all the way to the bottom of
// the page, regardless of browser quirks with position:sticky. The
// red/green promo strip above it is left in normal flow and scrolls
// away as usual — only the search bar needs to stay put. A resize
// observer keeps a matching spacer (via body padding-top) so page
// content is never hidden underneath the fixed header, even when the
// mobile menu opens and the header's height changes.
function pinNavToTop() {
  const header = document.getElementById('siteHeader');
  if (!header) return;

  header.classList.add('fixed', 'top-0', 'inset-x-0', 'z-40');

  const syncSpacing = () => {
    document.body.style.paddingTop = header.offsetHeight + 'px';
  };
  syncSpacing();
  window.addEventListener('resize', syncSpacing);
  if (window.ResizeObserver) {
    new ResizeObserver(syncSpacing).observe(header);
  }
}
