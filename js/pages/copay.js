// pages/copay.js — คำนวณคนละครึ่ง / ไทยช่วยไทย 4 โหมด + ปรับสัดส่วน + ตารางเทียบเร็ว
import { dbGet, dbPut } from '../db.js';
import { fmtInt, fmtMoney, toast, esc } from '../ui.js';
import { fromSelf, fromState, splitPrice, maxBuy, quickTable } from '../copay-calc.js';

export default async function render(root, { user }) {
  const setting = (await dbGet('settings', 'copayRatio')) || { key: 'copayRatio', self: 0.4, state: 0.6 };
  let ratio = { self: setting.self, state: setting.state };
  const canEdit = user.role === 'tester' || user.role === 'admin';
  const pct = x => Math.round(x * 100);

  root.innerHTML = `
  <h2>คำนวณคนละครึ่ง / ไทยช่วยไทย</h2>
  <div class="card">
    <div class="row">
      <div><label>สัดส่วน เงินตัวเอง (%)</label>
        <input id="rself" type="number" min="1" max="99" step="1" value="${pct(ratio.self)}" ${canEdit ? '' : 'disabled'}></div>
      <div><label>เงินรัฐ (%)</label><input id="rstate" type="number" value="${pct(ratio.state)}" disabled></div>
      ${canEdit ? '<div><button class="primary" id="btnRatio">บันทึกสัดส่วน</button></div>' : '<div class="muted">ปรับสัดส่วนได้เฉพาะ admin/tester</div>'}
    </div>
    <div class="muted">ค่าเริ่มต้น 40 : 60 · ทุกโหมดแสดงยอดปัดลงเป็นจำนวนเต็มบาท</div>
  </div>
  <div class="card">
    <div class="tabs">
      <button data-m="1" class="active">1) มีเงินตัวเอง</button>
      <button data-m="2">2) มีเงินรัฐ</button>
      <button data-m="3">3) รู้ราคาสินค้า</button>
      <button data-m="4">4) มีทั้งสองฝั่ง</button>
    </div>
    <div id="panel"></div>
  </div>
  <div class="card">
    <h3 style="margin-top:0">ตารางเทียบเร็ว (ราคาสินค้า 100–2,000 บาท)</h3>
    <table><thead><tr><th class="num">ราคาสินค้า</th><th class="num">จ่ายเอง</th><th class="num">รัฐช่วยจ่าย</th></tr></thead>
    <tbody id="qt"></tbody></table>
  </div>`;

  const panel = root.querySelector('#panel');
  const rself = root.querySelector('#rself');
  const rstate = root.querySelector('#rstate');

  function renderQuick() {
    root.querySelector('#qt').innerHTML = quickTable(ratio).map(r =>
      `<tr><td class="num">${fmtInt(r.price)}</td><td class="num">${fmtInt(r.self)}</td><td class="num">${fmtInt(r.state)}</td></tr>`).join('');
  }

  if (canEdit) {
    rself.addEventListener('input', () => { rstate.value = 100 - (+rself.value || 0); });
    root.querySelector('#btnRatio').onclick = async () => {
      const s = Math.floor(+rself.value);
      if (!(s >= 1 && s <= 99)) return toast('สัดส่วนต้องอยู่ระหว่าง 1–99%', 'err');
      ratio = { self: s / 100, state: (100 - s) / 100 };
      await dbPut('settings', { key: 'copayRatio', ...ratio });
      toast(`บันทึกสัดส่วน ${s}:${100 - s} แล้ว`);
      renderQuick(); showMode(currentMode);
    };
  }

  const NOTE = '<div class="muted" style="margin-top:6px">* ยอดปัดลงเป็นจำนวนเต็มบาท</div>';
  let currentMode = '1';

  function showMode(m) {
    currentMode = m;
    root.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.m === m));
    const forms = {
      '1': `<p>กรอกเงินในกระเป๋าตัวเอง → ระบบบอกว่าซื้อของได้รวมเท่าไร และรัฐช่วยจ่ายกี่บาท</p>
        <div class="row"><div><label>เงินตัวเอง (บาท)</label><input id="i1" type="number" min="0" step="0.01"></div>
        <div><button class="primary" id="go">คำนวณ</button></div></div>`,
      '2': `<p>กรอกสิทธิ์คงเหลือของรัฐ → ถ้าจะใช้ให้หมด ต้องควักเงินตัวเองกี่บาท และได้ของมูลค่าเท่าไร</p>
        <div class="row"><div><label>เงินรัฐคงเหลือ (บาท)</label><input id="i1" type="number" min="0" step="0.01"></div>
        <div><button class="primary" id="go">คำนวณ</button></div></div>`,
      '3': `<p>กรอกยอดสินค้ารวม → ระบบแยกให้ว่าจ่ายเองเท่าไร รัฐจ่ายเท่าไร</p>
        <div class="row"><div><label>ราคาสินค้ารวม (บาท)</label><input id="i1" type="number" min="0" step="0.01"></div>
        <div><button class="primary" id="go">คำนวณ</button></div></div>`,
      '4': `<p>กรอกเงินตัวเอง + เงินรัฐที่มี → ซื้อได้สูงสุด, ฝั่งไหนเป็นตัวจำกัด, เงินคงเหลือหลังซื้อ</p>
        <div class="row">
          <div><label>เงินตัวเอง (บาท)</label><input id="i1" type="number" min="0" step="0.01"></div>
          <div><label>เงินรัฐ (บาท)</label><input id="i2" type="number" min="0" step="0.01"></div>
          <div><label>ราคาสินค้าที่อยากซื้อ (ไม่บังคับ)</label><input id="i3" type="number" min="0" step="0.01" placeholder="—"></div>
          <div><button class="primary" id="go">คำนวณ</button></div>
        </div>`,
    };
    panel.innerHTML = forms[m] + '<div id="result"></div>';
    const res = panel.querySelector('#result');
    panel.querySelector('#go').onclick = () => {
      try {
        const v1 = parseFloat(panel.querySelector('#i1').value);
        if (m === '1') {
          const r = fromSelf(v1, ratio);
          res.innerHTML = `<div class="result-box">
            <div class="line">🛒 ซื้อของได้รวม <b class="big">${fmtInt(r.total)}</b> บาท</div>
            <div class="line">🏛️ รัฐช่วยจ่าย <b>${fmtInt(r.state)}</b> บาท · 💰 ตัวเองจ่ายจริง <b>${fmtInt(r.selfUsed)}</b> บาท</div>
            ${NOTE}</div>`;
        } else if (m === '2') {
          const r = fromState(v1, ratio);
          res.innerHTML = `<div class="result-box">
            <div class="line">🛒 ใช้สิทธิ์รัฐให้หมด จะซื้อของได้ <b class="big">${fmtInt(r.total)}</b> บาท</div>
            <div class="line">💰 ต้องควักเงินตัวเอง <b>${fmtInt(r.selfNeed)}</b> บาท · 🏛️ รัฐจ่าย <b>${fmtInt(r.stateUsed)}</b> บาท</div>
            ${NOTE}</div>`;
        } else if (m === '3') {
          const r = splitPrice(v1, ratio);
          res.innerHTML = `<div class="result-box">
            <div class="line">ของราคา <b>${fmtInt(r.price)}</b> บาท</div>
            <div class="line">💰 จ่ายเอง <b class="big">${fmtInt(r.self)}</b> บาท + 🏛️ รัฐจ่าย <b class="big">${fmtInt(r.state)}</b> บาท</div>
            ${NOTE}</div>`;
        } else {
          const v2 = parseFloat(panel.querySelector('#i2').value);
          const v3raw = panel.querySelector('#i3').value;
          const v3 = v3raw === '' ? null : parseFloat(v3raw);
          const r = maxBuy(v1, v2, ratio, v3);
          const limTxt = r.limiter === 'self' ? 'เงินตัวเอง' : r.limiter === 'state' ? 'เงินรัฐ' : 'พอดีทั้งสองฝั่ง';
          let html = `<div class="result-box">
            <div class="line">🛒 ซื้อของได้สูงสุด <b class="big">${fmtInt(r.maxTotal)}</b> บาท</div>
            <div class="line">⚖️ ตัวจำกัด: <b>${limTxt}</b></div>
            <div class="line">ใช้จริง — ตัวเอง ${fmtInt(r.usedSelf)} บาท · รัฐ ${fmtInt(r.usedState)} บาท</div>
            <div class="line">คงเหลือหลังซื้อ — ตัวเอง <b>${fmtMoney(r.selfLeft)}</b> บาท · รัฐ <b>${fmtMoney(r.stateLeft)}</b> บาท</div>`;
          if (r.topUp && r.topUp.add > 0) {
            const side = r.topUp.side === 'self' ? 'เงินตัวเอง' : 'เงินรัฐ';
            html += `<div class="line">➕ ต้องมี${side}รวม <b>${fmtInt(r.topUp.need)}</b> บาท (เติมอีก <b>${fmtMoney(r.topUp.add)}</b> บาท)
              จึงใช้อีกฝั่งได้หมด — จะซื้อได้ <b>${fmtInt(r.topUp.fullTotal)}</b> บาท</div>`;
          }
          html += NOTE + '</div>';
          if (r.priceCheck) {
            const pc = r.priceCheck;
            html += pc.enough
              ? `<div class="result-box"><div class="line">✅ ของราคา ${fmtInt(pc.price)} บาท — <b>เงินพอ</b>
                  (ตัวเอง ${fmtInt(pc.needSelf)} + รัฐ ${fmtInt(pc.needState)})</div></div>`
              : `<div class="warn-box"><div class="line">❌ ของราคา ${fmtInt(pc.price)} บาท — <b>เงินไม่พอ</b></div>
                  ${pc.shortSelf > 0 ? `<div class="line">ขาดเงินตัวเอง <b>${fmtMoney(pc.shortSelf)}</b> บาท</div>` : ''}
                  ${pc.shortState > 0 ? `<div class="line">ขาดเงินรัฐ <b>${fmtMoney(pc.shortState)}</b> บาท</div>` : ''}
                  <div class="line">ด้วยเงินที่มี ซื้อได้มากสุด <b>${fmtInt(pc.affordable)}</b> บาท</div></div>`;
          }
          res.innerHTML = html;
        }
      } catch (err) { res.innerHTML = ''; toast(err.message, 'err'); }
    };
    panel.querySelectorAll('input').forEach(inp =>
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); panel.querySelector('#go').click(); } }));
  }

  root.querySelectorAll('.tabs button').forEach(b => b.onclick = () => showMode(b.dataset.m));
  showMode('1');
  renderQuick();
}
