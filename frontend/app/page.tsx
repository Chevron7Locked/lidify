"use client";

import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { RefreshCw } from "lucide-react";
import { GradientSpinner } from "@/components/ui/GradientSpinner";
import { Badge } from "@/components/ui/Badge";
import { useHomeData } from "@/features/home/hooks/useHomeData";
import { HomeHero } from "@/features/home/components/HomeHero";
import { SectionHeader } from "@/features/home/components/SectionHeader";
import { ContinueListening } from "@/features/home/components/ContinueListening";
import { ArtistsGrid } from "@/features/home/components/ArtistsGrid";
import { MixesGrid } from "@/features/home/components/MixesGrid";
import { PopularArtistsGrid } from "@/features/home/components/PopularArtistsGrid";
import { PodcastsGrid } from "@/features/home/components/PodcastsGrid";
import { AudiobooksGrid } from "@/features/home/components/AudiobooksGrid";

export default function HomePage() {
    const {
        recentlyListened,
        recentlyAdded,
        recommended,
        mixes,
        popularArtists,
        recentPodcasts,
        recentAudiobooks,
        isLoading,
        isRefreshingMixes,
        handleRefreshMixes,
    } = useHomeData();

    if (isLoading) {
        return <LoadingScreen />;
    }

    return (
        <div className="relative">
            <HomeHero />

            <div className="relative max-w-[1800px] mx-auto px-6 pb-8">
                <div className="space-y-12">
                    {/* Continue Listening - #1 Priority */}
                    {recentlyListened.length > 0 && (
                        <section>
                            <SectionHeader title="Continue Listening" showAllHref="/library?tab=artists" />
                            <ContinueListening items={recentlyListened} />
                        </section>
                    )}

                    {/* Recently Added - #2 Priority */}
                    {recentlyAdded.length > 0 && (
                        <section>
                            <SectionHeader title="Recently Added" showAllHref="/library?tab=artists" />
                            <ArtistsGrid artists={recentlyAdded} />
                        </section>
                    )}

                    {/* Made For You - #3 Priority */}
                    {mixes.length > 0 && (
                        <section>
                            <SectionHeader
                                title="Made For You"
                                rightAction={
                                    <button
                                        onClick={handleRefreshMixes}
                                        disabled={isRefreshingMixes}
                                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors font-semibold group bg-white/5 hover:bg-white/10 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isRefreshingMixes ? (
                                            <GradientSpinner size="sm" />
                                        ) : (
                                            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                                        )}
                                        <span className="hidden sm:inline">
                                            {isRefreshingMixes ? "Refreshing..." : "Refresh"}
                                        </span>
                                    </button>
                                }
                            />
                            <MixesGrid mixes={mixes} />
                        </section>
                    )}

                    {/* Recommended For You - #4 Priority */}
                    {recommended.length > 0 && (
                        <section>
                            <SectionHeader title="Recommended For You" showAllHref="/discover" badge="Last.FM" />
                            <ArtistsGrid artists={recommended} />
                        </section>
                    )}

                    {/* Popular Artists - #5 Priority */}
                    {popularArtists.length > 0 && (
                        <section>
                            <SectionHeader title="Popular Artists" badge="Last.FM" />
                            <PopularArtistsGrid artists={popularArtists} />
                        </section>
                    )}

                    {/* Popular Podcasts - #6 Priority */}
                    {recentPodcasts.length > 0 && (
                        <section>
                            <SectionHeader title="Popular Podcasts" showAllHref="/podcasts" />
                            <PodcastsGrid podcasts={recentPodcasts} />
                        </section>
                    )}

                    {/* Audiobooks - #7 Priority */}
                    {recentAudiobooks.length > 0 && (
                        <section>
                            <SectionHeader title="Audiobooks" showAllHref="/audiobooks" />
                            <AudiobooksGrid audiobooks={recentAudiobooks} />
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}
