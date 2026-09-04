/* =========================================================
   KENBRIDGE CHRISTIAN SCHOOL
   GLOBAL JAVASCRIPT
   Version: 2026
   ========================================================= */

(function () {
    "use strict";

    /* =====================================================
       HELPERS
       ===================================================== */

    const $ = (selector, parent = document) =>
        parent.querySelector(selector);

    const $$ = (selector, parent = document) =>
        Array.from(parent.querySelectorAll(selector));

    const on = (element, event, handler, options) => {
        if (element) {
            element.addEventListener(event, handler, options);
        }
    };

    /* =====================================================
       OPENING SCREEN
       Runs only when the page contains #openingScreen.
       ===================================================== */

    function initOpeningScreen() {
        const screen = $("#openingScreen");
        const counter = $("#openingCounter");
        const message = $("#openingMessage");
        const progress = $("#openingProgress");

        if (!screen) return;

        let count = 10;
        const total = 10;

        const messages = {
            10: "Preparing your experience...",
            9: "Welcome to Kenbridge...",
            8: "Building Character...",
            7: "Quality Education...",
            6: "Growing in Christian Values...",
            5: "Learning with Purpose...",
            4: "Serving with Excellence...",
            3: "Building Tomorrow's Leaders...",
            2: "Almost ready...",
            1: "Welcome to Kenbridge Christian School!"
        };

        document.body.classList.add("opening-active");
        document.body.style.overflow = "hidden";

        screen.style.position = "fixed";
        screen.style.inset = "0";
        screen.style.width = "100%";
        screen.style.height = "100dvh";
        screen.style.minHeight = "100vh";
        screen.style.zIndex = "999999";
        screen.style.opacity = "1";
        screen.style.visibility = "visible";
        screen.style.pointerEvents = "all";

        function update() {
            if (counter) {
                counter.textContent = count;
                counter.style.animation = "none";
                void counter.offsetWidth;
                counter.style.animation = "counterPop 0.7s ease";
            }

            if (message) {
                message.textContent =
                    messages[count] ||
                    "Welcome to Kenbridge Christian School!";
            }

            if (progress) {
                const percent =
                    ((total - count) / total) * 100;

                progress.style.width =
                    Math.max(0, Math.min(100, percent)) + "%";
            }
        }

        update();

        const timer = setInterval(function () {
            count--;

            if (count > 0) {
                update();
                return;
            }

            clearInterval(timer);

            if (counter) {
                counter.textContent = "✓";
            }

            if (message) {
                message.textContent =
                    "Welcome to Kenbridge Christian School!";
            }

            if (progress) {
                progress.style.width = "100%";
            }

            setTimeout(function () {
                screen.classList.add("hide");
                document.body.classList.remove("opening-active");
                document.body.style.overflow = "";

                setTimeout(function () {
                    screen.style.display = "none";
                }, 900);
            }, 900);
        }, 1000);
    }

    /* =====================================================
       MOBILE NAVIGATION
       ===================================================== */

    function closeMobileMenu() {
        const button = $("#mobileMenuButton");
        const nav = $("#mobileNav");

        if (!button || !nav) return;

        nav.classList.remove("open", "show", "active");
        button.classList.remove("active");
        button.setAttribute("aria-expanded", "false");
        document.body.classList.remove("menu-open");
    }

    function initMobileNavigation() {
        const button = $("#mobileMenuButton");
        const nav = $("#mobileNav");

        if (!button || !nav) return;

        button.setAttribute(
            "aria-expanded",
            nav.classList.contains("open") ? "true" : "false"
        );

        on(button, "click", function (event) {
            event.stopPropagation();

            const open =
                !nav.classList.contains("open");

            nav.classList.toggle("open", open);
            nav.classList.toggle("active", open);
            button.classList.toggle("active", open);
            button.setAttribute(
                "aria-expanded",
                String(open)
            );
            document.body.classList.toggle(
                "menu-open",
                open
            );
        });

        $$("#mobileNav a").forEach(function (link) {
            on(link, "click", closeMobileMenu);
        });

        on(document, "click", function (event) {
            if (
                nav.classList.contains("open") &&
                !nav.contains(event.target) &&
                !button.contains(event.target)
            ) {
                closeMobileMenu();
            }
        });

        on(document, "keydown", function (event) {
            if (event.key === "Escape") {
                closeMobileMenu();
            }
        });
    }

    /* =====================================================
       MORE DROPDOWN
       ===================================================== */

    function closeMoreMenu() {
        const menu = $(".more-menu");
        const button = $(".more-button");

        if (!menu || !button) return;

        menu.classList.remove("open");
        button.setAttribute("aria-expanded", "false");
    }

    function initMoreMenu() {
        const menu = $(".more-menu");
        const button = $(".more-button");

        if (!menu || !button) return;

        on(button, "click", function (event) {
            event.stopPropagation();

            const open =
                !menu.classList.contains("open");

            menu.classList.toggle("open", open);
            button.setAttribute(
                "aria-expanded",
                String(open)
            );
        });

        const dropdown = $(".dropdown", menu);

        on(dropdown, "click", function (event) {
            event.stopPropagation();
        });

        $$(".dropdown a", menu).forEach(function (link) {
            on(link, "click", closeMoreMenu);
        });

        on(document, "click", closeMoreMenu);

        on(document, "keydown", function (event) {
            if (event.key === "Escape") {
                closeMoreMenu();
            }
        });
    }

    /* =====================================================
       HEADER SCROLL EFFECT
       ===================================================== */

    function initHeader() {
        const header = $("#header");

        if (!header) return;

        function update() {
            header.classList.toggle(
                "scrolled",
                window.scrollY > 40
            );
        }

        on(window, "scroll", update, {
            passive: true
        });

        update();
    }

    /* =====================================================
       SMOOTH INTERNAL LINKS
       ===================================================== */

    function initSmoothLinks() {
        $$('a[href^="#"]').forEach(function (link) {
            on(link, "click", function (event) {
                const id = link.getAttribute("href");

                if (!id || id === "#") return;

                let target = null;

                try {
                    target = document.querySelector(id);
                } catch (error) {
                    return;
                }

                if (!target) return;

                event.preventDefault();

                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

                history.replaceState(
                    null,
                    "",
                    id
                );
            });
        });
    }

    /* =====================================================
       SCROLL REVEAL
       ===================================================== */

    function initReveal() {
        const selector =
            ".feature-card," +
            ".section-heading," +
            ".welcome-content," +
            ".welcome-image," +
            ".contact-form-wrapper," +
            ".contact-details," +
            ".page-card," +
            ".info-card," +
            ".content-card," +
            ".project-card," +
            ".sport-card," +
            ".gallery-item," +
            ".article-card," +
            ".category-card," +
            ".team-card," +
            ".fee-card," +
            ".boarding-card";

        const elements = $$(selector);

        if (
            !elements.length ||
            !("IntersectionObserver" in window)
        ) {
            return;
        }

        const observer =
            new IntersectionObserver(
                function (entries, observer) {
                    entries.forEach(function (entry) {
                        if (!entry.isIntersecting) return;

                        entry.target.classList.add(
                            "visible"
                        );

                        observer.unobserve(
                            entry.target
                        );
                    });
                },
                {
                    threshold: 0.12
                }
            );

        elements.forEach(function (element) {
            element.classList.add("reveal");
            observer.observe(element);
        });
    }

    /* =====================================================
       CONTACT FORM
       ===================================================== */

    function initContactForm() {
        const form = $("#contactForm");
        const status = $("#contactStatus");

        if (!form) return;

        on(form, "submit", function (event) {
            event.preventDefault();

            if (status) {
                status.textContent =
                    "Thank you. Your message has been received by the website form.";

                status.classList.remove("error");
                status.classList.add("success");
            }

            form.reset();
        });
    }

    /* =====================================================
       FEEDBACK FORM
       ===================================================== */

    function initFeedbackForm() {
        const form = $("#feedbackForm");
        const status = $("#feedbackStatus");

        if (!form) return;

        on(form, "submit", function (event) {
            event.preventDefault();

            if (status) {
                status.textContent =
                    "Thank you for your feedback.";

                status.classList.remove("error");
                status.classList.add("success");
            }

            form.reset();
        });
    }

    /* =====================================================
       IMAGE ERROR HANDLING
       ===================================================== */

    function initImageHandling() {
        $$("img").forEach(function (image) {
            on(image, "error", function () {
                this.classList.add("image-error");
            });
        });
    }

    /* =====================================================
       CURRENT YEAR
       ===================================================== */

    function initYears() {
        const year = new Date().getFullYear();

        $$("[data-current-year]").forEach(
            function (element) {
                element.textContent = year;
            }
        );

        const footerYear = $("#footer-year");

        if (footerYear) {
            footerYear.textContent = year;
        }
    }

    /* =====================================================
       BACK TO TOP
       ===================================================== */

    function initBackToTop() {
        const button = $("#backToTop");

        if (!button) return;

        function update() {
            button.classList.toggle(
                "show",
                window.scrollY > 500
            );
        }

        on(window, "scroll", update, {
            passive: true
        });

        on(button, "click", function () {
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        });

        update();
    }

    /* =====================================================
       DEVELOPER CONTACT MODAL
       ===================================================== */

    function initDeveloperContact(root = document) {
        const button =
            $("#developerButton", root);

        const modal =
            $("#developerContact", root);

        const close =
            $("#developerClose", root);

        const overlay =
            $("#developerOverlay", root);

        if (!button || !modal) return;

        if (
            button.dataset.developerReady ===
            "true"
        ) {
            return;
        }

        button.dataset.developerReady = "true";

        function openDeveloper() {
            modal.classList.add("show");

            modal.setAttribute(
                "aria-hidden",
                "false"
            );

            document.body.classList.add(
                "developer-modal-open"
            );
        }

        function closeDeveloper() {
            modal.classList.remove("show");

            modal.setAttribute(
                "aria-hidden",
                "true"
            );

            document.body.classList.remove(
                "developer-modal-open"
            );
        }

        on(button, "click", openDeveloper);
        on(close, "click", closeDeveloper);
        on(overlay, "click", closeDeveloper);

        on(document, "keydown", function (event) {
            if (
                event.key === "Escape" &&
                modal.classList.contains("show")
            ) {
                closeDeveloper();
            }
        });
    }

    /* =====================================================
       SHARED FOOTER LOADER
       -----------------------------------------------------
       Supports older pages that only have a footer
       placeholder while leaving the newly updated pages
       with their own .site-footer untouched.
       ===================================================== */

    function initSharedFooter() {
        const existingFooter =
            $(".site-footer");

        /*
         * If a real footer already exists,
         * do not replace it.
         */
        if (
            existingFooter &&
            existingFooter.tagName.toLowerCase() ===
                "footer"
        ) {
            initDeveloperContact();
            initYears();
            return;
        }

        let container =
            $("#site-footer");

        /*
         * If there is an old hard-coded footer
         * but no modern footer container, replace it.
         */
        if (!container) {
            const oldFooters =
                $$("footer:not(.site-footer)");

            if (oldFooters.length) {
                oldFooters.forEach(function (footer) {
                    footer.remove();
                });

                container =
                    document.createElement("div");

                container.id = "site-footer";
                document.body.appendChild(container);
            }
        }

        /*
         * If neither exists, do nothing.
         */
        if (!container) {
            initYears();
            return;
        }

        /*
         * If the placeholder already contains
         * a footer, leave it alone.
         */
        if ($(".site-footer", container)) {
            initDeveloperContact(container);
            initYears();
            return;
        }

        const script =
            document.querySelector(
                'script[src*="js/script.js"]'
            );

        if (!script) {
            initYears();
            return;
        }

        let scriptURL;

        try {
            scriptURL = new URL(
                script.getAttribute("src"),
                document.baseURI
            );
        } catch (error) {
            console.error(
                "Kenbridge script URL error:",
                error
            );
            initYears();
            return;
        }

        const projectRoot =
            new URL("../", scriptURL);

        const footerURL =
            new URL(
                "components/footer.html",
                projectRoot
            );

        fetch(footerURL.href, {
            cache: "no-cache"
        })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error(
                        "Footer could not be loaded: " +
                        response.status
                    );
                }

                return response.text();
            })
            .then(function (html) {
                container.innerHTML = html;

                /*
                 * Resolve footer assets.
                 */
                $$(
                    "[data-asset]",
                    container
                ).forEach(function (element) {
                    const asset =
                        element.getAttribute(
                            "data-asset"
                        );

                    if (!asset) return;

                    try {
                        element.src =
                            new URL(
                                asset.replace(
                                    /^\/+/,
                                    ""
                                ),
                                projectRoot
                            ).href;
                    } catch (error) {
                        console.warn(
                            "Footer asset error:",
                            asset
                        );
                    }
                });

                /*
                 * Fix relative footer links.
                 */
                $$(
                    "[data-footer-link]",
                    container
                ).forEach(function (link) {
                    const target =
                        link.getAttribute(
                            "data-footer-link"
                        );

                    if (!target) return;

                    try {
                        link.href =
                            new URL(
                                target,
                                projectRoot
                            ).href;
                    } catch (error) {
                        console.warn(
                            "Footer link error:",
                            target
                        );
                    }
                });

                initYears();
                initDeveloperContact(container);
            })
            .catch(function (error) {
                console.error(
                    "Kenbridge shared footer error:",
                    error
                );

                initYears();
            });
    }

    /* =====================================================
       GLOBAL INITIALIZATION
       ===================================================== */

    function init() {
        initOpeningScreen();
        initMobileNavigation();
        initMoreMenu();
        initHeader();
        initSmoothLinks();
        initReveal();
        initContactForm();
        initFeedbackForm();
        initImageHandling();
        initYears();
        initBackToTop();
        initSharedFooter();
    }

    if (
        document.readyState === "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            init
        );
    } else {
        init();
    }
})();
