import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useSyncContext } from '../sync/SyncProvider';
import { photoState, type PhotoResult, type PhotoState } from './photoState';

// The address of a user photo for an <Image>, fetched from the server the first time this phone
// needs it. 'none' while there is no photo or it cannot be had right now, so screens show a placeholder.
export function usePhoto(photoId: string | null): PhotoState {
  const { photos } = useSyncContext();
  const auth = useAuth();
  const userId = auth.status === 'signedIn' ? auth.userId : null;
  const [state, setState] = useState<PhotoResult | null>(null);

  useEffect(() => {
    if (!photoId || !userId) return;
    let live = true;
    void photos.photoUri(userId, photoId).then((uri) => {
      if (live) setState({ userId, photoId, uri });
    });
    return () => {
      live = false;
    };
  }, [photos, userId, photoId]);

  return photoState(userId, photoId, state);
}
