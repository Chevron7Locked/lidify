import { GradientSpinner } from "./GradientSpinner";

interface LoadingScreenProps {
    message?: string;
}

export function LoadingScreen({ message = "Loading..." }: LoadingScreenProps) {
    return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <GradientSpinner size="lg" />
                {message && (
                    <p className="text-white text-sm font-medium">
                        {message}
                    </p>
                )}
            </div>
        </div>
    );
}
