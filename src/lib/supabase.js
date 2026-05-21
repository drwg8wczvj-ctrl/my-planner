import { createClient } from "@supabase/supabase-js";

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY must be set.");
}

export const supabase = createClient(
  url  ?? "https://placeholder.supabase.co",
  key  ?? "placeholder"
);
