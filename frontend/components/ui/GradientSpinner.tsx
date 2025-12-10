"use client";

import { memo } from "react";

interface GradientSpinnerProps {
    size?: "sm" | "md" | "lg" | "xl";
    className?: string;
}

const GradientSpinner = memo(function GradientSpinner({ size = "md", className = "" }: GradientSpinnerProps) {
    const sizeMap = {
        sm: { size: 16, strokeWidth: 2, radius: 6 },
        md: { size: 32, strokeWidth: 3, radius: 13 },
        lg: { size: 48, strokeWidth: 4, radius: 20 },
        xl: { size: 64, strokeWidth: 4, radius: 28 },
    };

    // Fallback to "md" if invalid size is provided
    const sizeConfig = sizeMap[size] || sizeMap.md;
    const { size: viewBoxSize, strokeWidth, radius } = sizeConfig;
    const center = viewBoxSize / 2;

    return (
        <svg
            className={`animate-spin ${className}`}
            width={viewBoxSize}
            height={viewBoxSize}
            viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        >
            <defs>
                <linearGradient id={`spinnerGrad-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{ stopColor: '#facc15', stopOpacity: 1 }} />
                    <stop offset="25%" style={{ stopColor: '#f59e0b', stopOpacity: 1 }} />
                    <stop offset="50%" style={{ stopColor: '#c026d3', stopOpacity: 1 }} />
                    <stop offset="75%" style={{ stopColor: '#a855f7', stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: '#facc15', stopOpacity: 1 }} />
                </linearGradient>
            </defs>
            <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={`url(#spinnerGrad-${size})`}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${radius * 5} ${radius * 1.5}`}
            />
        </svg>
    );
});

export { GradientSpinner };
