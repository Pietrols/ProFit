// User-supplied image validation (AUDIT S6). Inline images must be a data
// URI whose declared type AND magic bytes agree — a string that merely
// claims to be an image is rejected before it is stored or served to
// other users. https URLs pass through (rendered by RN Image, not executed).
import { ApiError } from "./errors";

const MAGIC: Record<string, (b: Buffer) => boolean> = {
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from("\x89PNG\r\n\x1a\n", "binary")),
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) =>
    b.subarray(0, 4).toString("binary") === "RIFF" &&
    b.subarray(8, 12).toString("binary") === "WEBP",
  "image/gif": (b) => ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("binary")),
};

/** Throws BAD_IMAGE unless `value` is null, an https URL, or a genuine image data URI. */
export function assertImageOrNull(value: string | null | undefined): void {
  if (value == null) return;
  if (value.startsWith("https://")) return;

  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  const bad = () =>
    ApiError.badRequest(
      "Image must be an https URL or a PNG/JPEG/WebP/GIF data URI.",
      "BAD_IMAGE",
    );
  if (!match) throw bad();

  let bytes: Buffer;
  try {
    bytes = Buffer.from(match[2], "base64");
  } catch {
    throw bad();
  }
  if (bytes.length < 12 || !MAGIC[match[1]]?.(bytes)) throw bad();
}
