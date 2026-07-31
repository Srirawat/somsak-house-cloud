// copay-calc.js — สูตรคนละครึ่ง/ไทยช่วยไทย ทั้ง 4 โหมด (logic ล้วน ทดสอบได้)
// สัดส่วนเริ่มต้น: เงินตัวเอง 40% : เงินรัฐ 60%
// ทุกโหมด "ปัดลงเป็นจำนวนเต็มบาท" (floor)

export const DEFAULT_RATIO = { self: 0.4, state: 0.6 };

const EPS = 1e-9;
export const floorBaht = x => Math.floor(x + EPS);

function checkRatio(r) {
  if (!r || typeof r.self !== 'number' || typeof r.state !== 'number' ||
      r.self <= 0 || r.state <= 0 || Math.abs(r.self + r.state - 1) > 1e-6) {
    throw new Error('สัดส่วนไม่ถูกต้อง (ต้องรวมกันได้ 100%)');
  }
}
function checkMoney(v, name = 'จำนวนเงิน') {
  if (typeof v !== 'number' || !isFinite(v) || v < 0) {
    throw new Error(`${name}ไม่ถูกต้อง (ต้องเป็นตัวเลข ≥ 0)`);
  }
}

// โหมด 1: มีเงินตัวเอง → จ่ายได้เท่าไร
// ตย. ตัวเอง 400 → ซื้อได้ 1,000 (รัฐช่วย 600)
export function fromSelf(selfMoney, ratio = DEFAULT_RATIO) {
  checkRatio(ratio); checkMoney(selfMoney, 'เงินตัวเอง');
  const total = floorBaht(selfMoney / ratio.self);
  const state = floorBaht(total * ratio.state);
  const selfUsed = total - state;
  return { total, state, selfUsed, selfLeft: selfMoney - selfUsed };
}

// โหมด 2: มีเงินรัฐ → จ่ายได้เท่าไร (ใช้สิทธิ์รัฐให้หมด)
// ตย. รัฐ 300 → ซื้อได้ 500 ต้องใช้เงินตัวเอง 200
export function fromState(stateMoney, ratio = DEFAULT_RATIO) {
  checkRatio(ratio); checkMoney(stateMoney, 'เงินรัฐ');
  const total = floorBaht(stateMoney / ratio.state);
  const stateUsed = floorBaht(total * ratio.state);
  const selfNeed = total - stateUsed;
  return { total, selfNeed, stateUsed, stateLeft: stateMoney - stateUsed };
}

// โหมด 3: รู้ราคาสินค้า → แยกจ่ายเท่าไร
// ตย. ของ 1,000 → ตัวเอง 400 + รัฐ 600
export function splitPrice(price, ratio = DEFAULT_RATIO) {
  checkRatio(ratio); checkMoney(price, 'ราคาสินค้า');
  const p = floorBaht(price);
  const state = floorBaht(p * ratio.state);
  const self = p - state;
  return { price: p, self, state };
}

// โหมด 4: มีทั้งสองฝั่ง → ซื้อได้สูงสุด
// ตย. ตัวเอง 200 + รัฐ 600 → ซื้อได้สูงสุด 500, เงินตัวเองเป็นตัวจำกัด,
//     รัฐเหลือ 300 (ต้องมีเงินตัวเอง 400 จึงใช้สิทธิ์รัฐหมด)
export function maxBuy(selfMoney, stateMoney, ratio = DEFAULT_RATIO, price = null) {
  checkRatio(ratio);
  checkMoney(selfMoney, 'เงินตัวเอง');
  checkMoney(stateMoney, 'เงินรัฐ');

  const capSelf = selfMoney / ratio.self;   // ซื้อได้ถ้าจำกัดด้วยเงินตัวเอง
  const capState = stateMoney / ratio.state; // ซื้อได้ถ้าจำกัดด้วยเงินรัฐ
  const maxTotal = floorBaht(Math.min(capSelf, capState));

  // ฝั่งไหนเป็นตัวจำกัด
  let limiter = 'both';
  if (capSelf < capState - EPS) limiter = 'self';
  else if (capState < capSelf - EPS) limiter = 'state';

  // ใช้เงินจริงเมื่อซื้อ maxTotal
  const usedState = Math.min(floorBaht(maxTotal * ratio.state), stateMoney);
  const usedSelf = maxTotal - usedState;
  const selfLeft = selfMoney - usedSelf;
  const stateLeft = stateMoney - usedState;

  // ต้องเติมฝั่งที่จำกัดอีกเท่าไร จึงใช้อีกฝั่งได้หมด
  let topUp = null;
  if (limiter === 'self') {
    const fullTotal = floorBaht(stateMoney / ratio.state);
    const needSelf = fullTotal - floorBaht(fullTotal * ratio.state);
    topUp = { side: 'self', need: needSelf, add: Math.max(0, needSelf - selfMoney), fullTotal };
  } else if (limiter === 'state') {
    const fullTotal = floorBaht(selfMoney / ratio.self);
    const needState = floorBaht(fullTotal * ratio.state);
    topUp = { side: 'state', need: needState, add: Math.max(0, needState - stateMoney), fullTotal };
  }

  const result = { maxTotal, limiter, usedSelf, usedState, selfLeft, stateLeft, topUp };

  // (ออปชัน) ราคาสินค้าที่อยากซื้อ → เงินพอไหม ขาดฝั่งไหนกี่บาท
  if (price !== null && price !== undefined && price !== '') {
    checkMoney(price, 'ราคาสินค้า');
    const p = floorBaht(price);
    const needState = floorBaht(p * ratio.state);
    const needSelf = p - needState;
    const shortSelf = Math.max(0, needSelf - selfMoney);
    const shortState = Math.max(0, needState - stateMoney);
    result.priceCheck = {
      price: p, needSelf, needState, shortSelf, shortState,
      enough: shortSelf <= 0 && shortState <= 0,
      affordable: Math.min(p, maxTotal),
    };
  }
  return result;
}

// ตารางเทียบเร็ว 100–2,000 บาท (ราคาสินค้า → แยกจ่าย)
export function quickTable(ratio = DEFAULT_RATIO, from = 100, to = 2000, step = 100) {
  checkRatio(ratio);
  const rows = [];
  for (let p = from; p <= to; p += step) rows.push(splitPrice(p, ratio));
  return rows;
}
