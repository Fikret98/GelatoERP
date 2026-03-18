import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Fetching users...');
  const { data: users } = await supabase.from('users').select('*');
  console.log(users);

  console.log('\nFetching last 5 shifts...');
  const { data: shifts } = await supabase.from('shifts').select('*').order('closed_at', { ascending: false, nullsFirst: false }).limit(5);
  console.log(shifts);

  console.log('\nFetching active discrepancies...');
  const { data: discs } = await supabase.from('shift_discrepancies').select('*').eq('status', 'pending');
  console.log(discs);
}

check();
