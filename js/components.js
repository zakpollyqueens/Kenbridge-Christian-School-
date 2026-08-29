/* =========================================================
   KENBRIDGE CHRISTIAN SCHOOL
   SHARED COMPONENTS — PART 1
========================================================= */

document.addEventListener("DOMContentLoaded", function () {
    loadFooter();
    setupMobileMenu();
    setupMoreMenu();
    setupActiveNavigation();
    setupBackToTop();
    setupScrollReveal();
    setupGalleryFilters();
    setupGalleryLightbox();
    setupImageErrors();
});
/* =========================================================
   PART 2 — LOAD SHARED FOOTER
========================================================= */

function loadFooter() {
    const footerContainer = document.getElementById("site-footer");

    if (!footerContainer) return;

    fetch("components/footer.html")
        .then(function(response) {
            if (!response.ok) {
                throw new Error("Footer could not be loaded.");
            }

            return response.text();
        })
        .then(function(html) {
            footerContainer.innerHTML = html;
            setupFooterYear();
        })
        .catch(function(error) {
            console.error("Footer loading error:", error);
        });
}
/* =========================================================
   PART 3 — FOOTER YEAR
========================================================= */

function setupFooterYear() {
    const year = document.getElementById("footer-year");

    if (year) {
        year.textContent = new Date().getFullYear();
    }
              }
/* =========================================================
   PART 4 — DEVELOPER CONTACT MODAL
========================================================= */

function setupDeveloperContact() {
    const openButton = document.getElementById("developerButton");
    const modal = document.getElementById("developerContact");
    const closeButton = document.getElementById("developerClose");
    const overlay = document.getElementById("developerOverlay");

    if (!openButton || !modal) return;

    openButton.addEventListener("click", function() {
        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("developer-modal-open");
    });

    function closeDeveloperContact() {
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("developer-modal-open");
    }

    if (closeButton) {
        closeButton.addEventListener("click", closeDeveloperContact);
    }

    if (overlay) {
        overlay.addEventListener("click", closeDeveloperContact);
    }

    document.addEventListener("keydown", function(event) {
        if (
            event.key === "Escape" &&
            modal.classList.contains("show")
        ) {
            closeDeveloperContact();
        }
    });
}
/* =========================================================
   PART 5 — MOBILE MENU
========================================================= */

function setupMobileMenu() {
    const button = document.getElementById("mobileMenuButton");
    const nav = document.getElementById("mobileNav");

    if (!button || !nav) return;

    button.addEventListener("click", function() {
        const isOpen = nav.classList.toggle("open");

        button.classList.toggle("active", isOpen);
        button.setAttribute("aria-expanded", String(isOpen));
        document.body.classList.toggle("menu-open", isOpen);
    });

    nav.querySelectorAll("a").forEach(function(link) {
        link.addEventListener("click", function() {
            nav.classList.remove("open");
            button.classList.remove("active");
            button.setAttribute("aria-expanded", "false");
            document.body.classList.remove("menu-open");
        });
    });
    }
/* =========================================================
   PART 6 — MORE MENU
========================================================= */

function setupMoreMenu() {
    const moreButton = document.querySelector(".more-button");
    const moreMenu = document.querySelector(".more-menu");

    if (!moreButton || !moreMenu) return;

    moreButton.addEventListener("click", function(event) {
        event.stopPropagation();
        moreMenu.classList.toggle("open");
    });

    document.addEventListener("click", function(event) {
        if (!moreMenu.contains(event.target)) {
            moreMenu.classList.remove("open");
        }
    });

    document.addEventListener("keydown", function(event) {
        if (event.key === "Escape") {
            moreMenu.classList.remove("open");
        }
    });
}
/* =========================================================
   PART 7 — ACTIVE NAVIGATION
========================================================= */

function setupActiveNavigation() {
    const currentPage = window.location.pathname
        .split("/")
        .pop()
        .toLowerCase();

    document.querySelectorAll(
        ".desktop-nav a, .mobile-nav a"
    ).forEach(function(link) {

        const href = link.getAttribute("href");

        if (!href || href === "#") return;

        const linkPage = href
            .split("/")
            .pop()
            .split("#")[0]
            .toLowerCase();

        if (
            linkPage === currentPage ||
            (currentPage === "" && linkPage === "index.html")
        ) {
            link.classList.add("active");
        }
    });
                                  }
/* =========================================================
   PART 8 — BACK TO TOP BUTTON
========================================================= */

function setupBackToTop() {
    const button = document.getElementById("backToTop");

    if (!button) return;

    window.addEventListener("scroll", function() {
        if (window.scrollY > 400) {
            button.classList.add("show");
        } else {
            button.classList.remove("show");
        }
    });

    button.addEventListener("click", function() {
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    });
      }
/* =========================================================
   PART 9 — SCROLL REVEAL
========================================================= */

