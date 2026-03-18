const fs = require('fs');
const https = require('https');

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const URL = urlMatch[1].trim();
const KEY = keyMatch[1].trim();

function get(path) {
  return new Promise((resolve, reject) => {
    https.get(`${URL}/rest/v1/${path}`, {
      headers: {
        'apikey': KEY,
        'Authorization': `Bearer ${KEY}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function run() {
  const users = await get('users?select=id,name');
  const shifts = await get('shifts?select=id,user_id,status,opened_at,closed_at&order=closed_at.desc.nullslast&limit=5');
  const discs = await get('shift_discrepancies?select=*&status=eq.pending');

  console.log("== USERS ==");
  console.log(users);
  console.log("\n== SHIFTS ==");
  console.log(shifts);
  console.log("\n== DISCS ==");
  console.log(discs);
}

run();
