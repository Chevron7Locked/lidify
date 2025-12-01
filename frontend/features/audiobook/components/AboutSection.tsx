"use client";

import { Card } from "@/components/ui/Card";

interface AboutSectionProps {
    description: string;
}

export function AboutSection({ description }: AboutSectionProps) {
    // Skip if description is just narrator info
    if (description.match(/^(Read by|Narrated by):/i)) {
        return null;
    }

    return (
        <section>
            <h2 className="text-2xl md:text-3xl font-bold mb-6">About</h2>
            <Card className="p-6">
                <div
                    className="text-gray-300 text-sm leading-relaxed prose prose-invert prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: description }}
                />
            </Card>
        </section>
    );
}


