/* =====================================================
   SASTAGO CUSTOMER PANEL
   COMPLETE UPDATED SHOPPING SYSTEM
   FAST PRODUCTS + LOW STOCK + ORDER DETAILS
   58MM PNG BILL DOWNLOAD / SHARE / PRINT
   ===================================================== */

import { auth, db } from "./firebase.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updatePassword,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    setDoc,
    query,
    where,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

/* =====================================================
   CONFIGURATION
   ===================================================== */

const WHATSAPP_NUMBER = "923060965926";
const DISPLAY_WHATSAPP = "03060965926";

const FREE_DELIVERY_LIMIT = 2500;
const DELIVERY_FEE = 50;
const SERVICE_CHARGE = 10;

const PRODUCT_CACHE_KEY = "sastago_products_cache";
const PRODUCT_CACHE_TIME = 30 * 60 * 1000;
const CATEGORY_CACHE_KEY = "sastago_categories_cache";
const BRAND_CACHE_KEY = "sastago_brands_cache";

const BILL_WIDTH = 384;

let currentUser = null;

let products = [];
let categories = [];
let brands = [];

let currentProductList = [];
let selectedProductId = null;
let selectedProductQuantity = 1;

let cart = [];
let wishlist = [];

let productLoadPromise = null;
let categoryLoadPromise = null;
let brandLoadPromise = null;

let customerOrdersCache = [];

/* =====================================================
   LOCAL STORAGE
   ===================================================== */

function loadLocalArray(key) {
    try {
        const data = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Storage Error:", error);
        return [];
    }
}

cart = loadLocalArray("sastago_cart");
wishlist = loadLocalArray("sastago_wishlist");

function saveCart() {
    localStorage.setItem("sastago_cart", JSON.stringify(cart));
    updateCartCount();
}

function saveWishlist() {
    localStorage.setItem("sastago_wishlist", JSON.stringify(wishlist));
    updateWishlistCount();
}

/* =====================================================
   DOM HELPERS
   ===================================================== */

function getElement(id) {
    return document.getElementById(id);
}

function setHTML(id, html) {
    const element = getElement(id);
    if (element) element.innerHTML = html;
}

function setText(id, text) {
    const element = getElement(id);
    if (element) element.textContent = text;
}

function money(value) {
    return Number(value || 0).toLocaleString("en-PK");
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function safeImage(url) {
    if (!url) return "";

    const value = String(url).trim();

    if (
        value.startsWith("https://") ||
        value.startsWith("http://") ||
        value.startsWith("data:image/")
    ) {
        return value;
    }

    return "";
}

function safeExternalURL(url) {
    try {
        const parsed = new URL(String(url || ""));

        if (
            parsed.protocol === "https:" ||
            parsed.protocol === "http:"
        ) {
            return parsed.href;
        }

        return "";
    } catch {
        return "";
    }
}

/* =====================================================
   TOAST
   ===================================================== */

function showToast(message, type = "success") {
    let container = getElement("toastContainer");

    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");

    toast.className = `sastago-toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

window.sastagoShowToast = showToast;

/* =====================================================
   ===================================================== */

/*
 Expected location object:

 {
    latitude: 0,
    longitude: 0,
    accuracy: 0,
    mapLink: "https://www.google.com/maps?q=...",
    capturedAt: "..."
 }

 Location is provided by customer-location.js.
*/

/* =====================================================
   PRODUCT HELPERS
   ===================================================== */

function productName(product) {
    return product.name ||
        product.title ||
        product.productName ||
        "Product";
}

function productDescription(product) {
    return product.description ||
        product.details ||
        product.shortDescription ||
        "No description available.";
}

function productPrice(product) {
    return Number(product.price ?? product.salePrice ?? 0);
}

function productMRP(product) {
    return Number(product.mrp ?? product.originalPrice ?? 0);
}

function productImage(product) {
    if (Array.isArray(product.images) && product.images.length) {
        const image = safeImage(product.images[0]);
        if (image) return image;
    }

    return safeImage(product.image) ||
        safeImage(product.imageUrl) ||
        safeImage(product.productImage) ||
        "";
}

function productImages(product) {
    const images = [];

    if (Array.isArray(product.images)) {
        product.images.forEach(url => {
            const image = safeImage(url);
            if (image && !images.includes(image)) images.push(image);
        });
    }

    [
        product.image,
        product.imageUrl,
        product.productImage
    ].forEach(url => {
        const image = safeImage(url);
        if (image && !images.includes(image)) images.push(image);
    });

    return images;
}

function productStock(product) {
    return Math.max(0, Number(
        product.stock ??
        product.quantity ??
        product.initialStock ??
        0
    ));
}

function productIsActive(product) {
    return product.active !== false &&
        product.isActive !== false &&
        product.isAvailable !== false;
}

function categoryIsActive(category) {
    return category.active !== false &&
        category.isActive !== false;
}

function brandIsActive(brand) {
    return brand.active !== false &&
        brand.isActive !== false;
}

function productRating(product) {
    const rating = Number(product.rating ?? 5);
    return Math.max(0, Math.min(5, rating));
}

function brandNameForProduct(product) {
    const brand = brands.find(item => item.id === product.brandId);
    return brand?.name || product.brand || "General";
}

function brandLogoForProduct(product) {
    const brand = brands.find(item => item.id === product.brandId);

    return safeImage(brand?.logo) ||
        safeImage(brand?.logoUrl) ||
        safeImage(brand?.imageUrl) ||
        safeImage(product.brandLogo);
}

function categoryNameForProduct(product) {
    const category = categories.find(item => item.id === product.categoryId);
    return category?.name || product.category || "General";
}

/* =====================================================
   QUANTITY PRICING
   ===================================================== */

function getQuantityTiers(product) {
    const tiers = [];

    if (Array.isArray(product.quantityPricing)) {
        product.quantityPricing.forEach(tier => {
            const quantity = Number(
                tier.minQuantity ??
                tier.quantity ??
                tier.qty ??
                0
            );

            const totalPrice = Number(tier.totalPrice ?? 0);

            if (quantity > 0 && totalPrice > 0) {
                tiers.push({
                    quantity,
                    unitPrice: totalPrice / quantity
                });
            }
        });
    }

    if (Array.isArray(product.priceTiers)) {
        product.priceTiers.forEach(tier => {
            const quantity = Number(
                tier.minQuantity ??
                tier.qty ??
                tier.quantity ??
                0
            );

            const unitPrice = Number(
                tier.price ??
                tier.unitPrice ??
                0
            );

            if (quantity > 0 && unitPrice > 0) {
                tiers.push({ quantity, unitPrice });
            }
        });
    }

    const unique = new Map();

    tiers.forEach(tier => {
        unique.set(tier.quantity, tier);
    });

    return Array.from(unique.values()).sort(
        (a, b) => a.quantity - b.quantity
    );
}

function getUnitPrice(product, quantity = 1) {
    let selectedTier = null;

    getQuantityTiers(product).forEach(tier => {
        if (quantity >= tier.quantity) selectedTier = tier;
    });

    return selectedTier
        ? selectedTier.unitPrice
        : productPrice(product);
}

function getLineTotal(product, quantity = 1) {
    return getUnitPrice(product, quantity) * quantity;
}

/* =====================================================
   RATING AND OFFERS
   ===================================================== */

function getRatingHTML(product) {
    const rating = productRating(product);

    return `
        <div class="product-rating">
            <span>${"★".repeat(Math.floor(rating))}${"☆".repeat(5 - Math.floor(rating))}</span>
            <small>${rating.toFixed(1)} / 5</small>
        </div>
    `;
}

function getQuantityPricingHTML(product) {
    const tiers = getQuantityTiers(product);

    if (!tiers.length) return "";

    return `
        <div class="quantity-pricing">
            <strong>Quantity Offers</strong>

            ${tiers.map(tier => `
                <div class="quantity-price-row">
                    <span>Buy ${tier.quantity} or more</span>
                    <strong>
                        Rs. ${money(tier.unitPrice)}
                        / ${escapeHTML(product.unit || "Piece")}
                    </strong>
                </div>
            `).join("")}
        </div>
    `;
}
function contactWhatsApp() {
    const message = encodeURIComponent(
        "Hello SastaGo! I need customer support."
    );

    window.open(
        `https://wa.me/923060965926?text=${message}`,
        "_blank"
    );
}

