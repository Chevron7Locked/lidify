"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

/**
 * Creates a new QueryClient instance with sensible defaults for the music streaming app
 *
 * Configuration rationale:
 * - staleTime: Time before data is considered stale and needs refetching
 * - cacheTime: Time to keep unused data in cache before garbage collection
 * - refetchOnWindowFocus: Disabled for music app - we don't want to interrupt playback
 * - retry: Number of times to retry failed requests
 */
function makeQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                // Data freshness configuration
                staleTime: 5 * 60 * 1000, // 5 minutes - default for most data
                gcTime: 10 * 60 * 1000, // 10 minutes - formerly called cacheTime

                // Refetch behavior
                refetchOnWindowFocus: false, // Don't refetch on window focus (music app)
                refetchOnMount: true, // Refetch when component mounts if data is stale
                refetchOnReconnect: true, // Refetch when internet reconnects

                // Retry configuration
                retry: 1, // Retry once on failure
                retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

                // Error handling
                throwOnError: false, // Don't throw errors, let components handle them
            },
            mutations: {
                // Mutations generally don't need retry for user actions
                retry: false,
            },
        },
    });
}

let browserQueryClient: QueryClient | undefined = undefined;

/**
 * Gets the QueryClient instance
 * For server-side rendering, always create a new instance
 * For client-side, reuse the same instance across renders
 */
function getQueryClient() {
    if (typeof window === "undefined") {
        // Server: always make a new query client
        return makeQueryClient();
    } else {
        // Browser: make a new query client if we don't already have one
        if (!browserQueryClient) browserQueryClient = makeQueryClient();
        return browserQueryClient;
    }
}

/**
 * QueryProvider component to wrap the app with React Query
 * Includes devtools in development mode
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
    // NOTE: Avoid useState when initializing the query client if you don't
    // have a suspense boundary between this and the code that may suspend
    // because React will throw away the client on the initial render if it
    // suspends and there is no boundary
    const queryClient = getQueryClient();

    return (
        <QueryClientProvider client={queryClient}>
            {children}
            {/* DevTools only in development */}
            {process.env.NODE_ENV === "development" && (
                <ReactQueryDevtools
                    initialIsOpen={false}
                    buttonPosition="bottom-left"
                />
            )}
        </QueryClientProvider>
    );
}

/**
 * Export the query client for use in server components or utilities
 */
export { getQueryClient };
