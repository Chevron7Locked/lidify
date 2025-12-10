"use client";

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
};

export function HomeHero() {
    return (
        <div className="relative">
            {/* Extended gradient background that fades from hero into content */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute inset-0 bg-gradient-to-b from-[#ecb200]/20 via-purple-900/15 to-transparent"
                    style={{ height: "120vh" }}
                />
                <div
                    className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#ecb200]/10 via-transparent to-transparent"
                    style={{ height: "100vh" }}
                />
            </div>

            {/* Hero Section */}
            <div className="relative">
                <div className="relative max-w-[1800px] mx-auto px-6 py-6">
                    <div className="space-y-3">
                        <h1 className="text-3xl md:text-4xl font-black text-white">
                            {getGreeting()}
                        </h1>
                    </div>
                </div>
            </div>
        </div>
    );
}
