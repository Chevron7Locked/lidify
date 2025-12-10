import { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    rightIcon?: ReactNode;
}

export function Input({
    label,
    error,
    rightIcon,
    className,
    ...props
}: InputProps) {
    return (
        <div className="w-full">
            {label && (
                <label className="block text-sm font-medium mb-2 text-white">
                    {label}
                </label>
            )}
            <div className="relative">
                <input
                    className={cn(
                        "w-full bg-[#1a1a1a] border border-[#1c1c1c] rounded-md px-4 py-2 text-white",
                        "placeholder:text-gray-500",
                        "focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500",
                        "transition-all duration-200",
                        error &&
                            "border-red-500/50 focus:ring-red-500/50 focus:border-red-500",
                        rightIcon && "pr-12",
                        className
                    )}
                    {...props}
                />
                {rightIcon && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer transition-colors">
                        {rightIcon}
                    </div>
                )}
            </div>
            {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
    );
}
