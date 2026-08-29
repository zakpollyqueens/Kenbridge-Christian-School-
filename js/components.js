document.addEventListener("DOMContentLoaded", async function () {

    const footerContainer = document.getElementById("site-footer");

    if (!footerContainer) {
        return;
    }

    try {

        const isPageFolder =
            window.location.pathname.includes("/page/");

        const footerPath = isPageFolder
            ? "../components/footer.html"
            : "components/footer.html";

        const response = await fetch(footerPath);

        if (!response.ok) {
            throw new Error(
                `Footer request failed: ${response.status}`
            );
        }

        const footerHTML = await response.text();

        footerContainer.innerHTML = footerHTML;


        /* Fix links when footer is used inside /page/ */

        if (isPageFolder) {

            footerContainer
                .querySelectorAll("a[href], img[src]")
                .forEach(function (element) {

                    const attribute =
                        element.tagName === "IMG"
                            ? "src"
                            : "href";

                    const value =
                        element.getAttribute(attribute);

                    if (
                        value &&
                        (
                            value.startsWith("page/") ||
                            value.startsWith("images/")
                        )
                    ) {

                        element.setAttribute(
                            attribute,
                            "../" + value
                        );

                    }

                });

        }


        /* Automatic year */

        const year =
            footerContainer.querySelector("#currentYear");

        if (year) {
            year.textContent =
                new Date().getFullYear();
        }

    } catch (error) {

        console.error(
            "Kenbridge footer failed to load:",
            error
        );

    }

});
