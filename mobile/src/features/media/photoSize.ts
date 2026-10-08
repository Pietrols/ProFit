// Photos are shrunk before they are kept: big enough to fill a phone screen's width, small enough
// to upload quickly on mobile data and stay well under the server's 5 MB limit.

export const MAX_PHOTO_SIDE = 1080;
export const PHOTO_QUALITY = 0.8;

// The resize that brings the longest side down to max, keeping the shape. Null when the image is
// already small enough.
export function fitWithin(width: number, height: number, max = MAX_PHOTO_SIDE): { width: number } | { height: number } | null {
  if (width <= max && height <= max) return null;
  return width >= height ? { width: max } : { height: max };
}
