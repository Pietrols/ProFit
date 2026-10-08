import { exerciseImages } from './data/images';

// The bundled image for a built-in exercise, or null when it has none yet (a placeholder shows).
export const exerciseImage = (id: string): number | null => exerciseImages[id] ?? null;

export const imageCount = (): number => Object.keys(exerciseImages).length;
