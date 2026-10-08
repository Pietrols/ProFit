import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useSyncContext } from '../sync/SyncProvider';

// The address of a user photo for an <Image>, fetched from the server the first time this phone
// needs it. 'none' while there is no photo or it cannot be had right now, so screens show a placeholder.
export function usePhoto(photoId: string | null): { status: 'loading' } | { status: 'none' } | { status: 'ready'; uri: string } {
  const { photos } = useSyncContext();
  const auth = useAuth();
  const userId = auth.status === 'signedIn' ? auth.userId : null;
  const [state, setState] = useState<{ id: string | null; uri: string | null; done: boolean }>({ id: null, uri: null, done: false });

  useEffect(() => {
    if (!photoId || !userId) return;
    let live = true;
    void photos.photoUri(userId, photoId).then((uri) => {
      if (live) setState({ id: photoId, uri, done: true });
    });
    return () => {
      live = false;
    };
  }, [photos, userId, photoId]);

  if (!photoId || !userId) return { status: 'none' };
  if (state.id !== photoId || !state.done) return { status: 'loading' };
  return state.uri ? { status: 'ready', uri: state.uri } : { status: 'none' };
}
