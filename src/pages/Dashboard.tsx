import React, { useEffect, useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Package, Users, DollarSign, X, AlertTriangle, ShoppingBag, PieChart, BarChart3, Calendar, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart as RePieChart, Pie
} from 'recharts';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { useCountUp } from '../hooks/useCountUp';

function AnimatedStat({ value, suffix = '', decimals = 2 }: { value: number; suffix?: string; decimals?: number }) {
  const count = useCountUp(value, 1200);
  return (
    <span className="flex items-baseline gap-1">
      <span>{decimals > 0 ? count.toFixed(decimals) : Math.round(count)}</span>
      {suffix && <span className="text-[0.6em] text-gray-400 font-medium">{suffix}</span>}
    </span>
  );
}

export default function Dashboard() {
  const { t } = useLanguage();
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'custom'>('week');
  const [customRange, setCustomRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [stats, setStats] = useState({
    revenue: 0,
    expenses: 0,
    profit: 0,
    lowStock: 0,
    employees: 0,
    transactions: 0,
    inventoryValue: 0,
    totalSupplierDebt: 0,
    totalFixedAssets: 0
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
  const [infoModal, setInfoModal] = useState<{ show: boolean; title: string; content: string } | null>(null);

  const reportInfo = {
    cash: {
      title: 'Kassa (Nəğd)',
      content: 'Kassadakı cari nəğd pul qalığı. Satışlardan gələn nəğd pullar ilə alış-veriş və xərclər arasındakı fərqi göstərir.'
    },
    revenue: {
      title: 'Ümumi Gəlir',
      content: 'Seçilmiş tarix aralığında edilən bütün satışların cəmi (Maya dəyəri çıxılmadan).'
    },
    netProfit: {
      title: 'Xalis Mənfəət',
      content: 'Ümumi Gəlir - (Satılan malların mayası + Xərclər). Biznesinizin real qazancını göstərir.'
    },
    aov: {
      title: 'Orta Satış (AOV)',
      content: 'Ümumi Gəlir / Satış sayı. Hər müştərinin orta hesabla nə qədər xərclədiyini göstərir.'
    },
    inventoryValue: {
      title: 'Anbar Dəyəri',
      content: 'Anbardakı bütün malların hazırki maya dəyəri ilə cəmi qiyməti.'
    },
    lowStock: {
      title: 'Azalan Anbar',
      content: 'Stoku təyin etdiyiniz kritik həddən aşağı düşən məhsulların sayı.'
    },
    totalSupplierDebt: {
      title: 'Təchizatçılara Borc',
      content: 'Bütün təchizatçılara olan ümumi borcunuzun cəmi.'
    },
    totalFixedAssets: {
      title: 'Əsas Vəsaitlər',
      content: 'Biznesinizə aid olan avadanlıq, maşın və digər əsas vəsaitlərin ümumi maya dəyəri.'
    },
    salesTrend: {
      title: 'Satış Trendi',
      content: 'Günlər üzrə satış məbləğlərinin paylanması. Histogram formatı ən çox satış olan günləri vizual olaraq fərqləndirir.'
    }
  };

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
  }, [dateRange, customRange]);

  // Body scroll lock when modals are open
  useEffect(() => {
    if (showLowStockModal || infoModal?.show) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100vw';
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = 'var(--scrollbar-width, 0px)';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = 'unset';
      document.body.style.paddingRight = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = 'unset';
      document.body.style.paddingRight = '';
    };
  }, [showLowStockModal, infoModal]);

  const fetchDashboardData = async () => {
    try {
      let startDate: string;
      let endDate: string = new Date(new Date().setHours(23, 59, 59, 999)).toISOString();
      const now = new Date();

      if (dateRange === 'today') {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        startDate = start.toISOString();
      } else if (dateRange === 'week') {
        const start = new Date();
        const day = start.getDay();
        const diff = start.getDate() - day + (day === 0 ? -6 : 1);
        start.setDate(diff);
        start.setHours(0, 0, 0, 0);
        startDate = start.toISOString();
      } else if (dateRange === 'month') {
        const start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        startDate = start.toISOString();
      } else {
        // Custom
        startDate = new Date(customRange.start).toISOString();
        const end = new Date(customRange.end);
        end.setHours(23, 59, 59, 999);
        endDate = end.toISOString();
      }

      const { data, error } = await supabase.rpc('get_advanced_analytics', {
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) {
        console.error("RPC Error:", error);
        toast.error("Məlumatlar gətirilərkən xəta: " + error.message);
        return;
      }

      if (data) {
        setStats(data.stats);
        setCharts(data.charts);

        // Fetch low stock items for the modal
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
    { id: 'cash',           name: 'Kassa (Nəğd)',     rawValue: stats.kassa || 0,       suffix: ' ₼', decimals: 2, icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
    { id: 'revenue',        name: t('dashboard.revenue'), rawValue: stats.revenue,      suffix: ' ₼', decimals: 2, icon: DollarSign, color: 'text-green-600 dark:text-green-400',   bg: 'bg-green-100 dark:bg-green-900/30' },
    { id: 'netProfit',      name: 'Xalis Mənfəət',   rawValue: stats.netProfit || 0,   suffix: ' ₼', decimals: 2, icon: TrendingUp, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
    { id: 'aov',            name: 'Orta Satış (AOV)', rawValue: aov,                    suffix: ' ₼', decimals: 2, icon: ShoppingBag, color: 'text-blue-600 dark:text-blue-400',  bg: 'bg-blue-100 dark:bg-blue-900/30' },
    { id: 'inventoryValue', name: 'Anbar Dəyəri',     rawValue: stats.inventoryValue,   suffix: ' ₼', decimals: 2, icon: BarChart3, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' },
    { id: 'totalSupplierDebt', name: 'Təchizatçılara Borc', rawValue: stats.totalSupplierDebt, suffix: ' ₼', decimals: 2, icon: Coins, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
    { id: 'totalFixedAssets', name: t('dashboard.fixedAssets'), rawValue: stats.totalFixedAssets, suffix: ' ₼', decimals: 2, icon: Package, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
    { id: 'lowStock',       name: t('dashboard.lowStock'), rawValue: stats.lowStock,    suffix: '',   decimals: 0, icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30', isClickable: true },
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
          <h1 className="text-lg sm:text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('nav.dashboard')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Biznesinizin cari vəziyyəti
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 shadow-inner">
            {(['today', 'week', 'month', 'custom'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold rounded-lg transition-all duration-200 ${dateRange === range
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-white shadow-sm ring-1 ring-black/5'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
              >
                {range === 'today' ? 'Bugün' : range === 'week' ? 'Bu Həftə' : range === 'month' ? 'Bu Ay' : 'Manual'}
              </button>
            ))}
          </div>

          {dateRange === 'custom' && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 bg-white dark:bg-gray-800 p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm"
            >
              <input 
                type="date" 
                title="Başlanğıc tarixi"
                className="text-[10px] font-bold bg-transparent border-none focus:ring-0 p-0 text-gray-600 dark:text-gray-400"
                value={customRange.start}
                onChange={e => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
              />
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <input 
                type="date" 
                title="Son tarix"
                className="text-[10px] font-bold bg-transparent border-none focus:ring-0 p-0 text-gray-600 dark:text-gray-400"
                value={customRange.end}
                onChange={e => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
              />
            </motion.div>
          )}
        </div>
      </div>

      <motion.div
        variants={{
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
          }
        }}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
      >
        {cards.map((card) => (
          <motion.div
            key={card.id}
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0 }
            }}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
            onClick={() => {
              if (card.id === 'lowStock') {
                setShowLowStockModal(true);
              } else {
                const info = (reportInfo as any)[card.id];
                if (info) setInfoModal({ show: true, ...info });
              }
            }}
            className={`p-3 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-all duration-300 cursor-pointer hover:shadow-md ${card.bg}`}
          >
            <div className="flex flex-col gap-4">
              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${card.bg}`}>
                <card.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${card.color}`} aria-hidden="true" />
              </div>
              <dl>
                <dt className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{card.name}</dt>
                <dd className="text-base sm:text-2xl font-black text-gray-900 dark:text-white mt-1 leading-tight">
                  <AnimatedStat value={card.rawValue} suffix={card.suffix} decimals={card.decimals} />
                </dd>
              </dl>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Sales Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2 bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700"
        >
          <button 
            onClick={() => setInfoModal({ show: true, ...reportInfo.salesTrend })}
            className="w-full text-left"
          >
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-base sm:text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-500" />
                Satış Trendi
              </h2>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.salesData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} dy={15} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} dx={-15} />
                  <Tooltip
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                    itemStyle={{ fontWeight: 'bold' }}
                    cursor={{ fill: 'rgba(79, 70, 229, 0.1)' }}
                  />
                  <Bar dataKey="amount" fill="#4f46e5" radius={[8, 8, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </button>
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
                  title={mode === 'revenue' ? 'Gəlirə görə ABC Analizini göstər' : 'Mənfəətə görə ABC Analizini göstər'}
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

      {/* Low Stock Items Modal */}
      <AnimatePresence>
        {showLowStockModal && (
          <div className="fixed inset-0 z-[110] flex items-end lg:items-center justify-center p-0 lg:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowLowStockModal(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              onClick={e => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 lg:p-8 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl border border-gray-100 dark:border-gray-700 touch-pan-y pb-28 lg:pb-8"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('dashboard.lowStock')}</h3>
                </div>
                <button onClick={() => setShowLowStockModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" title="Bağla">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {lowStockItems.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">Bütün məhsullar kifayət qədərdir.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {lowStockItems.map(item => (
                    <div key={item.id} className="p-4 rounded-xl border border-gray-100 dark:border-gray-700 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">{item.name}</p>
                        <p className="text-xs text-red-500 font-black uppercase mt-1">Kritik: {item.critical_limit || 0} {item.unit}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-gray-900 dark:text-white">{item.stock_quantity} {item.unit}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Stokda</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Informational Modal */}
      <AnimatePresence>
        {infoModal?.show && (
          <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center p-0 lg:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={() => setInfoModal(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-8 w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl border border-gray-100 dark:border-gray-700 relative overflow-x-hidden touch-pan-y pb-28 lg:pb-8"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600" />
              <button 
                onClick={() => setInfoModal(null)}
                title="Bağla"
                className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
              
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 dark:text-white">{infoModal.title}</h3>
              </div>
              
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed font-medium">
                {infoModal.content}
              </p>
              
              <button 
                onClick={() => setInfoModal(null)}
                className="w-full mt-8 py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl font-black hover:opacity-90 transition-opacity"
              >
                Anladım
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
