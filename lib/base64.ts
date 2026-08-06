/**
 * Base64 to bytes, in about twenty lines and no dependency.
 *
 * This exists because of one stubborn fact about uploading a photograph from
 * a phone: Supabase Storage will take an `ArrayBuffer` from React Native and
 * will not reliably take a `Blob`, a `File` or a `FormData`, all of which are
 * polyfills here rather than the browser objects the client expects. The
 * photograph arrives from the image picker as a `file://` URI, the only way
 * across is base64, and the whole ecosystem's answer to that is to add a
 * package.
 *
 * A decoder is a pure function over a string. Kept here it is testable off a
 * device, with no network and no picker, which is worth more than the twenty
 * lines cost.
 */

const STANDARD =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const VALUES: Record<string, number> = {};
for (let i = 0; i < STANDARD.length; i++) VALUES[STANDARD[i]] = i;
// The URL-safe alphabet decodes to the same bytes. Accepting it costs two
// lines and saves a caller from having to know which one it was handed.
VALUES["-"] = 62;
VALUES["_"] = 63;

/**
 * Decode base64 (standard or URL-safe) into bytes.
 *
 * Whitespace and padding are ignored; anything else throws, because a decoder
 * that silently skips what it does not recognise turns a corrupt photograph
 * into a shorter photograph rather than an error.
 */
export function decodeBase64(input: string): Uint8Array {
  const text = input.replace(/[\s]/g, "").replace(/=+$/, "");
  const bytes = new Uint8Array((text.length * 3) >> 2);
  let accumulator = 0;
  let bits = 0;
  let out = 0;

  for (let i = 0; i < text.length; i++) {
    const value = VALUES[text[i]];
    if (value === undefined) {
      throw new Error(`Not base64: unexpected character "${text[i]}"`);
    }
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (accumulator >> bits) & 0xff;
    }
  }

  return bytes;
}

/**
 * Split a `data:` URL into its media type and its bytes.
 *
 * `FileReader.readAsDataURL` is how a local file becomes base64 in React
 * Native, and it hands back the type the platform sniffed along with it, which
 * is the only honest source for the `contentType` an upload needs.
 */
export function decodeDataUrl(dataUrl: string): {
  bytes: Uint8Array;
  contentType: string;
} {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) {
    throw new Error("Not a data URL");
  }
  const meta = dataUrl.slice(5, comma);
  const contentType = meta.split(";")[0] || "application/octet-stream";
  return { bytes: decodeBase64(dataUrl.slice(comma + 1)), contentType };
}
