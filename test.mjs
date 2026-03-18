import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: shifts } = await supabase
      .from('shifts')
      .select('id, user_id, status, opened_at, closed_at')
      .order('closed_at', { ascending: false, nullsFirst: false })
      .limit(5);
  
  const { data: users } = await supabase.from('users').select('id, name');

  console.log("SHIFTS:");
  console.log(JSON.stringify(shifts, null, 2));

  console.log("\nUSERS:");
  console.log(JSON.stringify(users, null, 2));
}

run().catch(console.error);
