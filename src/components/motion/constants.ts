// Shared easing curves for solid-motionone animations.

export const easeSmooth: [number, number, number, number] = [
  0.25, 0.1, 0.25, 1,
];
export const smoothOut: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const elasticOut: [number, number, number, number] = [
  0.34, 1.56, 0.64, 1,
];

// Spring physics presets for bouncy, organic animations.

export const springGentle = { type: "spring" as const, bounce: 0.3 };
export const springMedium = { type: "spring" as const, bounce: 0.4 };
export const springBouncy = { type: "spring" as const, bounce: 0.5 };

// Common entrance presets.

export const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, easing: easeSmooth },
} as const;

export const fadeUpInView = {
  initial: { opacity: 0, y: 20 },
  inView: { opacity: 1, y: 0 },
  inViewOptions: { once: true },
  transition: { duration: 0.5, easing: easeSmooth },
} as const;

// Interactive element presets.

export const cardHover = {
  whileHover: { scale: 1.05, y: -2 },
  whileTap: { scale: 0.95 },
  transition: { duration: 0.2 },
} as const;

export const inputFocus = {
  whileFocus: { scale: 1.02 },
  whileHover: { scale: 1.01 },
} as const;
