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
            const developerButton =
    footerContainer.querySelector("#developerButton");

const developerContacts =
    footerContainer.querySelector("#developerContacts");

if (developerButton && developerContacts) {

    developerButton.addEventListener("click", function () {

        const isOpen =
            developerContacts.classList.toggle("show");

        developerButton.setAttribute(
            "aria-expanded",
            isOpen ? "true" : "false"
        );

        developerButton.innerHTML =
            isOpen
                ? "✕ Close Developer Contact"
                : "👨‍💻 Meet the Developer";
    });
}

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
<!-- =========================================================
     ZAKMOLANITECH SOLUTIONS — DEVELOPER SECTION
========================================================= -->

<section class="developer-section">

    <div class="developer-container">

        <div class="developer-card">

            <!-- DEVELOPER PHOTO -->
            <div class="developer-photo-wrap">

                <img
                    src="images/Snapchat-1124656073.jpg"
                    alt="Zakmolanitech Solutions"
                    class="developer-photo"
                >

            </div>


            <!-- DEVELOPER INFORMATION -->
            <div class="developer-info">

                <span class="developer-label">
                    WEBSITE DEVELOPER
                </span>

                <h2>
                    Zakmolanitech Solutions
                </h2>

                <p>
                    Website design, development and digital solutions.
                </p>

                <button
                    type="button"
                    class="developer-button"
                    onclick="openDeveloperContact()"
                >
                    Meet the Developer
                </button>

            </div>

        </div>

    </div>

</section>


<!-- =========================================================
     DEVELOPER CONTACT POPUP
========================================================= -->

<div
    class="developer-modal"
    id="developerContact"
    aria-hidden="true"
>

    <!-- CLICK OUTSIDE TO CLOSE -->
    <div
        class="developer-modal-overlay"
        onclick="closeDeveloperContact()"
    ></div>


    <div
        class="developer-modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="developerModalTitle"
    >

        <!-- CLOSE BUTTON -->
        <button
            type="button"
            class="developer-close"
            onclick="closeDeveloperContact()"
            aria-label="Close developer contact"
        >
            ×
        </button>


        <!-- DEVELOPER PHOTO -->
        <img
            src="images/Snapchat-1124656073.jpg"
            alt="Zakmolanitech Solutions"
            class="developer-modal-photo"
        >


        <span class="developer-label">
            MEET THE DEVELOPER
        </span>


        <h2 id="developerModalTitle">
            Zakmolanitech Solutions
        </h2>


        <p class="developer-modal-text">
            Connect with the developer through Telegram,
            WhatsApp or direct phone call.
        </p>


        <!-- =================================================
             TELEGRAM CHANNEL
        ================================================== -->

        <a
            href="https://t.me/zakmolanitech"
            class="developer-contact-link"
            target="_blank"
            rel="noopener noreferrer"
        >

            <span class="developer-contact-icon">
                📢
            </span>

            <span>
                <strong>
                    Telegram Channel
                </strong>

                <small>
                    Follow Zakmolanitech Solutions
                </small>
            </span>

        </a>


        <!-- =================================================
             TELEGRAM GROUP
        ================================================== -->

        <a
            href="https://t.me/zakmolanitechsolutions"
            class="developer-contact-link"
            target="_blank"
            rel="noopener noreferrer"
        >

            <span class="developer-contact-icon">
                👥
            </span>

            <span>
                <strong>
                    Telegram Group
                </strong>

                <small>
                    Join the Zakitech community
                </small>
            </span>

        </a>


        <!-- =================================================
             WHATSAPP — NUMBER 1
        ================================================== -->

        <a
            href="https://wa.me/256742956448"
            class="developer-contact-link"
            target="_blank"
            rel="noopener noreferrer"
        >

            <span class="developer-contact-icon">
                💬
            </span>

            <span>
                <strong>
                    WhatsApp
                </strong>

                <small>
                    +256 742 956 448
                </small>
            </span>

        </a>


        <!-- =================================================
             CALL — NUMBER 1
        ================================================== -->

        <a
            href="tel:+256742956448"
            class="developer-contact-link"
        >

            <span class="developer-contact-icon">
                📞
            </span>

            <span>
                <strong>
                    Direct Call
                </strong>

                <small>
                    +256 742 956 448
                </small>
            </span>

        </a>


        <!-- =================================================
             WHATSAPP — NUMBER 2
        ================================================== -->

        <a
            href="https://wa.me/256775226333"
            class="developer-contact-link"
            target="_blank"
            rel="noopener noreferrer"
        >

            <span class="developer-contact-icon">
                💬
            </span>

            <span>
                <strong>
                    WhatsApp
                </strong>

                <small>
                    +256 775 226 333
                </small>
            </span>

        </a>


        <!-- =================================================
             CALL — NUMBER 2
        ================================================== -->

        <a
            href="tel:+256775226333"
            class="developer-contact-link"
        >

            <span class="developer-contact-icon">
                📞
            </span>

            <span>
                <strong>
                    Direct Call
                </strong>

                <small>
                    +256 775 226 333
                </small>
            </span>

        </a>


    </div>

</div>


<!-- =========================================================
     DEVELOPER JAVASCRIPT
========================================================= -->

<script>

function openDeveloperContact() {

    const modal =
        document.getElementById("developerContact");

    if (!modal) return;

    modal.classList.add("show");

    modal.setAttribute(
        "aria-hidden",
        "false"
    );

    document.body.classList.add(
        "developer-modal-open"
    );

}


function closeDeveloperContact() {

    const modal =
        document.getElementById("developerContact");

    if (!modal) return;

    modal.classList.remove("show");

    modal.setAttribute(
        "aria-hidden",
        "true"
    );

    document.body.classList.remove(
        "developer-modal-open"
    );

}


/* =========================================================
   CLOSE POPUP WITH ESCAPE KEY
========================================================= */

document.addEventListener(
    "keydown",
    function(event) {

        if (event.key === "Escape") {

            closeDeveloperContact();

        }

    }
);

</script>
