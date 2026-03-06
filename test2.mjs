import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env.local manually to avoid needing dotenv package
const envContent = fs.readFileSync('.env.local', 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        envVars[match[1].trim()] = match[2].trim();
    }
});

const supabaseUrl = envVars['VITE_SUPABASE_URL'];
const supabaseKey = envVars['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('Fetching RPC stats...');
    const { data: dbStats, error: dbErr } = await supabase.rpc('get_dashboard_stats');
    console.log('RPC Stats:', dbStats, dbErr ? `Error: ${dbErr.message}` : '');

    console.log('Fetching COGS components...');
    const { data: cogsData } = await supabase.from('sale_items').select('quantity, product_id');
    const { data: costData } = await supabase.from('product_costs_view').select('*');

    if (cogsData && costData) {
        let ttl = 0;
        cogsData.forEach(item => {
            const c = costData.find(x => x.product_id === item.product_id);
            if (c) ttl += Number(item.quantity) * Number(c.calculated_cost_price);
        });
        console.log('Manual COGS total:', ttl);
    } else {
        console.log('cogsData or costData missing', !cogsData, !costData);
    }

    console.log('Done');
    process.exit(0);
}

run();
