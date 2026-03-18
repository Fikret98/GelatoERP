import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf-8');
const url = envFile.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const key = envFile.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const supabase = createClient(url, key);

async function main() {
  const { data: users } = await supabase.from('users').select('*').limit(1);
  console.log("Users schema:", users ? Object.keys(users[0]).map(k => `${k}: ${typeof users[0][k]}`) : "No data");
  
  const { data: shifts } = await supabase.from('shifts').select('*').limit(1);
  console.log("Shifts schema:", shifts ? Object.keys(shifts[0]).map(k => `${k}: ${typeof shifts[0][k]}`) : "No data");
}
main();
