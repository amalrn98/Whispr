/**
 * Whispr core: encryption and LSB steganography on raw RGBA pixel buffers.
 *
 * This file has no DOM dependencies. It runs in browsers (window.WhisprCore)
 * and in Node 20+ (require), which is how the test suite exercises it.
 *
 * Embedded layout (bits are written MSB first, one bit per R, G or B byte,
 * alpha is never touched):
 *
 *   v2: "WSPR" (4 bytes) | payload length (4 bytes, big endian) | payload
 *       payload = version (1) | flags (1) | salt (16) | iv (12) | AES-GCM ciphertext + tag
 *
 *   v1 (legacy, decode only): length (4 bytes) | checksum (4 bytes) | iv (12) | ciphertext + tag
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.WhisprCore = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MAGIC = [0x57, 0x53, 0x50, 0x52]; // "WSPR"
    const FORMAT_VERSION = 2;
    const FLAG_PASSWORD = 1;
    const SALT_LEN = 16;
    const IV_LEN = 12;
    const TAG_LEN = 16;
    const HEADER_BYTES = 8; // magic + length
    const PAYLOAD_OVERHEAD = 1 + 1 + SALT_LEN + IV_LEN + TAG_LEN;
    const PBKDF2_ITERATIONS = 600000;

    // Used when the user sets no password. This value is public, so a message
    // encrypted with it is obfuscated, not secret.
    const DEFAULT_PASSPHRASE = 'whispr-default-key-2024';

    const LEGACY_SALT = 'whispr-salt-2024';
    const LEGACY_ITERATIONS = 100000;

    class WhisprError extends Error {
        constructor(code, message) {
            super(message);
            this.name = 'WhisprError';
            this.code = code;
        }
    }

    function getSubtle() {
        const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
        if (!c || !c.subtle) {
            throw new WhisprError(
                'NO_CRYPTO',
                'WebCrypto is not available. Open Whispr over HTTPS, from localhost, or as a local file.'
            );
        }
        return { subtle: c.subtle, getRandomValues: (a) => c.getRandomValues(a) };
    }

    async function deriveKey(passphrase, salt, iterations) {
        const { subtle } = getSubtle();
        const material = await subtle.importKey(
            'raw',
            new TextEncoder().encode(passphrase),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
            material,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /** Capacity in bytes of the payload (after the 8 byte header) for an image. */
    function capacityBytes(width, height) {
        return Math.max(0, Math.floor((width * height * 3) / 8) - HEADER_BYTES);
    }

    /** Exact payload size needed for a message. */
    function requiredBytes(message) {
        return new TextEncoder().encode(message).length + PAYLOAD_OVERHEAD;
    }

    async function encryptMessage(message, password) {
        const { subtle, getRandomValues } = getSubtle();
        const salt = getRandomValues(new Uint8Array(SALT_LEN));
        const iv = getRandomValues(new Uint8Array(IV_LEN));
        const key = await deriveKey(password || DEFAULT_PASSPHRASE, salt, PBKDF2_ITERATIONS);
        const ciphertext = new Uint8Array(
            await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(message))
        );

        const payload = new Uint8Array(PAYLOAD_OVERHEAD - TAG_LEN + ciphertext.length);
        payload[0] = FORMAT_VERSION;
        payload[1] = password ? FLAG_PASSWORD : 0;
        payload.set(salt, 2);
        payload.set(iv, 2 + SALT_LEN);
        payload.set(ciphertext, 2 + SALT_LEN + IV_LEN);
        return payload;
    }

    async function decryptPayload(payload, password) {
        if (payload.length < PAYLOAD_OVERHEAD || payload[0] !== FORMAT_VERSION) {
            throw new WhisprError('NO_MESSAGE', 'No valid hidden message found in this image.');
        }
        const usedPassword = (payload[1] & FLAG_PASSWORD) !== 0;
        if (usedPassword && !password) {
            throw new WhisprError('PASSWORD_REQUIRED', 'This message is protected by a password. Enter it and try again.');
        }
        const salt = payload.slice(2, 2 + SALT_LEN);
        const iv = payload.slice(2 + SALT_LEN, 2 + SALT_LEN + IV_LEN);
        const ciphertext = payload.slice(2 + SALT_LEN + IV_LEN);
        return aesDecrypt(ciphertext, iv, salt, PBKDF2_ITERATIONS, password || DEFAULT_PASSPHRASE, usedPassword);
    }

    async function decryptLegacy(data, password) {
        const iv = data.slice(0, IV_LEN);
        const ciphertext = data.slice(IV_LEN);
        const salt = new TextEncoder().encode(LEGACY_SALT);
        return aesDecrypt(ciphertext, iv, salt, LEGACY_ITERATIONS, password || DEFAULT_PASSPHRASE, Boolean(password));
    }

    async function aesDecrypt(ciphertext, iv, salt, iterations, passphrase, usedPassword) {
        const { subtle } = getSubtle();
        try {
            const key = await deriveKey(passphrase, salt, iterations);
            const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
            return new TextDecoder('utf-8', { fatal: true }).decode(plain);
        } catch (err) {
            throw new WhisprError(
                'DECRYPT_FAILED',
                usedPassword
                    ? 'Decryption failed. Check the password, and make sure the image has not been edited or recompressed.'
                    : 'Decryption failed. The message may need a password, or the image was edited or recompressed.'
            );
        }
    }

    // ---- bit level helpers (RGBA buffer, RGB channels only) ----

    function bitToIndex(bit) {
        return Math.floor(bit / 3) * 4 + (bit % 3);
    }

    function writeBytes(pixels, bitOffset, bytes) {
        let bit = bitOffset;
        for (let i = 0; i < bytes.length; i++) {
            const b = bytes[i];
            for (let k = 7; k >= 0; k--, bit++) {
                const idx = bitToIndex(bit);
                pixels[idx] = (pixels[idx] & 0xfe) | ((b >> k) & 1);
            }
        }
    }

    function readBytes(pixels, bitOffset, count) {
        const out = new Uint8Array(count);
        let bit = bitOffset;
        for (let i = 0; i < count; i++) {
            let v = 0;
            for (let k = 0; k < 8; k++, bit++) {
                v = (v << 1) | (pixels[bitToIndex(bit)] & 1);
            }
            out[i] = v;
        }
        return out;
    }

    function pixelCapacity(pixels) {
        // number of payload bytes that fit after the header
        return Math.max(0, Math.floor(((pixels.length / 4) * 3) / 8) - HEADER_BYTES);
    }

    function readUint32(bytes) {
        return ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    }

    function writeUint32(value) {
        return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
    }

    function legacyChecksum(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum = (sum + data[i]) % 0xffffffff;
        return sum;
    }

    // ---- public API ----

    /** Encrypts `message` and embeds it into `pixels` (RGBA, modified in place). */
    async function encode(pixels, message, password) {
        const payload = await encryptMessage(message, password);
        if (payload.length > pixelCapacity(pixels)) {
            throw new WhisprError('CAPACITY_EXCEEDED', 'Message is too long for this image. Use a larger image or a shorter message.');
        }
        writeBytes(pixels, 0, new Uint8Array(MAGIC));
        writeBytes(pixels, 32, writeUint32(payload.length));
        writeBytes(pixels, 64, payload);
    }

    /** Extracts and decrypts a message from `pixels` (RGBA). */
    async function decode(pixels, password) {
        const noMessage = () => new WhisprError('NO_MESSAGE', 'No hidden Whispr message was found in this image.');
        if (pixels.length / 4 * 3 < 64) throw noMessage();

        const head = readBytes(pixels, 0, 4);
        const isV2 = MAGIC.every((m, i) => head[i] === m);

        if (isV2) {
            const length = readUint32(readBytes(pixels, 32, 4));
            if (length < PAYLOAD_OVERHEAD || length > pixelCapacity(pixels)) throw noMessage();
            return decryptPayload(readBytes(pixels, 64, length), password);
        }

        // Legacy v1 images: length, additive checksum, then iv + ciphertext.
        const length = readUint32(head);
        if (length <= IV_LEN + TAG_LEN || length > pixelCapacity(pixels)) throw noMessage();
        const expected = readUint32(readBytes(pixels, 32, 4));
        const data = readBytes(pixels, 64, length);
        if (legacyChecksum(data) !== expected) throw noMessage();
        return decryptLegacy(data, password);
    }

    return {
        WhisprError,
        FORMAT_VERSION,
        PBKDF2_ITERATIONS,
        capacityBytes,
        requiredBytes,
        encode,
        decode,
        // exported for tests
        _internals: { writeBytes, readBytes, legacyChecksum, LEGACY_SALT, LEGACY_ITERATIONS, DEFAULT_PASSPHRASE }
    };
});
