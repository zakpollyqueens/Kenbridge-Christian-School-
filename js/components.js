/* =========================================================
   KENBRIDGE CHRISTIAN SCHOOL
   REUSABLE WEBSITE COMPONENTS
   ========================================================= */

document.addEventListener("DOMContentLoaded", function () {

    const footerContainer = document.getElementById("site-footer");

    if (!footerContainer) {
        return;
    }

    /*
       Work out whether the current page is inside
       /page/ or at the root of the website.
    */

    const isPageFolder =
        window.location.pathname.includes("/page/");

    const footerPath = isPageFolder
        ? "../components/footer.html"
        : "components/footer.html";


    fetch(footerPath)

        .then(function (response) {

            if (!response.ok) {
                throw new Error(
                    "Footer could not be loaded."
                );
            }

            return response.text();

        })

        .then(function (html) {

            footerContainer.innerHTML = html;


            /*
               The footer component uses paths beginning
               with "page/" and "images/".
               
               When the component is loaded on a page
               inside /page/, those paths need "../".
            */

            if (isPageFolder) {

                const footerLinks =
                    footerContainer.querySelectorAll(
                        'a[href], img[src]'
                    );

                footerLinks.forEach(function (element) {

                    const attribute =
                        element.tagName.toLowerCase() === "img"
                            ? "src"
                            : "href";

                    const value =
                        element.getAttribute(attribute);

                    if (!value) {
                        return;
                    }

                    if (
                        value.startsWith("page/") ||
                        value.startsWith("images/")
                    ) {

                        element.setAttribute(
                            attribute,
                            "../" + value
                        );

                    }

                });

            }


            /*
               Automatic copyright year.
            */

            const yearElement =
                footerContainer.querySelector(
                    "#currentYear"
                );

            if (yearElement) {

                yearElement.textContent =
                    new Date().getFullYear();

            }

        })

        .catch(function (error) {

            console.error(
                "Kenbridge footer error:",
                error
            );

        });

});
