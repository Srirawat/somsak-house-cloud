// backup.js — export/import JSON ทั้งฐาน
import { STORES, dbAll, dbClear, dbPut } from './db.js';
import { download } from './ui.js';

export async function exportAll() {
  const data = { app: 'somsak-house', version: 1, exportedAt: new Date().toISOString(), stores: {} };
  for (const s of STORES) data.stores[s] = await dbAll(s);
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  download(`somsak-house-backup-${stamp}.json`, JSON.stringify(data, null, 1));
}

export async function importAll(file) {
  const data = JSON.parse(await file.text());
  if (!data || data.app !== 'somsak-house' || !data.stores) {
    throw new Error('ไฟล์สำรองไม่ถูกต้อง (ต้องเป็นไฟล์ export จาก Somsak House)');
  }
  for (const s of STORES) {
    if (!Array.isArray(data.stores[s])) continue;
    await dbClear(s);
    for (const v of data.stores[s]) await dbPut(s, v);
  }
}
