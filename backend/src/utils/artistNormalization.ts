import * as fuzz from "fuzzball";

/**
 * Utility functions for normalizing artist and album names
 * to handle case-sensitivity and other variations
 */

/**
 * Strip diacritics/accents from a string
 * e.g., "Ólafur" → "Olafur", "Björk" → "Bjork"
 */
function stripDiacritics(str: string): string {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Check if a string contains any diacritics/accents
 * Used to prefer the accented version when merging duplicates
 */
export function hasDiacritics(str: string): boolean {
    return str !== stripDiacritics(str);
}

/**
 * Given two artist names, return the "preferred" one
 * Prefers the accented version as it's likely the official spelling
 * e.g., "Olafur Arnalds" vs "Ólafur Arnalds" → "Ólafur Arnalds"
 */
export function getPreferredArtistName(name1: string, name2: string): string {
    const has1 = hasDiacritics(name1);
    const has2 = hasDiacritics(name2);
    
    // If one has accents and the other doesn't, prefer the accented one
    if (has2 && !has1) return name2;
    if (has1 && !has2) return name1;
    
    // If both or neither have accents, prefer the longer/more complete one
    return name1.length >= name2.length ? name1 : name2;
}

/**
 * Normalize an artist name for case-insensitive comparison
 * - Converts to lowercase
 * - Trims whitespace
 * - Strips diacritics/accents (Ólafur → olafur)
 * - This ensures "Olafur Arnalds" and "Ólafur Arnalds" match
 */
export function normalizeArtistName(name: string): string {
    return stripDiacritics(name.trim().toLowerCase());
}

/**
 * Normalize an album title for case-insensitive comparison
 * - Converts to lowercase
 * - Trims whitespace
 */
export function normalizeAlbumTitle(title: string): string {
    return title.trim().toLowerCase();
}

/**
 * Check if two artist names are similar enough to be considered the same
 * Uses fuzzy matching to catch typos like "the weeknd" vs "the weekend"
 * @param name1 First artist name
 * @param name2 Second artist name
 * @param threshold Similarity threshold (0-100), default 95
 * @returns true if names are similar enough
 */
export function areArtistNamesSimilar(
    name1: string,
    name2: string,
    threshold: number = 95
): boolean {
    // First normalize both names
    const normalized1 = normalizeArtistName(name1);
    const normalized2 = normalizeArtistName(name2);

    // If they're exactly equal after normalization, return true
    if (normalized1 === normalized2) {
        return true;
    }

    // Use fuzzy matching to catch typos
    const similarity = fuzz.ratio(normalized1, normalized2);
    return similarity >= threshold;
}

/**
 * Find the best matching artist from a list of candidates
 * @param targetName The name to match
 * @param candidates List of candidate artist names
 * @param threshold Minimum similarity score (0-100), default 95
 * @returns The best matching artist name, or null if no good match
 */
export function findBestArtistMatch(
    targetName: string,
    candidates: string[],
    threshold: number = 95
): string | null {
    const normalizedTarget = normalizeArtistName(targetName);

    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
        const normalizedCandidate = normalizeArtistName(candidate);
        const score = fuzz.ratio(normalizedTarget, normalizedCandidate);

        if (score >= threshold && score > bestScore) {
            bestScore = score;
            bestMatch = candidate;
        }
    }

    return bestMatch;
}
