import { Tab } from "../types";
import { cn } from "@/utils/cn";

interface LibraryTabsProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function LibraryTabs({ activeTab, onTabChange }: LibraryTabsProps) {
  return (
    <div data-tv-section="library-tabs" className="flex gap-2 mb-8">
      <button
        data-tv-card
        data-tv-card-index={0}
        tabIndex={0}
        onClick={() => onTabChange("artists")}
        className={cn(
          "px-4 py-2 text-sm font-bold rounded-full transition-all",
          activeTab === "artists"
            ? "bg-white text-black"
            : "bg-[#232323] text-white hover:bg-[#2a2a2a]"
        )}
      >
        Artists
      </button>
      <button
        data-tv-card
        data-tv-card-index={1}
        tabIndex={0}
        onClick={() => onTabChange("albums")}
        className={cn(
          "px-4 py-2 text-sm font-bold rounded-full transition-all",
          activeTab === "albums"
            ? "bg-white text-black"
            : "bg-[#232323] text-white hover:bg-[#2a2a2a]"
        )}
      >
        Albums
      </button>
      <button
        data-tv-card
        data-tv-card-index={2}
        tabIndex={0}
        onClick={() => onTabChange("tracks")}
        className={cn(
          "px-4 py-2 text-sm font-bold rounded-full transition-all",
          activeTab === "tracks"
            ? "bg-white text-black"
            : "bg-[#232323] text-white hover:bg-[#2a2a2a]"
        )}
      >
        Tracks
      </button>
    </div>
  );
}
