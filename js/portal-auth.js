(function () {
"use strict";

const API_BASE_URL =
    "https://kenbridge-christian-school.onrender.com/api";

const currentPath = window.location.pathname.toLowerCase();
const isAdminPage = currentPath.includes("/staff/admin/");
const loginPage = isAdminPage ? "../login.html" : "login.html";

if (currentPath.endsWith("/staff/login.html")) return;

const token = localStorage.getItem("kenbridgeAccessToken");

if (!token) {
    redirectToLogin("Please sign in to access the Staff Portal.");
    return;
}

verifyUser(token);

async function verifyUser(accessToken) {
    try {
        const response = await fetch(API_BASE_URL + "/auth/me", {
            headers: {
                Authorization: "Bearer " + accessToken
            }
        });

        const result = await response.json();

        if (!response.ok || !result.success || !result.user) {
            throw new Error(result.message || "Your session has expired.");
        }

        const user = result.user;
        const role = String(user.role || "").toUpperCase();

        localStorage.setItem("kenbridgeUser", JSON.stringify(user));
        sessionStorage.setItem("kenbridgeStaffLoggedIn", "true");
        sessionStorage.setItem(
            "kenbridgeUserRole",
            role.toLowerCase()
        );

        if (isAdminPage && role !== "ADMIN") {
            redirectToDashboard(user);
            return;
        }

        if (
            !isAdminPage &&
            role !== "STAFF" &&
            role !== "ADMIN"
        ) {
            clearSession();
            redirectToLogin(
                "Your account does not have permission to access this page."
            );
            return;
        }

        document.documentElement.classList.add(
            "portal-authenticated"
        );
    } catch (error) {
        console.error("PORTAL AUTHENTICATION ERROR:", error);
        clearSession();
        redirectToLogin("Your session has expired. Please sign in again.");
    }
}

function clearSession() {
    [
        "kenbridgeAccessToken",
        "kenbridgeRefreshToken",
        "kenbridgeUser"
    ].forEach(key => localStorage.removeItem(key));

    [
        "kenbridgeStaffLoggedIn",
        "kenbridgeUserRole"
    ].forEach(key => sessionStorage.removeItem(key));
}

function redirectToLogin(reason) {
    if (reason) {
        sessionStorage.setItem("kenbridgeLoginMessage", reason);
    }

    window.location.replace(loginPage);
}

function redirectToDashboard(user) {
    const role = String(user.role || "").toUpperCase();

    if (role === "ADMIN") {
        window.location.replace(
            isAdminPage
                ? "admin-dashboard.html"
                : "admin/admin-dashboard.html"
        );
        return;
    }

    window.location.replace(
        isAdminPage
            ? "../staff-dashboard.html"
            : "staff-dashboard.html"
    );
}

})();
