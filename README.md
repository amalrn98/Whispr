# Whispr

<p align="center">
  <strong>Encrypt a message and hide it inside an image. Everything runs in your browser.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://github.com/amalrn98/whispr/actions/workflows/ci.yml"><img src="https://github.com/amalrn98/whispr/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI Status"></a>
</p>

---

## What Whispr Does (and What It Does Not Claim)

Whispr encrypts text with AES-256-GCM, then hides the ciphertext in the least significant bits of an image's pixels (LSB steganography). The output is a PNG that looks the same as the original. There is no server, no account and no network request.

It is an educational and privacy tool. Please read the limits below before relying on it.

### Security model

- **Encryption is only as strong as the password.** The key comes from your password with PBKDF2-SHA256 (600,000 iterations, random 16 byte salt per message). AES-GCM also detects any tampering.
- **No password means no secrecy.** Without one, Whispr uses a built-in public key. The message is hidden, but anyone who uses Whispr on the image can read it.
- **LSB embedding is detectable.** Statistical analysis (steganalysis) can reveal that an image carries hidden data, even if it cannot read it.
- **Recompression destroys the message.** JPEG conversion, resizing, screenshots and most messaging apps alter pixels. Share the PNG as a file or document.
- **No sender authentication.** Anyone can create an image that claims to be from you.
- **No network.** The page sets a Content Security Policy with `connect-src 'none'`, and CI fails if the page loads any external script, stylesheet or image.

## Quick Start

1. Open `whispr-web/index.html` in a browser. No build or install is needed.
2. On **Encode**, choose a PNG or JPEG (up to 4 MB), type a message, optionally set a password, and generate the image.
3. Download the PNG and share it as a file.
4. On **Decode**, choose that PNG, enter the password if one was set, and reveal the message.

You can also host the `whispr-web` folder on any static host, such as GitHub Pages or Vercel. Serve it over HTTPS, because WebCrypto needs a secure context (a local file or `localhost` also works).

### Hosted copy

A hosted copy is available at https://whispr-mythicavalons-projects.vercel.app. It is a convenience. When you use a hosted copy, your browser downloads the code from that host on every visit, so you are trusting the host to serve it unmodified. The page and its response headers block network requests, but the strongest guarantee is to download this repository, review the code and open `whispr-web/index.html` locally.

## How It Works

1. The message is encrypted with AES-256-GCM using a key derived from the password.
2. The result is wrapped in a small header: a `WSPR` marker, a payload length, a format version, a password flag, the salt and the IV.
3. The bits are written, most significant bit first, into the lowest bit of the red, green and blue values of successive pixels. Alpha is never changed.
4. The image is saved as PNG, which is lossless and preserves those bits.

Transparent images are flattened onto a white background before embedding. Semi-transparent pixels would otherwise lose precision in the browser canvas and corrupt the hidden bits.

### Capacity

Capacity is `floor(width x height x 3 / 8)` bytes, minus 8 bytes of header and 46 bytes of encryption overhead.

| Image size    | Max message size (UTF-8 bytes) |
| :------------ | :----------------------------- |
| 500x500 px    | 93,696                         |
| 1000x1000 px  | 374,946                        |
| 1920x1080 px  | 777,546                        |
| 4000x3000 px  | 4,499,946                      |

The app shows the exact required and available bytes as you type. The upload limit is 4 MB per file and 40 megapixels per image.

## Browser Support

Current versions of Chrome, Edge, Firefox and Safari. Whispr needs WebCrypto (PBKDF2 and AES-GCM) and Canvas. Copying an image to the clipboard also needs the async Clipboard API; Download works everywhere.

## Troubleshooting

| Message | Cause |
| :------ | :---- |
| "Message is too long for this image" | Use a larger image or a shorter message. |
| "This message is protected by a password" | The image was made with a password. Enter it. |
| "Decryption failed" | Wrong password, or the image was edited or recompressed. |
| "No hidden Whispr message was found" | The image has no message, or it was changed after encoding. Use the original PNG. |

## Compatibility with Version 1

Images made by Whispr 1.x can still be decoded. New images use the 2.x format, which is not readable by 1.x.

## Development

```bash
# Run the test suite (Node 20 or newer, no dependencies)
npm test
```

```
whispr/
  whispr-web/
    index.html        Self-contained page with inline CSS
    whispr-core.js    Encryption and steganography (no DOM, unit tested)
    script.js         UI
    vercel.json       Security headers for Vercel hosting
  test/               node:test suite for whispr-core.js
  .github/            CI, issue templates, pull request template
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [CHANGELOG.md](CHANGELOG.md).

## Legal Notice

This software is provided for educational and legitimate privacy purposes. You are responsible for complying with the laws that apply to you. The authors are not responsible for misuse.

## License & Attribution

Whispr is licensed under the **[MIT License](LICENSE)**.
Created and maintained by **[Amal Nair](https://github.com/amalrn98)** (@mythicavalon on Discord).
