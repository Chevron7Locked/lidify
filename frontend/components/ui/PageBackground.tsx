/**
 * PageBackground - Reusable yellow-to-purple gradient background for main pages
 * The sidebar keeps its dark textured look, but content pages get this vibrant gradient
 */
export function PageBackground() {
    return (
        <div className="absolute inset-0 pointer-events-none -z-10">
            {/* Main gradient from yellow through purple */}
            <div
                className="absolute inset-0 bg-gradient-to-br from-[#ecb200]/15 via-purple-900/10 to-transparent"
                style={{ height: "120vh" }}
            />
            {/* Radial gradient for depth */}
            <div
                className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#ecb200]/8 via-transparent to-transparent"
                style={{ height: "100vh" }}
            />
            {/* Subtle bottom fade to keep it clean */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent" />
        </div>
    );
}
