import React, { useEffect, useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Package, Users, DollarSign, X, AlertTriangle, ShoppingBag, PieChart, BarChart3, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart as RePieChart, Pie
} from 'recharts';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
  const { t } = useLanguage();
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d'>('7d');
  const [stats, setStats] = useState({
    revenue: 0,
    expenses: 0,
    profit: 0,
    lowStock: 0,
    employees: 0,
    transactions: 0,
    inventoryValue: 0
  });

  const [charts, setCharts] = useState({
    salesData: [],
    expensesByCategory: [],
    topProducts: [],
    revenueByCategory: [],
    abcRevenue: { A: [], B: [], C: [] },
    abcProfit: { A: [], B: [], C: [] }
  });
  const [abcMode, setAbcMode] = useState<'revenue' | 'profit'>('revenue');

  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [showLowStockModal, setShowLowStockModal] = useState(false);

  useEffect(() => {
    fetchDashboardData();

    const channel = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incomes' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, fetchDashboardData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dateRange]);

  const fetchDashboardData = async () => {
    try {
      let filterDate: string;
      const now = new Date();
      if (dateRange === 'today') {
        filterDate = now.toISOString().split('T')[0];
      } else if (dateRange === '7d') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        filterDate = d.toISOString().split('T')[0];
      } else {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        filterDate = d.toISOString().split('T')[0];
      }

      const { data, error } = await supabase.rpc('get_advanced_analytics', {
        p_date_filter: filterDate
      });

      if (error) {
        console.error("RPC Error:", error);
        toast.error("Məlumatlar gətirilərkən xəta: " + error.message);
        return;
      }

      if (data) {
        setStats(data.stats);
        setCharts(data.charts);

        // Fix: Fetch low stock items properly (PostgREST filter cannot compare two columns directly)
        // We fetch all inventory and filter in JS to compare against critical_limit
        const { data: inventoryData, error: invError } = await supabase
          .from('inventory')
          .select('*');

        if (invError) throw invError;

        if (inventoryData) {
          const lowStock = inventoryData.filter(item => item.stock_quantity <= (item.critical_limit || 0));
          setLowStockItems(lowStock);
        }
      }

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    }
  };



  const aov = stats.transactions > 0 ? stats.revenue / stats.transactions : 0;

  const cards = [
    { id: 'cash', name: 'Kassa (Nəğd)', value: `${(stats.kassa || 0).toLocaleString()} ₼`, icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
    { id: 'revenue', name: t('dashboard.revenue'), value: `${stats.revenue.toLocaleString()} ₼`, icon: DollarSign, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
    { id: 'netProfit', name: 'Xalis Mənfəət', value: `${(stats.netProfit || 0).toLocaleString()} ₼`, icon: TrendingUp, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
    { id: 'aov', name: 'Orta Satış (AOV)', value: `${aov.toFixed(2)} ₼`, icon: ShoppingBag, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    { id: 'inventoryValue', name: 'Anbar Dəyəri', value: `${stats.inventoryValue.toLocaleString()} ₼`, icon: BarChart3, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' },
    { id: 'lowStock', name: t('dashboard.lowStock'), value: stats.lowStock, icon: Package, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30', isClickable: true },
  ];

  const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-8"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">{t('nav.dashboard')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Biznesinizin cari vəziyyəti
          </p>
        </div>

        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 shadow-inner">
          {(['today', '7d', '30d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${dateRange === range
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-white shadow-sm ring-1 ring-black/5'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
            >
              {range === 'today' ? 'Bugün' : range === '7d' ? '7 Gün' : '30 Gün'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card, index) => (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => card.id === 'lowStock' && setShowLowStockModal(true)}
            className={`group bg-white dark:bg-gray-800 overflow-hidden shadow-sm hover:shadow-xl rounded-3xl border border-gray-100 dark:border-gray-700 p-6 transition-all duration-300 ${card.isClickable ? 'cursor-pointer hover:-translate-y-1' : ''}`}
          >
            <div className="flex flex-col gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${card.bg}`}>
                <card.icon className={`h-6 w-6 ${card.color}`} aria-hidden="true" />
              </div>
              <dl>
                <dt className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{card.name}</dt>
                <dd className="text-2xl font-black text-gray-900 dark:text-white mt-1">{card.value}</dd>
              </dl>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Sales Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2 bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700"
        >
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              Satış Trendi
            </h2>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.salesData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} dy={15} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} dx={-15} />
                <Tooltip
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                  itemStyle={{ fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="amount" stroke="#4f46e5" strokeWidth={4} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Revenue by Category */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700"
        >
          <h2 className="text-xl font-black text-gray-900 dark:text-white mb-8 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-pink-500" />
            Bölmələr üzrə Gəlir
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={charts.revenueByCategory}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {charts.revenueByCategory.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </RePieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {charts.revenueByCategory.map((item: any, index) => (
              <div key={item.name} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-gray-600 dark:text-gray-400 font-medium">{item.name}</span>
                </div>
                <span className="font-bold text-gray-900 dark:text-white">{item.value.toFixed(2)} ₼</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Top Products */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700"
        >
          <h2 className="text-xl font-black text-gray-900 dark:text-white mb-8 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-orange-500" />
            Populyar Məhsullar
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.topProducts} layout="vertical" margin={{ left: -20 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" hide />
                <Tooltip cursor={{ fill: 'transparent' }} />
                <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={20}>
                  {charts.topProducts.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-3">
            {charts.topProducts.map((item: any, index) => (
              <div key={item.name} className="flex justify-between items-center">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{item.name}</span>
                <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-black text-indigo-600 dark:text-indigo-400">
                  {item.value} ədəd
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Expenses Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="lg:col-span-1 bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700"
        >
          <h2 className="text-xl font-black text-gray-900 dark:text-white mb-8 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-500" />
            Xərclər
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.expensesByCategory}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: '16px' }} />
                <Bar dataKey="value" fill="#ef4444" radius={[8, 8, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* ABC Analysis Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="lg:col-span-2 bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700"
        >
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-500" />
              ABC Analiz
            </h2>
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
              {(['revenue', 'profit'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAbcMode(mode)}
                  className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all duration-200 ${abcMode === mode
                    ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  {mode === 'revenue' ? 'Gəlirə görə' : 'Mənfəətə görə'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['A', 'B', 'C'] as const).map(group => (
              <div key={group} className="space-y-4">
                <div className={`p-3 rounded-2xl flex items-center justify-between ${group === 'A' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' :
                  group === 'B' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' :
                    'bg-gray-50 dark:bg-gray-900/20 text-gray-700 dark:text-gray-400'
                  }`}>
                  <span className="font-black text-lg">Qrup {group}</span>
                  <span className="text-xs font-bold px-2 py-1 rounded-lg bg-white/50 dark:bg-black/20">
                    {group === 'A' ? '70% Pay' : group === 'B' ? '20% Pay' : '10% Pay'}
                  </span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {((abcMode === 'revenue' ? charts.abcRevenue : charts.abcProfit) as any)[group].length === 0 ? (
                    <p className="text-xs text-center py-4 text-gray-400 italic">Məlumat yoxdur</p>
                  ) : (
                    ((abcMode === 'revenue' ? charts.abcRevenue : charts.abcProfit) as any)[group].map((item: any) => (
                      <div key={item.name} className="flex justify-between items-center p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate max-w-[100px]">{item.name}</span>
                        <div className="text-right">
                          <p className="text-[10px] font-black">{item.contribution.toFixed(1)}%</p>
                          <p className="text-[8px] text-gray-400">{item.value.toFixed(2)} ₼</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
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
