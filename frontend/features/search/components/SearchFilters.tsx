import { Download } from "lucide-react";
import { cn } from "@/utils/cn";
import { FilterTab } from "../types";

interface SearchFiltersProps {
    filterTab: FilterTab;
    onFilterChange: (tab: FilterTab) => void;
    soulseekEnabled: boolean;
    hasSearched: boolean;
}

export function SearchFilters({
    filterTab,
    onFilterChange,
    soulseekEnabled,
    hasSearched,
}: SearchFiltersProps) {
    if (!hasSearched) {
        return null;
    }

    return (
        <div className="flex gap-2 mb-8" data-tv-section="search-filters">
            <button
                data-tv-card
                data-tv-card-index={0}
                tabIndex={0}
                onClick={() => onFilterChange("all")}
                className={cn(
                    "px-4 py-2 text-sm font-bold rounded-full transition-all",
                    filterTab === "all" ? "bg-white text-black" : "bg-[#232323] text-white hover:bg-[#2a2a2a]"
                )}
            >
                All
            </button>
            <button
                data-tv-card
                data-tv-card-index={1}
                tabIndex={0}
                onClick={() => onFilterChange("library")}
                className={cn(
                    "px-4 py-2 text-sm font-bold rounded-full transition-all",
                    filterTab === "library" ? "bg-white text-black" : "bg-[#232323] text-white hover:bg-[#2a2a2a]"
                )}
            >
                My Library
            </button>
            <button
                data-tv-card
                data-tv-card-index={2}
                tabIndex={0}
                onClick={() => onFilterChange("discover")}
                className={cn(
                    "px-4 py-2 text-sm font-bold rounded-full transition-all",
                    filterTab === "discover" ? "bg-white text-black" : "bg-[#232323] text-white hover:bg-[#2a2a2a]"
                )}
            >
                Discover
            </button>
            {soulseekEnabled && (
                <button
                    data-tv-card
                    data-tv-card-index={3}
                    tabIndex={0}
                    onClick={() => onFilterChange("soulseek")}
                    className={cn(
                        "px-4 py-2 text-sm font-bold rounded-full transition-all flex items-center gap-2",
                        filterTab === "soulseek" ? "bg-[#ecb200] text-black" : "bg-[#232323] text-white hover:bg-[#2a2a2a]"
                    )}
                >
                    <Download className="w-4 h-4" />
                    Soulseek
                </button>
            )}
        </div>
    );
}
