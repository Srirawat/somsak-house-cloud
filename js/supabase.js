// supabase.js — สร้าง client กลาง
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export function configOK() {
  return SUPABASE_URL && !SUPABASE_URL.includes('YOUR-') &&
         SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('YOUR-');
}

export const supabase = configOK() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
