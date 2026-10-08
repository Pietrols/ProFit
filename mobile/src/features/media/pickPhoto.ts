import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { fitWithin, PHOTO_QUALITY } from './photoSize';

// Lets the user choose a photo from the phone's gallery, crops it square (exercise images are
// shown square), and returns a shrunk JPEG copy. Null when they cancel.
// The system picker needs no gallery permission on Android or iOS.
export async function pickPhoto(): Promise<string | null> {
  const result = await launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  const context = ImageManipulator.manipulate(asset.uri);
  const resize = fitWithin(asset.width, asset.height);
  if (resize) context.resize(resize);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY });
  return saved.uri;
}
