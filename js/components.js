document.addEventListener("DOMContentLoaded", function () {

    const footerContainer = document.getElementById("site-footer");

    if (!footerContainer) {
        console.error("Kenbridge: site-footer container not found.");
        return;
    }

    const isInsidePageFolder =
        window.location.pathname.includes("/page/");

    const footerFile = isInsidePageFolder
        ? "../components/footer.html"
        : "components/footer.html";

    fetch(footerFile)
        .then(function (response) {

            if (!response.ok) {
                throw new Error(
                    "Footer failed to load. HTTP " +
                    response.status
                );
            }

            return response.text();
        })

        .then(function (footerHTML) {

            footerContainer.innerHTML = footerHTML;

            /*
             * Correct paths for pages inside /page/
             */
            if (isInsidePageFolder) {

                const links =
                    footerContainer.querySelectorAll(
                        "a[href]"
                    );

                links.forEach(function (link) {

                    const href =
                        link.getAttribute("href");

                    if (
                        href &&
                        !href.startsWith("#") &&
                        !href.startsWith("http") &&
                        !href.startsWith("tel:")
                    ) {

                        if (!href.startsWith("../")) {
                            link.setAttribute(
                                "href",
                                "../" + href
                            );
                        }
                    }
                });


                const images =
                    footerContainer.querySelectorAll(
                        "img[src]"
                    );

                images.forEach(function (image) {

                    const src =
                        image.getAttribute("src");

                    if (
                        src &&
                        !src.startsWith("../") &&
                        !src.startsWith("http")
                    ) {

                        image.setAttribute(
                            "src",
                            "../" + src
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
                    padding:40px 20px;
                    text-align:center;
                    background:#063d23;
                    color:white;
                ">
                    <strong>Kenbridge Christian School</strong>
                </div>
            `;
        });

});
