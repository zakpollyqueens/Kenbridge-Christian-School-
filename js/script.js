/* =========================================================
KENBRIDGE CHRISTIAN SCHOOL
MAIN JAVASCRIPT
========================================================= */

/* =========================================================
WAIT FOR PAGE TO LOAD
========================================================= */

document.addEventListener("DOMContentLoaded", function () {

/* =====================================================
   MOBILE NAVIGATION
   ===================================================== */

const mobileMenuButton =
    document.getElementById("mobileMenuButton");

const mobileNav =
    document.getElementById("mobileNav");


if (mobileMenuButton && mobileNav) {

    mobileMenuButton.addEventListener("click", function () {

        const isOpen =
            mobileNav.classList.toggle("open");

        mobileMenuButton.classList.toggle(
            "active",
            isOpen
        );

        mobileMenuButton.setAttribute(
            "aria-expanded",
            isOpen
        );

        document.body.classList.toggle(
            "menu-open",
            isOpen
        );

    });


    /* Close mobile menu after clicking a link */

    const mobileLinks =
        mobileNav.querySelectorAll("a");

    mobileLinks.forEach(function (link) {

        link.addEventListener("click", function () {

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

        });

    });

}



/* =====================================================
   MORE DROPDOWN
   ===================================================== */

const moreMenu =
    document.querySelector(".more-menu");

const moreButton =
    document.querySelector(".more-button");


if (moreMenu && moreButton) {

    moreButton.addEventListener("click", function (event) {

        event.stopPropagation();

        moreMenu.classList.toggle("open");

    });


    /* Prevent dropdown click from closing itself */

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


    /* Close when clicking elsewhere */

    document.addEventListener(
        "click",
        function () {

            moreMenu.classList.remove("open");

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
                document.querySelector(targetId);

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
    document.getElementById("contactForm");

const contactStatus =
    document.getElementById("contactStatus");


if (contactForm) {

    contactForm.addEventListener(
        "submit",
        function (event) {

            /*
             * Front-end stage only.
             *
             * Later we will replace this with
             * the real backend endpoint.
             */

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
    document.getElementById("feedbackForm");

const feedbackStatus =
    document.getElementById("feedbackStatus");


if (feedbackForm) {

    feedbackForm.addEventListener(
        "submit",
        function (event) {

            /*
             * Front-end stage only.
             *
             * Real submission will be connected
             * during backend integration.
             */

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


yearElements.forEach(function (element) {

    element.textContent =
        new Date().getFullYear();

});



/* =====================================================
   BACK TO TOP
   ===================================================== */

const backToTop =
    document.getElementById("backToTop");


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
