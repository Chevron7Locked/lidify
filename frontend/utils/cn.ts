import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Check if a URL is a local/development URL that shouldn't be optimized by Next.js Image.
 * Includes localhost, 127.0.0.1, 10.0.2.2 (Android emulator), and private network ranges.
 */
export function isLocalUrl(url: string): boolean {
  return (
    url.startsWith("http://localhost") ||
    url.startsWith("http://127.0.0.1") ||
    url.startsWith("http://10.0.2.2") ||      // Android emulator host
    url.startsWith("http://10.0.3.2") ||      // Genymotion emulator host
    url.startsWith("http://192.168.") ||      // Private network
    url.startsWith("http://10.") ||           // Private network (broader)
    url.startsWith("http://172.16.") ||       // Private network
    url.startsWith("http://172.17.") ||       // Docker bridge
    url.startsWith("http://172.18.") ||       // Docker network
    url.startsWith("http://host.docker.internal")  // Docker for desktop
  );
}
