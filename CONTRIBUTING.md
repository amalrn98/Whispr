# Contributing to Whispr

Thank you for your interest in contributing to **Whispr**.

## Code of Conduct

We are committed to providing a friendly, safe, and welcoming environment for all contributors. Please be respectful and constructive in discussions and reviews. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Getting Started

1. **Fork the Repository**: Fork [Whispr on GitHub](https://github.com/amalrn98/whispr) and clone your fork locally.

2. **Run the app**: There is no build step. Open `whispr-web/index.html` in a browser.

3. **Run the tests** (Node 20 or newer, no dependencies to install):
   ```bash
   npm test
   ```

## Project Layout

- `whispr-web/whispr-core.js`: encryption and steganography on raw pixel buffers. No DOM access. Covered by `test/core.test.js`.
- `whispr-web/script.js`: UI only. Calls into `WhisprCore`.
- `whispr-web/index.html`: self-contained page with inline CSS.

## Ground Rules

- **No network requests.** The app must keep working offline. CI fails if `index.html` references an external script, stylesheet or image.
- **Never break decoding of existing images.** If you change the embedded format, bump the format version, keep the old decoder, and add a test that decodes an image in the old format.
- Add or update tests in `test/` for any change to `whispr-core.js`.
- Do not use em dashes in documentation or comments.

## Pull Requests

Use the pull request template. Keep changes focused, and describe how you tested them (browser and OS for UI changes).
