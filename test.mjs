import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('--- RPC ---');
    const { data: dbStats, error: dbErr } = await supabase.rpc('get_dashboard_stats');
    console.log(dbStats, dbErr);

    console.log('\n--- SALES ---');
    const { data: sales, error: sErr } = await supabase.from('sales').select('total_amount');
    const totalRev = sales?.reduce((acc, s) => acc + Number(s.total_amount), 0) || 0;
    console.log('Total Revenue:', totalRev, sErr);

    console.log('\n--- EXPENSES ---');
    const { data: exps, error: eErr } = await supabase.from('expenses').select('amount');
    const totalExp = exps?.reduce((acc, e) => acc + Number(e.amount), 0) || 0;
    console.log('Total Other Expenses:', totalExp, eErr);

    console.log('\n--- COGS ---');
    const { data: cogsData } = await supabase.from('sale_items').select('quantity, product_id');
    const { data: costData } = await supabase.from('product_costs_view').select('*');

    let totalCogs = 0;
    if (cogsData && costData) {
        for (const item of cogsData) {
            const costRaw = costData.find(c => c.product_id === item.product_id);
            if (costRaw) {
                totalCogs += item.quantity * costRaw.calculated_cost_price;
            }
        }
        console.log('Calculated COGS:', totalCogs);
    } else {
        console.log('Missing data from cogsData or costData');
    }

    console.log('\nExpected Expenses:', totalExp + totalCogs);
    console.log('Expected Profit:', totalRev - (totalExp + totalCogs));
}
check();
