import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { memo } from "react";

interface SectionHeaderProps {
    title: string;
    showAllHref?: string;
    rightAction?: React.ReactNode;
    badge?: string;
}

const SectionHeader = memo(function SectionHeader({
    title,
    showAllHref,
    rightAction,
    badge,
}: SectionHeaderProps) {
    return (
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-white">{title}</h2>
                {badge && <Badge variant="ai">{badge}</Badge>}
            </div>
            {rightAction ? (
                rightAction
            ) : showAllHref ? (
                <Link
                    href={showAllHref}
                    className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors font-semibold group"
                >
                    Show all
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
            ) : null}
        </div>
    );
});

export { SectionHeader };
