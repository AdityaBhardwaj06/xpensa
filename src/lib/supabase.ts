import { createClient } from '@supabase/supabase-js';

// Force clean base URL (strips /rest/v1/ even if present in .env.local or Vercel)
const rawUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://ihkghmccbcilkczufxol.supabase.co';

export const supabaseUrl = rawUrl
  .trim()
  .replace(/\/rest\/v1\/?.*$/i, '')
  .replace(/\/+$/, '');

export const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isCloudConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isCloudConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;