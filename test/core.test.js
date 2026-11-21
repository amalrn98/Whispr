'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../whispr-web/whispr-core.js');
const { writeBytes, legacyChecksum, LEGACY_SALT, LEGACY_ITERATIONS, DEFAULT_PASSPHRASE } = Core._internals;

function makePixels(width, height, alpha = 255) {
    const px = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < px.length; i += 4) {
        px[i] = (i * 7) & 255;
        px[i + 1] = (i * 13) & 255;
        px[i + 2] = (i * 29) & 255;
        px[i + 3] = alpha;
    }
    return px;
}

test('round trip with a password', async () => {
    const px = makePixels(64, 64);
    await Core.encode(px, 'meet at noon', 'correct horse');
    assert.equal(await Core.decode(px, 'correct horse'), 'meet at noon');
});

test('round trip without a password', async () => {
    const px = makePixels(64, 64);
    await Core.encode(px, 'no password here');
    assert.equal(await Core.decode(px, ''), 'no password here');
});

test('unicode and multi-line messages survive', async () => {
    const msg = 'héllo wörld 日本語 🔒\nsecond line';
    const px = makePixels(80, 80);
    await Core.encode(px, msg, 'pw');
    assert.equal(await Core.decode(px, 'pw'), msg);
});

test('wrong password fails with DECRYPT_FAILED', async () => {
    const px = makePixels(64, 64);
    await Core.encode(px, 'secret', 'right');
    await assert.rejects(() => Core.decode(px, 'wrong'), { code: 'DECRYPT_FAILED' });
});

test('missing password is reported as PASSWORD_REQUIRED', async () => {
    const px = makePixels(64, 64);
    await Core.encode(px, 'secret', 'right');
    await assert.rejects(() => Core.decode(px, ''), { code: 'PASSWORD_REQUIRED' });
});

test('image without a message reports NO_MESSAGE', async () => {
    await assert.rejects(() => Core.decode(makePixels(64, 64), ''), { code: 'NO_MESSAGE' });
});

test('oversized message reports CAPACITY_EXCEEDED', async () => {
    const px = makePixels(16, 16);
    await assert.rejects(() => Core.encode(px, 'x'.repeat(500), 'pw'), { code: 'CAPACITY_EXCEEDED' });
});

test('encoding changes only the LSB of R, G and B, never alpha', async () => {
    const before = makePixels(64, 64, 255);
    const after = Uint8ClampedArray.from(before);
    await Core.encode(after, 'lsb only', 'pw');
    for (let i = 0; i < before.length; i++) {
        if (i % 4 === 3) assert.equal(after[i], before[i], 'alpha must not change');
        else assert.ok(Math.abs(after[i] - before[i]) <= 1, 'channel changed by more than 1');
    }
});

test('two encodings of the same message differ (random salt and IV)', async () => {
    const a = makePixels(64, 64);
    const b = makePixels(64, 64);
    await Core.encode(a, 'same', 'pw');
    await Core.encode(b, 'same', 'pw');
    assert.notDeepEqual(Array.from(a), Array.from(b));
});

test('tampering with embedded data is detected', async () => {
    const px = makePixels(64, 64);
    await Core.encode(px, 'integrity', 'pw');
    px[4 * 40] ^= 1; // flip a payload bit
    await assert.rejects(() => Core.decode(px, 'pw'), { code: 'DECRYPT_FAILED' });
});

test('capacity and requirement helpers agree with encode', async () => {
    const w = 40, h = 40;
    const cap = Core.capacityBytes(w, h);
    const maxChars = cap - Core.requiredBytes('');
    const ok = makePixels(w, h);
    await Core.encode(ok, 'a'.repeat(maxChars), 'pw');
    assert.equal((await Core.decode(ok, 'pw')).length, maxChars);
    await assert.rejects(() => Core.encode(makePixels(w, h), 'a'.repeat(maxChars + 1), 'pw'), { code: 'CAPACITY_EXCEEDED' });
});

test('images embedded by the original v1 format can still be decoded', async () => {
    // Re-create the v1 writer exactly as shipped before v2.
    async function legacyEncode(pixels, message, password) {
        const subtle = globalThis.crypto.subtle;
        const enc = new TextEncoder();
        const material = await subtle.importKey('raw', enc.encode(password || DEFAULT_PASSPHRASE), 'PBKDF2', false, ['deriveKey']);
        const key = await subtle.deriveKey(
            { name: 'PBKDF2', salt: enc.encode(LEGACY_SALT), iterations: LEGACY_ITERATIONS, hash: 'SHA-256' },
            material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
        );
        const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
        const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(message)));
        const data = new Uint8Array(12 + ct.length);
        data.set(iv, 0);
        data.set(ct, 12);
        const u32 = (n) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
        writeBytes(pixels, 0, u32(data.length));
        writeBytes(pixels, 32, u32(legacyChecksum(data)));
        writeBytes(pixels, 64, data);
    }
    const withPw = makePixels(64, 64);
    await legacyEncode(withPw, 'old image', 'oldpw');
    assert.equal(await Core.decode(withPw, 'oldpw'), 'old image');

    const noPw = makePixels(64, 64);
    await legacyEncode(noPw, 'old default', '');
    assert.equal(await Core.decode(noPw, ''), 'old default');
});
