import { ButtonHTMLAttributes, forwardRef, memo } from "react";
import { cn } from "@/utils/cn";
import { GradientSpinner } from "./GradientSpinner";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "ghost" | "danger" | "ai" | "icon";
    isLoading?: boolean;
}

const Button = memo(forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className,
            variant = "secondary",
            isLoading,
            children,
            disabled,
            ...props
        },
        ref
    ) => {
        const baseStyles =
            "inline-flex items-center justify-center rounded-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] disabled:opacity-50 disabled:cursor-not-allowed";

        // Lidify brand yellow: #ecb200
        const variantStyles = {
            primary:
                "bg-[#ecb200] hover:bg-[#ffc520] text-black px-4 py-2 shadow-lg shadow-[#ecb200]/10",
            secondary:
                "bg-[#1a1a1a] hover:bg-[#222] text-white px-4 py-2 border border-[#262626]",
            ghost: "text-gray-400 hover:text-white hover:bg-[#1a1a1a] px-4 py-2",
            danger: "text-red-500 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/40 px-4 py-2",
            ai: "bg-[#1a1a1a] hover:bg-yellow-500/10 text-yellow-500 border border-[#1c1c1c] hover:border-yellow-500/30 px-4 py-2",
            icon: "w-8 h-8 text-gray-400 hover:text-white hover:bg-[#1a1a1a]",
        };

        return (
            <button
                ref={ref}
                className={cn(baseStyles, variantStyles[variant], className)}
                disabled={disabled || isLoading}
                {...props}
            >
                {isLoading ? (
                    <>
                        <GradientSpinner size="sm" className="mr-2" />
                        {children}
                    </>
                ) : (
                    children
                )}
            </button>
        );
    }
));

Button.displayName = "Button";

export { Button };
