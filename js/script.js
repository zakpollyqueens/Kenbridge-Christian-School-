/* =========================================================
   KENBRIDGE CHRISTIAN SCHOOL
   OPENING SCREEN / COUNTDOWN
   ========================================================= */

document.addEventListener("DOMContentLoaded", function () {

    const openingScreen = document.getElementById("openingScreen");
    const openingCounter = document.getElementById("openingCounter");
    const openingMessage = document.getElementById("openingMessage");
    const openingProgress = document.getElementById("openingProgress");

    if (!openingScreen) {
        return;
    }

    let countdown = 10;
    const totalTime = 10;

    /* Keep the homepage completely locked underneath */
    document.body.classList.add("opening-active");
    document.body.style.overflow = "hidden";

    /* Make absolutely sure the opening screen covers the viewport */
    openingScreen.style.position = "fixed";
    openingScreen.style.inset = "0";
    openingScreen.style.width = "100%";
    openingScreen.style.height = "100dvh";
    openingScreen.style.minHeight = "100vh";
    openingScreen.style.zIndex = "999999";
    openingScreen.style.opacity = "1";
    openingScreen.style.visibility = "visible";
    openingScreen.style.pointerEvents = "all";

    /* Starting state */
    openingCounter.textContent = countdown;

    if (openingMessage) {
        openingMessage.textContent = "Preparing your experience...";
    }

    if (openingProgress) {
        openingProgress.style.width = "0%";
    }

    /* Countdown */
    const countdownTimer = setInterval(function () {

        countdown--;

        if (openingCounter) {
            openingCounter.textContent = countdown;
        }

        /* Progress bar */
        if (openingProgress) {
            const progress =
                ((totalTime - countdown) / totalTime) * 100;

            openingProgress.style.width = progress + "%";
        }

        /* Messages */
        if (openingMessage) {

            if (countdown > 7) {
                openingMessage.textContent =
                    "Preparing your experience...";
            }

            else if (countdown > 4) {
                openingMessage.textContent =
                    "Welcome to Kenbridge...";
            }

            else if (countdown > 1) {
                openingMessage.textContent =
                    "Learning with Purpose...";
            }

            else if (countdown === 1) {
                openingMessage.textContent =
                    "Almost ready...";
            }
        }

        /* Finish */
        if (countdown <= 0) {

            clearInterval(countdownTimer);

            if (openingCounter) {
                openingCounter.textContent = "0";
            }

            if (openingProgress) {
                openingProgress.style.width = "100%";
            }

            if (openingMessage) {
                openingMessage.textContent =
                    "Welcome to Kenbridge Christian School";
            }

            /* Give the final message a moment */
            setTimeout(function () {

                openingScreen.classList.add("hide");

                document.body.classList.remove(
                    "opening-active"
                );

                document.body.style.overflow = "";

                /* Completely remove the opening layer */
                setTimeout(function () {
                    openingScreen.style.display = "none";
                }, 700);

            }, 500);
        }

    }, 1000);

});
/* =========================================================
   KENBRIDGE CHRISTIAN SCHOOL
   MAIN JAVASCRIPT
   ========================================================= */

