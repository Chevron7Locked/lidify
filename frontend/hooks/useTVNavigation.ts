"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useIsTV, DPAD_KEYS } from "@/lib/tv-utils";

interface UseTVNavigationOptions {
    onBack?: () => void;
    onSelect?: (element: HTMLElement) => void;
    enabled?: boolean;
}

interface UseTVNavigationResult {
    containerRef: React.RefObject<HTMLElement>;
    focusedSectionIndex: number;
    focusedCardIndex: number;
    isContentFocused: boolean;
    focusFirstCard: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
}

export function useTVNavigation(options: UseTVNavigationOptions = {}): UseTVNavigationResult {
    const { onBack, onSelect, enabled = true } = options;
    const isTV = useIsTV();

    const containerRef = useRef<HTMLElement>(null);
    const [focusedSectionIndex, setFocusedSectionIndex] = useState(0);
    const [focusedCardIndex, setFocusedCardIndex] = useState(0);
    const [isContentFocused, setIsContentFocused] = useState(false);

    // Focus memory: remember last focused card index per section
    const focusMemory = useRef<Map<number, number>>(new Map());

    // Get all sections with data-tv-section attribute
    const getSections = useCallback(() => {
        if (!containerRef.current) return [];
        return Array.from(
            containerRef.current.querySelectorAll<HTMLElement>('[data-tv-section]')
        );
    }, []);

    // Get all cards in a section with data-tv-card attribute
    const getCardsInSection = useCallback((section: HTMLElement) => {
        return Array.from(
            section.querySelectorAll<HTMLElement>('[data-tv-card]')
        );
    }, []);

    // Scroll element into view smoothly
    const scrollIntoView = useCallback((element: HTMLElement) => {
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
        });
    }, []);

    // Focus a specific card
    const focusCard = useCallback((card: HTMLElement | null) => {
        if (card) {
            card.focus();
            scrollIntoView(card);
        }
    }, [scrollIntoView]);

    // Focus first card in content area
    const focusFirstCard = useCallback(() => {
        const sections = getSections();
        if (sections.length === 0) {
            // Fallback: find any focusable element
            const firstFocusable = containerRef.current?.querySelector<HTMLElement>(
                'a[href], button, [tabindex="0"]'
            );
            if (firstFocusable) {
                firstFocusable.focus();
                setIsContentFocused(true);
            }
            return;
        }

        const firstSection = sections[0];
        const cards = getCardsInSection(firstSection);

        if (cards.length > 0) {
            focusCard(cards[0]);
            setFocusedSectionIndex(0);
            setFocusedCardIndex(0);
            setIsContentFocused(true);
        }
    }, [getSections, getCardsInSection, focusCard]);

    // Handle keyboard navigation
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!enabled || !isTV) return;

        // If not content focused, ignore - let TVLayout handle it
        if (!isContentFocused) return;

        const sections = getSections();
        if (sections.length === 0) {
            // No sections found, try fallback navigation
            const focusables = containerRef.current?.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), [tabindex="0"]'
            );
            if (!focusables || focusables.length === 0) return;

            const currentIdx = Array.from(focusables).findIndex(el => el === document.activeElement);
            if (currentIdx === -1) return;

            if (e.key === DPAD_KEYS.RIGHT || e.key === 'ArrowRight') {
                e.preventDefault();
                const next = focusables[Math.min(currentIdx + 1, focusables.length - 1)];
                next?.focus();
            } else if (e.key === DPAD_KEYS.LEFT || e.key === 'ArrowLeft') {
                e.preventDefault();
                const prev = focusables[Math.max(currentIdx - 1, 0)];
                prev?.focus();
            } else if (e.key === DPAD_KEYS.UP || e.key === 'ArrowUp') {
                e.preventDefault();
                onBack?.();
                setIsContentFocused(false);
            }
            return;
        }

        const currentSection = sections[focusedSectionIndex];
        if (!currentSection) return;

        const cards = getCardsInSection(currentSection);

        switch (e.key) {
            case DPAD_KEYS.RIGHT:
            case 'ArrowRight': {
                e.preventDefault();
                const nextIndex = Math.min(focusedCardIndex + 1, cards.length - 1);
                if (nextIndex !== focusedCardIndex) {
                    focusCard(cards[nextIndex]);
                    setFocusedCardIndex(nextIndex);
                    focusMemory.current.set(focusedSectionIndex, nextIndex);
                }
                break;
            }

            case DPAD_KEYS.LEFT:
            case 'ArrowLeft': {
                e.preventDefault();
                const prevIndex = Math.max(focusedCardIndex - 1, 0);
                if (prevIndex !== focusedCardIndex) {
                    focusCard(cards[prevIndex]);
                    setFocusedCardIndex(prevIndex);
                    focusMemory.current.set(focusedSectionIndex, prevIndex);
                }
                break;
            }

            case DPAD_KEYS.DOWN:
            case 'ArrowDown': {
                e.preventDefault();
                if (focusedSectionIndex < sections.length - 1) {
                    // Save current position
                    focusMemory.current.set(focusedSectionIndex, focusedCardIndex);

                    const nextSectionIndex = focusedSectionIndex + 1;
                    const nextSection = sections[nextSectionIndex];
                    const nextCards = getCardsInSection(nextSection);

                    if (nextCards.length > 0) {
                        // Try to restore saved position, or use current column, or clamp
                        const savedIndex = focusMemory.current.get(nextSectionIndex);
                        const targetIndex = savedIndex !== undefined
                            ? Math.min(savedIndex, nextCards.length - 1)
                            : Math.min(focusedCardIndex, nextCards.length - 1);

                        focusCard(nextCards[targetIndex]);
                        setFocusedSectionIndex(nextSectionIndex);
                        setFocusedCardIndex(targetIndex);
                    }
                }
                break;
            }

            case DPAD_KEYS.UP:
            case 'ArrowUp': {
                e.preventDefault();
                if (focusedSectionIndex > 0) {
                    // Save current position
                    focusMemory.current.set(focusedSectionIndex, focusedCardIndex);

                    const prevSectionIndex = focusedSectionIndex - 1;
                    const prevSection = sections[prevSectionIndex];
                    const prevCards = getCardsInSection(prevSection);

                    if (prevCards.length > 0) {
                        // Try to restore saved position
                        const savedIndex = focusMemory.current.get(prevSectionIndex);
                        const targetIndex = savedIndex !== undefined
                            ? Math.min(savedIndex, prevCards.length - 1)
                            : Math.min(focusedCardIndex, prevCards.length - 1);

                        focusCard(prevCards[targetIndex]);
                        setFocusedSectionIndex(prevSectionIndex);
                        setFocusedCardIndex(targetIndex);
                    }
                } else {
                    // At top section, trigger onBack to return to nav
                    onBack?.();
                    setIsContentFocused(false);
                }
                break;
            }

            case DPAD_KEYS.CENTER:
            case 'Enter': {
                const focusedElement = document.activeElement as HTMLElement;
                if (focusedElement) {
                    // If it's a link, let the default behavior happen
                    if (focusedElement.tagName === 'A') {
                        return; // Allow default navigation
                    }
                    // Otherwise trigger onSelect
                    onSelect?.(focusedElement);
                }
                break;
            }

            case DPAD_KEYS.BACK:
            case 'Escape': {
                e.preventDefault();
                onBack?.();
                setIsContentFocused(false);
                break;
            }
        }
    }, [
        enabled, isTV, isContentFocused, focusedSectionIndex, focusedCardIndex,
        getSections, getCardsInSection, focusCard, onBack, onSelect
    ]);

    // Track when content receives focus from outside
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !isTV) return;

        const handleFocusIn = (e: FocusEvent) => {
            const target = e.target as HTMLElement;
            if (target.hasAttribute('data-tv-card')) {
                setIsContentFocused(true);

                // Find which section and card index
                const sections = getSections();
                for (let sIdx = 0; sIdx < sections.length; sIdx++) {
                    const cards = getCardsInSection(sections[sIdx]);
                    const cIdx = cards.indexOf(target);
                    if (cIdx !== -1) {
                        setFocusedSectionIndex(sIdx);
                        setFocusedCardIndex(cIdx);
                        break;
                    }
                }
            }
        };

        const handleFocusOut = (e: FocusEvent) => {
            // Check if focus is leaving the container entirely
            const relatedTarget = e.relatedTarget as HTMLElement;
            if (!container.contains(relatedTarget)) {
                setIsContentFocused(false);
            }
        };

        container.addEventListener('focusin', handleFocusIn);
        container.addEventListener('focusout', handleFocusOut);

        return () => {
            container.removeEventListener('focusin', handleFocusIn);
            container.removeEventListener('focusout', handleFocusOut);
        };
    }, [isTV, getSections, getCardsInSection]);

    return {
        containerRef,
        focusedSectionIndex,
        focusedCardIndex,
        isContentFocused,
        focusFirstCard,
        handleKeyDown
    };
}