async function shareApp() {
    const shareData = {
        title: "SastaGo",
        text: "Shop your daily essentials with SastaGo!",
        url: window.location.href
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            await navigator.clipboard.writeText(shareData.url);
            showToast("App link copied!");
        }
    } catch (error) {
        if (error.name !== "AbortError") {
            showToast("Could not share app link.", "error");
        }
    }
}

/* =====================================================
   GLOBAL FUNCTIONS
   ===================================================== */

window.showPage = showPage;
window.searchProducts = searchProducts;
window.showProduct = showProduct;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.removeFromCart = removeFromCart;
window.changeQuantity = changeQuantity;
window.toggleWishlist = toggleWishlist;
window.showCategory = showCategory;
window.showBrand = showBrand;
window.showSettingsSection = showSettingsSection;
window.contactWhatsApp = contactWhatsApp;
window.shareApp = shareApp;
window.customerLogout = customerLogout;
window.saveCustomerAddress = saveCustomerAddress;
window.forgotPassword = forgotPassword;
window.changeDetailQuantity = changeDetailQuantity;
window.addDetailProductToCart = addDetailProductToCart;
window.loadCustomerOrders = loadOrders;
window.openOrderDetails = openOrderDetails;
window.closeOrderDetails = closeOrderDetails;

/* =====================================================
   PAGE NAVIGATION
   ===================================================== */

function showPage(page) {
    const actualPage = page === "profile" ? "settings" : page;

    document.querySelectorAll(".page").forEach(section => {
        section.classList.remove("active");
    });

    const target = getElement(actualPage + "Page");

    if (target) target.classList.add("active");

    document.querySelectorAll(".bottom-nav button").forEach(button => {
        button.classList.remove("active");

        if (button.getAttribute("onclick")?.includes(actualPage)) {
            button.classList.add("active");
        }
    });

    window.scrollTo({ top: 0, behavior: "smooth" });

    if (actualPage === "cart") renderCart();
    if (actualPage === "wishlist") renderWishlist();
    if (actualPage === "orders") loadOrders();
    if (actualPage === "settings") loadProfile();

    if (actualPage === "products") {
        renderProducts(currentProductList || products);
    }

    if (actualPage === "checkout") renderCheckoutSummary();
}

/* =====================================================
   SETTINGS NAVIGATION
   ===================================================== */

function showSettingsSection(sectionId) {
    document.querySelectorAll(".settings-section").forEach(section => {
        section.classList.remove("active");
    });

    const section = getElement(sectionId);

    if (section) {
        section.classList.add("active");
        section.scrollIntoView({ behavior: "smooth" });
    }
}

/* =====================================================
   PRODUCT CACHE
   ===================================================== */

function loadCachedProducts() {
    try {
        const cached = JSON.parse(
            localStorage.getItem(PRODUCT_CACHE_KEY) || "null"
        );

        if (!cached || !Array.isArray(cached.products)) return false;

        const age = Date.now() - Number(cached.savedAt || 0);

        products = cached.products.filter(productIsActive);
        currentProductList = products;

        renderFeaturedProducts();
        renderDeals();
        renderBestSelling();

        console.log(
            "SastaGo cached products:",
            products.length,
            "Cache age:",
            Math.round(age / 1000),
            "seconds"
        );

        return true;

    } catch (error) {
        console.error("Product cache error:", error);
        return false;
    }
}

function saveProductCache(allProducts) {
    try {
        localStorage.setItem(
            PRODUCT_CACHE_KEY,
            JSON.stringify({
                savedAt: Date.now(),
                products: allProducts
            })
        );
    } catch (error) {
        console.warn("Could not save product cache:", error);
    }
}

/* =====================================================
   PRODUCT LOADING
   ===================================================== */

async function loadProducts(force = false) {
    if (productLoadPromise) {
        return productLoadPromise;
    }

    const grid = getElement("productGrid");

    if (!products.length && grid) {
        grid.innerHTML = `
            <div class="product-loading">
                <p>Loading products...</p>
            </div>
        `;
    }

    productLoadPromise = (async () => {
        try {
            const cached = JSON.parse(
                localStorage.getItem(PRODUCT_CACHE_KEY) || "null"
            );

            const cacheAge = cached
                ? Date.now() - Number(cached.savedAt || 0)
                : Infinity;

            if (
                !force &&
                products.length &&
                cacheAge < PRODUCT_CACHE_TIME
            ) {
                return products;
            }

            console.log("SastaGo: Fetching products...");
            console.log("Firebase Project:", db.app.options.projectId);

            const snapshot = await getDocs(collection(db, "products"));

            const allProducts = snapshot.docs.map(item => ({
                id: item.id,
                ...item.data()
            }));

            products = allProducts.filter(productIsActive);
            currentProductList = products;

            saveProductCache(products);

            renderProducts(products);
            renderFeaturedProducts();
            renderDeals();
            renderBestSelling();
            renderWishlist();

            console.log("Products loaded:", products.length);

            return products;

        } catch (error) {
            console.error("SastaGo Products Error:", error);

            if (!products.length && grid) {
                grid.innerHTML = `
                    <div class="empty-state">
                        <h3>Products Could Not Be Loaded</h3>
                        <p>${escapeHTML(error.message)}</p>
                        <button class="primary-btn" onclick="location.reload()">
                            Try Again
                        </button>
                    </div>
                `;
            } else {
                showToast(
                    "Could not refresh products. Showing saved products.",
                    "error"
                );
            }

            return products;

        } finally {
            productLoadPromise = null;
        }
    })();

    return productLoadPromise;
}

/* =====================================================
   PRODUCT IMAGE
   ===================================================== */

function productImageHTML(image, name, index = 0) {
    if (!image) {
        return `<div class="product-image-placeholder">No Image</div>`;
    }

    return `
        <img
            src="${escapeHTML(image)}"
            alt="${escapeHTML(name)}"
            loading="${index < 4 ? "eager" : "lazy"}"
            ${index < 4 ? 'fetchpriority="high"' : ""}
            decoding="async"
            onerror="this.style.display='none'"
        >
    `;
}

/* =====================================================
   PRODUCT CARD
   ===================================================== */

function productCard(product, index = 0) {
    const price = productPrice(product);
    const mrp = productMRP(product);
    const image = productImage(product);
    const name = productName(product);
    const brand = brandNameForProduct(product);

    const safeId = escapeHTML(product.id);

    const discount = mrp > price && mrp > 0
        ? Math.round(((mrp - price) / mrp) * 100)
        : 0;

    const stock = productStock(product);

    return `
        <div class="product-card">

            <div onclick="showProduct('${safeId}')" style="cursor:pointer">

                ${productImageHTML(image, name, index)}

                <div class="product-info">

                    <h3>${escapeHTML(name)}</h3>

                    <p class="product-brand">
                        ${escapeHTML(brand)}
                    </p>

                    ${getRatingHTML(product)}

                    <div class="product-price">
                        Rs. ${money(price)}
                    </div>

                    ${
                        mrp > price && mrp > 0
                        ? `
                            <span class="old-price">
                                Rs. ${money(mrp)}
                            </span>

                            <span class="discount-label">
                                ${discount}% OFF
                            </span>
                        `
                        : ""
                    }

                </div>
            </div>

            <div class="product-card-actions">

                <button
                    type="button"
                    onclick="showProduct('${safeId}')"
                    class="details-btn"
                >
                    View Details
                </button>

                <button
                    type="button"
                    onclick="addToCart('${safeId}')"
                    ${stock <= 0 ? "disabled" : ""}
                >
                    ${stock <= 0 ? "Out of Stock" : "Add to Cart"}
                </button>

                <button
                    type="button"
                    onclick="toggleWishlist('${safeId}')"
                    class="wishlist-btn"
                >
                    ♡ Wishlist
                </button>

            </div>

        </div>
    `;
}

