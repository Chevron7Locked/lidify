const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const ASSETS_DIR = path.join(__dirname, "..", "assets");
const ANDROID_RES_DIR = path.join(__dirname, "..", "android", "app", "src", "main", "res");

// Circular logo for app icon (black circle with yellow soundwave)
const SOURCE_ICON = path.join(
    __dirname,
    "..",
    "public",
    "assets",
    "images",
    "lidify_circular.webp"
);
// Simple yellow soundwave for splash screen (transparent, high quality)
const SOURCE_SPLASH_LOGO = path.join(
    __dirname,
    "..",
    "public",
    "assets",
    "images",
    "LIDIFY.webp"
);
// Simple yellow soundwave for notification icon
const SOURCE_SIMPLE_LOGO = path.join(
    __dirname,
    "..",
    "public",
    "assets",
    "images",
    "LIDIFY.webp"
);

async function generateAssets() {
    console.log("Generating Capacitor assets...");

    // Ensure assets directory exists
    if (!fs.existsSync(ASSETS_DIR)) {
        fs.mkdirSync(ASSETS_DIR, { recursive: true });
    }

    // Check source image dimensions
    const iconMeta = await sharp(SOURCE_ICON).metadata();
    const splashMeta = await sharp(SOURCE_SPLASH_LOGO).metadata();
    console.log(`Source icon size: ${iconMeta.width}x${iconMeta.height}`);
    console.log(`Source splash logo size: ${splashMeta.width}x${splashMeta.height}`);

    // 1. Convert webp icon to PNG (1024x1024 for best quality)
    console.log("Creating icon.png...");
    await sharp(SOURCE_ICON)
        .resize(1024, 1024, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(path.join(ASSETS_DIR, "icon.png"));
    console.log("✓ icon.png created");

    // 2. Create icon-only.png (transparent background version)
    console.log("Creating icon-only.png...");
    await sharp(SOURCE_ICON)
        .resize(1024, 1024, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(path.join(ASSETS_DIR, "icon-only.png"));
    console.log("✓ icon-only.png created");

    // 3. Create icon-foreground.png for adaptive icons
    console.log("Creating icon-foreground.png...");
    await sharp(SOURCE_ICON)
        .resize(1024, 1024, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(path.join(ASSETS_DIR, "icon-foreground.png"));
    console.log("✓ icon-foreground.png created");

    // 4. Create icon-background.png (solid black)
    console.log("Creating icon-background.png...");
    await sharp({
        create: {
            width: 1024,
            height: 1024,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
        },
    })
        .png()
        .toFile(path.join(ASSETS_DIR, "icon-background.png"));
    console.log("✓ icon-background.png created");

    // 5. Create splash.png (2732x2732, black background with centered logo)
    // Keep the logo at its original size or slightly smaller to maintain sharpness
    console.log("Creating splash.png...");
    const splashSize = 2732;
    
    // Use the splash logo at its native resolution for sharpness
    // Source is 621x621 - keep it crisp rather than scaling up
    const logoSize = Math.min(splashMeta.width, 600);

    // Use the full logo (LIDIFY-2.webp) which has the honeycomb design
    const resizedLogo = await sharp(SOURCE_SPLASH_LOGO)
        .resize(logoSize, logoSize, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .sharpen() // Sharpen to maintain crispness
        .png()
        .toBuffer();

    // Create black background and composite logo in center
    await sharp({
        create: {
            width: splashSize,
            height: splashSize,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 255 },
        },
    })
        .composite([
            {
                input: resizedLogo,
                top: Math.floor((splashSize - logoSize) / 2),
                left: Math.floor((splashSize - logoSize) / 2),
            },
        ])
        .png()
        .toFile(path.join(ASSETS_DIR, "splash.png"));
    console.log("✓ splash.png created");

    // 6. Create splash-dark.png (same as splash for dark mode)
    console.log("Creating splash-dark.png...");
    await sharp({
        create: {
            width: splashSize,
            height: splashSize,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 255 },
        },
    })
        .composite([
            {
                input: resizedLogo,
                top: Math.floor((splashSize - logoSize) / 2),
                left: Math.floor((splashSize - logoSize) / 2),
            },
        ])
        .png()
        .toFile(path.join(ASSETS_DIR, "splash-dark.png"));
    console.log("✓ splash-dark.png created");

    // 7. Create notification icon (ic_stat_icon) for media controls
    // This should be a simple white/transparent icon for notification bar
    console.log("\nCreating notification icons...");
    
    // Create drawable directories if they don't exist
    const drawableDirs = [
        "drawable-hdpi",
        "drawable-mdpi", 
        "drawable-xhdpi",
        "drawable-xxhdpi",
        "drawable-xxxhdpi"
    ];
    
    const iconSizes = {
        "drawable-mdpi": 24,
        "drawable-hdpi": 36,
        "drawable-xhdpi": 48,
        "drawable-xxhdpi": 72,
        "drawable-xxxhdpi": 96
    };

    for (const dir of drawableDirs) {
        const dirPath = path.join(ANDROID_RES_DIR, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        
        const size = iconSizes[dir];
        
        // Create notification icon (white silhouette for notification bar)
        // Use the simple logo and make it white/monochrome
        await sharp(SOURCE_SIMPLE_LOGO)
            .resize(size, size, {
                fit: "contain",
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .png()
            .toFile(path.join(dirPath, "ic_stat_icon.png"));
        
        console.log(`✓ ${dir}/ic_stat_icon.png created (${size}x${size})`);
    }

    // 8. Create Android TV banner (320x180 dp = 320x180 at mdpi)
    // This is shown on the Android TV home screen
    console.log("\nCreating Android TV banner...");
    
    const tvBannerSizes = {
        "drawable-mdpi": { width: 320, height: 180 },
        "drawable-hdpi": { width: 480, height: 270 },
        "drawable-xhdpi": { width: 640, height: 360 },
        "drawable-xxhdpi": { width: 960, height: 540 },
        "drawable-xxxhdpi": { width: 1280, height: 720 }
    };

    for (const [dir, size] of Object.entries(tvBannerSizes)) {
        const dirPath = path.join(ANDROID_RES_DIR, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        
        // Calculate logo size for banner (about 40% of height)
        const bannerLogoSize = Math.floor(size.height * 0.4);
        
        // Resize logo for banner
        const bannerLogo = await sharp(SOURCE_ICON)
            .resize(bannerLogoSize, bannerLogoSize, {
                fit: "contain",
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .png()
            .toBuffer();
        
        // Create black background with centered logo
        await sharp({
            create: {
                width: size.width,
                height: size.height,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 255 },
            },
        })
            .composite([
                {
                    input: bannerLogo,
                    top: Math.floor((size.height - bannerLogoSize) / 2),
                    left: Math.floor((size.width - bannerLogoSize) / 2),
                },
            ])
            .png()
            .toFile(path.join(dirPath, "ic_banner.png"));
        
        console.log(`✓ ${dir}/ic_banner.png created (${size.width}x${size.height})`);
    }

    console.log("\n[SUCCESS] All assets generated successfully!");
    console.log("Now run: npx @capacitor/assets generate --android");
}

generateAssets().catch((err) => {
    console.error("Error generating assets:", err);
    process.exit(1);
});
