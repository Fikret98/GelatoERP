import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Extract keys from .env.local
const envFile = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.+)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.+)/);

if (!urlMatch || !keyMatch) {
  console.error("Missing keys in .env.local");
  process.exit(1);
}

const url = urlMatch[1].trim();
const key = keyMatch[1].trim();

const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase.from('secrets').select('*');
  if (error) {
    console.error("Error fetching secrets:", error);
  } else {
    console.log("Secrets table content:");
    data.forEach(s => {
      console.log(`${s.name}: ${s.value ? s.value.substring(0, 15) + '...' : 'null'}`);
    });
  }
}

main();
