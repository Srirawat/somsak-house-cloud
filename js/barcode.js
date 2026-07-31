// barcode.js — สแกนบาร์โค้ดด้วยกล้องมือถือ
// ลำดับการทำงาน: BarcodeDetector (Chrome Android) → ZXing (สำรอง iOS/เดสก์ท็อป) → ถ่ายภาพ → กรอกเลขเอง
import { h, esc } from './ui.js';

const ZXING_CDN = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm';
const WANT_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar', 'qr_code'];

let zxingReader = null;
async function loadZxing() {
  if (zxingReader) return zxingReader;
  const mod = await import(ZXING_CDN);
  zxingReader = new mod.BrowserMultiFormatReader();
  return zxingReader;
}

function isSecure() {
  return window.isSecureContext ||
    window.location.protocol === 'https:' ||
    ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

export function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && isSecure();
}

async function detectorFormats() {
  try {
    const sup = await window.BarcodeDetector.getSupportedFormats();
    const use = WANT_FORMATS.filter(f => sup.includes(f));
    return use.length ? use : undefined;
  } catch { return undefined; }
}

// ถอดรหัสจากไฟล์รูป (โหมดถ่ายภาพ)
async function decodeFile(file) {
  if ('BarcodeDetector' in window) {
    try {
      const bmp = await createImageBitmap(file);
      const det = new window.BarcodeDetector({ formats: await detectorFormats() });
      const found = await det.detect(bmp);
      bmp.close?.();
      if (found.length) return found[0].rawValue;
    } catch { /* ตกไปใช้ ZXing */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const reader = await loadZxing();
    const res = await reader.decodeFromImageUrl(url);
    return res?.getText() || null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * เปิดกล้องสแกนบาร์โค้ด
 * @returns {Promise<string|null>} เลขบาร์โค้ด หรือ null ถ้าผู้ใช้ปิดหน้าต่าง
 */
export function scanBarcode() {
  return new Promise(resolve => {
    const back = h(`<div class="modal-back">
      <div class="modal scan-modal">
        <h3 style="margin-top:0">📷 สแกนบาร์โค้ด</h3>
        <div class="scan-view">
          <video id="scanVideo" playsinline muted></video>
          <div class="scan-frame"></div>
        </div>
        <div class="scan-status" id="scanStatus">กำลังเปิดกล้อง…</div>
        <div style="margin-top:10px">
          <label>หรือกรอกเลขเอง แล้วกด Enter</label>
          <input id="scanManual" inputmode="numeric" autocomplete="off"
                 placeholder="เช่น 8850001234567" style="width:100%">
        </div>
        <div class="actions" style="justify-content:space-between">
          <button type="button" id="scanPhotoBtn">📸 ถ่ายภาพแทน</button>
          <span>
            <button type="button" id="scanFlip" hidden>🔄 สลับกล้อง</button>
            <button type="button" id="scanCancel">ปิด</button>
          </span>
        </div>
        <input id="scanPhoto" type="file" accept="image/*" capture="environment" hidden>
      </div></div>`);

    document.body.appendChild(back);
    const $ = id => back.querySelector('#' + id);
    const video = $('scanVideo');
    const status = $('scanStatus');

    let stream = null, raf = 0, stopped = false, facing = 'environment';

    function cleanup() {
      cancelAnimationFrame(raf);
      try { zxingReader?.reset(); } catch { /* ignore */ }
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    function done(code) {
      if (stopped) return;
      stopped = true;
      cleanup();
      back.remove();
      document.removeEventListener('keydown', onEsc);
      resolve(code ? String(code).trim() : null);
    }
    function onEsc(e) { if (e.key === 'Escape') done(null); }

    $('scanCancel').onclick = () => done(null);
    back.addEventListener('click', e => { if (e.target === back) done(null); });
    document.addEventListener('keydown', onEsc);

    // กรอกเลขเอง
    $('scanManual').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = e.target.value.trim();
        if (v) done(v);
      }
    });

    // ถ่ายภาพแทน (ใช้ได้แม้กล้องสดไม่ทำงาน)
    $('scanPhotoBtn').onclick = () => $('scanPhoto').click();
    $('scanPhoto').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      status.textContent = 'กำลังอ่านรูป…';
      const code = await decodeFile(f);
      if (code) done(code);
      else status.textContent = '❌ อ่านบาร์โค้ดจากรูปไม่ได้ — ถ่ายใหม่ให้ชัด ตรง และเต็มกรอบ';
      e.target.value = '';
    });

    // สลับกล้องหน้า/หลัง
    $('scanFlip').onclick = () => {
      facing = facing === 'environment' ? 'user' : 'environment';
      cleanup();
      startCamera();
    };

    async function startCamera() {
      if (!cameraSupported()) {
        back.querySelector('.scan-view').style.display = 'none';
        status.innerHTML = !isSecure()
          ? '⚠️ เบราว์เซอร์อนุญาตให้ใช้กล้องเฉพาะเว็บ https — ใช้ปุ่ม "ถ่ายภาพแทน" หรือกรอกเลขเอง'
          : '⚠️ อุปกรณ์นี้ไม่รองรับกล้องผ่านเบราว์เซอร์ — ใช้ปุ่ม "ถ่ายภาพแทน" หรือกรอกเลขเอง';
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream;
        await video.play();
        $('scanFlip').hidden = false;
        status.textContent = 'เล็งกล้องให้บาร์โค้ดอยู่ในกรอบ';
        startDecoding();
      } catch (err) {
        back.querySelector('.scan-view').style.display = 'none';
        status.innerHTML = /NotAllowed|Permission/i.test(String(err.name) + err.message)
          ? '⚠️ ไม่ได้รับอนุญาตให้ใช้กล้อง — กดไอคอนกุญแจ/กล้องบนแถบที่อยู่เพื่ออนุญาต แล้วลองใหม่<br>หรือใช้ปุ่ม "ถ่ายภาพแทน"'
          : `⚠️ เปิดกล้องไม่สำเร็จ (${esc(err.name || 'Error')}) — ใช้ปุ่ม "ถ่ายภาพแทน" หรือกรอกเลขเอง`;
      }
    }

    async function startDecoding() {
      if ('BarcodeDetector' in window) {
        try {
          const det = new window.BarcodeDetector({ formats: await detectorFormats() });
          const tick = async () => {
            if (stopped) return;
            try {
              const found = await det.detect(video);
              if (found.length && found[0].rawValue) return done(found[0].rawValue);
            } catch { /* เฟรมนี้อ่านไม่ได้ ข้ามไป */ }
            raf = requestAnimationFrame(tick);
          };
          tick();
          return;
        } catch { /* ตกไปใช้ ZXing */ }
      }
      try {
        status.textContent = 'กำลังโหลดตัวถอดรหัส…';
        const reader = await loadZxing();
        if (stopped) return;
        status.textContent = 'เล็งกล้องให้บาร์โค้ดอยู่ในกรอบ';
        reader.decodeFromVideoElement(video, res => { if (res) done(res.getText()); });
      } catch {
        status.textContent = '⚠️ โหลดตัวถอดรหัสไม่ได้ (ต้องต่ออินเทอร์เน็ต) — ใช้ "ถ่ายภาพแทน" หรือกรอกเลขเอง';
      }
    }

    startCamera();
  });
}
