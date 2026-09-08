import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Add them to site/.env.local."
  );
}

// Client-side Supabase client using the anon key. RLS policies (added in
// supabase/schema.sql once auth is wired) scope what an authenticated
// agency user can read/write; the intake form's public writes go through a
// narrow, explicitly-scoped RLS policy (insert-only on clients/campaigns).
export const supabase = createClient(url, anonKey);
