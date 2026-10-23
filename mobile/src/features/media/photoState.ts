export type PhotoResult = { userId: string; photoId: string; uri: string | null };
export type PhotoState =
  { status: 'loading' } | { status: 'none' } | { status: 'ready'; uri: string };

// React effects run after render. Gate the cached result during the render that changes owner.
export function photoState(
  userId: string | null,
  photoId: string | null,
  result: PhotoResult | null,
): PhotoState {
  if (!userId || !photoId) return { status: 'none' };
  if (result?.userId !== userId || result.photoId !== photoId) return { status: 'loading' };
  return result.uri ? { status: 'ready', uri: result.uri } : { status: 'none' };
}
