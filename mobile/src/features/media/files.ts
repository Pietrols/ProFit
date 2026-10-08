// Where photos live on the phone. The web preview has no app folder to keep files in, so photos are
// a phone-only feature there (null). files.native.ts is the real one.

export type MediaFiles = {
  // Copies an image into the app's own folder as <id>; returns its path inside that folder.
  keep(sourceUri: string, id: string): Promise<string>;
  exists(path: string): boolean;
  remove(path: string): void;
  // The address an <Image> can show. Worked out each time, because the app folder's full path can
  // change between app updates on iOS.
  uri(path: string): string;
  // Sends the file as the request body. Resolves with the answer, rejects when no answer came back.
  upload(path: string, url: string, headers: Record<string, string>, contentType: string): Promise<{ status: number; body: string }>;
  // Saves the answer to the app's folder as <id>; rejects on no answer or a non-2xx status.
  download(url: string, id: string, headers: Record<string, string>): Promise<string>;
};

export const mediaFiles: MediaFiles | null = null;