document.addEventListener("DOMContentLoaded", function () {

    /* =====================================================
       10-SECOND OPENING SCREEN
       ===================================================== */

    const openingScreen =
        document.getElementById("openingScreen");

    const openingCounter =
        document.getElementById("openingCounter");

    const openingMessage =
        document.getElementById("openingMessage");

    const openingProgress =
        document.getElementById("openingProgress");

    if (
        openingScreen &&
        openingCounter &&
        openingMessage
    ) {

        document.body.classList.add("opening-active");

        let count = 10;

        const openingMessages = {
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

        function updateOpeningScreen() {

            openingCounter.textContent = count;

            openingMessage.textContent =
                openingMessages[count] ||
                "Welcome to Kenbridge Christian School!";

            if (openingProgress) {

                const progress =
                    ((10 - count) / 10) * 100;

                openingProgress.style.width =
                    progress + "%";
            }

            openingCounter.style.animation = "none";

            void openingCounter.offsetWidth;

            openingCounter.style.animation =
                "counterPop 0.7s ease";
        }

        updateOpeningScreen();

        const openingTimer =
            setInterval(function () {

                count--;

                if (count > 0) {

                    updateOpeningScreen();

                } else {

                    clearInterval(openingTimer);

                    openingCounter.textContent = "✓";

                    openingMessage.textContent =
                        "Welcome to Kenbridge Christian School!";

                    if (openingProgress) {
                        openingProgress.style.width = "100%";
                    }

                    setTimeout(function () {

                        openingScreen.classList.add("hide");

                        document.body.classList.remove(
                            "opening-active"
                        );

                    }, 900);
                }

            }, 1000);
    }


    /* =====================================================
       MOBILE NAVIGATION
       ===================================================== */

    const mobileMenuButton =
        document.getElementById("mobileMenuButton");

    const mobileNav =
        document.getElementById("mobileNav");

    if (mobileMenuButton && mobileNav) {

        mobileMenuButton.addEventListener(
            "click",
            function () {

                const isOpen =
                    mobileNav.classList.toggle("open");

                mobileMenuButton.classList.toggle(
                    "active",
                    isOpen
                );

                mobileMenuButton.setAttribute(
                    "aria-expanded",
                    String(isOpen)
                );

                document.body.classList.toggle(
                    "menu-open",
                    isOpen
                );
            }
        );

        const mobileLinks =
            mobileNav.querySelectorAll("a");

        mobileLinks.forEach(function (link) {

            link.addEventListener(
                "click",
                function () {

                    mobileNav.classList.remove("open");

                    mobileMenuButton.classList.remove(
                        "active"
                    );

                    mobileMenuButton.setAttribute(
                        "aria-expanded",
                        "false"
                    );

                    document.body.classList.remove(
                        "menu-open"
                    );
                }
            );
        });
    }


    /* =====================================================
       CLOSE MOBILE MENU OUTSIDE
       ===================================================== */

    document.addEventListener(
        "click",
        function (event) {

            if (!mobileNav || !mobileMenuButton) {
                return;
            }

            if (
                mobileNav.classList.contains("open") &&
                !mobileNav.contains(event.target) &&
                !mobileMenuButton.contains(event.target)
            ) {

                mobileNav.classList.remove("open");

                mobileMenuButton.classList.remove(
                    "active"
                );

                mobileMenuButton.setAttribute(
                    "aria-expanded",
                    "false"
                );

                document.body.classList.remove(
                    "menu-open"
                );
            }
        }
    );


    /* =====================================================
       ESCAPE KEY CLOSES MOBILE MENU
       ===================================================== */

    document.addEventListener(
        "keydown",
        function (event) {

            if (event.key !== "Escape") {
                return;
            }

            if (!mobileNav || !mobileMenuButton) {
                return;
            }

            mobileNav.classList.remove("open");

            mobileMenuButton.classList.remove(
                "active"
            );

            mobileMenuButton.setAttribute(
                "aria-expanded",
                "false"
            );

            document.body.classList.remove(
                "menu-open"
            );
        }
    );


    /* =====================================================
       MORE DROPDOWN
       ===================================================== */

    const moreMenu =
        document.querySelector(".more-menu");

    const moreButton =
        document.querySelector(".more-button");

    if (moreMenu && moreButton) {

        moreButton.addEventListener(
            "click",
            function (event) {

                event.stopPropagation();

                const isOpen =
                    moreMenu.classList.toggle("open");

                moreButton.setAttribute(
                    "aria-expanded",
                    String(isOpen)
                );
            }
        );

        const dropdown =
            moreMenu.querySelector(".dropdown");

        if (dropdown) {

            dropdown.addEventListener(
                "click",
                function (event) {
                    event.stopPropagation();
                }
            );
        }

        document.addEventListener(
            "click",
            function () {

                moreMenu.classList.remove("open");

                moreButton.setAttribute(
                    "aria-expanded",
                    "false"
                );
            }
        );
    }


    /* =====================================================
       HEADER SCROLL EFFECT
       ===================================================== */

    const header =
        document.getElementById("header");

    function updateHeader() {

        if (!header) {
            return;
        }

        if (window.scrollY > 40) {

            header.classList.add("scrolled");

        } else {

            header.classList.remove("scrolled");
        }
    }

    window.addEventListener(
        "scroll",
        updateHeader
    );

    updateHeader();


    /* =====================================================
       SMOOTH INTERNAL LINKS
       ===================================================== */

    const internalLinks =
        document.querySelectorAll(
            'a[href^="#"]'
        );

    internalLinks.forEach(function (link) {

        link.addEventListener(
            "click",
            function (event) {

                const targetId =
                    this.getAttribute("href");

                if (
                    !targetId ||
                    targetId === "#"
                ) {
                    return;
                }

                const target =
                    document.querySelector(
                        targetId
                    );

                if (!target) {
                    return;
                }

                event.preventDefault();

                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        );
    });


    /* =====================================================
       SCROLL REVEAL ANIMATION
       ===================================================== */

    const revealElements =
        document.querySelectorAll(
            ".feature-card, .section-heading, .welcome-content, .welcome-image, .contact-form-wrapper, .contact-details"
        );

    if (
        revealElements.length > 0 &&
        "IntersectionObserver" in window
    ) {

        const revealObserver =
            new IntersectionObserver(
                function (entries, observer) {

                    entries.forEach(
                        function (entry) {

                            if (
                                entry.isIntersecting
                            ) {

                                entry.target.classList.add(
                                    "visible"
                                );

                                observer.unobserve(
                                    entry.target
                                );
                            }
                        }
                    );
                },
                {
                    threshold: 0.12
                }
            );

        revealElements.forEach(
            function (element) {

                element.classList.add(
                    "reveal"
                );

                revealObserver.observe(
                    element
                );
            }
        );
    }


    /* =====================================================
       CONTACT FORM
       ===================================================== */

    const contactForm =
        document.getElementById(
            "contactForm"
        );

    const contactStatus =
        document.getElementById(
            "contactStatus"
        );

    if (contactForm) {

        contactForm.addEventListener(
            "submit",
            function (event) {

                event.preventDefault();

                if (contactStatus) {

                    contactStatus.textContent =
                        "Thank you. Your message has been received by the website form.";

                    contactStatus.classList.add(
                        "success"
                    );
                }

                contactForm.reset();
            }
        );
    }


    /* =====================================================
       FEEDBACK FORM
       ===================================================== */

    const feedbackForm =
        document.getElementById(
            "feedbackForm"
        );

    const feedbackStatus =
        document.getElementById(
            "feedbackStatus"
        );

    if (feedbackForm) {

        feedbackForm.addEventListener(
            "submit",
            function (event) {

                event.preventDefault();

                if (feedbackStatus) {

                    feedbackStatus.textContent =
                        "Thank you for your feedback.";

                    feedbackStatus.classList.add(
                        "success"
                    );
                }

                feedbackForm.reset();
            }
        );
    }


    /* =====================================================
       IMAGE ERROR HANDLING
       ===================================================== */

    const images =
        document.querySelectorAll("img");

    images.forEach(function (image) {

        image.addEventListener(
            "error",
            function () {

                this.classList.add(
                    "image-error"
                );
            }
        );
    });


    /* =====================================================
       CURRENT YEAR
       ===================================================== */

    const yearElements =
        document.querySelectorAll(
            "[data-current-year]"
        );

    yearElements.forEach(
        function (element) {

            element.textContent =
                new Date().getFullYear();
        }
    );


    /* =====================================================
       BACK TO TOP
       ===================================================== */

    const backToTop =
        document.getElementById(
            "backToTop"
        );

    if (backToTop) {

        window.addEventListener(
            "scroll",
            function () {

                if (window.scrollY > 500) {

                    backToTop.classList.add(
                        "show"
                    );

                } else {

                    backToTop.classList.remove(
                        "show"
                    );
                }
            }
        );

        backToTop.addEventListener(
            "click",
            function () {

                window.scrollTo({
                    top: 0,
                    behavior: "smooth"
                });
            }
        );
    }

});
/* =========================================================
   AUTOMATIC SHARED FOOTER
   ---------------------------------------------------------
   This section is ONLY for loading the shared footer.
   DO NOT CHANGE THE HAMBURGER CODE ABOVE.
   ========================================================= */

(function () {

    function loadSharedFooter() {

        /* If the page already has the shared footer,
           leave it completely alone. */
        if (document.getElementById("site-footer")) {
            return;
        }


        /*
         * Find the location of script.js so this works
         * from both:
         *
         * index.html
         * page/about.html
         * page/contact.html
         * etc.
         */
        const script =
            document.querySelector(
                'script[src*="js/script.js"]'
            );


        if (!script) {
            return;
        }


        const scriptURL =
            new URL(
                script.getAttribute("src"),
                document.baseURI
            );


        /*
         * Go from:
         *
         * /js/script.js
         *
         * back to project root.
         */
        const projectRoot =
            new URL(
                "../",
                scriptURL
            );


        /*
         * Shared footer location.
         */
        const footerURL =
            new URL(
                "components/footer.html",
                projectRoot
            );


        /*
         * Create the footer container automatically.
         */
        const footerContainer =
            document.createElement("div");

        footerContainer.id =
            "site-footer";


        /*
         * Remove an old hard-coded footer if
         * the page has one.
         *
         * This allows the new master footer
         * to replace the old footer automatically.
         */
        document.querySelectorAll(
            "footer:not(.site-footer)"
        ).forEach(function (oldFooter) {

            oldFooter.remove();

        });


        /*
         * Put the new shared footer at the
         * bottom of the page.
         */
        document.body.appendChild(
            footerContainer
        );


        /*
         * Load the master footer.
         */
        fetch(
            footerURL.href,
            {
                cache: "no-cache"
            }
        )

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

            footerContainer.innerHTML =
                html;


            /*
             * Update footer year.
             */
            const year =
                document.getElementById(
                    "footer-year"
                );


            if (year) {

                year.textContent =
                    new Date().getFullYear();

            }


            /*
             * Fix images inside the footer.
             */
            footerContainer
                .querySelectorAll(
                    "[data-asset]"
                )
                .forEach(function (element) {

                    const asset =
                        element.getAttribute(
                            "data-asset"
                        );


                    if (!asset) {
                        return;
                    }


                    element.src =
                        new URL(
                            asset.replace(
                                /^\/+/,
                                ""
                            ),
                            projectRoot
                        ).href;

                });


            /*
             * Fix developer button if the
             * developer section exists.
             */
            const developerButton =
                document.getElementById(
                    "developerButton"
                );


            const developerModal =
                document.getElementById(
                    "developerContact"
                );


            const developerClose =
                document.getElementById(
                    "developerClose"
                );


            const developerOverlay =
                document.getElementById(
                    "developerOverlay"
                );


            if (
                developerButton &&
                developerModal &&
                developerButton.dataset
                    .developerReady !== "true"
            ) {

                developerButton.dataset
                    .developerReady =
                    "true";


                function openDeveloper() {

                    developerModal
                        .classList
                        .add("show");


                    developerModal.setAttribute(
                        "aria-hidden",
                        "false"
                    );


                    document.body.classList.add(
                        "developer-modal-open"
                    );

                }


                function closeDeveloper() {

                    developerModal
                        .classList
                        .remove("show");


                    developerModal.setAttribute(
                        "aria-hidden",
                        "true"
                    );


                    document.body.classList.remove(
                        "developer-modal-open"
                    );

                }


                developerButton.addEventListener(
                    "click",
                    openDeveloper
                );


                if (developerClose) {

                    developerClose.addEventListener(
                        "click",
                        closeDeveloper
                    );

                }


                if (developerOverlay) {

                    developerOverlay.addEventListener(
                        "click",
                        closeDeveloper
                    );

                }


                document.addEventListener(
                    "keydown",
                    function (event) {

                        if (
                            event.key === "Escape" &&
                            developerModal
                                .classList
                                .contains("show")
                        ) {

                            closeDeveloper();

                        }

                    }
                );

            }

        })

        .catch(function (error) {

            console.error(
                "Kenbridge shared footer error:",
                error
            );

        });

    }


    /*
     * Run after the page has loaded.
     */
    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            loadSharedFooter
        );

    } else {

        loadSharedFooter();

    }

})();
