"use client";

import { MixCard } from "@/components/MixCard";
import { Mix } from "../types";
import { memo } from "react";

interface MixesGridProps {
    mixes: Mix[];
}

const MixesGrid = memo(function MixesGrid({ mixes }: MixesGridProps) {
    return (
        <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-5 3xl:grid-cols-5 gap-4"
            data-tv-section="mixes"
        >
            {mixes.slice(0, 10).map((mix, index) => (
                <MixCard key={mix.id} mix={mix} index={index} />
            ))}
        </div>
    );
});

export { MixesGrid };
