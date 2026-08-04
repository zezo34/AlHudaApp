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

/** Google Docs Viewer, embedded inside our own WebView — this never leaves
 * the app, it's the same as any other page a WebView could load. */
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
 * Self-contained HTML shell loaded into the WebView for LOCAL files.
 * It loads pdf.js from a CDN (still just a <script src> fetch made by the
 * WebView itself — no external app, no browser, nothing leaves the Modal),
 * waits for the PDF's base64 bytes to arrive via postMessage from React
 * Native, then decodes + renders every page onto stacked <canvas>
 * elements inside a scrollable page. Fully self-contained, no
 * react-native-pdf / native module required, so it works in Expo Go.
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
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    function b64ToUint8Array(base64) {
      const raw = atob(base64);
      const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      return arr;
    }

    function post(type, payload) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload }));
    }

    async function renderPdf(base64) {
      const statusEl = document.getElementById('status');
      const pagesEl = document.getElementById('pages');
      try {
        const data = b64ToUint8Array(base64);
        const pdf = await pdfjsLib.getDocument({ data: data }).promise;
        statusEl.textContent = 'جاري رسم الصفحات (0/' + pdf.numPages + ')...';

        const containerWidth = Math.max(320, document.documentElement.clientWidth - 16);
        const devicePixelRatio = (window.devicePixelRatio && Number(window.devicePixelRatio)) || 1;
        // Cap DPR to avoid huge memory usage on very high-density screens
        const useDpr = Math.min(Math.max(1, devicePixelRatio), 3);

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const baseViewport = page.getViewport({ scale: 1 });

          // CSS scale to fit container width
          const cssScale = containerWidth / baseViewport.width;
          // renderScale multiplies by DPR for crisp text on high-density screens
          const renderScale = cssScale * useDpr;

          // viewport used for rendering (pixel-perfect backing size)
          const renderViewport = page.getViewport({ scale: renderScale });

          // create canvas with backing bitmap at device-scaled size
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(renderViewport.width);
          canvas.height = Math.floor(renderViewport.height);

          // set CSS size to fit container (downscales the high-res backing to CSS pixels)
          const cssHeight = (renderViewport.height / renderViewport.width) * containerWidth;
          canvas.style.width = containerWidth + 'px';
          canvas.style.height = cssHeight + 'px';

          pagesEl.appendChild(canvas);

          const ctx = canvas.getContext('2d');

          // Clear and render
          ctx.save();
          // Let pdf.js paint into the high-res backing canvas directly
          await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
          ctx.restore();

          statusEl.textContent = 'جاري رسم الصفحات (' + pageNum + '/' + pdf.numPages + ')...';
          post('progress', { current: pageNum, total: pdf.numPages });

          // yield to the event loop to keep UI responsive for large PDFs
          await new Promise(res => setTimeout(res, 8));
        }

        statusEl.style.display = 'none';
        post('ready', { pages: pdf.numPages });
      } catch (err) {
        post('error', { message: String(err && err.message ? err.message : err) });
      }
    }

    function handleMessage(e) {
      try {
        const msg = JSON.parse(e.data);
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

    post('bootReady', {});
  </script>
</body>
</html>
`;

/**
 * InternalPdfViewerModal — 100% embedded, no external browser / intents /
 * share sheets under any circumstance.
 *
 * - Remote https(s) PDFs -> Google Docs Viewer, loaded inside this WebView.
 * - Local PDFs (file://, content://, etc.) -> read as base64 with
 *   expo-file-system and rendered page-by-page with pdf.js inside this
 *   same WebView. Works identically on iOS and Android, and in Expo Go.
 */
export default function InternalPdfViewerModal({ visible, onClose, pdfUri, pdfTitle }) {
  const webviewRef = useRef(null);
  const [webviewKey, setWebviewKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [progress, setProgress] = useState(null);
  const [bootReady, setBootReady] = useState(false);
  const [base64Data, setBase64Data] = useState(null);
  const [usePdfJs, setUsePdfJs] = useState(false); // whether to render via embedded pdf.js

  const remote = isRemoteUrl(pdfUri);
  const local = isLocalUri(pdfUri);

  const viewerUrl = useMemo(() => {
    if (!pdfUri || !remote) return null;
    return buildGoogleViewerUrl(pdfUri);
  }, [pdfUri, remote]);

  // Reset all transient state whenever a new PDF is opened.
  useEffect(() => {
    if (visible) {
      setLoading(true);
      setErrorMsg(null);
      setProgress(null);
      setBootReady(false);
      setBase64Data(null);
      setWebviewKey((k) => k + 1);
    }
  }, [visible, pdfUri]);

  // For local files, read the base64 payload as soon as the modal opens.
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
          setUsePdfJs(true);
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
        // download to cache and read as base64 for consistent high-res rendering via pdf.js
        const dest = FileSystem.cacheDirectory + `viewer_${Date.now()}.pdf`;
        const res = await FileSystem.downloadAsync(pdfUri, dest);
        const b64 = await FileSystem.readAsStringAsync(res.uri, { encoding: 'base64' });
        if (!cancelled) {
          setBase64Data(b64);
          setUsePdfJs(true);
        }
      } catch (e) {
        console.warn('[InternalPdfViewerModal] failed to download remote PDF for pdf.js fallback', { pdfUri, error: e?.message || e });
        // fallback: keep usePdfJs false to use Google Viewer
      }
    }

    // prefer pdf.js rendering for local files; for remote try to download and render with pdf.js too (higher quality)
    if (local) readLocal();
    else if (remote) fetchRemoteAsBase64();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, local, remote, pdfUri, webviewKey]);

  // Once the pdf.js shell inside the WebView signals it's ready AND we
  // have the base64 payload, push the PDF bytes in.
  useEffect(() => {
    if (local && bootReady && base64Data && webviewRef.current) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'load', base64: base64Data }));
    }
  }, [local, bootReady, base64Data]);

  const handleWebViewMessage = useCallback((event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'bootReady') {
        setBootReady(true);
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

    // --- Local file: rendered internally via pdf.js inside our WebView ---
    if (local) {
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

    // --- Remote file: Google Docs Viewer, embedded inside our WebView ---
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
