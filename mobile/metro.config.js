const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The web preview only (phones are not affected): expo-sqlite on web is a WebAssembly build of
// SQLite, so Metro must bundle .wasm files, and it needs SharedArrayBuffer, which browsers only
// allow on cross-origin isolated pages. Metro adds the isolation headers below to what it serves,
// but in SDK 57 Expo's dev server sends the HTML page itself without them, so signed-in screens in
// the preview need those headers added in front of it (see D24 in docs/DECISIONS.md).
config.resolver.assetExts.push('wasm');
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(req, res, next);
};

module.exports = config;
