/* ================================================
KENBRIDGE CHRISTIAN SCHOOL
PHASE 1 JAVASCRIPT
================================================ */

/* MOBILE NAVIGATION */

const mobileMenuButton =
document.getElementById("mobileMenuButton");

const mobileNav =
document.getElementById("mobileNav");

if (mobileMenuButton && mobileNav) {

mobileMenuButton.addEventListener(
    "click",
    function () {

        mobileNav.classList.toggle("show");

        const isOpen =
            mobileNav.classList.contains("show");

        mobileMenuButton.setAttribute(
            "aria-expanded",
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

            mobileNav.classList.remove("show");

            mobileMenuButton.setAttribute(
                "aria-expanded",
                "false"
            );

        }
    );

});

}

/* HEADER SCROLL EFFECT */

const header =
document.getElementById("header");

window.addEventListener(
"scroll",
function () {

    if (!header) {
        return;
    }

    if (window.scrollY > 30) {

        header.style.boxShadow =
            "0 8px 30px rgba(0,0,0,0.10)";

    } else {

        header.style.boxShadow =
            "0 3px 20px rgba(0,0,0,0.06)";

    }

}

);

/* SIMPLE SCROLL REVEAL */

const revealElements =
document.querySelectorAll(
".quick-card, " +
".feature-card, " +
".life-card, " +
".welcome-content, " +
".welcome-image, " +
".contact-grid"
);

const revealObserver =
new IntersectionObserver(
function (entries) {

        entries.forEach(function (entry) {

            if (entry.isIntersecting) {

                entry.target.classList.add(
                    "visible"
                );

                revealObserver.unobserve(
                    entry.target
                );

            }

        });

    },
    {
        threshold: 0.12
    }
);

revealElements.forEach(function (element) {

element.style.opacity = "0";

element.style.transform =
    "translateY(25px)";

element.style.transition =
    "opacity 0.7s ease, transform 0.7s ease";

revealObserver.observe(element);

});

/* REVEAL STYLE */

const revealStyle =
document.createElement("style");

revealStyle.textContent = `

.quick-card.visible,
.feature-card.visible,
.life-card.visible,
.welcome-content.visible,
.welcome-image.visible,
.contact-grid.visible {

    opacity: 1 !important;

    transform:
        translateY(0) !important;
}

`;

document.head.appendChild(revealStyle);
