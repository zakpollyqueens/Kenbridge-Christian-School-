document.addEventListener("DOMContentLoaded", function () {

    const footerContainer =
        document.getElementById("site-footer");

    if (!footerContainer) {
        console.error("Kenbridge: #site-footer not found.");
        return;
    }

    const footerURL =
        new URL(
            "components/footer.html",
            window.location.href
        );

    /*
     * If the current page is inside /page/,
     * move one level back to the project root.
     */
    if (
        window.location.pathname.includes("/page/")
    ) {

        footerURL.href =
            new URL(
                "../components/footer.html",
                window.location.href
            ).href;

    }


    fetch(footerURL.href)

        .then(function (response) {

            if (!response.ok) {
                throw new Error(
                    "Footer HTTP error: " +
                    response.status
                );
            }

            return response.text();

        })

        .then(function (html) {

            footerContainer.innerHTML = html;


            /*
             * Fix footer links for pages inside /page/
             */

            if (
                window.location.pathname.includes("/page/")
            ) {

                footerContainer
                    .querySelectorAll(
                        'a[href], img[src]'
                    )
                    .forEach(function (element) {

                        const attribute =
                            element.tagName === "IMG"
                                ? "src"
                                : "href";

                        const value =
                            element.getAttribute(attribute);

                        if (!value) {
                            return;
                        }

                        if (
                            value.startsWith("page/")
                        ) {

                            element.setAttribute(
                                attribute,
                                "../" + value
                            );

                        }

                        if (
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
             * Automatic copyright year
             */

            const year =
                footerContainer.querySelector(
                    "#currentYear"
                );

            if (year) {

                year.textContent =
                    new Date().getFullYear();

            }

            console.log(
                "Kenbridge footer loaded successfully."
            );

        })

        .catch(function (error) {

            console.error(
                "Kenbridge footer error:",
                error
            );

            footerContainer.innerHTML = `
                <div style="
                    padding:30px;
                    text-align:center;
                    color:#666;
                ">
                    Kenbridge Christian School
                </div>
            `;

        });

});
