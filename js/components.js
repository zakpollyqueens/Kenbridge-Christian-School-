/* =========================================================
   KENBRIDGE CHRISTIAN SCHOOL
   COMPONENTS.JS
   ========================================================= */

(function () {
"use strict";

/* =========================================================
   PROJECT ROOT
   ========================================================= */

const SCRIPT =
    document.querySelector('script[src*="js/components.js"]');

const SCRIPT_URL = SCRIPT
    ? new URL(SCRIPT.getAttribute("src"), document.baseURI)
    : new URL("js/components.js", document.baseURI);

const PROJECT_ROOT = new URL("../", SCRIPT_URL);

document.addEventListener("DOMContentLoaded", () => {
    loadFooter();
    setupActiveNavigation();
    setupGalleryFilters();
    setupGalleryLightbox();
});

/* =========================================================
   PATH RESOLVER
   ========================================================= */

function resolveProjectPath(path) {
    if (!path) return PROJECT_ROOT.href;

    if (/^(https?:|mailto:|tel:|#|javascript:)/i.test(path)) {
        return path;
    }

    return new URL(
        path.replace(/^\/+/, ""),
        PROJECT_ROOT
    ).href;
}

/* =========================================================
   FOOTER
   ========================================================= */

function loadFooter() {
    const container = document.getElementById("site-footer");

    if (!container) return;

    const footerURL =
        resolveProjectPath("components/footer.html");

    fetch(footerURL, {
        cache: "no-cache"
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(
                `Footer could not be loaded: ${response.status}`
            );
        }

        return response.text();
    })
    .then(html => {
        container.innerHTML = html;

        setupFooterLinks();
        setupFooterAssets();
        setupFooterYear();
        setupDeveloperContact();

        /*
         * IMPORTANT:
         * The old createMobileMenuFooter() call has been removed.
         *
         * The normal website footer must remain inside
         * #site-footer and must NEVER be copied into #mobileNav.
         */

        setupMobileStaffLogin();
    })
    .catch(error => {
        console.error(
            "Kenbridge footer loading error:",
            error
        );

        container.innerHTML = `
            <div class="footer-load-error">
                <p>Kenbridge Christian School</p>
                <a href="${resolveProjectPath("page/contact.html")}">
                    Contact Us
                </a>
            </div>
        `;
    });
}

/* =========================================================
   FOOTER LINKS
   ========================================================= */

function setupFooterLinks() {
    const links = document.querySelectorAll(
        "#site-footer a[data-footer-link]"
    );

    links.forEach(link => {
        const target = link.dataset.footerLink;

        if (target) {
            link.href = resolveProjectPath(target);
        }
    });
}

/* =========================================================
   FOOTER ASSETS
   ========================================================= */

function setupFooterAssets() {
    const footer =
        document.getElementById("site-footer");

    if (!footer) return;

    footer.querySelectorAll("[data-asset]")
        .forEach(element => {
            const path = element.dataset.asset;

            if (!path) return;

            const assetURL =
                resolveProjectPath(path);

            if (
                element.tagName.toLowerCase() === "img"
            ) {
                element.src = assetURL;

                element.addEventListener(
                    "error",
                    () => {
                        element.classList.add(
                            "image-error"
                        );

                        console.warn(
                            "Kenbridge image could not be loaded:",
                            assetURL
                        );
                    },
                    { once: true }
                );
            }
        });
}

/* =========================================================
   FOOTER YEAR
   ========================================================= */

function setupFooterYear() {
    const year =
        document.getElementById("currentYear");

    if (year) {
        year.textContent =
            new Date().getFullYear();
    }

    const oldYear =
        document.getElementById("footer-year");

    if (oldYear) {
        oldYear.textContent =
            new Date().getFullYear();
    }
}

/* =========================================================
   DEVELOPER CONTACT
   ========================================================= */

function setupDeveloperContact() {
    const openButton =
        document.getElementById("developerButton");

    const contacts =
        document.getElementById("developerContacts");

    if (
        !openButton ||
        !contacts ||
        openButton.dataset.developerReady === "true"
    ) {
        return;
    }

    openButton.dataset.developerReady = "true";

    openButton.setAttribute(
        "aria-expanded",
        "false"
    );

    contacts.setAttribute(
        "aria-hidden",
        "true"
    );

    function openContacts() {
        contacts.classList.add("show");

        contacts.setAttribute(
            "aria-hidden",
            "false"
        );

        openButton.setAttribute(
            "aria-expanded",
            "true"
        );

        openButton.innerHTML =
            "✕ Close Developer Contact";
    }

    function closeContacts() {
        contacts.classList.remove("show");

        contacts.setAttribute(
            "aria-hidden",
            "true"
        );

        openButton.setAttribute(
            "aria-expanded",
            "false"
        );

        openButton.innerHTML =
            "👨‍💻 Meet the Developer";
    }

    openButton.addEventListener(
        "click",
        () => {
            if (contacts.classList.contains("show")) {
                closeContacts();
            } else {
                openContacts();
            }
        }
    );

    document.addEventListener(
        "keydown",
        event => {
            if (
                event.key === "Escape" &&
                contacts.classList.contains("show")
            ) {
                closeContacts();
            }
        }
    );
}

/* =========================================================
   MOBILE STAFF LOGIN
   ========================================================= */

function setupMobileStaffLogin() {
    const button =
        document.querySelector(
            ".mobile-staff-login-button"
        );

    if (!button) return;

    button.href =
        resolveProjectPath("staff/login.html");
}

/* =========================================================
   ACTIVE NAVIGATION
   ========================================================= */

function setupActiveNavigation() {
    const currentPath =
        window.location.pathname
            .replace(/\/+$/, "")
            .toLowerCase();

    const currentPage =
        currentPath.split("/").pop() ||
        "index.html";

    document.querySelectorAll(
        ".desktop-nav a, .mobile-nav a"
    ).forEach(link => {
        const href =
            link.getAttribute("href");

        if (
            !href ||
            href === "#" ||
            /^(https?:|tel:|mailto:|javascript:)/i.test(href)
        ) {
            return;
        }

        const cleanHref =
            href
                .split("#")[0]
                .split("?")[0];

        const page =
            cleanHref
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
    const filters =
        document.querySelectorAll(
            ".gallery-filter"
        );

    const items =
        document.querySelectorAll(
            ".gallery-item"
        );

    if (
        !filters.length ||
        !items.length
    ) {
        return;
    }

    filters.forEach(filter => {

        filter.addEventListener(
            "click",
            () => {

                const category =
                    filter.dataset.filter ||
                    "all";

                filters.forEach(item => {
                    item.classList.remove(
                        "active"
                    );
                });

                filter.classList.add(
                    "active"
                );

                items.forEach(item => {

                    const hidden =
                        category !== "all" &&
                        item.dataset.category !==
                        category;

                    item.classList.toggle(
                        "hidden",
                        hidden
                    );

                    item.setAttribute(
                        "aria-hidden",
                        hidden ? "true" : "false"
                    );
                });
            }
        );
    });
}

/* =========================================================
   GALLERY LIGHTBOX
   ========================================================= */

function setupGalleryLightbox() {

    const items = [
        ...document.querySelectorAll(
            ".gallery-item"
        )
    ];

    const lightbox =
        document.getElementById(
            "galleryLightbox"
        );

    const image =
        document.getElementById(
            "lightboxImage"
        );

    const caption =
        document.getElementById(
            "lightboxCaption"
        );

    const close =
        document.getElementById(
            "lightboxClose"
        );

    const previous =
        document.getElementById(
            "lightboxPrev"
        );

    const next =
        document.getElementById(
            "lightboxNext"
        );

    if (
        !items.length ||
        !lightbox ||
        !image ||
        !caption
    ) {
        return;
    }

    let currentIndex = 0;

    function visibleItems() {
        return items.filter(
            item =>
                !item.classList.contains(
                    "hidden"
                )
        );
    }

    function showImage(index) {

        const visible =
            visibleItems();

        if (!visible.length) {
            return;
        }

        currentIndex =
            (index + visible.length) %
            visible.length;

        const item =
            visible[currentIndex];

        const itemImage =
            item.querySelector("img");

        const title =
            item.querySelector("strong");

        const description =
            item.querySelector("span");

        if (!itemImage) {
            return;
        }

        image.src = itemImage.src;

        image.alt =
            itemImage.alt || "";

        caption.innerHTML = "";

        if (title) {
            const titleElement =
                document.createElement(
                    "strong"
                );

            titleElement.textContent =
                title.textContent;

            caption.appendChild(
                titleElement
            );
        }

        if (description) {

            if (title) {
                caption.appendChild(
                    document.createElement(
                        "br"
                    )
                );
            }

            const descriptionElement =
                document.createElement(
                    "span"
                );

            descriptionElement.textContent =
                description.textContent;

            caption.appendChild(
                descriptionElement
            );
        }
    }

    function openLightbox(index) {

        showImage(index);

        lightbox.classList.add("show");

        lightbox.setAttribute(
            "aria-hidden",
            "false"
        );

        document.body.classList.add(
            "lightbox-open"
        );

        close?.focus();
    }

    function closeLightbox() {

        lightbox.classList.remove(
            "show"
        );

        lightbox.setAttribute(
            "aria-hidden",
            "true"
        );

        document.body.classList.remove(
            "lightbox-open"
        );

        image.removeAttribute("src");
    }

    items.forEach(item => {

        item.setAttribute(
            "tabindex",
            "0"
        );

        item.addEventListener(
            "click",
            () => {

                const index =
                    visibleItems()
                        .indexOf(item);

                if (index !== -1) {
                    openLightbox(index);
                }
            }
        );

        item.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter" ||
                    event.key === " "
                ) {

                    event.preventDefault();

                    const index =
                        visibleItems()
                            .indexOf(item);

                    if (index !== -1) {
                        openLightbox(index);
                    }
                }
            }
        );
    });

    close?.addEventListener(
        "click",
        closeLightbox
    );

    previous?.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            showImage(
                currentIndex - 1
            );
        }
    );

    next?.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            showImage(
                currentIndex + 1
            );
        }
    );

    lightbox.addEventListener(
        "click",
        event => {

            if (
                event.target === lightbox
            ) {
                closeLightbox();
            }
        }
    );

    document.addEventListener(
        "keydown",
        event => {

            if (
                !lightbox.classList.contains(
                    "show"
                )
            ) {
                return;
            }

            if (event.key === "Escape") {
                closeLightbox();
            }

            if (event.key === "ArrowLeft") {
                showImage(
                    currentIndex - 1
                );
            }

            if (event.key === "ArrowRight") {
                showImage(
                    currentIndex + 1
                );
            }
        }
    );
}

})();

This is based on the current repository version, which is 854 lines in the raw file.

What changed: the entire "createMobileMenuFooter()" function is gone, and its call from "loadFooter()" is gone. So the normal footer loaded into "#site-footer" remains, but "components.js" no longer creates a second footer inside "#mobileNav".

Replace "js/components.js" completely with the code above, commit it, and then test About, Academics, Admissions, and Boarding on mobile.
