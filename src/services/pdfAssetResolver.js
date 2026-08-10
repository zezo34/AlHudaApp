/**
 * services/pdfAssetResolver.js
 * -----------------------------
 * Resolves a lesson's PDF marker to a URI the InternalPdfViewerModal can open.
 *
 * Lessons may carry their PDF in any of several keys (pdfUri / pdfUrl / url /
 * fileUri / pdfAsset). The value can be:
 *   - 'asset:<name>'  -> one of the PDF books bundled with the app
 *                        (assets/pdfs/*.pdf). Works fully offline.
 *   - 'file://…'      -> a local file (e.g. picked by the admin from the
 *                        device via expo-document-picker).
 *   - 'https://…'     -> a remote URL.
 *
 * 'asset:' markers are resolved through expo-asset (Asset.fromModule +
 * downloadAsync), which ALWAYS yields a local `file://` URI on the device —
 * readable directly by expo-file-system. We deliberately do NOT use
 * Image.resolveAssetSource here: in dev/Expo Go it returns the Metro dev-server
 * URL (http://192.168.x.x:8081/assets/…), which used to send these files to
 * Google Docs Viewer and produced the "No preview available" screen.
 */
import { Asset } from 'expo-asset';

// The academy's curriculum books, shipped inside the app bundle (offline-first).
// The keys are the `asset:` markers stored in lesson.pdfUri in the database.
const BUNDLED_PDFS = {
  'asset:tajweed': require('../../assets/pdfs/tajweed.pdf'), // كتاب الهدى في تجويد كلام الله
  'asset:tafsir': require('../../assets/pdfs/tafsir.pdf'),   // كتاب تفسير الهدى
  'asset:sirah': require('../../assets/pdfs/sirah.pdf'),     // كتاب سيرة الهدى
  'asset:aqeeda': require('../../assets/pdfs/aqeeda.pdf'),   // كتاب عقيدة الهدى
};

// Cache resolved local URIs so reopening a book is instant and never re-copies.
const resolvedUriCache = new Map();

/**
 * Returns the raw PDF marker stored on a lesson (any of the known keys),
 * or null when the lesson has no PDF attached.
 */
export function getLessonPdfMarker(lesson) {
  if (!lesson || typeof lesson !== 'object') return null;
  return (
    lesson.pdfUri ||
    lesson.pdfUrl ||
    lesson.url ||
    lesson.fileUri ||
    lesson.pdfAsset ||
    null
  );
}

/** True when the lesson carries a PDF attachment of any kind. */
export function lessonHasPdf(lesson) {
  return Boolean(getLessonPdfMarker(lesson));
}

/**
 * Copies a bundled PDF module out of the app bundle into a readable local file
 * and returns its `file://` URI (Expo caches the copy, so this is cheap after
 * the first time). Falls back to Image.resolveAssetSource only if the copy
 * fails (e.g. fully offline on the very first open in Expo Go).
 */
async function resolveBundledPdf(moduleId) {
  if (resolvedUriCache.has(moduleId)) return resolvedUriCache.get(moduleId);
  try {
    const asset = Asset.fromModule(moduleId);
    await asset.downloadAsync();
    const uri = asset.localUri || asset.uri || null;
    resolvedUriCache.set(moduleId, uri);
    return uri;
  } catch (e) {
    console.warn('[pdfAssetResolver] failed to materialize bundled PDF', e?.message || e);
    try {
      const { Image } = require('react-native');
      const resolved = Image.resolveAssetSource(moduleId);
      return resolved?.uri || null;
    } catch (e2) {
      console.warn('[pdfAssetResolver] fallback resolve failed', e2?.message || e2);
      return null;
    }
  }
}

/**
 * Resolves the lesson's PDF to a URI the InternalPdfViewerModal can open.
 * 'asset:*' markers resolve to the bundled book copied to the filesystem
 * (a `file://` URI readable by expo-file-system — never a dev-server URL).
 * Everything else (file://, https://) is passed through untouched.
 */
export async function resolveLessonPdfUri(lesson) {
  const marker = getLessonPdfMarker(lesson);
  if (!marker) return null;

  if (typeof marker === 'string' && marker.startsWith('asset:')) {
    const moduleId = BUNDLED_PDFS[marker];
    if (!moduleId) return null;
    return resolveBundledPdf(moduleId);
  }

  return marker;
}
