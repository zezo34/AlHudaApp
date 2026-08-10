// components/InternalPdfViewerModal.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Safely percent-encodes a remote URL so that spaces and non-ASCII
 * characters (e.g. Arabic filenames) are escaped, without double-encoding
 * a URL that is already (partially) encoded.
 *
 * decodeURI() -> normalizes an already-encoded URL back to "raw" form
 * encodeURI() -> re-encodes it, escaping spaces/Arabic but preserving
 *                URL-structural characters (:, /, ?, #, &, =, etc.)
 */
function sanitizeRemoteUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  const trimmed = rawUrl.trim();
  let normalized = trimmed;
  try {
    normalized = decodeURI(trimmed);
  } catch (e) {
    normalized = trimmed;
  }
  try {
    return encodeURI(normalized);
  } catch (e) {
    return trimmed;
  }
}

/**
 * Google Docs Viewer, embedded inside our own WebView.
 * ⚠️ Last-resort fallback ONLY: Google's servers must be able to reach the
 * file URL, so it can never display file:// or LAN/dev-server URLs. Local and
 * bundled PDFs are always rendered internally with pdf.js instead.
 */
function buildGoogleViewerUrl(remoteUrl) {
  const safeUrl = sanitizeRemoteUrl(remoteUrl);
  return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(safeUrl)}`;
}

function isRemoteUrl(uri) {
  return /^https?:\/\//i.test(uri || '');
}

function isLocalUri(uri) {
  return Boolean(uri) && !isRemoteUrl(uri);
}

/**
 * Self-contained HTML shell loaded into the WebView. It loads pdf.js from a
 * CDN (still just a <script src> fetch made by the WebView itself — no
 * external app, no browser, nothing leaves the Modal), waits for the PDF's
 * base64 bytes to arrive via postMessage from React Native, then decodes and
 * renders every page onto stacked <canvas> elements inside a scrollable page.
 *
 * Loading is hardened: three CDN mirrors are tried in order (a blocked/slow
 * mirror no longer bricks the viewer), a failure posts an explicit error
 * message back to React Native, and bootReady is posted only once the library
 * is actually available. No react-native-pdf / native module required, so it
 * works in Expo Go.
 */
const PDF_VIEWER_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    html, body { margin: 0; padding: 0; background: #525659; }
    #pages { display: flex; flex-direction: column; align-items: center; padding: 8px 0 40px; }
    /* ensure canvases occupy full CSS width while their backing bitmap is high-res */
    canvas { margin-bottom: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.4); max-width: 100%; height: auto; display: block; }
    #status { color: #fff; font-family: sans-serif; text-align: center; padding: 24px 16px; }
  </style>
</head>
<body>
  <div id="status">جاري تجهيز العارض...</div>
  <div id="pages"></div>
  <script>
    var PDFJS_LIB_URLS = [
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
      'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js'
    ];
    var PDFJS_WORKER_URLS = [
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
      'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
    ];

    function post(type, payload) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload }));
    }

    function loadScript(src) {
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = function () { resolve(); };
        s.onerror = function () { s.remove(); reject(new Error('load failed: ' + src)); };
        document.head.appendChild(s);
      });
    }

    async function init() {
      var lib = null;
      var loadedIndex = 0;
      for (var i = 0; i < PDFJS_LIB_URLS.length; i++) {
        try {
          await loadScript(PDFJS_LIB_URLS[i]);
          lib = window.pdfjsLib || globalThis.pdfjsLib;
          if (lib && lib.getDocument) {
            loadedIndex = i;
            break;
          }
        } catch (e) {
          // try the next mirror
        }
      }
      if (!lib || !lib.getDocument) {
        post('error', { message: 'تعذر تحميل مكتبة عرض PDF. تحقق من اتصالك بالإنترنت.' });
        return;
      }
      window.pdfjsLib = lib;
      // use the worker from the same mirror that actually served the library,
      // so a blocked cdnjs doesn't break rendering on the jsdelivr fallback
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URLS[loadedIndex];
      post('bootReady', {});
    }

    function b64ToUint8Array(base64) {
      var raw = atob(base64);
      var arr = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      return arr;
    }

    async function renderPdf(base64) {
      var statusEl = document.getElementById('status');
      var pagesEl = document.getElementById('pages');
      try {
        var pdfjsLib = window.pdfjsLib;
        var data = b64ToUint8Array(base64);
        var pdf = await pdfjsLib.getDocument({ data: data }).promise;
        statusEl.textContent = 'جاري رسم الصفحات (0/' + pdf.numPages + ')...';

        var containerWidth = Math.max(320, document.documentElement.clientWidth - 16);
        var devicePixelRatio = (window.devicePixelRatio && Number(window.devicePixelRatio)) || 1;
        // Cap DPR to avoid huge memory usage on very high-density screens
        var useDpr = Math.min(Math.max(1, devicePixelRatio), 3);

        for (var pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          var page = await pdf.getPage(pageNum);
          var baseViewport = page.getViewport({ scale: 1 });

          // CSS scale to fit container width
          var cssScale = containerWidth / baseViewport.width;
          // renderScale multiplies by DPR for crisp text on high-density screens
          var renderScale = cssScale * useDpr;

          // viewport used for rendering (pixel-perfect backing size)
          var renderViewport = page.getViewport({ scale: renderScale });

          // create canvas with backing bitmap at device-scaled size
          var canvas = document.createElement('canvas');
          canvas.width = Math.floor(renderViewport.width);
          canvas.height = Math.floor(renderViewport.height);

          // set CSS size to fit container (downscales the high-res backing to CSS pixels)
          var cssHeight = (renderViewport.height / renderViewport.width) * containerWidth;
          canvas.style.width = containerWidth + 'px';
          canvas.style.height = cssHeight + 'px';

          pagesEl.appendChild(canvas);

          var ctx = canvas.getContext('2d');

          // Clear and render
          ctx.save();
          // Let pdf.js paint into the high-res backing canvas directly
          await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
          ctx.restore();

          statusEl.textContent = 'جاري رسم الصفحات (' + pageNum + '/' + pdf.numPages + ')...';
          post('progress', { current: pageNum, total: pdf.numPages });

          // yield to the event loop to keep UI responsive for large PDFs
          await new Promise(function (res) { setTimeout(res, 8); });
        }

        statusEl.style.display = 'none';
        post('ready', { pages: pdf.numPages });
      } catch (err) {
        post('error', { message: String(err && err.message ? err.message : err) });
      }
    }

    function handleMessage(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'load') {
          renderPdf(msg.base64);
        }
      } catch (err) {
        post('error', { message: 'bad message: ' + String(err) });
      }
    }
    // react-native-webview delivers postMessage() differently per platform
    document.addEventListener('message', handleMessage);
    window.addEventListener('message', handleMessage);

    init();
  </script>
</body>
</html>
`;

