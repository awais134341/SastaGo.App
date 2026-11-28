/* =====================================================
SASTAGO ANDROID BILL TOOLS
ANDROID GALLERY SAVE / SHARE / 58MM PRINT
BROWSER FALLBACK INCLUDED
===================================================== */

import { Capacitor } from "@capacitor/core";
import { FileSharer } from "@capgo/capacitor-file-sharer";
import { Printer } from "@capgo/capacitor-printer";

/* =====================================================
PLATFORM
===================================================== */

function isAndroidApp() {
return (
Capacitor.isNativePlatform() &&
Capacitor.getPlatform() === "android"
);
}

function notify(message, type = "success") {
if (typeof window.sastagoShowToast === "function") {
window.sastagoShowToast(message, type);
} else {
alert(message);
}
}

/* =====================================================
FIND ORDER
===================================================== */

function findOrder(orderId) {
const orders = Array.isArray(window.sastagoCustomerOrders)
? window.sastagoCustomerOrders
: [];

return orders.find(order =>
    String(order.id) === String(orderId) ||
    String(order.orderNumber) === String(orderId)
);

}

/* =====================================================
BILL CANVAS
===================================================== */

function createCanvas(order) {
if (typeof window.sastagoCreateBillCanvas !== "function") {
throw new Error("Bill generator is not connected.");
}

const canvas = window.sastagoCreateBillCanvas(order);

if (!canvas || typeof canvas.toDataURL !== "function") {
    throw new Error("Bill image could not be generated.");
}

return canvas;

}

/* =====================================================
FILE NAME
===================================================== */

function getFileName(order) {
const number = String(order.orderNumber || order.id || Date.now())
.replace(/[^a-zA-Z0-9-]/g, "");

return `SastaGo-${number}.png`;

}

/* =====================================================
CANVAS TO PNG BASE64
===================================================== */

