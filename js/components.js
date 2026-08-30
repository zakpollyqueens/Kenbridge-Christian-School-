/* =========================================================
   KENBRIDGE CHRISTIAN SCHOOL
   COMPONENTS.JS
   ========================================================= */

const SITE_ROOT = new URL("./", document.baseURI);

document.addEventListener("DOMContentLoaded", () => {
    loadFooter();
    setupActiveNavigation();
    setupGalleryFilters();
    setupGalleryLightbox();
});

/* =========================================================
   FOOTER
   ========================================================= */

function loadFooter() {
    const container = document.getElementById("site-footer");
    if (!container) return;

    const footerURL = new URL("components/footer.html", SITE_ROOT).href;

    fetch(footerURL, { cache: "no-cache" })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Footer could not be loaded: ${response.status}`);
            }
            return response.text();
        })
        .then(html => {
            container.innerHTML = html;
            setupFooterLinks();
            setupFooterAssets();
            setupFooterYear();
            setupDeveloperContact();
            createMobileMenuFooter();
        })
        .catch(error => {
            console.error("Kenbridge footer loading error:", error);
        });
}

/* =========================================================
   FOOTER LINKS
   ========================================================= */

function setupFooterLinks() {
    const links = document.querySelectorAll("#site-footer a[data-footer-link]");

    links.forEach(link => {
        const target = link.dataset.footerLink;
        link.href = target ? resolveProjectPath(target) : SITE_ROOT.href;
    });
}

function resolveProjectPath(path) {
    if (!path) return SITE_ROOT.href;

    if (/^(https?:|mailto:|tel:|#)/i.test(path)) {
        return path;
    }

    return new URL(path.replace(/^\/+/, ""), SITE_ROOT).href;
}

/* =========================================================
   FOOTER ASSETS
   ========================================================= */

function setupFooterAssets() {
    const footer = document.getElementById("site-footer");
    if (!footer) return;

    footer.querySelectorAll("[data-asset]").forEach(element => {
        const path = element.dataset.asset;
        if (!path) return;

        const assetURL = new URL(
            path.replace(/^\/+/, ""),
            SITE_ROOT
        ).href;

        if (element.tagName.toLowerCase() === "img") {
            element.src = assetURL;

            element.addEventListener("error", () => {
                element.classList.add("image-error");
                console.warn(
                    "Kenbridge image could not be loaded:",
                    assetURL
                );
            });
        }
    });
}

/* =========================================================
   FOOTER YEAR
   ========================================================= */

function setupFooterYear() {
    const year = document.getElementById("footer-year");
    if (year) {
        year.textContent = new Date().getFullYear();
    }
}

/* =========================================================
   DEVELOPER CONTACT MODAL
   ========================================================= */

function setupDeveloperContact() {
    const openButton = document.getElementById("developerButton");
    const modal = document.getElementById("developerContact");
    const closeButton = document.getElementById("developerClose");
    const overlay = document.getElementById("developerOverlay");

    if (!openButton || !modal || openButton.dataset.developerReady === "true") {
        return;
    }

    openButton.dataset.developerReady = "true";

    function openModal() {
        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("developer-modal-open");
        closeButton?.focus();
    }

    function closeModal() {
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("developer-modal-open");
    }

    openButton.addEventListener("click", openModal);
    closeButton?.addEventListener("click", closeModal);
    overlay?.addEventListener("click", closeModal);

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && modal.classList.contains("show")) {
            closeModal();
        }
    });

    setupMobileDeveloperButton();
}

/* =========================================================
   MOBILE / HAMBURGER FOOTER
   ========================================================= */

function createMobileMenuFooter() {
    const mobileNav = document.getElementById("mobileNav");

    if (!mobileNav || mobileNav.querySelector(".mobile-menu-footer")) {
        return;
    }

    const footer = document.createElement("div");
    footer.className = "mobile-menu-footer";

    const links = [
        ["About", "page/about.html"],
        ["Academics", "page/academics.html"],
        ["Admissions", "page/admissions.html"],
        ["Boarding", "page/boarding.html"],
        ["Gallery", "page/gallery.html"],
        ["Sports", "page/sports.html"],
        ["Contact", "page/contact.html"],
        ["Feedback", "page/feedback.html"]
    ];

    footer.innerHTML = `
        <div class="mobile-footer-brand">
            <h3>Kenbridge Christian School</h3>
            <p>Heads and Not Tails</p>
            <p>Deuteronomy 28:13</p>
        </div>

        <div class="mobile-footer-contact">
            <div class="mobile-footer-info">
                📍 Old Butabika Road,<br>
                Kampala, Uganda
            </div>
            <a href="tel:+256789825517">
                📞 +256 789 825 517
            </a>
            <div class="mobile-footer-info">
                📮 P.O. Box 520093,<br>
                Luzira, Kampala
            </div>
        </div>

        <div class="mobile-footer-links">
            ${links.map(([label, path]) => `
                <a href="${resolveProjectPath(path)}">${label}</a>
            `).join("")}
        </div>

        <div class="mobile-staff-login">
            <span class="mobile-staff-login-label">STAFF PORTAL</span>
            <a href="${resolveProjectPath("staff/login.html")}" class="mobile-staff-login-button">
                🔐 Staff Login
            </a>
        </div>

        <div class="mobile-developer-profile">
            <img data-mobile-developer-image alt="Zakmolanitech Solutions">
            <div>
                <strong>Zakmolanitech Solutions</strong>
                <span>Website Developer</span>
            </div>
        </div>

        <button type="button" class="mobile-developer-button" id="mobileDeveloperButton">
            👨‍💻 Meet the Developer
        </button>

        <div class="mobile-footer-copyright">
            © ${new Date().getFullYear()}
            Kenbridge Christian School.
            <br>
            Website by
            <a href="https://t.me/zakmolanitech" target="_blank" rel="noopener noreferrer">
                Zakmolanitech Solutions
            </a>
        </div>
    `;

    mobileNav.appendChild(footer);

    const image = footer.querySelector("[data-mobile-developer-image]");

    if (image) {
        image.src = new URL(
            "images/Snapchat-1124656073.jpg",
            SITE_ROOT
        ).href;
    }

    setupMobileDeveloperButton();
}

/* =========================================================
   MOBILE STAFF LOGIN
   ========================================================= */

function setupMobileStaffLogin() {
    const button = document.querySelector(
        ".mobile-staff-login-button"
    );

    if (!button) return;

    button.href = resolveProjectPath("staff/login.html");
}

/* =========================================================
   MOBILE DEVELOPER BUTTON
   ========================================================= */

function setupMobileDeveloperButton() {
    const button = document.getElementById("mobileDeveloperButton");
    const modal = document.getElementById("developerContact");

    if (!button || !modal || button.dataset.developerReady === "true") {
        return;
    }

    button.dataset.developerReady = "true";

    button.addEventListener("click", () => {
        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("developer-modal-open");
    });
}

/* =========================================================
   ACTIVE NAVIGATION
   ========================================================= */

function setupActiveNavigation() {
    const currentPage =
        window.location.pathname
            .split("/")
            .filter(Boolean)
            .pop()
            ?.toLowerCase() || "index.html";

    document.querySelectorAll(
        ".desktop-nav a, .mobile-nav a"
    ).forEach(link => {
        const href = link.getAttribute("href");

        if (
            !href ||
            href === "#" ||
            /^(https?:|tel:|mailto:)/i.test(href)
        ) {
            return;
        }

        const page =
            href
                .split("#")[0]
                .split("?")[0]
                .split("/")
                .filter(Boolean)
                .pop();

        if (
            page &&
            page.toLowerCase() === currentPage
        ) {
            link.classList.add("active");
        }
    });
}

/* =========================================================
   GALLERY FILTERS
   ========================================================= */

function setupGalleryFilters() {
    const filters = document.querySelectorAll(".gallery-filter");
    const items = document.querySelectorAll(".gallery-item");

    if (!filters.length || !items.length) {
        return;
    }

    filters.forEach(filter => {
        filter.addEventListener("click", () => {
            const category = filter.dataset.filter;

            filters.forEach(item => {
                item.classList.remove("active");
            });

            filter.classList.add("active");

            items.forEach(item => {
                item.classList.toggle(
                    "hidden",
                    category !== "all" &&
                    item.dataset.category !== category
                );
            });
        });
    });
}

/* =========================================================
   GALLERY LIGHTBOX
   ========================================================= */

function setupGalleryLightbox() {
    const items = [...document.querySelectorAll(".gallery-item")];
    const lightbox = document.getElementById("galleryLightbox");
    const image = document.getElementById("lightboxImage");
    const caption = document.getElementById("lightboxCaption");
    const close = document.getElementById("lightboxClose");
    const previous = document.getElementById("lightboxPrev");
    const next = document.getElementById("lightboxNext");

    if (!items.length || !lightbox || !image || !caption) {
        return;
    }

    let currentIndex = 0;

    function visibleItems() {
        return items.filter(
            item => !item.classList.contains("hidden")
        );
    }

    function showImage(index) {
        const visible = visibleItems();

        if (!visible.length) return;

        currentIndex =
            (index + visible.length) %
            visible.length;

        const item = visible[currentIndex];
        const itemImage = item.querySelector("img");
        const title = item.querySelector("strong");
        const description = item.querySelector("span");

        if (!itemImage) return;

        image.src = itemImage.src;
        image.alt = itemImage.alt || "";
        caption.innerHTML = "";

        if (title) {
            const element = document.createElement("strong");
            element.textContent = title.textContent;
            caption.appendChild(element);
        }

        if (description) {
            if (title) {
                caption.appendChild(
                    document.createElement("br")
                );
            }

            const element = document.createElement("span");
            element.textContent = description.textContent;
            caption.appendChild(element);
        }
    }

    function openLightbox(index) {
        showImage(index);
        lightbox.classList.add("show");
        lightbox.setAttribute("aria-hidden", "false");
        document.body.classList.add("lightbox-open");
    }

    function closeLightbox() {
        lightbox.classList.remove("show");
        lightbox.setAttribute("aria-hidden", "true");
        document.body.classList.remove("lightbox-open");
        image.removeAttribute("src");
    }

    items.forEach(item => {
        item.addEventListener("click", () => {
            const index = visibleItems().indexOf(item);

            if (index !== -1) {
                openLightbox(index);
            }
        });
    });

    close?.addEventListener("click", closeLightbox);

    previous?.addEventListener("click", event => {
        event.stopPropagation();
        showImage(currentIndex - 1);
    });

    next?.addEventListener("click", event => {
        event.stopPropagation();
        showImage(currentIndex + 1);
    });

    lightbox.addEventListener("click", event => {
        if (event.target === lightbox) {
            closeLightbox();
        }
    });

    document.addEventListener("keydown", event => {
        if (!lightbox.classList.contains("show")) {
            return;
        }

        if (event.key === "Escape") {
            closeLightbox();
        }

        if (event.key === "ArrowLeft") {
            showImage(currentIndex - 1);
        }

        if (event.key === "ArrowRight") {
            showImage(currentIndex + 1);
        }
    });
}