/**
 * InternalPdfViewerModal — 100% embedded, no external browser / intents /
 * share sheets under any circumstance.
 *
 * - Bundled ('asset:') and local (file://, content://) PDFs -> read as base64
 *   with expo-file-system and rendered page-by-page with pdf.js inside this
 *   same WebView. Works identically on iOS and Android, and in Expo Go.
 * - Remote https(s) PDFs -> downloaded and rendered with pdf.js too (higher
 *   quality, and never blocked by Google's viewer).
 * - Google Docs Viewer is used ONLY as a last-resort fallback for remote
 *   files that could not be downloaded (it can't see file:// or LAN URLs).
 */
export default function InternalPdfViewerModal({ visible, onClose, pdfUri, pdfTitle }) {
  const webviewRef = useRef(null);
  const [webviewKey, setWebviewKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [progress, setProgress] = useState(null);
  const [bootReady, setBootReady] = useState(false);
  const [base64Data, setBase64Data] = useState(null);
  // Only ever set for REMOTE files whose download failed — switches the viewer
  // to Google Docs Viewer as a last resort. Local/bundled files never go there.
  const [remoteFallbackToGview, setRemoteFallbackToGview] = useState(false);

  const remote = isRemoteUrl(pdfUri);
  const local = isLocalUri(pdfUri);

  const viewerUrl = useMemo(() => {
    if (!pdfUri || !remote || !remoteFallbackToGview) return null;
    return buildGoogleViewerUrl(pdfUri);
  }, [pdfUri, remote, remoteFallbackToGview]);

  // pdf.js is used whenever the file is local OR we already have its bytes;
  // while a remote download is in flight we also render the pdf.js shell and
  // feed it the bytes as soon as they arrive.
  const renderWithPdfJs = local || Boolean(base64Data) || (remote && !remoteFallbackToGview);

  // Reset all transient state whenever a new PDF is opened.
  useEffect(() => {
    if (visible) {
      setLoading(true);
      setErrorMsg(null);
      setProgress(null);
      setBootReady(false);
      setBase64Data(null);
      setRemoteFallbackToGview(false);
      setWebviewKey((k) => k + 1);
    }
  }, [visible, pdfUri]);

  // For local files, read the base64 payload as soon as the modal opens.
  // For remote files, download to cache and read as base64 for consistent
  // high-res rendering via pdf.js (falling back to Google Viewer on failure).
  useEffect(() => {
    let cancelled = false;
    async function readLocal() {
      if (!visible || !local || !pdfUri) return;
      try {
        const b64 = await FileSystem.readAsStringAsync(pdfUri, {
          encoding: 'base64',
        });
        if (!cancelled) {
          setBase64Data(b64);
        }
      } catch (e) {
        console.warn('[InternalPdfViewerModal] failed to read local PDF', { pdfUri, error: e?.message || e });
        if (!cancelled) {
          setErrorMsg(
            __DEV__
              ? `تعذرت قراءة ملف PDF: ${e?.message || e}\nURI: ${pdfUri}`
              : 'تعذرت قراءة ملف PDF من الجهاز.'
          );
        }
      }
    }

    async function fetchRemoteAsBase64() {
      if (!visible || !remote || !pdfUri) return;
      try {
        const dest = FileSystem.cacheDirectory + `viewer_${Date.now()}.pdf`;
        const res = await FileSystem.downloadAsync(pdfUri, dest);
        const b64 = await FileSystem.readAsStringAsync(res.uri, { encoding: 'base64' });
        if (!cancelled) {
          setBase64Data(b64);
        }
      } catch (e) {
        console.warn('[InternalPdfViewerModal] failed to download remote PDF for pdf.js fallback', { pdfUri, error: e?.message || e });
        if (!cancelled) {
          // last resort: Google Docs Viewer for genuinely remote files
          setRemoteFallbackToGview(true);
          setWebviewKey((k) => k + 1);
        }
      }
    }

    if (local) readLocal();
    // never re-download after we already fell back to Google Viewer (would loop)
    else if (remote && !remoteFallbackToGview) fetchRemoteAsBase64();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, local, remote, pdfUri, remoteFallbackToGview, webviewKey]);

  // Once the pdf.js shell inside the WebView signals it's ready AND we
  // have the base64 payload, push the PDF bytes in.
  useEffect(() => {
    if (bootReady && base64Data && webviewRef.current) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'load', base64: base64Data }));
    }
  }, [bootReady, base64Data]);

  // If the pdf.js library never loads (offline / CDN blocked), stop the
  // spinner and surface a clear, actionable error instead of hanging forever.
  // Only applies to the pdf.js path — Google Viewer never posts bootReady.
  useEffect(() => {
    if (!visible || bootReady || !renderWithPdfJs) return;
    const timer = setTimeout(() => {
      setLoading(false);
      setErrorMsg('تعذر تحميل مكتبة عرض PDF. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.');
    }, 12000);
    return () => clearTimeout(timer);
  }, [visible, bootReady, renderWithPdfJs, webviewKey]);

  const handleWebViewMessage = useCallback((event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'bootReady') {
        setBootReady(true);
        setErrorMsg(null); // library finally arrived -> clear any CDN timeout error
      } else if (msg.type === 'progress') {
        setProgress(msg.payload);
      } else if (msg.type === 'ready') {
        setLoading(false);
      } else if (msg.type === 'error') {
        setLoading(false);
        setErrorMsg(msg.payload?.message || 'حدث خطأ أثناء عرض الملف.');
      }
    } catch (e) {
      // ignore malformed / unrelated messages
    }
  }, []);

  const handleRetry = useCallback(() => {
    setLoading(true);
    setErrorMsg(null);
    setProgress(null);
    setBootReady(false);
    setBase64Data(null);
    setRemoteFallbackToGview(false);
    setWebviewKey((k) => k + 1);
  }, []);

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
        <Text style={styles.closeBtnText}>✕ إغلاق</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {pdfTitle || 'عرض PDF'}
      </Text>
    </View>
  );

  const renderBody = () => {
    if (!pdfUri) {
      return (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>لا يوجد ملف لعرضه.</Text>
        </View>
      );
    }

    // --- Local / bundled / downloaded files: rendered internally via pdf.js ---
    if (renderWithPdfJs) {
      return (
        <View style={{ flex: 1 }}>
          <WebView
            key={webviewKey}
            ref={webviewRef}
            originWhitelist={['*']}
            source={{ html: PDF_VIEWER_HTML, baseUrl: 'https://localhost' }}
            style={styles.webview}
            javaScriptEnabled
            domStorageEnabled
            onMessage={handleWebViewMessage}
            onError={() => {
              setLoading(false);
              setErrorMsg('تعذر تحميل عارض PDF.');
            }}
          />
          {loading && !errorMsg && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#0F382C" />
              <Text style={styles.loadingText}>
                {progress
                  ? `جاري رسم الصفحات (${progress.current}/${progress.total})...`
                  : 'جاري تحميل الملف...'}
              </Text>
            </View>
          )}
          {errorMsg && (
            <View style={styles.centerBoxOverlay}>
              <Text style={styles.errorText}>{errorMsg}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
                <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }

    // --- Remote fallback: Google Docs Viewer, embedded inside our WebView ---
    return (
      <View style={{ flex: 1 }}>
        <WebView
          key={webviewKey}
          source={{ uri: viewerUrl }}
          style={styles.webview}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setErrorMsg('تعذر عرض الملف عبر العارض الداخلي.');
          }}
          onHttpError={() => {
            setLoading(false);
            setErrorMsg('تعذر عرض الملف عبر العارض الداخلي.');
          }}
        />
        {loading && !errorMsg && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#0F382C" />
            <Text style={styles.loadingText}>جاري تحميل الملف...</Text>
          </View>
        )}
        {errorMsg && (
          <View style={styles.centerBoxOverlay}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
              <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        {renderBody()}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F382C' },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#0F382C',
  },
  closeBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  closeBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  headerTitle: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
    flex: 1,
    textAlign: 'right',
    marginRight: 12,
  },
  webview: { flex: 1, backgroundColor: '#525659' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { marginTop: 10, color: '#0F382C', fontWeight: '700', textAlign: 'center', paddingHorizontal: 24 },
  centerBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  centerBoxOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    color: '#B91C1C',
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#0F382C',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  retryBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
});
