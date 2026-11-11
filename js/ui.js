// ui.js — helper: format เงิน/วันที่ พ.ศ., toast, modal, บีบอัดรูป
export const fmtMoney = n => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtInt = n => (Number(n) || 0).toLocaleString('th-TH');

export function fmtDateTH(ts) {
  return new Date(ts).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}
export function fmtDateTimeTH(ts) {
  return new Date(ts).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function fmtMonthTH(ts) {
  return new Date(ts).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
}

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg, type = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) { box = h('<div id="toasts"></div>'); document.body.appendChild(box); }
  const t = h(`<div class="toast ${type}">${esc(msg)}</div>`);
  box.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

export function modal(innerHTML) {
  const back = h(`<div class="modal-back"><div class="modal">${innerHTML}</div></div>`);
  const close = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back) close(); });
  document.body.appendChild(back);
  return { el: back.querySelector('.modal'), close };
}

/** แสดง overlay "กำลังบันทึก…" ระหว่างรอ Apps Script แล้วคืนผลของ fn
 *  ถ้า error จะแสดง toast และคืน undefined */
export async function busy(fn, text = 'กำลังบันทึก…') {
  const el = h(`<div class="loading-back"><div class="loading-box"><div class="spinner"></div><div>${esc(text)}</div></div></div>`);
  document.body.appendChild(el);
  try {
    return await fn();
  } catch (err) {
    toast(err.message, 'err');
    return undefined;
  } finally {
    el.remove();
  }
}

/** เสียงบี๊บ + สั่น เมื่อสแกนสำเร็จ */
export function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 1400; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.09);
    o.onended = () => ctx.close();
  } catch { /* ไม่มีเสียงก็ได้ */ }
  navigator.vibrate?.(60);
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// บีบอัดรูปอัตโนมัติ → dataURL (jpeg)
export function compressImage(file, maxW = 1000, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const sc = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * sc));
      c.height = Math.max(1, Math.round(img.height * sc));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('อ่านไฟล์รูปไม่ได้')); };
    img.src = url;
  });
}

export function download(filename, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
