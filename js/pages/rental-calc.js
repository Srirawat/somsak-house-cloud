// pages/rental-calc.js — ดึงเลขมิเตอร์ครั้งก่อนอัตโนมัติ, คำนวณค่าน้ำ/ไฟ/รวม, บันทึกลงประวัติ
import { dbGet, dbPut, dbAllBy, uuid } from '../db.js';
import { fmtMoney, fmtInt, toast, esc } from '../ui.js';
import { ROOMS } from '../auth.js';

// สูตรบ้านเช่า (logic ล้วน ทดสอบได้)
export function calcRental({ prevW, curW, prevE, curE, rateW, rateE, rent }) {
  for (const [k, v] of Object.entries({ prevW, curW, prevE, curE, rateW, rateE, rent })) {
    if (typeof v !== 'number' || !isFinite(v) || v < 0) throw new Error(`ค่า ${k} ไม่ถูกต้อง`);
  }
  if (curW < prevW) throw new Error('เลขมิเตอร์น้ำครั้งนี้ต้องไม่น้อยกว่าครั้งก่อน');
  if (curE < prevE) throw new Error('เลขมิเตอร์ไฟครั้งนี้ต้องไม่น้อยกว่าครั้งก่อน');
  const unitsW = curW - prevW;
  const unitsE = curE - prevE;
  const waterAmt = unitsW * rateW;
  const elecAmt = unitsE * rateE;
  const total = rent + waterAmt + elecAmt;
  return { unitsW, unitsE, waterAmt, elecAmt, total };
}

export default async function render(root, { user }) {
  const rates = (await dbGet('settings', 'rentalRates')) || { water: 18, electric: 8, rent: 3000 };
  const canSave = user.role === 'tester' || user.role === 'admin';

  root.innerHTML = `
  <h2>คำนวณบ้านเช่า</h2>
  <div class="card">
    <div class="row">
      <div><label>ห้อง</label><select id="room">${ROOMS.map(r => `<option>${r}</option>`).join('')}</select></div>
      <div><label>เดือนที่คิดค่าเช่า</label><input id="month" type="month"></div>
    </div>
    <div id="prevInfo" class="muted" style="margin-top:6px"></div>
  </div>
  <div class="grid2">
    <div class="card">
      <h3 style="margin-top:0">💧 ค่าน้ำ</h3>
      <div class="row">
        <div><label>มิเตอร์ครั้งก่อน</label><input id="prevW" type="number" min="0" step="1"></div>
        <div><label>มิเตอร์ครั้งนี้</label><input id="curW" type="number" min="0" step="1"></div>
        <div><label>ราคา/หน่วย (บาท)</label><input id="rateW" type="number" min="0" step="0.01" value="${rates.water}"></div>
      </div>
    </div>
    <div class="card">
      <h3 style="margin-top:0">⚡ ค่าไฟ</h3>
      <div class="row">
        <div><label>มิเตอร์ครั้งก่อน</label><input id="prevE" type="number" min="0" step="1"></div>
        <div><label>มิเตอร์ครั้งนี้</label><input id="curE" type="number" min="0" step="1"></div>
        <div><label>ราคา/หน่วย (บาท)</label><input id="rateE" type="number" min="0" step="0.01" value="${rates.electric}"></div>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="row">
      <div><label>ค่าเช่าห้อง (บาท/เดือน)</label><input id="rent" type="number" min="0" step="0.01" value="${rates.rent}"></div>
      <div><button class="primary" id="btnCalc">คำนวณ</button></div>
    </div>
    <div id="result"></div>
  </div>`;

  const $ = id => root.querySelector('#' + id);
  const now = new Date();
  $('month').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let lastCalc = null;

  async function loadPrev() {
    const room = $('room').value;
    const recs = (await dbAllBy('rental_records', 'room', room)).sort((a, b) => b.ts - a.ts);
    const last = recs[0];
    if (last) {
      $('prevW').value = last.curW;
      $('prevE').value = last.curE;
      $('prevInfo').textContent = `ดึงเลขมิเตอร์ครั้งก่อนของห้อง ${room} อัตโนมัติ (บันทึกล่าสุด: น้ำ ${last.curW}, ไฟ ${last.curE}) — แก้ไขได้ถ้าจำเป็น`;
    } else {
      $('prevW').value = '';
      $('prevE').value = '';
      $('prevInfo').textContent = `ห้อง ${room} ยังไม่มีประวัติ — กรอกเลขมิเตอร์ครั้งก่อนเอง`;
    }
    $('result').innerHTML = '';
    lastCalc = null;
  }

  $('room').addEventListener('change', loadPrev);

  $('btnCalc').onclick = () => {
    try {
      const input = {
        prevW: +$('prevW').value, curW: +$('curW').value,
        prevE: +$('prevE').value, curE: +$('curE').value,
        rateW: +$('rateW').value, rateE: +$('rateE').value,
        rent: +$('rent').value,
      };
      if ($('prevW').value === '' || $('curW').value === '' || $('prevE').value === '' || $('curE').value === '') {
        throw new Error('กรอกเลขมิเตอร์ให้ครบ');
      }
      const r = calcRental(input);
      lastCalc = { ...input, ...r };
      $('result').innerHTML = `<div class="result-box">
        <div class="line">💧 น้ำ ${fmtInt(r.unitsW)} หน่วย × ${fmtMoney(input.rateW)} = <b>${fmtMoney(r.waterAmt)}</b> บาท</div>
        <div class="line">⚡ ไฟ ${fmtInt(r.unitsE)} หน่วย × ${fmtMoney(input.rateE)} = <b>${fmtMoney(r.elecAmt)}</b> บาท</div>
        <div class="line">🏠 ค่าเช่า <b>${fmtMoney(input.rent)}</b> บาท</div>
        <div class="line big">รวมทั้งสิ้น ${fmtMoney(r.total)} บาท</div>
        ${canSave ? '<div style="margin-top:10px"><button class="primary" id="btnSave">บันทึกลงประวัติ</button></div>'
                  : '<div class="muted" style="margin-top:8px">การบันทึกลงประวัติทำได้เฉพาะ admin/tester</div>'}
      </div>`;
      if (canSave) $('result').querySelector('#btnSave').onclick = save;
    } catch (err) { toast(err.message, 'err'); }
  };

  async function save() {
    if (!lastCalc) return;
    const room = $('room').value;
    const month = $('month').value;
    await dbPut('rental_records', {
      id: uuid(), room, month, ts: Date.now(),
      prevW: lastCalc.prevW, curW: lastCalc.curW, unitsW: lastCalc.unitsW,
      prevE: lastCalc.prevE, curE: lastCalc.curE, unitsE: lastCalc.unitsE,
      rateW: lastCalc.rateW, rateE: lastCalc.rateE,
      waterAmt: lastCalc.waterAmt, elecAmt: lastCalc.elecAmt,
      rent: lastCalc.rent, total: lastCalc.total,
      status: 'unpaid', userId: user.id,
    });
    // จำอัตราล่าสุดไว้เป็นค่าตั้งต้น
    await dbPut('settings', { key: 'rentalRates', water: lastCalc.rateW, electric: lastCalc.rateE, rent: lastCalc.rent });
    toast(`บันทึกบิลห้อง ${room} เดือน ${month} แล้ว (สถานะ: ค้างชำระ)`);
    loadPrev();
  }

  await loadPrev();
}
