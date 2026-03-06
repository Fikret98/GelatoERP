import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDbStats() {
    console.log('--- Checking DB Stats ---');

    // 1. Check RPC
    const { data: dbStats, error: dbErr } = await supabase.rpc('get_dashboard_stats');
    console.log('Stats from RPC:', dbStats);
    if (dbErr) {
        console.error('RPC Error:', dbErr);
        console.log('Attempting to fetch raw tables to see if they exist...');
    }

    console.log('\n--- Checking Sale Items ---');
    const { data: cogsData, error: cogsErr } = await supabase.from('sale_items').select('quantity, product_id');
    console.log(`Found ${cogsData?.length || 0} sale items.`);
    if (cogsErr) console.error('Sale Items Error:', cogsErr);

    console.log('\n--- Checking Product Costs View ---');
    const { data: costData, error: costErr } = await supabase.from('product_costs_view').select('*');
    console.log(`Found ${costData?.length || 0} product costs.`);
    if (costErr) console.error('Cost View Error:', costErr);

    if (cogsData && costData) {
        let ttlCogs = 0;
        console.log('\n--- Calculating COGS manually ---');
        for (const item of cogsData) {
            const costRaw = costData.find(c => c.product_id === item.product_id);
            if (costRaw) {
                const itemCogs = item.quantity * costRaw.calculated_cost_price;
                ttlCogs += itemCogs;
            }
        }
        console.log('=> Calculated COGS in Node:', ttlCogs);
    } else {
        console.log("Could not calculate COGS due to missing data from sale_items or product_costs_view");
    }
}

checkDbStats().then(() => {
    console.log("Done");
    process.exit(0);
}).catch(e => {
    console.error("Fatal Error", e);
    process.exit(1);
});
