# Changelog

## 2.0.0

### Security
- New embedded format (v2) with a random 16 byte salt per message. v1 used one fixed, public salt.
- PBKDF2-SHA256 iterations raised from 100,000 to 600,000.
- The additive checksum is replaced by a "WSPR" marker and the AES-GCM authentication tag.
- The header records whether a password was used, so decoding can ask for one instead of failing with a generic error.

### Fixes
- Transparent PNGs no longer corrupt the hidden data. Transparency is flattened onto white before embedding.
- Capacity is now exact. v1 reserved 100 pixels for an 8 byte header.
- Copying an image to the clipboard now reports failures correctly.
- The capacity indicator colors work in the single-page build.

### Changes
- `index.html` is now fully self-contained. It no longer loads Tailwind from a CDN, so the app really works offline.
- Removed `index-offline.html`, the stale `whispr-web-complete.zip`, the duplicate `whispr-web/README.md` and the empty `favicon.ico`.
- Encryption and steganography moved to `whispr-core.js` and are covered by tests.
- Dark mode follows the system setting until the user chooses.
- Drop zones are keyboard accessible, and alerts are announced to screen readers.
- Documentation rewritten to describe the security model accurately.

### Compatibility
- Images made by v1 can still be decoded.

## 1.0.0

- Initial release.
