/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            screens: {
                '3xl': '1920px',  // TV/Large Desktop
                '4xl': '2560px',  // 4K TV/Large TV
            },
        },
    },
    plugins: [],
}
