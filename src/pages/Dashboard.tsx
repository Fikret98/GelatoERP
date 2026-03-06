import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Package, Users, DollarSign, X, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
  const { t } = useLanguage();
  const [stats, setStats] = useState({
    revenue: 0,
    expenses: 0,
    profit: 0,
    lowStock: 0,
    employees: 0
  });

  const [charts, setCharts] = useState({
    salesData: [],
    expensesByCategory: []
  });

  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [showLowStockModal, setShowLowStockModal] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // 1. Fetch Stats via RPC and Chart Data via Queries
      const [
        { data: rpcStats, error: rpcErr },
        { data: salesData },
        { data: expensesData },
        { data: inventoryData }
      ] = await Promise.all([
        supabase.rpc('get_dashboard_stats'),
        supabase.from('sales').select('date, total_amount').order('date', { ascending: false }).limit(100),
        supabase.from('expenses').select('category, amount'),
        supabase.from('inventory').select('name, stock_quantity, critical_limit, unit')
      ]);

      if (rpcErr) throw rpcErr;

      if (inventoryData) {
        setLowStockItems(inventoryData.filter(item => item.stock_quantity <= (item.critical_limit || 0)));
      }

      // 2. Set Stats from RPC
      setStats({
        revenue: rpcStats.revenue || 0,
        expenses: rpcStats.expenses || 0,
        profit: rpcStats.profit || 0,
        lowStock: rpcStats.lowStock || 0,
        employees: rpcStats.employees || 0
      });

      const sales = salesData || [];
      const expenses = expensesData || [];

      // 3. Calculate Chart Data
      const salesByDate: Record<string, number> = {};
      sales.forEach(sale => {
        const d = new Date(sale.date).toISOString().split('T')[0];
        salesByDate[d] = (salesByDate[d] || 0) + Number(sale.total_amount);
      });
      const chartSales = Object.keys(salesByDate)
        .sort()
        .map(date => ({ date, amount: salesByDate[date] }))
        .slice(-7);

      const expCat: Record<string, number> = {};
      expenses.forEach(exp => {
        expCat[exp.category] = (expCat[exp.category] || 0) + Number(exp.amount);
      });
      const chartExpenses = Object.keys(expCat).map(name => ({
        name,
        value: expCat[name]
      }));

      setCharts({
        salesData: chartSales as any,
        expensesByCategory: chartExpenses as any
      });

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    }
  };

  const cards = [
    { id: 'revenue', name: t('dashboard.revenue'), value: `${stats.revenue.toFixed(2)} ₼`, icon: DollarSign, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
    { id: 'expenses', name: t('dashboard.expenses'), value: `${stats.expenses.toFixed(2)} ₼`, icon: TrendingDown, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
    { id: 'profit', name: t('dashboard.profit'), value: `${stats.profit.toFixed(2)} ₼`, icon: TrendingUp, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
    { id: 'lowStock', name: t('dashboard.lowStock'), value: stats.lowStock, icon: Package, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30', isClickable: true },
    { id: 'employees', name: t('dashboard.employees'), value: stats.employees, icon: Users, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.dashboard')}</h1>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card, index) => (
          <motion.div
            key={card.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => card.isClickable && setShowLowStockModal(true)}
            className={`bg-white dark:bg-gray-800 overflow-hidden shadow-sm rounded-2xl border border-gray-100 dark:border-gray-700 p-6 hover:shadow-md transition ${card.isClickable ? 'cursor-pointer hover:ring-2 hover:ring-orange-500/50' : ''}`}
          >
            <div className="flex items-center">
              <div className={`flex-shrink-0 rounded-xl p-3 ${card.bg}`}>
                <card.icon className={`h-6 w-6 ${card.color}`} aria-hidden="true" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{card.name}</dt>
                  <dd className="text-2xl font-semibold text-gray-900 dark:text-white">{card.value}</dd>
                </dl>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700"
        >
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">{t('dashboard.salesChart')}</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.salesData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dx={-10} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`${value.toFixed(2)} ₼`, t('nav.pos')]}
                />
                <Area type="monotone" dataKey="amount" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700"
        >
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">{t('dashboard.expenseChart')}</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.expensesByCategory} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#374151', fontSize: 12, fontWeight: 500 }} />
                <Tooltip
                  cursor={{ fill: '#f3f4f6' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`${value.toFixed(2)} ₼`, t('reports.latestExpenses')]}
                />
                <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Low Stock Popup Modal */}
      {showLowStockModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Kritik Anbar Qalığı ({lowStockItems.length})
                </h3>
              </div>
              <button
                onClick={() => setShowLowStockModal(false)}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                title="Bağla"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {lowStockItems.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  Hər şey qaydasındadır, kritik mal yoxdur.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {lowStockItems.map((item, idx) => (
                    <div key={idx} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex justify-between items-center rounded-xl">
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">{item.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Limit: {item.critical_limit} {item.unit}</p>
                      </div>
                      <div className="text-right">
                        <span className="inline-block bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold px-3 py-1 rounded-full text-sm">
                          {item.stock_quantity} {item.unit}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </motion.div>
  );
}
