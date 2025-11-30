import { HTMLAttributes, forwardRef, memo } from "react";
import { cn } from "@/utils/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
    variant?: "default" | "ai" | "metric";
    hover?: boolean;
}

const Card = memo(forwardRef<HTMLDivElement, CardProps>(
    (
        { className, variant = "default", hover = true, children, ...props },
        ref
    ) => {
        const baseStyles = "rounded-sm p-4 transition-all duration-300";

        const variantStyles = {
            default: cn(
                "bg-gradient-to-br from-[#121212] to-[#0f0f0f] border border-[#1c1c1c] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]",
                hover &&
                    "hover:border-purple-500/30 hover:shadow-[0_10px_30px_-10px_rgba(147,51,234,0.08)]"
            ),
            ai: cn(
                "bg-gradient-to-br from-[#121212] to-[#0f0f0f] border border-[#1c1c1c] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]",
                hover &&
                    "hover:border-yellow-500/30 hover:shadow-[0_10px_30px_-10px_rgba(147,51,234,0.08)]"
            ),
            metric: "bg-[#0f0f0f] border border-[#1c1c1c]",
        };

        return (
            <div
                ref={ref}
                className={cn(baseStyles, variantStyles[variant], className)}
                {...props}
            >
                {children}
            </div>
        );
    }
));

Card.displayName = "Card";

export { Card };