/* =====================================================
   RENDER PRODUCTS
   ===================================================== */

function renderProducts(list = products) {
    const grid = getElement("productGrid");
    if (!grid) return;

    currentProductList = list || [];

    if (!currentProductList.length) {
        grid.innerHTML = `
            <div class="empty-state">
                <h3>No Products Found</h3>
                <p>Products are not available right now.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = currentProductList
        .map((product, index) => productCard(product, index))
        .join("");
}

/* =====================================================
   FEATURED PRODUCTS
   ===================================================== */

function renderFeaturedProducts() {
    const box = getElement("featuredProducts");
    if (!box) return;

    const featured = products.filter(product =>
        product.isFeatured === true ||
        product.featured === true
    );

    box.innerHTML = (
        featured.length ? featured : products.slice(0, 8)
    ).map((product, index) => productCard(product, index)).join("")
        || "<p>No products available.</p>";
}

/* =====================================================
   DEAL PRODUCTS
   ===================================================== */

function renderDeals() {
    const box = getElement("dealProducts");
    if (!box) return;

    const deals = products.filter(product =>
        productMRP(product) > productPrice(product) &&
        productPrice(product) > 0
    );

    box.innerHTML = deals.length
        ? deals.map((product, index) => productCard(product, index)).join("")
        : "<p>No special deals available.</p>";
}

/* =====================================================
   BEST SELLING
   ===================================================== */

function renderBestSelling() {
    const box = getElement("bestSellingProducts");
    if (!box) return;

    const best = products.filter(product =>
        product.isBestSelling === true ||
        product.bestSelling === true
    );

    box.innerHTML = (
        best.length ? best : products.slice(0, 6)
    ).map((product, index) => productCard(product, index)).join("")
        || "<p>No products available.</p>";
}

/* =====================================================
   SEARCH
   ===================================================== */

function searchProducts() {
    const input = getElement("searchInput");
    if (!input) return;

    const keyword = input.value.toLowerCase().trim();

    const filtered = products.filter(product => {
        return (
            productName(product).toLowerCase().includes(keyword) ||
            brandNameForProduct(product).toLowerCase().includes(keyword) ||
            categoryNameForProduct(product).toLowerCase().includes(keyword) ||
            productDescription(product).toLowerCase().includes(keyword)
        );
    });

    setText(
        "productsTitle",
        keyword ? "Search Results" : "All Products"
    );

    currentProductList = filtered;
    showPage("products");
}

/* =====================================================
   LOW STOCK MESSAGE
   ===================================================== */

function getLowStockHTML(stock) {
    if (stock <= 0) {
        return `<p class="stock-status out-of-stock">Out of Stock</p>`;
    }

    if (stock <= 5) {
        return `
            <p class="stock-status low-stock">
                Only ${stock} left in stock!
            </p>
        `;
    }

    return "";
}

/* =====================================================
   PRODUCT DETAILS
   ===================================================== */

function showProduct(id) {
    const product = products.find(item => item.id === id);

    if (!product) {
        showToast("Product is not available.", "error");
        return;
    }

    selectedProductId = id;
    selectedProductQuantity = 1;

    const box = getElement("productDetails");
    if (!box) return;

    const price = productPrice(product);
    const mrp = productMRP(product);
    const image = productImage(product);
    const name = productName(product);
    const brand = brandNameForProduct(product);
    const brandLogo = brandLogoForProduct(product);
    const category = categoryNameForProduct(product);
    const stock = productStock(product);
    const images = productImages(product);

    const gallery = images.map(url => `
        <img
            src="${escapeHTML(url)}"
            alt="${escapeHTML(name)}"
            class="detail-thumbnail"
            onclick="document.getElementById('mainProductImage').src=this.src"
            loading="lazy"
        >
    `).join("");

    box.innerHTML = `
        <div class="product-detail-layout">

            <div class="product-detail-image-area">

                ${
                    image
                    ? `
                        <img
                            id="mainProductImage"
                            src="${escapeHTML(image)}"
                            alt="${escapeHTML(name)}"
                            class="main-product-image"
                            fetchpriority="high"
                        >
                    `
                    : `<div class="main-product-image">No Image Available</div>`
                }

                <div class="product-image-gallery">
                    ${gallery}
                </div>

            </div>

            <div class="product-detail-info">

                <h2>${escapeHTML(name)}</h2>

                ${getRatingHTML(product)}

                <div class="detail-brand">

                    ${
                        brandLogo
                        ? `<img src="${escapeHTML(brandLogo)}" alt="${escapeHTML(brand)}">`
                        : ""
                    }

                    <span>Brand: ${escapeHTML(brand)}</span>

                </div>

                <p>Category: ${escapeHTML(category)}</p>
                <p>Unit: ${escapeHTML(product.unit || "Piece")}</p>

                <div class="detail-price">
                    Rs.
                    <span id="detailUnitPrice">${money(price)}</span>

                    ${
                        mrp > price
                        ? `<span class="old-price">Rs. ${money(mrp)}</span>`
                        : ""
                    }
                </div>

                ${getLowStockHTML(stock)}
                ${getQuantityPricingHTML(product)}

                <div class="detail-quantity-control">

                    <button type="button" onclick="changeDetailQuantity(-1)">−</button>

                    <span id="detailQuantity">1</span>

                    <button type="button" onclick="changeDetailQuantity(1)">+</button>

                </div>

                <p>
                    Total:
                    Rs.
                    <strong id="detailTotalPrice">${money(price)}</strong>
                </p>

                <button
                    type="button"
                    class="primary-btn"
                    onclick="addDetailProductToCart()"
                    ${stock <= 0 ? "disabled" : ""}
                >
                    ${stock <= 0 ? "Out of Stock" : "Add to Cart"}
                </button>

                <button
                    type="button"
                    onclick="toggleWishlist('${escapeHTML(product.id)}')"
                    class="wishlist-btn"
                >
                    ♡ Add to Wishlist
                </button>

            </div>

        </div>

        <div class="product-description">
            <h3>Product Description</h3>
            <p>${escapeHTML(productDescription(product))}</p>
        </div>
    `;

    showPage("productDetails");
    updateDetailPricing();
}

/* =====================================================
   DETAIL QUANTITY
   ===================================================== */

function changeDetailQuantity(change) {
    const product = products.find(item => item.id === selectedProductId);
    if (!product) return;

    const next = selectedProductQuantity + Number(change);

    if (next < 1) return;

    if (next > productStock(product)) {
        showToast(
            "Available stock is only " + productStock(product),
            "error"
        );
        return;
    }

    selectedProductQuantity = next;
    updateDetailPricing();
}

function updateDetailPricing() {
    const product = products.find(item => item.id === selectedProductId);
    if (!product) return;

    setText("detailQuantity", selectedProductQuantity);

    setText(
        "detailUnitPrice",
        money(getUnitPrice(product, selectedProductQuantity))
    );

    setText(
        "detailTotalPrice",
        money(getLineTotal(product, selectedProductQuantity))
    );
}

function addDetailProductToCart() {
    if (selectedProductId) {
        addToCart(selectedProductId, selectedProductQuantity);
    }
}

/* =====================================================
   CATEGORIES
   ===================================================== */

function loadCachedCategories() {
    try {
        const saved = JSON.parse(localStorage.getItem(CATEGORY_CACHE_KEY) || "[]");
        if (!Array.isArray(saved)) return false;
        categories = saved.filter(categoryIsActive);
        renderCategories();
        return categories.length > 0;
    } catch (error) {
        console.warn("Category cache unavailable:", error);
        return false;
    }
}

async function loadCategories() {
    if (categoryLoadPromise) return categoryLoadPromise;

    categoryLoadPromise = (async () => {
        try {
            const snapshot = await getDocs(collection(db, "categories"));

            categories = snapshot.docs.map(item => ({
                id: item.id,
                ...item.data()
            })).filter(categoryIsActive);
            try { localStorage.setItem(CATEGORY_CACHE_KEY, JSON.stringify(categories)); }
            catch (cacheError) { console.warn("Could not cache categories:", cacheError); }

            renderCategories();

        } catch (error) {
            console.error("Category Error:", error);
            setHTML(
                "allCategories",
                "<p>Categories could not be loaded.</p>"
            );
        } finally {
            categoryLoadPromise = null;
        }
    })();

    return categoryLoadPromise;
}

function renderCategories() {
    const html = categories.map(category => {
        const id = escapeHTML(category.id);

        const image = safeImage(
            category.image || category.imageUrl || category.icon
        );

        const name = escapeHTML(
            category.name || category.title || "Category"
        );

        return `
            <div class="category-card" onclick="showCategory('${id}')">

                ${
                    image
                    ? `<img src="${escapeHTML(image)}" alt="${name}" loading="lazy">`
                    : ""
                }

                <h3>${name}</h3>

            </div>
        `;
    }).join("");

    setHTML("homeCategories", html || "<p>No categories available.</p>");
    setHTML("allCategories", html || "<p>No categories available.</p>");
}

function showCategory(id) {
    const category = categories.find(item => item.id === id);
    if (!category) return;

    const filtered = products.filter(product =>
        product.categoryId === id ||
        product.category === category.name
    );

    setText("productsTitle", category.name || "Category Products");

    currentProductList = filtered;
    showPage("products");
}

/* =====================================================
   BRANDS
   ===================================================== */

function loadCachedBrands() {
    try {
        const saved = JSON.parse(localStorage.getItem(BRAND_CACHE_KEY) || "[]");
        if (!Array.isArray(saved)) return false;
        brands = saved.filter(brandIsActive);
        renderBrands();
        return brands.length > 0;
    } catch (error) {
        console.warn("Brand cache unavailable:", error);
        return false;
    }
}

async function loadBrands() {
    if (brandLoadPromise) return brandLoadPromise;

    brandLoadPromise = (async () => {
        try {
            const snapshot = await getDocs(collection(db, "brands"));

            brands = snapshot.docs.map(item => ({
                id: item.id,
                ...item.data()
            })).filter(brandIsActive);
            try { localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(brands)); }
            catch (cacheError) { console.warn("Could not cache brands:", cacheError); }

            renderBrands();

        } catch (error) {
            console.error("Brand Error:", error);
            setHTML("allBrands", "<p>Brands could not be loaded.</p>");
        } finally {
            brandLoadPromise = null;
        }
    })();

    return brandLoadPromise;
}

function renderBrands() {
    const html = brands.map(brand => {
        const id = escapeHTML(brand.id);

        const logo = safeImage(
            brand.logo || brand.logoUrl || brand.imageUrl
        );

        const name = escapeHTML(brand.name || "Brand");

        return `
            <div class="brand-card" onclick="showBrand('${id}')">

                ${
                    logo
                    ? `<img src="${escapeHTML(logo)}" alt="${name}" loading="lazy">`
                    : ""
                }

                <h3>${name}</h3>

            </div>
        `;
    }).join("");

    setHTML("homeBrands", html || "<p>No brands available.</p>");
    setHTML("allBrands", html || "<p>No brands available.</p>");
}

function showBrand(id) {
    const brand = brands.find(item => item.id === id);
    if (!brand) return;

    const filtered = products.filter(product =>
        product.brandId === id ||
        product.brand === brand.name
    );

    setText("productsTitle", brand.name + " Products");

    currentProductList = filtered;
    showPage("products");
}

/* =====================================================
   CART COUNT
   ===================================================== */

function updateCartCount() {
    const count = cart.reduce(
        (total, item) => total + Number(item.quantity || 0),
        0
    );

    setText("cartCount", count);
}

/* =====================================================
   BILL CALCULATIONS
   ===================================================== */

function getCartSubtotal() {
    return cart.reduce((total, item) => {
        const product = products.find(product => product.id === item.id);

        const price = product
            ? getLineTotal(product, item.quantity)
            : Number(item.price || 0) * Number(item.quantity || 0);

        return total + price;
    }, 0);
}

function getDeliveryFee(subtotal) {
    return subtotal >= FREE_DELIVERY_LIMIT ? 0 : DELIVERY_FEE;
}

function getServiceCharge() {
    return cart.length ? SERVICE_CHARGE : 0;
}

function getBillSummary(subtotal) {
    const delivery = getDeliveryFee(subtotal);
    const service = getServiceCharge();

    return {
        subtotal,
        delivery,
        service,
        grandTotal: subtotal + delivery + service
    };
}

/* =====================================================
   ADD TO CART
   ===================================================== */

function addToCart(id, requestedQuantity = 1) {
    const product = products.find(item => item.id === id);

    if (!product) {
        showToast("Product is not available.", "error");
        return;
    }

    const quantity = Math.max(1, Number(requestedQuantity || 1));

    const existing = cart.find(item => item.id === id);
    const currentQuantity = existing
        ? Number(existing.quantity || 0)
        : 0;

    const stock = productStock(product);

    if (stock <= 0) {
        showToast("This product is out of stock.", "error");
        return;
    }

    if (currentQuantity + quantity > stock) {
        showToast("Available stock is only " + stock, "error");
        return;
    }

    if (existing) {
        existing.quantity += quantity;
    } else {
        cart.push({
            id: product.id,
            name: productName(product),
            price: productPrice(product),
            image: productImage(product),
            quantity
        });
    }

    saveCart();
    showToast("Product added to cart!");
}

/* =====================================================
   CHANGE CART QUANTITY
   ===================================================== */

function changeQuantity(id, change) {
    const item = cart.find(product => product.id === id);
    if (!item) return;

    const product = products.find(product => product.id === id);
    const next = Number(item.quantity) + Number(change);

    if (next < 1) {
        removeFromCart(id);
        return;
    }

    if (product && next > productStock(product)) {
        showToast(
            "Available stock is only " + productStock(product),
            "error"
        );
        return;
    }

    item.quantity = next;

    if (product) {
        item.price = productPrice(product);
        item.name = productName(product);
        item.image = productImage(product);
    }

    saveCart();
    renderCart();
}

function removeFromCart(id) {
    cart = cart.filter(item => item.id !== id);

    saveCart();
    renderCart();

    showToast("Product removed from cart.");
}

/* =====================================================
   BILL SUMMARY HTML
   ===================================================== */

function billSummaryHTML(summary) {
    return `
        <div class="bill-summary">

            <h3>Bill Summary</h3>

            <div class="bill-row">
                <span>Products Subtotal</span>
                <strong>Rs. ${money(summary.subtotal)}</strong>
            </div>

            <div class="bill-row">
                <span>Delivery Charges</span>
                <strong>
                    ${summary.delivery === 0
                        ? "FREE"
                        : "Rs. " + money(summary.delivery)}
                </strong>
            </div>

            <div class="bill-row">
                <span>Service Charges</span>
                <strong>Rs. ${money(summary.service)}</strong>
            </div>

            <div class="bill-row grand-total">
                <span>Grand Total</span>
                <strong>Rs. ${money(summary.grandTotal)}</strong>
            </div>

            ${
                summary.delivery === 0
                ? `<p class="free-delivery-message">Congratulations! Free delivery applied.</p>`
                : `<p class="delivery-message">Add Rs. ${money(FREE_DELIVERY_LIMIT - summary.subtotal)} more to get free delivery.</p>`
            }

        </div>
    `;
}

/* =====================================================
   RENDER CART
   ===================================================== */

function renderCart() {
    const box = getElement("cartProducts");
    const summaryBox = getElement("cartSummary");

    if (!box || !summaryBox) return;

    if (!cart.length) {
        box.innerHTML = `
            <div class="empty-state">
                <h3>Your Cart is Empty</h3>
                <p>Add products to your cart to continue.</p>
            </div>
        `;

        summaryBox.innerHTML = "";
        return;
    }

    box.innerHTML = cart.map(item => {
        const product = products.find(product => product.id === item.id);
        const quantity = Number(item.quantity || 0);

        const unitPrice = product
            ? getUnitPrice(product, quantity)
            : Number(item.price || 0);

        const subtotal = product
            ? getLineTotal(product, quantity)
            : unitPrice * quantity;

        const image = product ? productImage(product) : item.image;

        return `
            <div class="order-card cart-item">

                ${
                    safeImage(image)
                    ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(item.name)}" class="cart-product-image">`
                    : ""
                }

                <div class="cart-product-info">

                    <h3>${escapeHTML(item.name)}</h3>

                    <p>Rs. ${money(unitPrice)} each</p>

                    <div class="cart-quantity-control">

                        <button type="button" onclick="changeQuantity('${escapeHTML(item.id)}',-1)">−</button>

                        <strong>${quantity}</strong>

                        <button type="button" onclick="changeQuantity('${escapeHTML(item.id)}',1)">+</button>

                    </div>

                    <p>
                        Subtotal:
                        <strong>Rs. ${money(subtotal)}</strong>
                    </p>

                    <button
                        type="button"
                        onclick="removeFromCart('${escapeHTML(item.id)}')"
                        class="remove-cart-btn"
                    >
                        Remove
                    </button>

                </div>
            </div>
        `;
    }).join("");

    const subtotal = getCartSubtotal();
    summaryBox.innerHTML = billSummaryHTML(getBillSummary(subtotal));
}

/* =====================================================
   CHECKOUT SUMMARY
   ===================================================== */

function renderCheckoutSummary() {
    const box = getElement("checkoutSummary");
    if (!box) return;

    if (!cart.length) {
        box.innerHTML = "<p>Your cart is empty.</p>";
        return;
    }

    box.innerHTML = billSummaryHTML(
        getBillSummary(getCartSubtotal())
    );
}

/* =====================================================
   WISHLIST
   ===================================================== */

function toggleWishlist(id) {
    if (wishlist.includes(id)) {
        wishlist = wishlist.filter(item => item !== id);
        showToast("Removed from wishlist.");
    } else {
        wishlist.push(id);
        showToast("Added to wishlist!");
    }

    saveWishlist();
    renderWishlist();
}

function renderWishlist() {
    const box = getElement("wishlistProducts");
    if (!box) return;

    const items = products.filter(product => wishlist.includes(product.id));

    box.innerHTML = items.length
        ? items.map((product, index) => productCard(product, index)).join("")
        : "<p>Your wishlist is empty.</p>";
}

function updateWishlistCount() {
    setText("wishlistCount", wishlist.length);
}

/* =====================================================
   SIGNUP
   ===================================================== */

getElement("signupForm")?.addEventListener("submit", async function(event) {
    event.preventDefault();

    const name = getElement("signupName")?.value.trim() || "";
    const phone = getElement("signupPhone")?.value.trim() || "";
    const email = getElement("signupEmail")?.value.trim() || "";
    const password = getElement("signupPassword")?.value || "";

    if (!name || !phone || !email || !password) {
        showToast("Please complete all signup fields.", "error");
        return;
    }

    try {
        const result = await createUserWithEmailAndPassword(
            auth,
            email,
            password
        );

        await setDoc(doc(db, "customers", result.user.uid), {
            uid: result.user.uid,
            name,
            phone,
            email,
            address: "",
            createdAt: serverTimestamp()
        });

        showToast("Account created successfully!");
        this.reset();

    } catch (error) {
        console.error("Signup Error:", error);
        showToast(error.message, "error");
    }
});

/* =====================================================
   LOGIN
   ===================================================== */

getElement("loginForm")?.addEventListener("submit", async function(event) {
    event.preventDefault();

    const email = getElement("loginEmail")?.value.trim() || "";
    const password = getElement("loginPassword")?.value || "";

    if (!email || !password) {
        showToast("Enter your email and password.", "error");
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);

        showToast("Login successful!");
        showPage("home");

    } catch (error) {
        console.error("Login Error:", error);
        showToast(error.message, "error");
    }
});

/* =====================================================
   AUTH STATE - FIXED
   ===================================================== */

function showCustomerAuth() {
    const loader = getElement("loader");
    const authSection = getElement("authSection");
    const appSection = getElement("appSection");

    if (loader) loader.hidden = true;
    if (appSection) appSection.hidden = true;
    if (authSection) authSection.hidden = false;
}

function showCustomerApp() {
    const loader = getElement("loader");
    const authSection = getElement("authSection");
    const appSection = getElement("appSection");

    if (loader) loader.hidden = true;
    if (authSection) authSection.hidden = true;
    if (appSection) appSection.hidden = false;
}

onAuthStateChanged(auth, async user => {
    currentUser = user;

    try {
        if (user) {
            showCustomerApp();

            await loadProfile();

            console.log("SastaGo customer logged in:", user.uid);

        } else {
            customerOrdersCache = [];
            window.sastagoCustomerOrders = customerOrdersCache;

            showCustomerAuth();

            const profile = getElement("profileDetails");

            if (profile) {
                profile.textContent =
                    "Please login to see your profile.";
            }

            console.log("SastaGo: Customer login required.");
        }

    } catch (error) {
        console.error("Authentication State Error:", error);

        if (user) {
            showCustomerApp();
        } else {
            showCustomerAuth();
        }
    }
});

/* =====================================================
   PROFILE
   ===================================================== */

async function loadProfile() {
    if (!currentUser) return;

    try {
        const snapshot = await getDoc(
            doc(db, "customers", currentUser.uid)
        );

        if (!snapshot.exists()) return;

        const customer = snapshot.data();

        setHTML("profileDetails", `
            <h3>${escapeHTML(customer.name || "")}</h3>
            <p>Email: ${escapeHTML(customer.email || "")}</p>
            <p>Phone: ${escapeHTML(customer.phone || "")}</p>
            <p>Address: ${escapeHTML(customer.address || "Not added")}</p>
        `);

        const fields = {
            customerName: customer.name || "",
            customerPhone: customer.phone || "",
            customerEmail: customer.email || "",
            customerAddress: customer.address || "",
            savedAddress: customer.address || ""
        };

        Object.entries(fields).forEach(([id, value]) => {
            const element = getElement(id);

            if (element && !element.value) {
                element.value = value;
            }
        });

    } catch (error) {
        console.error("Profile Error:", error);
    }
}

/* =====================================================
   SAVE ADDRESS
   ===================================================== */

async function saveCustomerAddress() {
    if (!currentUser) {
        showToast("Please login first.", "error");
        return;
    }

    const address = getElement("savedAddress")?.value.trim() || "";

    try {
        await setDoc(
            doc(db, "customers", currentUser.uid),
            { address },
            { merge: true }
        );

        showToast("Address saved successfully!");
        await loadProfile();

    } catch (error) {
        showToast(error.message, "error");
    }
}

/* =====================================================
   CHANGE PASSWORD
   ===================================================== */

getElement("passwordForm")?.addEventListener("submit", async function(event) {
    event.preventDefault();

    if (!currentUser) {
        showToast("Please login first.", "error");
        return;
    }

    const password = getElement("newPassword")?.value || "";

    if (password.length < 6) {
        showToast("Password must contain at least 6 characters.", "error");
        return;
    }

    try {
        await updatePassword(currentUser, password);

        showToast("Password updated successfully!");
        this.reset();

    } catch (error) {
        showToast(error.message, "error");
    }
});

/* =====================================================
   FORGOT PASSWORD
   ===================================================== */

async function forgotPassword() {
    const email = getElement("loginEmail")?.value.trim() || "";

    if (!email) {
        showToast("Please enter your email address first.", "error");
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        showToast("Password reset email sent!");

    } catch (error) {
        showToast(error.message, "error");
    }
}

/* =====================================================
   LOGOUT
   ===================================================== */

async function customerLogout() {
    if (!currentUser) {
        showToast("You are not logged in.", "error");
        return;
    }

    if (!confirm("Are you sure you want to logout?")) return;

    try {
        await signOut(auth);
        showToast("Logout successful!");
        showPage("home");

    } catch (error) {
        showToast(error.message, "error");
    }
}

/* =====================================================
   PLACE ORDER
   ===================================================== */

getElement("checkoutForm")?.addEventListener("submit", async function(event) {
    event.preventDefault();

    if (!currentUser) {
        showToast("Please login before placing an order.", "error");
        showPage("settings");
        showSettingsSection("loginSection");
        return;
    }

    if (!cart.length) {
        showToast("Your cart is empty.", "error");
        return;
    }

    const name = getElement("customerName")?.value.trim() || "";
    const phone = getElement("customerPhone")?.value.trim() || "";
    const email = getElement("customerEmail")?.value.trim() || "";
    const address = getElement("customerAddress")?.value.trim() || "";
    // City is optional because the updated checkout form may not show it.
    const city = getElement("customerCity")?.value.trim() || "";
    const manualMapLink = getElement("mapLink")?.value.trim() || "";
    // SastaGo currently supports Cash on Delivery only.
    const payment = "Cash on Delivery";
    const note = getElement("orderNote")?.value.trim() || "";

    if (!name || !phone || !address) {
        showToast("Please complete your delivery details.", "error");
        return;
    }

    if (manualMapLink && !safeExternalURL(manualMapLink)) {
        showToast("Please enter a valid map link.", "error");
        return;
    }

    const submitButton = this.querySelector('button[type="submit"]');

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Placing Order...";
    }

    try {
        await loadProducts();

        // Location/GPS is handled separately by customer-location.js.
        const mapLink = manualMapLink || "";

        const orderItems = [];

        for (const item of cart) {
            const product = products.find(product => product.id === item.id);

            if (!product) {
                throw new Error(item.name + " is no longer available.");
            }

            const quantity = Number(item.quantity || 0);
            const stock = productStock(product);

            if (stock < quantity) {
                throw new Error(
                    item.name + " has insufficient stock. Available: " + stock
                );
            }

            const unitPrice = getUnitPrice(product, quantity);
            const itemSubtotal = getLineTotal(product, quantity);

            if (unitPrice <= 0) {
                throw new Error(item.name + " has an invalid price.");
            }

            orderItems.push({
                productId: product.id,
                name: productName(product),
                image: productImage(product),
                brand: brandNameForProduct(product),
                unit: product.unit || "Piece",
                price: unitPrice,
                quantity,
                subtotal: itemSubtotal
            });
        }

        const subtotal = orderItems.reduce(
            (sum, item) => sum + item.subtotal,
            0
        );

        const deliveryFee = getDeliveryFee(subtotal);
        const serviceCharge = SERVICE_CHARGE;
        const grandTotal = subtotal + deliveryFee + serviceCharge;

        const orderNumber = "SG-" + Date.now().toString().slice(-9);

        const orderData = {
            orderNumber,

            customerId: currentUser.uid,
            customerName: name,
            customerPhone: phone,
            customerEmail: email,

            deliveryAddress: address,
            city,

            mapLink,

            paymentMethod: payment,
            note,

            items: orderItems,

            subtotal,
            deliveryFee,
            serviceCharge,

            grandTotal,
            total: grandTotal,
            totalAmount: grandTotal,

            status: "Pending",
            createdAt: serverTimestamp()
        };

        const reference = await addDoc(
            collection(db, "orders"),
            orderData
        );

        /* WhatsApp Order Message — attractive emoji bill */

        let message = "🛒 *SASTAGO — NEW ORDER*\n";
        message += "━━━━━━━━━━━━━━━━━━━━\n";
        message += "🧾 *Order No:* " + orderNumber + "\n";
        message += "📅 *Date:* " + new Date().toLocaleString("en-PK") + "\n";
        message += "📌 *Status:* Pending\n\n";
        message += "👤 *CUSTOMER DETAILS*\n";
        message += "🙍 *Name:* " + name + "\n";
        message += "📞 *Phone:* " + phone + "\n";
        message += "🏠 *Address:* " + address + (city ? ", " + city : "") + "\n";
        if (mapLink) message += "🗺️ *Delivery Map:* " + mapLink + "\n";
        message += "\n🛍️ *ORDER ITEMS*\n";
        message += "━━━━━━━━━━━━━━━━━━━━\n";
        orderItems.forEach((item, index) => {
            message += (index + 1) + ". *" + item.name + "*\n";
            message += "   " + item.quantity + " x Rs. " + money(item.price) +
                " = *Rs. " + money(item.subtotal) + "*\n";
        });
        message += "\n💳 *BILL SUMMARY*\n";
        message += "━━━━━━━━━━━━━━━━━━━━\n";
        message += "🧺 Subtotal: Rs. " + money(subtotal) + "\n";
        message += "🚚 Delivery: " +
            (deliveryFee === 0 ? "FREE 🎉" : "Rs. " + money(deliveryFee)) + "\n";
        message += "🧾 Service Charge: Rs. " + money(serviceCharge) + "\n";
        message += "💰 *GRAND TOTAL: Rs. " + money(grandTotal) + "*\n";
        message += "💵 *Payment:* Cash on Delivery\n";
        if (note) message += "📝 *Note:* " + note + "\n";
        message += "━━━━━━━━━━━━━━━━━━━━\n";
        message += "✅ Thank you for shopping with *SastaGo*!\n";
        message += "📲 WhatsApp: " + DISPLAY_WHATSAPP + "\n";
        message += "🔖 Order ID: " + reference.id;

        const whatsappURL =
            "https://wa.me/" + WHATSAPP_NUMBER +
            "?text=" + encodeURIComponent(message);

        cart = [];
        saveCart();

        this.reset();
        renderCart();

        showToast("Your order has been placed successfully!");

        window.location.href = whatsappURL;

    } catch (error) {
        console.error("Order Error:", error);
        showToast("Order failed: " + error.message, "error");

    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Place Order";
        }
    }
});

/* =====================================================
   MY ORDERS
   ===================================================== */

async function loadOrders() {
    const box = getElement("customerOrders");
    if (!box) return;

    if (!currentUser) {
        box.innerHTML = "<p>Please login to see your orders.</p>";
        return;
    }

    box.innerHTML = "<p>Loading your orders...</p>";

    try {
        const ordersQuery = query(
            collection(db, "orders"),
            where("customerId", "==", currentUser.uid)
        );

        const snapshot = await getDocs(ordersQuery);

        if (snapshot.empty) {
            customerOrdersCache = [];
            window.sastagoCustomerOrders = customerOrdersCache;

            box.innerHTML = `
                <div class="empty-state">
                    <h3>No Orders Found</h3>
                    <p>You have not placed any orders yet.</p>
                </div>
            `;
            return;
        }

        const orders = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

        orders.sort((a, b) => {
            const dateA = a.createdAt?.toMillis
                ? a.createdAt.toMillis()
                : 0;

            const dateB = b.createdAt?.toMillis
                ? b.createdAt.toMillis()
                : 0;

            return dateB - dateA;
        });

        customerOrdersCache = orders;
        window.sastagoCustomerOrders = customerOrdersCache;

        box.innerHTML = orders.map((order, index) => {
            const total = Number(
                order.grandTotal ??
                order.totalAmount ??
                order.total ??
                0
            );

            const status = order.status || "Pending";

            const date = order.createdAt?.toDate
                ? order.createdAt.toDate().toLocaleString("en-PK")
                : "Date unavailable";

            const itemCount = Array.isArray(order.items)
                ? order.items.reduce(
                    (sum, item) => sum + Number(item.quantity || 0),
                    0
                )
                : 0;

            return `
                <div class="order-card customer-order-card">

                    <h3>
                        Order: ${escapeHTML(order.orderNumber || order.id)}
                    </h3>

                    <p>${escapeHTML(date)}</p>

                    <p>
                        Products:
                        <strong>${itemCount}</strong>
                    </p>

                    <p>
                        Total:
                        <strong>Rs. ${money(total)}</strong>
                    </p>

                    <p>
                        Status:
                        <strong>${escapeHTML(status)}</strong>
                    </p>

                    <button
                        type="button"
                        class="primary-btn"
                        onclick="openOrderDetails(${index})"
                    >
                        View Order Details
                    </button>

                </div>
            `;
        }).join("");

    } catch (error) {
        console.error("Orders Error:", error);

        box.innerHTML = `
            <div class="empty-state">
                <h3>Orders Could Not Be Loaded</h3>
                <p>${escapeHTML(error.message)}</p>
                <button class="primary-btn" onclick="loadCustomerOrders()">
                    Try Again
                </button>
            </div>
        `;
    }
}

/* =====================================================
   ORDER DETAILS MODAL
   ===================================================== */

function createOrderModal() {
    if (getElement("sastagoOrderModal")) return;

    const modal = document.createElement("div");

    modal.id = "sastagoOrderModal";

    modal.innerHTML = `
        <div class="sastago-modal-overlay" onclick="closeOrderDetails()">

            <div class="sastago-modal-content" onclick="event.stopPropagation()">

                <button
                    type="button"
                    class="sastago-modal-close"
                    onclick="closeOrderDetails()"
                >
                    ×
                </button>

                <div id="sastagoOrderDetailsContent"></div>

            </div>

        </div>
    `;

    document.body.appendChild(modal);

    if (!getElement("sastagoOrderModalStyle")) {
        const style = document.createElement("style");
        style.id = "sastagoOrderModalStyle";

        style.textContent = `
            #sastagoOrderModal {
                display:none;
                position:fixed;
                inset:0;
                z-index:99999;
            }

            .sastago-modal-overlay {
                position:fixed;
                inset:0;
                background:rgba(0,0,0,.65);
                display:flex;
                align-items:center;
                justify-content:center;
                padding:12px;
                overflow-y:auto;
            }

            .sastago-modal-content {
                position:relative;
                background:#fff;
                width:100%;
                max-width:520px;
                max-height:90vh;
                overflow-y:auto;
                border-radius:14px;
                padding:20px;
                color:#222;
            }

            .sastago-modal-close {
                position:sticky;
                top:0;
                float:right;
                border:0;
                background:#eee;
                border-radius:50%;
                width:36px;
                height:36px;
                font-size:25px;
                cursor:pointer;
            }

            .sastago-order-line {
                display:flex;
                justify-content:space-between;
                gap:10px;
                padding:9px 0;
                border-bottom:1px solid #eee;
                font-size:14px;
            }

            .sastago-order-actions {
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:9px;
                margin-top:18px;
            }

            .sastago-order-actions button {
                padding:12px 8px;
                border:0;
                border-radius:8px;
                background:#087b43;
                color:white;
                font-weight:bold;
                cursor:pointer;
            }

            .sastago-order-actions button:disabled {
                opacity:.6;
            }

            .sastago-order-total {
                font-size:19px;
                font-weight:bold;
                color:#087b43;
            }

            .sastago-order-info {
                background:#f5f7f5;
                padding:12px;
                border-radius:8px;
                margin:12px 0;
                line-height:1.8;
                font-size:14px;
            }

            .sastago-map-link {
                color:#087b43;
                font-weight:bold;
            }
        `;

        document.head.appendChild(style);
    }
}

function openOrderDetails(index) {
    const order = customerOrdersCache[index];

    if (!order) {
        showToast("Order details not found.", "error");
        return;
    }

    createOrderModal();

    const modal = getElement("sastagoOrderModal");
    const content = getElement("sastagoOrderDetailsContent");

    const total = Number(
        order.grandTotal ??
        order.totalAmount ??
        order.total ??
        0
    );

    const items = Array.isArray(order.items) ? order.items : [];

    const date = order.createdAt?.toDate
        ? order.createdAt.toDate().toLocaleString("en-PK")
        : "Date unavailable";

    const mapURL = safeExternalURL(order.mapLink);

    const coordinatesAvailable =
        Number.isFinite(Number(order.latitude)) &&
        Number.isFinite(Number(order.longitude));

    const gpsMapURL = coordinatesAvailable
        ? `https://www.google.com/maps?q=${order.latitude},${order.longitude}`
        : "";

    content.innerHTML = `
        <div class="sastago-order-details">

            <h2>SastaGo Order Details</h2>

            <div class="sastago-order-info">

                <strong>Order:</strong>
                ${escapeHTML(order.orderNumber || order.id)}
                <br>

                <strong>Date:</strong>
                ${escapeHTML(date)}
                <br>

                <strong>Status:</strong>
                ${escapeHTML(order.status || "Pending")}
                <br>

                <strong>Customer:</strong>
                ${escapeHTML(order.customerName || "")}
                <br>

                <strong>Phone:</strong>
                ${escapeHTML(order.customerPhone || "")}
                <br>

                <strong>Address:</strong>
                ${escapeHTML([order.deliveryAddress, order.city].filter(Boolean).join(", "))}
                <br>

                <strong>Payment:</strong>
                ${escapeHTML(order.paymentMethod || "")}

                ${
                    mapURL
                    ? `<br><a class="sastago-map-link" href="${escapeHTML(mapURL)}" target="_blank" rel="noopener noreferrer">Open Delivery Map</a>`
                    : ""
                }

                ${
                    gpsMapURL
                    ? `<br><a class="sastago-map-link" href="${escapeHTML(gpsMapURL)}" target="_blank" rel="noopener noreferrer">Open GPS Coordinates</a>`
                    : ""
                }

                ${
                    coordinatesAvailable
                    ? `<br><strong>Latitude:</strong> ${escapeHTML(order.latitude)}<br><strong>Longitude:</strong> ${escapeHTML(order.longitude)}`
                    : ""
                }

            </div>

            <h3>Products</h3>

            ${
                items.map(item => `
                    <div class="sastago-order-line">
                        <span>
                            ${escapeHTML(item.name || "Product")}
                            × ${Number(item.quantity || 0)}
                        </span>

                        <strong>
                            Rs. ${money(item.subtotal ?? (
                                Number(item.price || 0) *
                                Number(item.quantity || 0)
                            ))}
                        </strong>
                    </div>
                `).join("")
            }

            <div class="sastago-order-info">

                <div class="sastago-order-line">
                    <span>Subtotal</span>
                    <strong>Rs. ${money(order.subtotal || 0)}</strong>
                </div>

                <div class="sastago-order-line">
                    <span>Delivery</span>
                    <strong>
                        ${
                            Number(order.deliveryFee || 0) === 0
                            ? "FREE"
                            : "Rs. " + money(order.deliveryFee)
                        }
                    </strong>
                </div>

                <div class="sastago-order-line">
                    <span>Service Charges</span>
                    <strong>Rs. ${money(order.serviceCharge || 0)}</strong>
                </div>

                <div class="sastago-order-line sastago-order-total">
                    <span>Grand Total</span>
                    <strong>Rs. ${money(total)}</strong>
                </div>

            </div>

            ${
                order.note
                ? `<p><strong>Note:</strong> ${escapeHTML(order.note)}</p>`
                : ""
            }

            <div class="sastago-order-info">
                <strong>Business WhatsApp:</strong>
                ${DISPLAY_WHATSAPP}
            </div>

            <div class="sastago-order-actions">

                <button type="button" onclick="downloadOrderPNG('${escapeHTML(order.id)}')">
                    Download PNG
                </button>

                <button type="button" onclick="shareOrderPNG('${escapeHTML(order.id)}')">
                    Share Bill
                </button>

                <button type="button" onclick="printOrderPNG('${escapeHTML(order.id)}')">
                    Print 58mm
                </button>

                <button type="button" onclick="closeOrderDetails()">
                    Close
                </button>

            </div>

        </div>
    `;

    modal.style.display = "block";
    document.body.style.overflow = "hidden";
}