function getPngBase64(canvas) {
if (
!canvas ||
!canvas.width ||
!canvas.height ||
typeof canvas.toDataURL !== "function"
) {
throw new Error("Bill image is empty.");
}

let dataUrl;

try {
    dataUrl = canvas.toDataURL("image/png");
} catch (error) {
    throw new Error(
        "Bill PNG could not be generated. Check the bill images and try again."
    );
}

const comma = dataUrl.indexOf(",");

if (
    comma < 0 ||
    !dataUrl.slice(0, comma)
        .toLowerCase()
        .startsWith("data:image/png;base64")
) {
    throw new Error("Invalid PNG image data.");
}

let base64 = dataUrl
    .slice(comma + 1)
    .replace(/\s/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

if (!base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error("PNG image contains invalid Base64 data.");
}

while (base64.length % 4 !== 0) {
    base64 += "=";
}

let decoded;

try {
    decoded = atob(base64);
} catch (error) {
    throw new Error("PNG image could not be decoded.");
}

// PNG signature validation
if (
    decoded.length < 8 ||
    decoded.charCodeAt(0) !== 0x89 ||
    decoded.charCodeAt(1) !== 0x50 ||
    decoded.charCodeAt(2) !== 0x4E ||
    decoded.charCodeAt(3) !== 0x47
) {
    throw new Error("Generated file is not a valid PNG.");
}

return base64;

}

/* =====================================================
GENERATE BILL DATA
===================================================== */

function getBillData(orderId) {
const order = findOrder(orderId);

if (!order) {
    throw new Error("Order not found.");
}

const canvas = createCanvas(order);

return {
    order,
    canvas,
    filename: getFileName(order),
    base64Data: getPngBase64(canvas)
};

}

/* =====================================================
DOWNLOAD BILL PNG
===================================================== */

async function downloadOrderPNG(orderId) {
try {
const { filename, base64Data } = getBillData(orderId);

    if (isAndroidApp()) {
        const result = await FileSharer.save({
            filename,
            contentType: "image/png",
            base64Data,
            android: {
                saveDirectory: "pictures",
                relativePath: "SastaGo Bills"
            }
        });

        console.log("SastaGo bill saved:", result?.uri);

        notify(
            "Bill Gallery ke Pictures/SastaGo Bills folder mein save ho gaya!"
        );

    } else {
        const link = document.createElement("a");

        link.href = `data:image/png;base64,${base64Data}`;
        link.download = filename;

        document.body.appendChild(link);
        link.click();
        link.remove();

        notify("Bill PNG download ho gaya.");
    }

} catch (error) {
    console.error("Bill Download Error:", error);

    notify(
        error.message || "Bill download failed.",
        "error"
    );
}

}

/* =====================================================
SHARE BILL PNG
===================================================== */

async function shareOrderPNG(orderId) {
try {
const { filename, base64Data } = getBillData(orderId);

    if (isAndroidApp()) {
        await FileSharer.share({
            filename,
            contentType: "image/png",
            base64Data,
            title: "SastaGo Order Bill",
            text: "SastaGo Order Bill"
        });

    } else {
        const response = await fetch(
            `data:image/png;base64,${base64Data}`
        );

        const blob = await response.blob();

        const file = new File(
            [blob],
            filename,
            { type: "image/png" }
        );

        if (
            navigator.share &&
            (
                !navigator.canShare ||
                navigator.canShare({ files: [file] })
            )
        ) {
            await navigator.share({
                title: "SastaGo Order Bill",
                files: [file]
            });

        } else {
            const link = document.createElement("a");

            link.href = URL.createObjectURL(blob);
            link.download = filename;

            document.body.appendChild(link);
            link.click();
            link.remove();

            setTimeout(() => {
                URL.revokeObjectURL(link.href);
            }, 1000);

            notify("Bill download ho gaya. Ab aap share kar sakte hain.");
        }
    }

} catch (error) {
    if (
        error.name === "AbortError" ||
        error.message === "USER_CANCELLED"
    ) {
        return;
    }

    console.error("Bill Share Error:", error);

    notify(
        error.message || "Bill share failed.",
        "error"
    );
}

}

/* =====================================================
PRINT 58MM BILL
===================================================== */

async function printOrderPNG(orderId) {
try {
const { filename, base64Data } = getBillData(orderId);

    if (isAndroidApp()) {
        await Printer.printBase64({
            name: filename,
            data: base64Data,
            mimeType: "image/png"
        });

    } else {
        const printWindow = window.open("", "_blank");

        if (!printWindow) {
            throw new Error(
                "Print popup blocked. Please allow popups."
            );
        }

        printWindow.document.open();

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>SastaGo Bill</title>

                <style>
                    @page {
                        size: 58mm auto;
                        margin: 0;
                    }

                    html, body {
                        margin: 0;
                        padding: 0;
                        width: 58mm;
                        background: #ffffff;
                    }

                    img {
                        display: block;
                        width: 58mm;
                        height: auto;
                        margin: 0;
                        padding: 0;
                    }
                </style>
            </head>

            <body>
                <img
                    id="billImage"
                    src="data:image/png;base64,${base64Data}"
                >

                <script>
                    const image = document.getElementById("billImage");

                    image.onload = function () {
                        setTimeout(() => {
                            window.print();
                        }, 300);
                    };

                    image.onerror = function () {
                        alert("Bill image could not be loaded.");
                    };
                <\/script>
            </body>
            </html>
        `);

        printWindow.document.close();
    }

} catch (error) {
    console.error("Bill Print Error:", error);

    notify(
        error.message || "Bill printing failed.",
        "error"
    );
}

}

/* =====================================================
GLOBAL FUNCTIONS
===================================================== */

window.downloadOrderPNG = downloadOrderPNG;
window.shareOrderPNG = shareOrderPNG;
window.printOrderPNG = printOrderPNG;

window.SastaGoCustomerBillTools = {
downloadOrderPNG,
shareOrderPNG,
printOrderPNG,
isAndroidApp
};

console.log("SastaGo Bill Tools Initialized.", {
android: isAndroidApp(),
platform: Capacitor.getPlatform()
});