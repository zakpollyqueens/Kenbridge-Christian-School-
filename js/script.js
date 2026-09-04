```javascript
/* =========================================================
   KENBRIDGE CHRISTIAN SCHOOL
   MAIN JAVASCRIPT
   ========================================================= */

(function () {
"use strict";

/* =========================================================
   DOM READY
   ========================================================= */
document.addEventListener("DOMContentLoaded", function () {

/* =========================================================
   OPENING SCREEN / 10 SECOND COUNTDOWN
   ---------------------------------------------------------
   IMPORTANT:
   The countdown is intentionally KEPT.
   Only the duplicate implementation has been removed.
   ========================================================= */

const openingScreen=document.getElementById("openingScreen");
const openingCounter=document.getElementById("openingCounter");
const openingMessage=document.getElementById("openingMessage");
const openingProgress=document.getElementById("openingProgress");
const openingLogo=document.querySelector(".opening-school-logo");

if(openingScreen){

    document.body.classList.add("opening-active");
    document.body.style.overflow="hidden";

    openingScreen.style.position="fixed";
    openingScreen.style.inset="0";
    openingScreen.style.width="100%";
    openingScreen.style.height="100dvh";
    openingScreen.style.minHeight="100vh";
    openingScreen.style.zIndex="999999";
    openingScreen.style.opacity="1";
    openingScreen.style.visibility="visible";
    openingScreen.style.pointerEvents="all";

    /* -----------------------------------------------------
       Opening badge enhancement
       ----------------------------------------------------- */

    if(openingLogo){

        openingLogo.style.display="block";
        openingLogo.style.objectFit="contain";
        openingLogo.style.margin="0 auto 18px";
        openingLogo.style.position="relative";
        openingLogo.style.zIndex="3";

        /*
         * Keep the real school badge visible while giving
         * it a clean illuminated background.
         */
        openingLogo.style.filter=
            "drop-shadow(0 12px 28px rgba(0,0,0,.25))";

        openingLogo.addEventListener("error",function(){
            this.style.display="none";
        });

    }else{

        /*
         * If the homepage contains no logo element,
         * create one automatically.
         */
        const content=document.querySelector(".opening-content");

        if(content){

            const logo=document.createElement("img");

            logo.className="opening-school-logo";
            logo.src="images/logo.jpg";
            logo.alt="Kenbridge Christian School Badge";
            logo.width=180;
            logo.height=180;
            logo.loading="eager";
            logo.decoding="async";
            logo.fetchPriority="high";

            const firstChild=content.firstElementChild;

            if(firstChild){
                content.insertBefore(logo,firstChild);
            }else{
                content.appendChild(logo);
            }

        }
    }

    /*
     * Extra background logo effect.
     * This does NOT replace the central badge.
     * It gives the opening screen a school-branded
     * background instead of a plain solid colour.
     */
    let openingBackground=document.querySelector(
        ".opening-logo-background"
    );

    if(!openingBackground){

        openingBackground=document.createElement("div");

        openingBackground.className=
            "opening-logo-background";

        openingBackground.setAttribute(
            "aria-hidden",
            "true"
        );

        openingBackground.style.position="absolute";
        openingBackground.style.left="50%";
        openingBackground.style.top="50%";
        openingBackground.style.width="min(72vw,620px)";
        openingBackground.style.height="min(72vw,620px)";
        openingBackground.style.transform=
            "translate(-50%,-50%)";
        openingBackground.style.backgroundImage=
            'url("images/logo.jpg")';
        openingBackground.style.backgroundPosition=
            "center";
        openingBackground.style.backgroundRepeat=
            "no-repeat";
        openingBackground.style.backgroundSize=
            "contain";
        openingBackground.style.opacity=".055";
        openingBackground.style.filter=
            "blur(1px)";
        openingBackground.style.pointerEvents="none";
        openingBackground.style.zIndex="1";

        openingScreen.insertBefore(
            openingBackground,
            openingScreen.firstChild
        );
    }

    /*
     * Make sure opening content remains above
     * the background badge.
     */
    const openingContent=document.querySelector(
        ".opening-content"
    );

    if(openingContent){
        openingContent.style.position="relative";
        openingContent.style.zIndex="5";
    }


    /* -----------------------------------------------------
       Countdown
       ----------------------------------------------------- */

    let count=10;
    const totalTime=10;

    const openingMessages={
        10:"Preparing your experience...",
        9:"Welcome to Kenbridge...",
        8:"Building Character...",
        7:"Quality Education...",
        6:"Growing in Christian Values...",
        5:"Learning with Purpose...",
        4:"Serving with Excellence...",
        3:"Building Tomorrow's Leaders...",
        2:"Almost ready...",
        1:"Welcome to Kenbridge Christian School!"
    };

    function updateOpeningScreen(){

        if(openingCounter){
            openingCounter.textContent=count;

            /*
             * Restart counter animation cleanly.
             */
            openingCounter.style.animation="none";

            void openingCounter.offsetWidth;

            openingCounter.style.animation=
                "counterPop .7s ease";
        }

        if(openingMessage){
            openingMessage.textContent=
                openingMessages[count] ||
                "Welcome to Kenbridge Christian School!";
        }

        if(openingProgress){

            const progress=
                ((totalTime-count)/totalTime)*100;

            openingProgress.style.width=
                progress+"%";
        }
    }

    updateOpeningScreen();

    const openingTimer=setInterval(function(){

        count--;

        if(count>0){

            updateOpeningScreen();

        }else{

            clearInterval(openingTimer);

            if(openingCounter){
                openingCounter.textContent="✓";
            }

            if(openingMessage){
                openingMessage.textContent=
                    "Welcome to Kenbridge Christian School!";
            }

            if(openingProgress){
                openingProgress.style.width="100%";
            }

            /*
             * Keep the final welcome moment before
             * revealing the homepage.
             */
            setTimeout(function(){

                openingScreen.classList.add("hide");

                document.body.classList.remove(
                    "opening-active"
                );

                document.body.style.overflow="";

                /*
                 * Remove from layout after transition.
                 */
                setTimeout(function(){

                    openingScreen.style.display="none";

                },750);

            },700);
        }

    },1000);
}


/* =========================================================
   MOBILE NAVIGATION
   ========================================================= */

const mobileMenuButton=
    document.getElementById("mobileMenuButton");

const mobileNav=
    document.getElementById("mobileNav");

function closeMobileMenu(){

    if(!mobileNav){
        return;
    }

    mobileNav.classList.remove("open");
    mobileNav.classList.remove("active");

    if(mobileMenuButton){

        mobileMenuButton.classList.remove("active");

        mobileMenuButton.setAttribute(
            "aria-expanded",
            "false"
        );
    }

    document.body.classList.remove("menu-open");
}

function openMobileMenu(){

    if(!mobileNav){
        return;
    }

    mobileNav.classList.add("open");
    mobileNav.classList.add("active");

    if(mobileMenuButton){

        mobileMenuButton.classList.add("active");

        mobileMenuButton.setAttribute(
            "aria-expanded",
            "true"
        );
    }

    document.body.classList.add("menu-open");
}

if(mobileMenuButton && mobileNav){

    mobileMenuButton.addEventListener(
        "click",
        function(event){

            event.preventDefault();
            event.stopPropagation();

            if(
                mobileNav.classList.contains("open") ||
                mobileNav.classList.contains("active")
            ){
                closeMobileMenu();
            }else{
                openMobileMenu();
            }
        }
    );

    mobileNav.querySelectorAll("a").forEach(
        function(link){

            link.addEventListener(
                "click",
                function(){

                    /*
                     * Do not interfere with Developer
                     * trigger. It is handled separately.
                     */
                    if(
                        this.hasAttribute(
                            "data-developer-trigger"
                        )
                    ){
                        return;
                    }

                    closeMobileMenu();
                }
            );
        }
    );
}


/* =========================================================
   CLOSE MOBILE MENU WHEN CLICKING OUTSIDE
   ========================================================= */

document.addEventListener(
    "click",
    function(event){

        if(!mobileNav || !mobileMenuButton){
            return;
        }

        if(
            mobileNav.classList.contains("open") &&
            !mobileNav.contains(event.target) &&
            !mobileMenuButton.contains(event.target)
        ){
            closeMobileMenu();
        }
    }
);


/* =========================================================
   ESCAPE KEY
   ========================================================= */

document.addEventListener(
    "keydown",
    function(event){

        if(event.key!=="Escape"){
            return;
        }

        closeMobileMenu();

    }
);


/* =========================================================
   MORE DROPDOWN
   ========================================================= */

const moreMenu=
    document.querySelector(".more-menu");

const moreButton=
    document.querySelector(".more-button");

if(moreMenu && moreButton){

    moreButton.addEventListener(
        "click",
        function(event){

            event.preventDefault();
            event.stopPropagation();

            const isOpen=
                moreMenu.classList.toggle("open");

            moreButton.setAttribute(
                "aria-expanded",
                String(isOpen)
            );
        }
    );

    const dropdown=
        moreMenu.querySelector(".dropdown");

    if(dropdown){

        dropdown.addEventListener(
            "click",
            function(event){
                event.stopPropagation();
            }
        );
    }

    document.addEventListener(
        "click",
        function(){

            moreMenu.classList.remove("open");

            moreButton.setAttribute(
                "aria-expanded",
                "false"
            );
        }
    );
}


/* =========================================================
   HEADER SCROLL EFFECT
   ========================================================= */

const header=
    document.getElementById("header");

let scrollTicking=false;

function updateHeader(){

    if(!header){
        return;
    }

    if(window.scrollY>40){
        header.classList.add("scrolled");
    }else{
        header.classList.remove("scrolled");
    }

    scrollTicking=false;
}

window.addEventListener(
    "scroll",
    function(){

        if(!scrollTicking){

            window.requestAnimationFrame(
                updateHeader
            );

            scrollTicking=true;
        }

    },
    {passive:true}
);

updateHeader();


/* =========================================================
   INTERNAL SMOOTH LINKS
   ========================================================= */

document.querySelectorAll(
    'a[href^="#"]'
).forEach(function(link){

    link.addEventListener(
        "click",
        function(event){

            const targetId=
                this.getAttribute("href");

            if(
                !targetId ||
                targetId==="#" ||
                targetId==="javascript:void(0)"
            ){
                return;
            }

            let target=null;

            try{
                target=document.querySelector(
                    targetId
                );
            }catch(error){
                return;
            }

            if(!target){
                return;
            }

            event.preventDefault();

            closeMobileMenu();

            target.scrollIntoView({
                behavior:"smooth",
                block:"start"
            });
        }
    );
});


/* =========================================================
   SCROLL REVEAL
   ========================================================= */

const revealElements=
    document.querySelectorAll(
        ".feature-card,"+
        ".section-heading,"+
        ".welcome-content,"+
        ".welcome-image,"+
        ".contact-form-wrapper,"+
        ".contact-details"
    );

if(
    revealElements.length &&
    "IntersectionObserver" in window
){

    const revealObserver=
        new IntersectionObserver(
            function(entries,observer){

                entries.forEach(
                    function(entry){

                        if(entry.isIntersecting){

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
                threshold:.12,
                rootMargin:"0px 0px -30px 0px"
            }
        );

    revealElements.forEach(
        function(element){

            element.classList.add("reveal");

            revealObserver.observe(
                element
            );
        }
    );

}else{

    /*
     * Fallback for browsers without
     * IntersectionObserver.
     */
    revealElements.forEach(
        function(element){
            element.classList.add("visible");
        }
    );
}


/* =========================================================
   CONTACT FORM
   ========================================================= */

const contactForm=
    document.getElementById("contactForm");

const contactStatus=
    document.getElementById("contactStatus");

if(contactForm){

    contactForm.addEventListener(
        "submit",
        function(event){

            event.preventDefault();

            if(contactStatus){

                contactStatus.textContent=
                    "Thank you. Your message has been received by the website form.";

                contactStatus.classList.add(
                    "success"
                );
            }

            contactForm.reset();
        }
    );
}


/* =========================================================
   FEEDBACK FORM
   ========================================================= */

const feedbackForm=
    document.getElementById("feedbackForm");

const feedbackStatus=
    document.getElementById("feedbackStatus");

if(feedbackForm){

    feedbackForm.addEventListener(
        "submit",
        function(event){

            event.preventDefault();

            if(feedbackStatus){

                feedbackStatus.textContent=
                    "Thank you for your feedback.";

                feedbackStatus.classList.add(
                    "success"
                );
            }

            feedbackForm.reset();
        }
    );
}


/* =========================================================
   IMAGE ERROR HANDLING
   ========================================================= */

document.querySelectorAll("img").forEach(
    function(image){

        image.addEventListener(
            "error",
            function(){

                this.classList.add(
                    "image-error"
                );
            },
            {once:true}
        );
    }
);


/* =========================================================
   CURRENT YEAR
   ========================================================= */

document.querySelectorAll(
    "[data-current-year]"
).forEach(
    function(element){

        element.textContent=
            new Date().getFullYear();
    }
);


/* =========================================================
   BACK TO TOP
   ========================================================= */

const backToTop=
    document.getElementById("backToTop");

if(backToTop){

    let topTicking=false;

    function updateBackToTop(){

        if(window.scrollY>500){

            backToTop.classList.add("show");

        }else{

            backToTop.classList.remove("show");
        }

        topTicking=false;
    }

    window.addEventListener(
        "scroll",
        function(){

            if(!topTicking){

                window.requestAnimationFrame(
                    updateBackToTop
                );

                topTicking=true;
            }

        },
        {passive:true}
    );

    backToTop.addEventListener(
        "click",
        function(){

            window.scrollTo({
                top:0,
                behavior:"smooth"
            });
        }
    );
}

});


/* =========================================================
   DEVELOPER SYSTEM
   ---------------------------------------------------------
   Supports:
   - Existing developerButton
   - Mobile hamburger developer link
   - Desktop developer link
   ========================================================= */

function setupDeveloper(){

    const modal=
        document.getElementById(
            "developerContact"
        );

    const closeButton=
        document.getElementById(
            "developerClose"
        );

    const overlay=
        document.getElementById(
            "developerOverlay"
        );

    const developerButtons=
        document.querySelectorAll(
            "#developerButton,"+
            "[data-developer-trigger]"
        );

    if(!modal){
        return;
    }

    function closeDeveloper(){

        modal.classList.remove("show");

        modal.setAttribute(
            "aria-hidden",
            "true"
        );

        document.body.classList.remove(
            "developer-modal-open"
        );
    }

    function openDeveloper(event){

        if(event){
            event.preventDefault();
        }

        modal.classList.add("show");

        modal.setAttribute(
            "aria-hidden",
            "false"
        );

        document.body.classList.add(
            "developer-modal-open"
        );

        /*
         * Close mobile navigation when
         * Developer is selected.
         */
        const mobileNav=
            document.getElementById("mobileNav");

        const mobileButton=
            document.getElementById(
                "mobileMenuButton"
            );

        if(mobileNav){
            mobileNav.classList.remove("open");
            mobileNav.classList.remove("active");
        }

        if(mobileButton){

            mobileButton.classList.remove(
                "active"
            );

            mobileButton.setAttribute(
                "aria-expanded",
                "false"
            );
        }

        document.body.classList.remove(
            "menu-open"
        );
    }

    developerButtons.forEach(
        function(button){

            /*
             * Prevent duplicate listeners.
             */
            if(
                button.dataset.developerReady===
                "true"
            ){
                return;
            }

            button.dataset.developerReady=
                "true";

            button.addEventListener(
                "click",
                openDeveloper
            );
        }
    );

    if(closeButton){

        closeButton.addEventListener(
            "click",
            closeDeveloper
        );
    }

    if(overlay){

        overlay.addEventListener(
            "click",
            closeDeveloper
        );
    }

    document.addEventListener(
        "keydown",
        function(event){

            if(
                event.key==="Escape" &&
                modal.classList.contains("show")
            ){
                closeDeveloper();
            }
        }
    );
}


/* =========================================================
   SHARED FOOTER
   ---------------------------------------------------------
   Loads components/footer.html only when necessary.
   Uses the existing #site-footer when present.
   ========================================================= */

function loadSharedFooter(){

    let footerContainer=
        document.getElementById("site-footer");

    /*
     * Find script.js path so this works from:
     * /index.html
     * /page/about.html
     * /page/contact.html
     * etc.
     */
    const script=
        document.querySelector(
            'script[src*="js/script.js"]'
        );

    if(!script){
        setupDeveloper();
        return;
    }

    const scriptURL=
        new URL(
            script.getAttribute("src"),
            document.baseURI
        );

    const projectRoot=
        new URL(
            "../",
            scriptURL
        );

    const footerURL=
        new URL(
            "components/footer.html",
            projectRoot
        );

    /*
     * If there is no footer container,
     * create one at the bottom.
     */
    if(!footerContainer){

        /*
         * Remove legacy hard-coded footers.
         */
        document.querySelectorAll(
            "footer:not(.site-footer)"
        ).forEach(
            function(oldFooter){
                oldFooter.remove();
            }
        );

        footerContainer=
            document.createElement("div");

        footerContainer.id=
            "site-footer";

        document.body.appendChild(
            footerContainer
        );
    }

    /*
     * If the footer has already been loaded,
     * do not request it again.
     */
    if(
        footerContainer.dataset.loaded===
        "true"
    ){

        setupDeveloper();
        return;
    }

    footerContainer.dataset.loading=
        "true";

    fetch(
        footerURL.href,
        {
            cache:"default"
        }
    )
    .then(
        function(response){

            if(!response.ok){

                throw new Error(
                    "Footer could not be loaded: "+
                    response.status
                );
            }

            return response.text();
        }
    )
    .then(
        function(html){

            footerContainer.innerHTML=
                html;

            footerContainer.dataset.loaded=
                "true";

            footerContainer.dataset.loading=
                "false";

            /*
             * Update footer year.
             */
            const footerYear=
                document.getElementById(
                    "footer-year"
                );

            if(footerYear){

                footerYear.textContent=
                    new Date().getFullYear();
            }

            /*
             * Correct footer assets.
             */
            footerContainer.querySelectorAll(
                "[data-asset]"
            ).forEach(
                function(element){

                    const asset=
                        element.getAttribute(
                            "data-asset"
                        );

                    if(!asset){
                        return;
                    }

                    const cleanAsset=
                        asset.replace(
                            /^\/+/,
                            ""
                        );

                    /*
                     * Support both image and source
                     * elements.
                     */
                    if(
                        element.tagName===
                        "IMG"
                    ){

                        element.src=
                            new URL(
                                cleanAsset,
                                projectRoot
                            ).href;

                    }else{

                        element.setAttribute(
                            "src",
                            new URL(
                                cleanAsset,
                                projectRoot
                            ).href
                        );
                    }
                }
            );

            /*
             * Setup developer controls after
             * the footer has been inserted.
             */
            setupDeveloper();
        }
    )
    .catch(
        function(error){

            footerContainer.dataset.loading=
                "false";

            console.error(
                "Kenbridge shared footer error:",
                error
            );

            /*
             * Do not block the rest of the
             * website if the footer fails.
             */
            setupDeveloper();
        }
    );
}


/* =========================================================
   START SHARED FOOTER
   ========================================================= */

if(
    document.readyState===
    "loading"
){

    document.addEventListener(
        "DOMContentLoaded",
        loadSharedFooter,
        {once:true}
    );

}else{

    loadSharedFooter();
}


/* =========================================================
   GLOBAL DEVELOPER FALLBACK
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    function(){

        /*
         * If there is no dynamically loaded footer,
         * still initialise developer controls.
         */
        setTimeout(
            setupDeveloper,
            0
        );

    },
    {once:true}
);

})();
```