function setupScrollReveal() {
    const elements = document.querySelectorAll(".reveal");

    if (!elements.length) return;

    if (
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
        elements.forEach(function(element) {
            element.classList.add("visible");
        });
        return;
    }

    const observer = new IntersectionObserver(
        function(entries, observer) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                    observer.unobserve(entry.target);
                }
            });
        },
        {
            threshold: 0.15
        }
    );

    elements.forEach(function(element) {
        observer.observe(element);
    });
      }

/* =========================================================
   PART 10 — GALLERY FILTERS
========================================================= */

function setupGalleryFilters() {
    const filters = document.querySelectorAll(".gallery-filter");
    const items = document.querySelectorAll(".gallery-item");

    if (!filters.length || !items.length) return;

    filters.forEach(function(filter) {
        filter.addEventListener("click", function() {
            const category = filter.getAttribute("data-filter");

            filters.forEach(function(item) {
                item.classList.remove("active");
            });

            filter.classList.add("active");

            items.forEach(function(item) {
                const itemCategory =
                    item.getAttribute("data-category");

                if (
                    category === "all" ||
                    itemCategory === category
                ) {
                    item.classList.remove("hidden");
                } else {
                    item.classList.add("hidden");
                }
            });
        });
    });
}
/* =========================================================
   PART 11 — GALLERY LIGHTBOX
========================================================= */

function setupGalleryLightbox() {
    const items = Array.from(
        document.querySelectorAll(".gallery-item")
    );

    const lightbox =
        document.getElementById("galleryLightbox");

    const image =
        document.getElementById("lightboxImage");

    const caption =
        document.getElementById("lightboxCaption");

    const closeButton =
        document.getElementById("lightboxClose");

    const previousButton =
        document.getElementById("lightboxPrev");

    const nextButton =
        document.getElementById("lightboxNext");

    if (
        !items.length ||
        !lightbox ||
        !image ||
        !caption
    ) return;

    let currentIndex = 0;

    function visibleItems() {
        return items.filter(function(item) {
            return !item.classList.contains("hidden");
        });
    }

    function showImage(index) {
        const visible = visibleItems();

        if (!visible.length) return;

        if (index < 0) {
            index = visible.length - 1;
        }

        if (index >= visible.length) {
            index = 0;
        }

        currentIndex = index;

        const item = visible[currentIndex];
        const itemImage = item.querySelector("img");
        const title = item.querySelector("strong");
        const description = item.querySelector("span");

        if (!itemImage) return;

        image.src = itemImage.src;
        image.alt = itemImage.alt || "";

        caption.innerHTML = "";

        if (title) {
            const titleElement =
                document.createElement("strong");

            titleElement.textContent =
                title.textContent;

            caption.appendChild(titleElement);
        }

        if (description) {
            const descriptionElement =
                document.createElement("span");

            descriptionElement.textContent =
                description.textContent;

            if (title) {
                caption.appendChild(
                    document.createElement("br")
                );
            }

            caption.appendChild(descriptionElement);
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
            "developer-modal-open"
        );
    }

    function closeLightbox() {
        lightbox.classList.remove("show");

        lightbox.setAttribute(
            "aria-hidden",
            "true"
        );

        document.body.classList.remove(
            "developer-modal-open"
        );

        image.src = "";
    }

    items.forEach(function(item) {
        item.addEventListener("click", function() {
            const visible = visibleItems();
            const index = visible.indexOf(item);

            if (index !== -1) {
                openLightbox(index);
            }
        });
    });

    if (closeButton) {
        closeButton.addEventListener(
            "click",
            closeLightbox
        );
    }

    if (previousButton) {
        previousButton.addEventListener(
            "click",
            function() {
                showImage(currentIndex - 1);
            }
        );
    }

    if (nextButton) {
        nextButton.addEventListener(
            "click",
            function() {
                showImage(currentIndex + 1);
            }
        );
    }

    lightbox.addEventListener(
        "click",
        function(event) {
            if (event.target === lightbox) {
                closeLightbox();
            }
        }
    );

    document.addEventListener(
        "keydown",
        function(event) {
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
        }
    );
      }
/* =========================================================
   PART 12 — IMAGE ERROR HANDLING
========================================================= */

function setupImageErrors() {
    const images = document.querySelectorAll("img");

    images.forEach(function(image) {
        image.addEventListener("error", function() {
            image.classList.add("image-error");
            image.setAttribute("alt", "Image unavailable");
        });
    });
}
function loadFooter() {
    const footerContainer = document.getElementById("site-footer");

    if (!footerContainer) {
        console.log("Footer container not found");
        return;
    }

    fetch("components/footer.html")
        .then(function(response) {
            console.log("Footer response:", response.status);

            if (!response.ok) {
                throw new Error("Footer file not found");
            }

            return response.text();
        })
        .then(function(html) {
            footerContainer.innerHTML = html;
            console.log("Footer loaded successfully");
            setupFooterYear();
        })
        .catch(function(error) {
            console.error("FOOTER ERROR:", error);
        });
}
