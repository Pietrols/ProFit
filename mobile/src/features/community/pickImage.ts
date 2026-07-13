import * as ImagePicker from 'expo-image-picker';

export const MAX_IMAGE_BYTES = 900_000; // must stay under the backend cap

export type PickResult =
  | { ok: true; dataUri: string }
  | { ok: false; reason: 'canceled' | 'denied' | 'too_large' };

/**
 * Pick an image from the device library and return it as a compact JPEG data
 * URI, or a typed failure. Shared by workout covers (F) and avatars (G).
 */
export async function pickImageAsDataUri(
  aspect: [number, number] = [16, 9],
): Promise<PickResult> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { ok: false, reason: 'denied' };

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect,
    quality: 0.4,
    base64: true,
  });
  if (res.canceled || !res.assets[0]?.base64) return { ok: false, reason: 'canceled' };

  const dataUri = `data:image/jpeg;base64,${res.assets[0].base64}`;
  if (dataUri.length > MAX_IMAGE_BYTES) return { ok: false, reason: 'too_large' };
  return { ok: true, dataUri };
}
