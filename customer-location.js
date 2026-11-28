/* =====================================================
   SASTAGO UNIVERSAL GPS LOCATION SYSTEM
   Acode Browser + Android Capacitor APK
   GPS / PERMISSIONS / CHECKOUT / GOOGLE MAPS
===================================================== */

(() => {
    "use strict";

    /* ================= CONFIGURATION ================= */

    const BUTTON_ID = "addMyLocationBtn";
    const ADDRESS_ID = "customerAddress";
    const STATUS_ID = "locationStatus";
    const MAP_FIELD_ID = "mapLink";

    const SAVED_LOCATION_KEY = "sastago_customer_location";
    const PROMPT_KEY = "sastago_location_prompt_seen";

    let currentLocation = null;
    let isRequestingLocation = false;

    let CapacitorAPI = null;
    let GeolocationAPI = null;

    /* ================= PLATFORM DETECTION ================= */

    async function loadCapacitor() {
        try {
            if (window.Capacitor?.isNativePlatform?.()) {
                CapacitorAPI = window.Capacitor;

                if (window.Capacitor.Plugins?.Geolocation) {
                    GeolocationAPI =
                        window.Capacitor.Plugins.Geolocation;
                }
            }
        } catch (error) {
            console.warn("Capacitor detection:", error);
        }

        /*
          Browser mode does not require Capacitor.
          APK mode can use the globally registered plugin.
        */

        return Boolean(GeolocationAPI);
    }

    function isAndroidApp() {
        try {
            return Boolean(
                CapacitorAPI?.isNativePlatform?.() &&
                CapacitorAPI?.getPlatform?.() === "android"
            );
        } catch {
            return false;
        }
    }

    /* ================= NOTIFICATION ================= */

    function notify(message, type = "success") {
        if (typeof window.sastagoShowToast === "function") {
            window.sastagoShowToast(message, type);
        } else if (typeof window.showToast === "function") {
            window.showToast(message, type);
        } else {
            console.log(message);
        }
    }

    /* ================= CSS ================= */

    function addLocationStyles() {
        if (document.getElementById("sastagoLocationStyles")) {
            return;
        }

        const style = document.createElement("style");

        style.id = "sastagoLocationStyles";

        style.textContent = `
            #sastagoLocationPrompt {
                display: none;
                position: fixed;
                inset: 0;
                z-index: 999999;
                background: rgba(0,0,0,.68);
                align-items: center;
                justify-content: center;
                padding: 18px;
            }

            #sastagoLocationPrompt.show {
                display: flex;
            }

            .sastago-location-modal {
                width: 100%;
                max-width: 380px;
                background: #fff;
                border-radius: 22px;
                padding: 25px 20px;
                text-align: center;
                box-shadow: 0 15px 45px rgba(0,0,0,.25);
            }

            .sastago-location-icon {
                width: 78px;
                height: 78px;
                margin: 0 auto 15px;
                border-radius: 50%;
                background: #e5f8ed;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 40px;
            }

            .sastago-location-modal h2 {
                color: #087b43;
                margin: 10px 0;
                font-size: 23px;
            }

            .sastago-location-modal p {
                color: #666;
                font-size: 14px;
                line-height: 1.6;
                margin: 12px 0 20px;
            }

            .sastago-location-btn {
                display: block;
                width: 100%;
                padding: 14px;
                margin-top: 10px;
                border: none;
                border-radius: 12px;
                font-size: 15px;
                font-weight: bold;
                cursor: pointer;
            }

            #sastagoAllowLocation {
                background: linear-gradient(120deg,#087b43,#18b96b);
                color: white;
            }

            #sastagoSkipLocation {
                background: #f1f3f2;
                color: #555;
            }

            .sastago-location-btn:disabled {
                opacity: .6;
            }

            #sastagoStartupStatus,
            #locationStatus {
                display: block;
                margin: 10px 0;
                font-size: 12px;
                line-height: 1.5;
            }
        `;

        document.head.appendChild(style);
    }

    /* ================= POPUP ================= */

    function createLocationPopup() {
        if (document.getElementById("sastagoLocationPrompt")) {
            return;
        }

        const modal = document.createElement("div");

        modal.id = "sastagoLocationPrompt";

        modal.innerHTML = `
            <div class="sastago-location-modal">

                <div class="sastago-location-icon">📍</div>

                <h2>Enable Your Location</h2>

                <p>
                    Welcome to SastaGo! Allow location access
                    to make your delivery easier.
                    Your location will only be used when requested.
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

                <span id="sastagoStartupStatus"></span>

            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById("sastagoAllowLocation")
            .addEventListener("click", () => {
                requestSastaGoLocation("startup");
            });

        document.getElementById("sastagoSkipLocation")
            .addEventListener("click", closeLocationPopup);
    }

    function openLocationPopup() {
        document.getElementById("sastagoLocationPrompt")
            ?.classList.add("show");
    }

    function closeLocationPopup() {
        document.getElementById("sastagoLocationPrompt")
            ?.classList.remove("show");

        try {
            localStorage.setItem(PROMPT_KEY, "yes");
        } catch (error) {
            console.warn(error);
        }
    }

    /* ================= STATUS ================= */

    function setStatus(message, type = "success", source = "checkout") {
        const ids = source === "startup"
            ? ["sastagoStartupStatus", STATUS_ID]
            : [STATUS_ID];

        ids.forEach(id => {
            const element = document.getElementById(id);

            if (!element) return;

            element.textContent = message;

            element.style.color =
                type === "error" ? "#d32f2f" : "#087b43";
        });
    }

    /* ================= GPS POSITION ================= */

    async function getGPSPosition() {

        /* ANDROID CAPACITOR GPS */

        if (isAndroidApp() && GeolocationAPI) {

            let permission =
                await GeolocationAPI.checkPermissions();

            if (
                permission.location !== "granted" &&
                permission.coarseLocation !== "granted"
            ) {
                permission =
                    await GeolocationAPI.requestPermissions();
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

            return await GeolocationAPI.getCurrentPosition({
                enableHighAccuracy: true,
                timeout: 30000,
                maximumAge: 0
            });
        }

        /* BROWSER GPS */

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
                    timeout: 30000,
                    maximumAge: 0
                }
            );

        });
    }

    /* ================= VALIDATE COORDINATES ================= */

    function validateCoordinates(latitude, longitude) {
        return (
            Number.isFinite(latitude) &&
            Number.isFinite(longitude) &&
            latitude >= -90 &&
            latitude <= 90 &&
            longitude >= -180 &&
            longitude <= 180
        );
    }

    /* ================= SAVE LOCATION ================= */

    function saveCustomerLocation(position) {

        const latitude = Number(position.coords.latitude);
        const longitude = Number(position.coords.longitude);
        const accuracy = Number(position.coords.accuracy || 0);

        if (!validateCoordinates(latitude, longitude)) {
            throw new Error("INVALID_LOCATION_COORDINATES");
        }

        const mapLink =
            `https://www.google.com/maps?q=${latitude},${longitude}`;

        currentLocation = {
            latitude,
            longitude,
            accuracy,
            mapLink,
            capturedAt: new Date().toISOString()
        };

        try {
            localStorage.setItem(
                SAVED_LOCATION_KEY,
                JSON.stringify(currentLocation)
            );
        } catch (error) {
            console.warn("Location storage error:", error);
        }

        const mapField =
            document.getElementById(MAP_FIELD_ID);

        if (mapField) {
            mapField.value = mapLink;

            mapField.dispatchEvent(
                new Event("input", { bubbles: true })
            );

            mapField.dispatchEvent(
                new Event("change", { bubbles: true })
            );
        }

        window.sastagoCustomerLocation = currentLocation;

        setStatus(
            "Location added successfully! Google Maps link is ready.",
            "success",
            "checkout"
        );

        setStatus(
            "Your location is connected successfully!",
            "success",
            "startup"
        );

        closeLocationPopup();

        notify("Your current location has been added!");

        console.log("SastaGo GPS:", currentLocation);

        return currentLocation;
    }

    /* ================= ERROR HANDLING ================= */

    function handleLocationError(error, source) {

        let message =
            "Unable to get your location. Please try again.";

        if (
            error.message === "LOCATION_PERMISSION_DENIED" ||
            error.code === 1
        ) {
            message =
                "Location permission denied. Please enable location access in your phone settings.";
        } else if (
            error.message === "GPS_NOT_SUPPORTED" ||
            error.code === 2
        ) {
            message =
                "GPS is unavailable. Please turn on your phone location.";
        } else if (error.code === 3) {
            message =
                "Location request timed out. Please try again.";
        } else if (error.message === "HTTPS_REQUIRED") {
            message =
                "Location requires HTTPS or the Android app.";
        } else if (
            error.message === "INVALID_LOCATION_COORDINATES"
        ) {
            message =
                "Invalid GPS coordinates received. Please try again.";
        }

        setStatus(message, "error", source);

        notify(message, "error");

        console.error("SastaGo GPS Error:", error);
    }

    /* ================= REQUEST LOCATION ================= */

    async function requestSastaGoLocation(source = "checkout") {

        if (isRequestingLocation) return;

        isRequestingLocation = true;

        const button = document.getElementById(
            source === "startup"
                ? "sastagoAllowLocation"
                : BUTTON_ID
        );

        const originalText = button?.textContent;

        if (button) {
            button.disabled = true;
            button.textContent = "Getting Location...";
        }

        setStatus(
            "Please wait. Getting your current GPS location...",
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

    /* ================= LOAD SAVED LOCATION ================= */

    function loadSavedLocation() {

        try {
            const saved = JSON.parse(
                localStorage.getItem(SAVED_LOCATION_KEY) || "null"
            );

            if (
                !saved ||
                !saved.mapLink ||
                !validateCoordinates(
                    Number(saved.latitude),
                    Number(saved.longitude)
                )
            ) {
                return;
            }

            currentLocation = saved;

            window.sastagoCustomerLocation = saved;

            const mapField =
                document.getElementById(MAP_FIELD_ID);

            if (mapField && !mapField.value) {
                mapField.value = saved.mapLink;
            }

        } catch (error) {
            console.error("Saved GPS Location Error:", error);
        }
    }

    /* ================= INITIALIZE ================= */

    async function initializeSastaGoLocation() {

        addLocationStyles();

        createLocationPopup();

        await loadCapacitor();

        loadSavedLocation();

        document.addEventListener("click", event => {

            const button = event.target.closest(`#${BUTTON_ID}`);

            if (!button) return;

            event.preventDefault();

            requestSastaGoLocation("checkout");
        });

        let promptSeen = false;

        try {
            promptSeen =
                localStorage.getItem(PROMPT_KEY) === "yes";
        } catch (error) {
            console.warn(error);
        }

        if (!promptSeen) {
            openLocationPopup();
        }

        console.log("SastaGo Location System Initialized.", {
            android: isAndroidApp(),
            browserGPS: Boolean(navigator.geolocation)
        });
    }

    /* ================= GLOBAL FUNCTIONS ================= */

    window.requestSastaGoLocation = requestSastaGoLocation;

    window.getSastaGoCustomerLocation = function () {
        return currentLocation;
    };

    window.resetSastaGoLocationPrompt = function () {
        try {
            localStorage.removeItem(PROMPT_KEY);
            return true;
        } catch (error) {
            console.warn(error);
            return false;
        }
    };

    /* ================= START ================= */

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