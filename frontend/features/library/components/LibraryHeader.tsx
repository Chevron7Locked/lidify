export function LibraryHeader() {
  return (
    <div className="relative">
      {/* Extended gradient background */}
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

      {/* Title */}
      <div className="relative max-w-7xl mx-auto px-6 md:px-8 py-6">
        <h1 className="text-3xl md:text-4xl font-black text-white">
          Your Library
        </h1>
      </div>
    </div>
  );
}
