/* =========================================================
   KENBRIDGE CHRISTIAN SCHOOL
   SHARED COMPONENTS
   ========================================================= */

/*
   IMPORTANT:

   script.js owns:
   - Main mobile hamburger menu
   - More dropdown
   - Header scroll effect
   - Back-to-top button
   - Main scroll reveal
   - Main image error handling
   - Forms

   components.js owns:
   - Shared footer
   - Footer assets
   - Developer modal
   - Active navigation
   - Gallery filters
   - Gallery lightbox

   The footer URL is resolved from this JavaScript file,
   so it works correctly from both:

       /index.html

   and:

       /page/*.html
*/


/* =========================================================
   COMPONENT SCRIPT LOCATION
   ========================================================= */

const COMPONENTS_SCRIPT_URL =
    document.currentScript
        ? document.currentScript.src
        : new URL(
            "js/components.js",
            document.baseURI
        ).href;


/* =========================================================
   START SHARED COMPONENTS
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        loadFooter();

        setupActiveNavigation();

        setupGalleryFilters();

        setupGalleryLightbox();

    }
);


/* =========================================================
   LOAD SHARED FOOTER
   ========================================================= */

function loadFooter() {

    const footerContainer =
        document.getElementById(
            "site-footer"
        );

    if (!footerContainer) {
        return;
    }


    /*
       Resolve footer.html relative to:

           js/components.js

       This works from the homepage and
       from pages inside /page/.
    */

    const footerURL =
        new URL(
            "../components/footer.html",
            COMPONENTS_SCRIPT_URL
        ).href;


    fetch(
        footerURL,
        {
            cache: "no-cache"
        }
    )

        .then(
            function (response) {

                if (!response.ok) {

                    throw new Error(
                        "Footer could not be loaded: " +
                        response.status
                    );
                }

                return response.text();
            }
        )

        .then(
            function (html) {

                footerContainer.innerHTML =
                    html;


                /*
                   The footer now exists in the DOM.
                   Therefore these functions MUST run
                   after innerHTML has been inserted.
                */

                setupFooterAssets();

                setupFooterYear();

                setupDeveloperContact();

            }
        )

        .catch(
            function (error) {

                console.error(
                    "Footer loading error:",
                    error
                );

            }
        );
}


/* =========================================================
   FOOTER ASSET PATHS
   ========================================================= */

function setupFooterAssets() {

    const assetElements =
        document.querySelectorAll(
            "[data-asset]"
        );


    assetElements.forEach(
        function (element) {

            const assetPath =
                element.getAttribute(
                    "data-asset"
                );


            if (!assetPath) {
                return;
            }


            /*
               Resolve assets from the project root
               using the location of components.js.

               Example:

               js/components.js
                    ↓
               ../images/file.jpg
            */

            const assetURL =
                new URL(
                    "../" +
                    assetPath.replace(
                        /^\/+/,
                        ""
                    ),
                    COMPONENTS_SCRIPT_URL
                ).href;


            if (
                element.tagName.toLowerCase() ===
                "img"
            ) {

                element.src =
                    assetURL;


                element.addEventListener(
                    "error",
                    function () {

                        element.classList.add(
                            "image-error"
                        );

                    }
                );

            }

        }
    );
}


/* =========================================================
   FOOTER YEAR
   ========================================================= */

function setupFooterYear() {

    const year =
        document.getElementById(
            "footer-year"
        );


    if (year) {

        year.textContent =
            new Date().getFullYear();

    }
}


/* =========================================================
   DEVELOPER CONTACT MODAL
   ========================================================= */

