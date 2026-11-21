/**
 * Whispr UI. All crypto and steganography lives in whispr-core.js.
 * Nothing in this file makes network requests.
 */
(function () {
    'use strict';

    const Core = window.WhisprCore;

    const MAX_FILE_BYTES = 4 * 1024 * 1024;
    const MAX_PIXELS = 40 * 1000 * 1000;
    const ALLOWED_TYPES = ['image/png', 'image/jpeg'];

    const $ = (id) => document.getElementById(id);

    class WhisprApp {
        constructor() {
            this.currentEncodeImage = null;
            this.currentDecodeImage = null;
            this.resultBlob = null;
            this.resultUrl = null;
            this.alertTimers = {};
            this.init();
        }

        init() {
            if (!Core) {
                this.showError('Failed to load whispr-core.js. Keep it in the same folder as index.html.');
                return;
            }
            this.setupEventListeners();
            this.setupDarkMode();
            this.switchTab('encode');
        }

        // ---------- setup ----------

        setupEventListeners() {
            $('encodeTab').addEventListener('click', () => this.switchTab('encode'));
            $('decodeTab').addEventListener('click', () => this.switchTab('decode'));

            this.bindDropZone('encode');
            this.bindDropZone('decode');

            $('secretMessage').addEventListener('input', () => this.updateCapacityInfo());
            $('generateBtn').addEventListener('click', () => this.generateSecretImage());
            $('revealBtn').addEventListener('click', () => this.revealMessage());
            $('downloadBtn').addEventListener('click', () => this.downloadImage());
            $('copyBtn').addEventListener('click', () => this.copyImageToClipboard());
            $('copyMessageBtn').addEventListener('click', () => this.copyMessageToClipboard());
            $('closeError').addEventListener('click', () => this.hideAlert('error'));
            $('closeSuccess').addEventListener('click', () => this.hideAlert('success'));
            $('darkModeToggle').addEventListener('click', () => this.toggleDarkMode());
        }

        bindDropZone(type) {
            const zone = $(`${type}DropZone`);
            const input = $(`${type}ImageInput`);
            zone.addEventListener('click', () => input.click());
            zone.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    input.click();
                }
            });
            zone.addEventListener('dragover', (e) => e.preventDefault());
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                const file = e.dataTransfer && e.dataTransfer.files[0];
                if (file) this.processImageFile(file, type);
            });
            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this.processImageFile(file, type);
            });
        }

        setupDarkMode() {
            let saved = null;
            try {
                saved = localStorage.getItem('darkMode');
            } catch (e) {
                // storage can be blocked (private mode, some file:// setups)
            }
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            const isDark = saved === null ? prefersDark : saved === 'true';
            document.documentElement.classList.toggle('dark', isDark);
        }

        toggleDarkMode() {
            const isDark = document.documentElement.classList.toggle('dark');
            try {
                localStorage.setItem('darkMode', String(isDark));
            } catch (e) {
                // ignore
            }
        }

        switchTab(tab) {
            $('encodeTab').classList.toggle('active', tab === 'encode');
            $('decodeTab').classList.toggle('active', tab === 'decode');
            $('encodeSection').classList.toggle('hidden', tab !== 'encode');
            $('decodeSection').classList.toggle('hidden', tab !== 'decode');
            $('encodeResult').classList.add('hidden');
            $('decodeResult').classList.add('hidden');
        }

        // ---------- files ----------

        async processImageFile(file, type) {
            if (!this.validateImageFile(file)) return;
            this.showLoading();

            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                const key = type === 'encode' ? 'currentEncodeImage' : 'currentDecodeImage';
                if (this[key]) URL.revokeObjectURL(this[key].url);

                if (img.naturalWidth * img.naturalHeight > MAX_PIXELS) {
                    URL.revokeObjectURL(url);
                    this.showError('Image is too large to process (over 40 megapixels).');
                    this.hideLoading();
                    return;
                }

                this[key] = { file, img, url };
                this.displayImagePreview(img, file, type, url);
                if (type === 'encode') this.updateCapacityInfo();
                this.hideLoading();
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                this.showError('Failed to load image. Please try a different file.');
                this.hideLoading();
            };
            img.src = url;
        }

        validateImageFile(file) {
            if (!ALLOWED_TYPES.includes(file.type)) {
                this.showError('Please select a PNG or JPEG image.');
                return false;
            }
            if (file.size > MAX_FILE_BYTES) {
                this.showError('Image file is too large. Please select an image under 4 MB.');
                return false;
            }
            return true;
        }

        displayImagePreview(img, file, type, url) {
            $(`${type}PreviewImg`).src = url;
            $(`${type}ImagePreview`).classList.remove('hidden');
            const kb = Math.round(file.size / 1024);
            $(`${type}ImageInfo`).textContent = `${img.naturalWidth}\u00d7${img.naturalHeight} pixels, ${kb} KB`;
        }

        updateCapacityInfo() {
            const message = $('secretMessage').value;
            const bytes = new TextEncoder().encode(message).length;
            $('messageLength').textContent = `${message.length} characters (${bytes} bytes)`;

            const info = $('capacityInfo');
            if (!this.currentEncodeImage) {
                info.textContent = '';
                return;
            }
            const { naturalWidth: w, naturalHeight: h } = this.currentEncodeImage.img;
            const capacity = Core.capacityBytes(w, h);
            const required = Core.requiredBytes(message);
            info.textContent = `Needs ${required} of ${capacity} bytes`;
            info.classList.toggle('capacity-bad', required > capacity);
            info.classList.toggle('capacity-good', required <= capacity);
        }

        // ---------- main actions ----------

        /** Draws an image to a canvas. Encoding flattens transparency onto white. */
        renderToCanvas(img, flatten) {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (flatten) {
                // Semi-transparent pixels lose RGB precision in canvas, which would
                // corrupt the hidden bits. An opaque background avoids that.
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.drawImage(img, 0, 0);
            return { canvas, ctx };
        }

        nextFrame() {
            return new Promise((resolve) => setTimeout(resolve, 0));
        }

        async generateSecretImage() {
            const message = $('secretMessage').value.trim();
            const password = $('encodePassword').value;

            if (!message) return this.showError('Please enter a secret message.');
            if (!this.currentEncodeImage) return this.showError('Please select an image first.');

            this.showLoading();
            try {
                await this.nextFrame();
                const { canvas, ctx } = this.renderToCanvas(this.currentEncodeImage.img, true);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                await Core.encode(imageData.data, message, password);
                ctx.putImageData(imageData, 0, 0);

                const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
                if (!blob) throw new Error('The browser could not create the PNG.');

                if (this.resultUrl) URL.revokeObjectURL(this.resultUrl);
                this.resultBlob = blob;
                this.resultUrl = URL.createObjectURL(blob);
                $('resultImage').src = this.resultUrl;
                $('encodeResult').classList.remove('hidden');
                this.showSuccess('Secret image generated. Share it as a file, not as a compressed photo.');
            } catch (error) {
                this.showError(error.message);
            } finally {
                this.hideLoading();
            }
        }

        async revealMessage() {
            const password = $('decodePassword').value;
            if (!this.currentDecodeImage) return this.showError('Please select an image first.');

            this.showLoading();
            try {
                await this.nextFrame();
                const { canvas, ctx } = this.renderToCanvas(this.currentDecodeImage.img, false);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const message = await Core.decode(imageData.data, password);

                $('revealedMessage').textContent = message;
                $('decodeResult').classList.remove('hidden');
                this.showSuccess('Message revealed.');
            } catch (error) {
                $('decodeResult').classList.add('hidden');
                let text = error.message;
                if (error.code === 'NO_MESSAGE' && this.currentDecodeImage.file.type === 'image/jpeg') {
                    text += ' JPEG compression destroys hidden data, so use the original PNG.';
                }
                this.showError(text);
            } finally {
                this.hideLoading();
            }
        }

        downloadImage() {
            if (!this.resultUrl) return this.showError('No image to download.');
            const a = document.createElement('a');
            a.href = this.resultUrl;
            a.download = 'whispr-secret-image.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            this.showSuccess('Image downloaded.');
        }

        async copyImageToClipboard() {
            if (!this.resultBlob) return this.showError('No image to copy.');
            if (!(navigator.clipboard && window.ClipboardItem)) {
                return this.showError('Copying images is not supported in this browser. Use Download instead.');
            }
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': this.resultBlob })]);
                this.showSuccess('Image copied to clipboard.');
            } catch (error) {
                this.showError('Failed to copy image to clipboard. Use Download instead.');
            }
        }

        async copyMessageToClipboard() {
            try {
                await navigator.clipboard.writeText($('revealedMessage').textContent);
                this.showSuccess('Message copied to clipboard.');
            } catch (error) {
                this.showError('Failed to copy message to clipboard.');
            }
        }

        // ---------- ui helpers ----------

        showLoading() {
            $('loadingIndicator').classList.remove('hidden');
        }

        hideLoading() {
            $('loadingIndicator').classList.add('hidden');
        }

        showAlert(type, message, ms) {
            clearTimeout(this.alertTimers[type]);
            $(`${type}Message`).textContent = message;
            $(`${type}Alert`).classList.remove('hidden');
            this.alertTimers[type] = setTimeout(() => this.hideAlert(type), ms);
        }

        showError(message) {
            this.showAlert('error', message, 7000);
        }

        showSuccess(message) {
            this.showAlert('success', message, 4000);
        }

        hideAlert(type) {
            clearTimeout(this.alertTimers[type]);
            $(`${type}Alert`).classList.add('hidden');
        }
    }

    document.addEventListener('DOMContentLoaded', () => new WhisprApp());
})();
