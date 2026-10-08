import { Directory, File, Paths, UploadType } from 'expo-file-system';
import type { MediaFiles } from './files';

// Photos are kept in <documents>/media/<id>.jpg. Documents, not cache, so the system never clears
// a photo that has not reached the server yet.

const FOLDER = 'media';
const pathFor = (id: string) => `${FOLDER}/${id}.jpg`;
const fileAt = (path: string) => new File(Paths.document, path);

function ensureFolder() {
  const folder = new Directory(Paths.document, FOLDER);
  if (!folder.exists) folder.create({ intermediates: true });
}

export const mediaFiles: MediaFiles | null = {
  async keep(sourceUri, id) {
    ensureFolder();
    const path = pathFor(id);
    await new File(sourceUri).copy(fileAt(path), { overwrite: true });
    return path;
  },
  exists: (path) => fileAt(path).exists,
  remove(path) {
    const file = fileAt(path);
    if (file.exists) file.delete();
  },
  uri: (path) => fileAt(path).uri,
  async upload(path, url, headers, contentType) {
    const result = await fileAt(path).upload(url, {
      httpMethod: 'PUT',
      uploadType: UploadType.BINARY_CONTENT,
      mimeType: contentType,
      headers: { ...headers, 'Content-Type': contentType },
    });
    return { status: result.status, body: result.body };
  },
  async download(url, id, headers) {
    ensureFolder();
    const path = pathFor(id);
    await File.downloadFileAsync(url, fileAt(path), { headers, idempotent: true });
    return path;
  },
};