function setupDeveloperContact() {

    const openButton =
        document.getElementById(
            "developerButton"
        );


    const modal =
        document.getElementById(
            "developerContact"
        );


    const closeButton =
        document.getElementById(
            "developerClose"
        );


    const overlay =
        document.getElementById(
            "developerOverlay"
        );


    /*
       The footer has to finish loading first.
    */

    if (
        !openButton ||
        !modal
    ) {
        return;
    }


    /*
       Prevent duplicate listeners if the footer
       is ever loaded again.
    */

    if (
        openButton.dataset.developerReady ===
        "true"
    ) {
        return;
    }


    openButton.dataset.developerReady =
        "true";


    /* -----------------------------------------------------
       OPEN DEVELOPER MODAL
       ----------------------------------------------------- */

    function openDeveloperContact() {

        modal.classList.add(
            "show"
        );


        modal.setAttribute(
            "aria-hidden",
            "false"
        );


        document.body.classList.add(
            "developer-modal-open"
        );


        if (closeButton) {

            closeButton.focus();

        }

    }


    /* -----------------------------------------------------
       CLOSE DEVELOPER MODAL
       ----------------------------------------------------- */

    function closeDeveloperContact() {

        modal.classList.remove(
            "show"
        );


        modal.setAttribute(
            "aria-hidden",
            "true"
        );


        document.body.classList.remove(
            "developer-modal-open"
        );

    }


    /* -----------------------------------------------------
       OPEN BUTTON
       ----------------------------------------------------- */

    openButton.addEventListener(
        "click",
        openDeveloperContact
    );


    /* -----------------------------------------------------
       CLOSE BUTTON
       ----------------------------------------------------- */

    if (closeButton) {

        closeButton.addEventListener(
            "click",
            closeDeveloperContact
        );

    }


    /* -----------------------------------------------------
       OVERLAY CLOSE
       ----------------------------------------------------- */

    if (overlay) {

        overlay.addEventListener(
            "click",
            closeDeveloperContact
        );

    }


    /* -----------------------------------------------------
       ESCAPE KEY
       ----------------------------------------------------- */

    document.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key === "Escape" &&
                modal.classList.contains("show")
            ) {

                closeDeveloperContact();

            }

        }
    );

}


/* =========================================================
   ACTIVE NAVIGATION
   ========================================================= */

function setupActiveNavigation() {

    const currentPage =
        window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();


    document.querySelectorAll(
        ".desktop-nav a, .mobile-nav a"
    ).forEach(
        function (link) {

            const href =
                link.getAttribute(
                    "href"
                );


            if (
                !href ||
                href === "#"
            ) {
                return;
            }


            const linkPage =
                href
                    .split("/")
                    .pop()
                    .split("#")[0]
                    .toLowerCase();


            if (
                linkPage === currentPage ||
                (
                    currentPage === "" &&
                    linkPage === "index.html"
                )
            ) {

                link.classList.add(
                    "active"
                );

            }

        }
    );
}


/* =========================================================
   GALLERY FILTERS
   ========================================================= */

function setupGalleryFilters() {

    const filters =
        document.querySelectorAll(
            ".gallery-filter"
        );


    const items =
        document.querySelectorAll(
            ".gallery-item"
        );


    if (
        !filters.length ||
        !items.length
    ) {
        return;
    }


    filters.forEach(
        function (filter) {

            filter.addEventListener(
                "click",
                function () {

                    const category =
                        filter.getAttribute(
                            "data-filter"
                        );


                    filters.forEach(
                        function (item) {

                            item.classList.remove(
                                "active"
                            );

                        }
                    );


                    filter.classList.add(
                        "active"
                    );


                    items.forEach(
                        function (item) {

                            const itemCategory =
                                item.getAttribute(
                                    "data-category"
                                );


                            if (
                                category === "all" ||
                                itemCategory === category
                            ) {

                                item.classList.remove(
                                    "hidden"
                                );

                            } else {

                                item.classList.add(
                                    "hidden"
                                );

                            }

                        }
                    );

                }
            );

        }
    );
}


/* =========================================================
   GALLERY LIGHTBOX
   ========================================================= */

