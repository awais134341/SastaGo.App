/* =====================================================
   SASTAGO CUSTOMER GPS LOCATION SYSTEM
   ANDROID CAPACITOR + BROWSER GPS
   AUTO LOCATION + CHECKOUT + GOOGLE MAPS
   LOCATION PERSISTENCE ENABLED
===================================================== */

import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

(() => {
    "use strict";

    /* =====================================================
       CONFIGURATION
    ===================================================== */

    const MAP_FIELD_ID = "mapLink";

    const PROMPT_KEY = "sastago_location_prompt_seen";

    const SAVED_LOCATION_KEY = "sastago_customer_location";

    const LOCATION_TIMEOUT = 30000;

    let currentLocation = null;

    let isRequestingLocation = false;

    let observer = null;


    /* =====================================================
       PLATFORM DETECTION
    ===================================================== */

    function isNativeAndroid() {
        return (
            Capacitor.isNativePlatform() &&
            Capacitor.getPlatform() === "android"
        );
    }


    /* =====================================================
       NOTIFICATION
    ===================================================== */

    function notify(message, type = "success") {

        if (typeof window.sastagoShowToast === "function") {

            window.sastagoShowToast(message, type);

        } else if (typeof window.showToast === "function") {

            window.showToast(message, type);

        } else {

            alert(message);

        }

    }


    /* =====================================================
       CSS STYLES
    ===================================================== */

    function addLocationStyles() {

        if (document.getElementById("sastagoLocationStyles")) {
            return;
        }

        const style = document.createElement("style");

        style.id = "sastagoLocationStyles";

        style.textContent = `

            #sastagoLocationPrompt {
                display:none;
                position:fixed;
                inset:0;
                z-index:999999;
                background:rgba(0,0,0,.65);
                align-items:center;
                justify-content:center;
                padding:18px;
            }

            #sastagoLocationPrompt.show {
                display:flex;
            }

            .sastago-location-modal {
                width:100%;
                max-width:380px;
                background:#fff;
                border-radius:20px;
                padding:25px 20px;
                text-align:center;
                box-shadow:0 15px 45px rgba(0,0,0,.2);
            }

            .sastago-location-icon {
                width:75px;
                height:75px;
                margin:0 auto 15px;
                border-radius:50%;
                background:#e8f7ee;
                display:flex;
                align-items:center;
                justify-content:center;
                font-size:38px;
            }

            .sastago-location-modal h2 {
                color:#087b43;
                margin:10px 0;
                font-size:23px;
            }

            .sastago-location-modal p {
                color:#666;
                font-size:14px;
                line-height:1.6;
                margin:10px 0 20px;
            }

            .sastago-location-btn {
                display:block;
                width:100%;
                padding:14px;
                margin-top:10px;
                border:none;
                border-radius:10px;
                font-size:15px;
                font-weight:bold;
                cursor:pointer;
            }

            #sastagoAllowLocation {
                background:#087b43;
                color:#fff;
            }

            #sastagoSkipLocation {
                background:#f1f1f1;
                color:#555;
            }

            #sastagoLocationStatus,
            #sastagoCheckoutLocationStatus {
                display:block;
                margin-top:10px;
                font-size:13px;
                line-height:1.5;
            }

            .sastago-checkout-location {
                margin:12px 0;
                padding:14px;
                background:#f0faf4;
                border:1px solid #ccebd8;
                border-radius:10px;
            }

            .sastago-checkout-location button {
                width:100%;
                padding:12px;
                border:none;
                border-radius:8px;
                background:#087b43;
                color:white;
                font-weight:bold;
                font-size:14px;
                cursor:pointer;
            }

            .sastago-checkout-location button:disabled {
                opacity:.6;
                cursor:not-allowed;
            }

            .sastago-map-link {
                display:block;
                margin-top:8px;
                color:#087b43;
                font-size:13px;
                font-weight:bold;
                text-decoration:none;
            }

        `;

        document.head.appendChild(style);

    }


    /* =====================================================
       CREATE LOCATION POPUP
    ===================================================== */

    function createLocationPopup() {

        if (document.getElementById("sastagoLocationPrompt")) {
            return;
        }

        const modal = document.createElement("div");

        modal.id = "sastagoLocationPrompt";

        modal.innerHTML = `

            <div class="sastago-location-modal">

                <div class="sastago-location-icon">
                    📍
                </div>

                <h2>Turn On Location</h2>

                <p>
                    Allow SastaGo to access your current location
                    so we can make your delivery easier and share
                    your delivery point with our team.
                </p>

                <button
                    type="button"
                    id="sastagoAllowLocation"
                    class="sastago-location-btn">

                    Allow Location

                </button>

                <button
                    type="button"
                    id="sastagoSkipLocation"
                    class="sastago-location-btn">

                    Maybe Later

                </button>

                <span id="sastagoLocationStatus"></span>

            </div>

        `;

        document.body.appendChild(modal);

        document
            .getElementById("sastagoAllowLocation")
            .addEventListener("click", () => {

                requestSastaGoLocation("startup");

            });

        document
            .getElementById("sastagoSkipLocation")
            .addEventListener("click", closeLocationPopup);

    }


    /* =====================================================
       CHECKOUT LOCATION BUTTON
    ===================================================== */

    function createCheckoutLocationButton() {

        const mapField = document.getElementById(MAP_FIELD_ID);

        if (!mapField) return;

        if (
            document.getElementById(
                "sastagoCheckoutLocationBox"
            )
        ) {
            return;
        }

        const box = document.createElement("div");

        box.id = "sastagoCheckoutLocationBox";

        box.className = "sastago-checkout-location";

        box.innerHTML = `

            <button
                type="button"
                id="sastagoCheckoutLocationBtn">

                📍 Use My Current Location

            </button>

            <span id="sastagoCheckoutLocationStatus">

                Add your GPS location for easier delivery.

            </span>

            <a
                id="sastagoCheckoutMapLink"
                class="sastago-map-link"
                href="#"
                target="_blank"
                rel="noopener"
                style="display:none;">

                Open Location in Google Maps

            </a>

        `;

        mapField.insertAdjacentElement("afterend", box);

        document
            .getElementById("sastagoCheckoutLocationBtn")
            .addEventListener("click", () => {

                requestSastaGoLocation("checkout");

            });

        if (currentLocation) {

            showSavedLocation();

        }

    }


    /* =====================================================
       POPUP CONTROL
    ===================================================== */

    function openLocationPopup() {

        document
            .getElementById("sastagoLocationPrompt")
            ?.classList.add("show");

    }


    function closeLocationPopup() {

        document
            .getElementById("sastagoLocationPrompt")
            ?.classList.remove("show");

        try {

            localStorage.setItem(PROMPT_KEY, "yes");

        } catch (error) {

            console.error(
                "Location prompt storage error:",
                error
            );

        }

    }


    /* =====================================================
       LOCATION STATUS
    ===================================================== */

    function setLocationStatus(
        message,
        type = "success",
        target = "both"
    ) {

        const ids = [];

        if (
            target === "both" ||
            target === "startup"
        ) {
            ids.push("sastagoLocationStatus");
        }

        if (
            target === "both" ||
            target === "checkout"
        ) {
            ids.push("sastagoCheckoutLocationStatus");
        }

        ids.forEach(id => {

            const element = document.getElementById(id);

            if (!element) return;

            element.textContent = message;

            element.style.color =
                type === "error"
                    ? "#d32f2f"
                    : "#087b43";

        });

    }


    /* =====================================================
       NORMALIZE GPS POSITION
    ===================================================== */

    function normalizePosition(position) {

        const coords = position?.coords || position;

        const latitude = Number(coords?.latitude);

        const longitude = Number(coords?.longitude);

        const accuracy = Number(coords?.accuracy || 0);

        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
        ) {

            throw new Error("INVALID_LOCATION");

        }

        return {
            latitude,
            longitude,
            accuracy
        };

    }


    /* =====================================================
       SHOW SAVED LOCATION
    ===================================================== */

    function showSavedLocation() {

        if (!currentLocation) return;

        const mapField = document.getElementById(MAP_FIELD_ID);

        if (mapField) {

            mapField.value = currentLocation.mapLink;

            mapField.dispatchEvent(
                new Event("input", { bubbles: true })
            );

            mapField.dispatchEvent(
                new Event("change", { bubbles: true })
            );

        }

        const mapLinkElement = document.getElementById(
            "sastagoCheckoutMapLink"
        );

        if (mapLinkElement) {

            mapLinkElement.href = currentLocation.mapLink;

            mapLinkElement.style.display = "block";

        }

        setLocationStatus(
            "Your saved delivery location is ready.",
            "success",
            "checkout"
        );

    }


    /* =====================================================
       SAVE CUSTOMER LOCATION
    ===================================================== */

    function saveCustomerLocation(position) {

        const coords = normalizePosition(position);

        const mapLink =
            "https://www.google.com/maps?q=" +
            coords.latitude +
            "," +
            coords.longitude;

        currentLocation = {

            latitude: coords.latitude,

            longitude: coords.longitude,

            accuracy: coords.accuracy,

            mapLink,

            capturedAt: new Date().toISOString()

        };

        try {

            localStorage.setItem(
                SAVED_LOCATION_KEY,
                JSON.stringify(currentLocation)
            );

        } catch (error) {

            throw new Error(
                "Location could not be saved on this device."
            );

        }

        window.sastagoCustomerLocation = currentLocation;

        showSavedLocation();

        setLocationStatus(
            "Location added successfully! Your delivery map link is ready.",
            "success"
        );

        closeLocationPopup();

        notify("Current location added successfully!");

        console.log(
            "SastaGo GPS Location:",
            currentLocation
        );

        return currentLocation;

    }


    /* =====================================================
       ERROR HANDLING
    ===================================================== */

    function handleLocationError(error, source) {

        let message = "Unable to get your location.";

        if (
            error.message === "LOCATION_PERMISSION_DENIED" ||
            error.message === "USER_DENIED" ||
            error.code === 1
        ) {

            message =
                "Location permission denied. Please allow location access in Android app settings.";

        } else if (
            error.message === "GPS_NOT_SUPPORTED" ||
            error.code === 2
        ) {

            message =
                "Your location is unavailable. Please check your GPS.";

        } else if (error.code === 3) {

            message =
                "Location request timed out. Please try again.";

        } else if (
            error.message === "HTTPS_REQUIRED"
        ) {

            message =
                "Secure connection is required for browser location.";

        } else if (
            error.message === "INVALID_LOCATION"
        ) {

            message =
                "Invalid GPS coordinates received. Please try again.";

        } else if (
            error.message === "GPS_PERMISSION_ERROR"
        ) {

            message =
                "Unable to access GPS. Please check app permissions.";

        }

        setLocationStatus(
            message,
            "error",
            source
        );

        notify(message, "error");

        console.error(
            "SastaGo Location Error:",
            error
        );

    }


    /* =====================================================
       GET ANDROID GPS
    ===================================================== */

    async function getAndroidGPSPosition() {

        let permission = await Geolocation.checkPermissions();

        if (
            permission.location !== "granted" &&
            permission.coarseLocation !== "granted"
        ) {

            permission = await Geolocation.requestPermissions();

        }

        if (
            permission.location !== "granted" &&
            permission.coarseLocation !== "granted"
        ) {

            const error = new Error(
                "LOCATION_PERMISSION_DENIED"
            );

            error.code = 1;

            throw error;

        }

        return await Geolocation.getCurrentPosition({

            enableHighAccuracy: true,

            timeout: LOCATION_TIMEOUT,

            maximumAge: 0

        });

    }


    /* =====================================================
       GET BROWSER GPS
    ===================================================== */

    async function getBrowserGPSPosition() {

        if (!navigator.geolocation) {

            throw new Error("GPS_NOT_SUPPORTED");

        }

        if (!window.isSecureContext) {

            throw new Error("HTTPS_REQUIRED");

        }

        return await new Promise((resolve, reject) => {

            navigator.geolocation.getCurrentPosition(

                resolve,

                reject,

                {

                    enableHighAccuracy: true,

                    timeout: LOCATION_TIMEOUT,

                    maximumAge: 0

                }

            );

        });

    }


    /* =====================================================
       GET GPS POSITION
    ===================================================== */

    async function getGPSPosition() {

        if (isNativeAndroid()) {

            return await getAndroidGPSPosition();

        }

        return await getBrowserGPSPosition();

    }


    /* =====================================================
       REQUEST LOCATION
    ===================================================== */

    async function requestSastaGoLocation(
        source = "checkout"
    ) {

        if (isRequestingLocation) return;

        isRequestingLocation = true;

        const button = document.getElementById(

            source === "checkout"
                ? "sastagoCheckoutLocationBtn"
                : "sastagoAllowLocation"

        );

        const originalText = button?.textContent || "";

        if (button) {

            button.disabled = true;

            button.textContent = "Getting Location...";

        }

        setLocationStatus(

            "Please wait. Getting your current location...",

            "success",

            source

        );

        try {

            const position = await getGPSPosition();

            saveCustomerLocation(position);

        } catch (error) {

            handleLocationError(error, source);

        } finally {

            isRequestingLocation = false;

            if (button) {

                button.disabled = false;

                button.textContent = originalText;

            }

        }

    }


    /* =====================================================
       LOAD SAVED LOCATION
    ===================================================== */

    function loadSavedLocation() {

        try {

            const saved = JSON.parse(

                localStorage.getItem(
                    SAVED_LOCATION_KEY
                ) || "null"

            );

            if (!saved || !saved.mapLink) return;

            const latitude = Number(saved.latitude);

            const longitude = Number(saved.longitude);

            if (

                !Number.isFinite(latitude) ||

                !Number.isFinite(longitude) ||

                latitude < -90 ||

                latitude > 90 ||

                longitude < -180 ||

                longitude > 180

            ) {

                localStorage.removeItem(
                    SAVED_LOCATION_KEY
                );

                return;

            }

            currentLocation = {

                ...saved,

                latitude,

                longitude

            };

            window.sastagoCustomerLocation =
                currentLocation;

        } catch (error) {

            console.error(
                "Saved Location Error:",
                error
            );

        }

    }


    /* =====================================================
       DYNAMIC CHECKOUT FIELD SUPPORT
    ===================================================== */

    function watchCheckoutField() {

        if (observer) return;

        observer = new MutationObserver(() => {

            createCheckoutLocationButton();

        });

        observer.observe(document.body, {

            childList: true,

            subtree: true

        });

    }


    /* =====================================================
       RESET LOCATION
    ===================================================== */

    function resetCustomerLocation() {

        try {

            localStorage.removeItem(
                SAVED_LOCATION_KEY
            );

            currentLocation = null;

            window.sastagoCustomerLocation = null;

            const mapField = document.getElementById(
                MAP_FIELD_ID
            );

            if (mapField) {

                mapField.value = "";

            }

            const mapLinkElement = document.getElementById(
                "sastagoCheckoutMapLink"
            );

            if (mapLinkElement) {

                mapLinkElement.style.display = "none";

                mapLinkElement.removeAttribute("href");

            }

            setLocationStatus(
                "Location removed. You can add it again.",
                "success"
            );

            notify("Saved location removed.");

        } catch (error) {

            console.error(
                "Reset Location Error:",
                error
            );

        }

    }


    /* =====================================================
       STARTUP
    ===================================================== */

    function initializeSastaGoLocation() {

        addLocationStyles();

        createLocationPopup();

        loadSavedLocation();

        createCheckoutLocationButton();

        watchCheckoutField();

        if (currentLocation) {

            return;

        }

        try {

            if (
                localStorage.getItem(PROMPT_KEY) === "yes"
            ) {

                return;

            }

        } catch (error) {

            console.error(
                "Location prompt check error:",
                error
            );

        }

        openLocationPopup();

    }


    /* =====================================================
       GLOBAL FUNCTIONS
    ===================================================== */

    window.requestSastaGoLocation =
        requestSastaGoLocation;

    window.getSastaGoCustomerLocation = function () {

        return currentLocation;

    };

    window.resetSastaGoCustomerLocation =
        resetCustomerLocation;

    window.resetSastaGoLocationPrompt = function () {

        try {

            localStorage.removeItem(PROMPT_KEY);

            openLocationPopup();

        } catch (error) {

            console.error(
                "Location prompt reset error:",
                error
            );

        }

    };

    window.sastagoCustomerLocation =
        currentLocation;


    /* =====================================================
       RUN
    ===================================================== */

    if (document.readyState === "loading") {

        document.addEventListener(

            "DOMContentLoaded",

            initializeSastaGoLocation,

            { once: true }

        );

    } else {

        initializeSastaGoLocation();

    }

})();