/**
 * Generate PWA icons from the correct Lidify logo
 * 
 * Uses the icon-only.png (smooth black circle with yellow soundwave)
 * instead of the old sharp-edged version with white borders
 */

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// Source: The correct logo (smooth black circle, yellow soundwave, no white borders)
const SOURCE_ICON = path.join(__dirname, "..", "assets", "icon-only.png");
const OUTPUT_DIR = path.join(__dirname, "..", "public", "assets", "icons");

// PWA icon sizes
const SIZES = [48, 72, 96, 128, 192, 256, 512];

async function generatePwaIcons() {
    console.log("Generating PWA icons from icon-only.png...");
    
    // Verify source exists
    if (!fs.existsSync(SOURCE_ICON)) {
        console.error(`Source icon not found: ${SOURCE_ICON}`);
        process.exit(1);
    }

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Get source metadata
    const meta = await sharp(SOURCE_ICON).metadata();
    console.log(`Source icon: ${meta.width}x${meta.height}`);

    for (const size of SIZES) {
        const outputPath = path.join(OUTPUT_DIR, `icon-${size}.webp`);
        
        await sharp(SOURCE_ICON)
            .resize(size, size, {
                fit: "contain",
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .webp({ quality: 90 })
            .toFile(outputPath);
        
        console.log(`✓ Generated icon-${size}.webp`);
    }

    // Also generate a PNG version for favicon (some browsers prefer PNG)
    const faviconPath = path.join(__dirname, "..", "public", "assets", "images", "favicon-192.png");
    await sharp(SOURCE_ICON)
        .resize(192, 192)
        .png()
        .toFile(faviconPath);
    console.log(`✓ Generated favicon-192.png`);

    console.log("\n[SUCCESS] All PWA icons generated!");
}

generatePwaIcons().catch((err) => {
    console.error("Error generating PWA icons:", err);
    process.exit(1);
});