function setupGalleryLightbox() {

    const items =
        Array.from(
            document.querySelectorAll(
                ".gallery-item"
            )
        );


    const lightbox =
        document.getElementById(
            "galleryLightbox"
        );


    const image =
        document.getElementById(
            "lightboxImage"
        );


    const caption =
        document.getElementById(
            "lightboxCaption"
        );


    const closeButton =
        document.getElementById(
            "lightboxClose"
        );


    const previousButton =
        document.getElementById(
            "lightboxPrev"
        );


    const nextButton =
        document.getElementById(
            "lightboxNext"
        );


    if (
        !items.length ||
        !lightbox ||
        !image ||
        !caption
    ) {
        return;
    }


    let currentIndex = 0;


    /* -----------------------------------------------------
       GET VISIBLE GALLERY ITEMS
       ----------------------------------------------------- */

    function visibleItems() {

        return items.filter(
            function (item) {

                return !item.classList.contains(
                    "hidden"
                );

            }
        );

    }


    /* -----------------------------------------------------
       SHOW IMAGE
       ----------------------------------------------------- */

    function showImage(index) {

        const visible =
            visibleItems();


        if (!visible.length) {
            return;
        }


        if (index < 0) {

            index =
                visible.length - 1;

        }


        if (
            index >=
            visible.length
        ) {

            index = 0;

        }


        currentIndex =
            index;


        const item =
            visible[currentIndex];


        const itemImage =
            item.querySelector(
                "img"
            );


        const title =
            item.querySelector(
                "strong"
            );


        const description =
            item.querySelector(
                "span"
            );


        if (!itemImage) {
            return;
        }


        image.src =
            itemImage.src;


        image.alt =
            itemImage.alt || "";


        caption.innerHTML =
            "";


        if (title) {

            const titleElement =
                document.createElement(
                    "strong"
                );


            titleElement.textContent =
                title.textContent;


            caption.appendChild(
                titleElement
            );

        }


        if (description) {

            const descriptionElement =
                document.createElement(
                    "span"
                );


            descriptionElement.textContent =
                description.textContent;


            if (title) {

                caption.appendChild(
                    document.createElement(
                        "br"
                    )
                );

            }


            caption.appendChild(
                descriptionElement
            );

        }

    }


    /* -----------------------------------------------------
       OPEN LIGHTBOX
       ----------------------------------------------------- */

    function openLightbox(index) {

        showImage(index);


        lightbox.classList.add(
            "show"
        );


        lightbox.setAttribute(
            "aria-hidden",
            "false"
        );


        document.body.classList.add(
            "lightbox-open"
        );

    }


    /* -----------------------------------------------------
       CLOSE LIGHTBOX
       ----------------------------------------------------- */

    function closeLightbox() {

        lightbox.classList.remove(
            "show"
        );


        lightbox.setAttribute(
            "aria-hidden",
            "true"
        );


        document.body.classList.remove(
            "lightbox-open"
        );


        image.removeAttribute(
            "src"
        );

    }


    /* -----------------------------------------------------
       GALLERY ITEM CLICK
       ----------------------------------------------------- */

    items.forEach(
        function (item) {

            item.addEventListener(
                "click",
                function () {

                    const visible =
                        visibleItems();


                    const index =
                        visible.indexOf(
                            item
                        );


                    if (index !== -1) {

                        openLightbox(
                            index
                        );

                    }

                }
            );

        }
    );


    /* -----------------------------------------------------
       CLOSE BUTTON
       ----------------------------------------------------- */

    if (closeButton) {

        closeButton.addEventListener(
            "click",
            closeLightbox
        );

    }


    /* -----------------------------------------------------
       PREVIOUS BUTTON
       ----------------------------------------------------- */

    if (previousButton) {

        previousButton.addEventListener(
            "click",
            function (event) {

                event.stopPropagation();

                showImage(
                    currentIndex - 1
                );

            }
        );

    }


    /* -----------------------------------------------------
       NEXT BUTTON
       ----------------------------------------------------- */

    if (nextButton) {

        nextButton.addEventListener(
            "click",
            function (event) {

                event.stopPropagation();

                showImage(
                    currentIndex + 1
                );

            }
        );

    }


    /* -----------------------------------------------------
       CLICK OUTSIDE LIGHTBOX
       ----------------------------------------------------- */

    lightbox.addEventListener(
        "click",
        function (event) {

            if (
                event.target ===
                lightbox
            ) {

                closeLightbox();

            }

        }
    );


    /* -----------------------------------------------------
       KEYBOARD CONTROLS
       ----------------------------------------------------- */

    document.addEventListener(
        "keydown",
        function (event) {

            if (
                !lightbox.classList.contains(
                    "show"
                )
            ) {
                return;
            }


            if (
                event.key === "Escape"
            ) {

                closeLightbox();

            }


            if (
                event.key === "ArrowLeft"
            ) {

                showImage(
                    currentIndex - 1
                );

            }


            if (
                event.key === "ArrowRight"
            ) {

                showImage(
                    currentIndex + 1
                );

            }

        }
    );

}