function closeOrderDetails() {
    const modal = getElement("sastagoOrderModal");

    if (modal) modal.style.display = "none";

    document.body.style.overflow = "";
}

/* =====================================================
   BILL CANVAS HELPERS
   ===================================================== */

function createBillCanvas(order) {
    const items = Array.isArray(order.items) ? order.items : [];

    const canvas = document.createElement("canvas");
    canvas.width = BILL_WIDTH;

    const ctx = canvas.getContext("2d");

    const padding = 14;
    const contentWidth = BILL_WIDTH - padding * 2;

    const layout = [];
    let totalHeight = 22;

    function addText(text, options = {}) {
        const {
            size = 14,
            bold = false,
            align = "left",
            gap = 7,
            maxWidth = contentWidth
        } = options;

        ctx.font = `${bold ? "bold " : ""}${size}px Arial`;

        const words = String(text ?? "").split(/\s+/);
        const lines = [];
        let currentLine = "";

        words.forEach(word => {
            const testLine = currentLine
                ? currentLine + " " + word
                : word;

            if (
                currentLine &&
                ctx.measureText(testLine).width > maxWidth
            ) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        });

        if (currentLine) lines.push(currentLine);

        const lineHeight = size + 5;

        layout.push({
            type: "text",
            lines,
            size,
            bold,
            align,
            lineHeight,
            gap
        });

        totalHeight += lines.length * lineHeight + gap;
    }

    function addLine() {
        layout.push({ type: "line" });
        totalHeight += 20;
    }

    function addPair(left, right, bold = false) {
        layout.push({
            type: "pair",
            left: String(left),
            right: String(right),
            bold
        });

        totalHeight += 25;
    }

    function addSection(title) {
        addText(title, { size: 16, bold: true, gap: 8 });
    }

    addText("SastaGo", {
        size: 28,
        bold: true,
        align: "center",
        gap: 5
    });

    addText("Har Cheez, Aap Ke Qareeb!", {
        size: 13,
        align: "center",
        gap: 5
    });

    addText("CUSTOMER ORDER BILL", {
        size: 16,
        bold: true,
        align: "center",
        gap: 8
    });

    addLine();

    addPair(
        "Order No:",
        order.orderNumber || order.id,
        true
    );

    const date = order.createdAt?.toDate
        ? order.createdAt.toDate().toLocaleString("en-PK")
        : "Date unavailable";

    addPair("Date:", date);
    addPair("Status:", order.status || "Pending");

    addLine();

    addSection("Customer Details");

    addText("Name: " + (order.customerName || ""));
    addText("Phone: " + (order.customerPhone || ""));
    if (order.city) addText("City: " + order.city);
    addText("Address: " + (order.deliveryAddress || ""));

    if (order.customerEmail) {
        addText("Email: " + order.customerEmail);
    }

    if (order.paymentMethod) {
        addText("Payment: " + order.paymentMethod);
    }

    const mapURL = safeExternalURL(order.mapLink);
    const hasGPSCoordinates =
        Number.isFinite(Number(order.latitude)) &&
        Number.isFinite(Number(order.longitude)) &&
        order.latitude !== null && order.longitude !== null;
    const gpsMapURL = hasGPSCoordinates
        ? `https://www.google.com/maps?q=${order.latitude},${order.longitude}`
        : "";

    if (mapURL) {
        addText("Delivery Map Link:", { size: 11, bold: true, gap: 2 });
        addText(mapURL, { size: 10, gap: 5 });
    }

    if (gpsMapURL) {
        addText("Customer GPS Location:", { size: 11, bold: true, gap: 2 });
        addText(gpsMapURL, { size: 10, gap: 3 });
        addText("GPS: " + order.latitude + ", " + order.longitude, { size: 10 });
    } else {
        addText("GPS Location: Not shared", { size: 10 });
    }

    addLine();

    addText("PRODUCTS", {
        size: 16,
        bold: true,
        gap: 8
    });

    items.forEach(item => {
        const quantity = Number(item.quantity || 0);

        const subtotal = Number(
            item.subtotal ??
            (Number(item.price || 0) * quantity)
        );

        addText(item.name || "Product", {
            size: 14,
            bold: true,
            gap: 2
        });

        addPair(
            `${quantity} x Rs.${money(item.price || 0)}`,
            "Rs. " + money(subtotal)
        );
    });

    addLine();

    addPair(
        "Subtotal",
        "Rs. " + money(order.subtotal || 0)
    );

    addPair(
        "Delivery",
        Number(order.deliveryFee || 0) === 0
            ? "FREE"
            : "Rs. " + money(order.deliveryFee)
    );

    addPair(
        "Service Charges",
        "Rs. " + money(order.serviceCharge || 0)
    );

    addLine();

    addPair(
        "GRAND TOTAL",
        "Rs. " + money(
            order.grandTotal ??
            order.totalAmount ??
            order.total ??
            0
        ),
        true
    );

    addLine();

    addText("WhatsApp: " + DISPLAY_WHATSAPP, {
        size: 15,
        bold: true,
        align: "center",
        gap: 8
    });

    if (order.note) {
        addText("Order Note: " + order.note, {
            size: 12,
            gap: 8
        });
    }

    addText("Thank You For Shopping!", {
        size: 17,
        bold: true,
        align: "center",
        gap: 5
    });

    addText("SastaGo", {
        size: 18,
        bold: true,
        align: "center",
        gap: 5
    });

    addText("Please Visit Again", {
        size: 13,
        align: "center",
        gap: 15
    });

    canvas.height = Math.ceil(totalHeight + 25);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, BILL_WIDTH, canvas.height);

    ctx.fillStyle = "#111111";

    let y = 24;

    layout.forEach(item => {
        if (item.type === "line") {
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(BILL_WIDTH - padding, y);
            ctx.strokeStyle = "#333333";
            ctx.lineWidth = 1;
            ctx.stroke();

            y += 20;
            return;
        }

        if (item.type === "pair") {
            ctx.font = `${item.bold ? "bold " : ""}14px Arial`;

            ctx.textAlign = "left";
            ctx.fillText(
                item.left,
                padding,
                y,
                contentWidth * 0.58
            );

            ctx.textAlign = "right";
            ctx.fillText(
                item.right,
                BILL_WIDTH - padding,
                y,
                contentWidth * 0.42
            );

            y += 25;
            return;
        }

        ctx.font = `${item.bold ? "bold " : ""}${item.size}px Arial`;

        item.lines.forEach(text => {
            ctx.textAlign = item.align;

            let x = padding;

            if (item.align === "center") {
                x = BILL_WIDTH / 2;
            } else if (item.align === "right") {
                x = BILL_WIDTH - padding;
            }

            ctx.fillText(text, x, y, contentWidth);
            y += item.lineHeight;
        });

        y += item.gap;
    });

    return canvas;
}

window.sastagoCreateBillCanvas = createBillCanvas;
/* =====================================================
   CUSTOMER PANEL INITIALIZATION
   ===================================================== */

async function initializeCustomerPanel() {
    console.log("SastaGo Customer Panel Starting...");

    try {
        console.log(
            "Connected Firebase Project:",
            db.app.options.projectId
        );

        // Load saved products and update screen
        loadCachedProducts();
        loadCachedCategories();
        loadCachedBrands();

        updateCartCount();
        updateWishlistCount();

        renderCart();
        renderWishlist();

        // Load latest Firebase data in background
        Promise.allSettled([
            loadProducts(),
            loadCategories(),
            loadBrands()
        ]).then(() => {
            renderCart();
            renderWishlist();

            console.log("SastaGo data refresh complete.");
        });

        console.log("SastaGo Customer Panel initialized.");

    } catch (error) {
        console.error("Customer Initialization Error:", error);

        showToast(
            "App initialization failed: " + error.message,
            "error"
        );

        const loader = getElement("loader");
        if (loader) loader.hidden = true;
    }
}

initializeCustomerPanel();
/* ================= END OF SASTAGO CUSTOMER.JS ================= */