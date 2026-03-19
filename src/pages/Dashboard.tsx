import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { TrendingUp, TrendingDown, Package, Users, DollarSign, X, AlertTriangle, ShoppingBag, PieChart, BarChart3, Calendar, Coins, Percent, ArrowUpRight, ArrowDownLeft, Wallet, Info, CreditCard } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart as RePieChart, Pie, Legend
} from 'recharts';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { useCountUp } from '../hooks/useCountUp';
import { cn } from '../lib/utils';

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
    totalFixedAssets: 0,
    kassa: 0,
    bank_balance: 0,
    netProfit: 0
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
  const [discrepancies, setDiscrepancies] = useState<any[]>([]);
  const [isResolving, setIsResolving] = useState(false);

  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [showLowStockModal, setShowLowStockModal] = useState(false);
  const [infoModal, setInfoModal] = useState<{ show: boolean; title: string; content: string } | null>(null);
  const [resolutionModal, setResolutionModal] = useState<{ show: boolean; discrepancy: any } | null>(null);
  const [resolutionForm, setResolutionForm] = useState({
    responsibleUserId: '',
    adminNotes: ''
  });

  const reportInfo = {
    kassa: {
      title: 'Kassa (Nağd və Bank)',
      content: 'Kassadakı cari pul qalığı. Nağd kassa və Bank hesabı üzrə ayrıca qalıqları və ümumi cəmi göstərir.'
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
    }
  };

  // 1. Core Logic Functions
  const fetchDashboardData = async () => {
    try {
      let startDate: string;
      let endDate: string = new Date(new Date().setHours(23, 59, 59, 999)).toISOString();

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
        const isValidDate = (d: any) => d && !isNaN(new Date(d).getTime());

        if (!isValidDate(customRange.start) || !isValidDate(customRange.end)) {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          startDate = start.toISOString();
        } else {
          try {
            startDate = new Date(customRange.start).toISOString();
            const end = new Date(customRange.end);
            end.setHours(23, 59, 59, 999);
            endDate = end.toISOString();
          } catch (e) {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            startDate = start.toISOString();
          }
        }
      }

      const { data, error } = await supabase.rpc('get_advanced_analytics', {
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) throw error;

      if (data) {
        setStats(data.stats);
        setCharts(data.charts);

        const { data: inventoryData, error: invError } = await supabase
          .from('inventory')
          .select('id, name, stock_quantity, critical_limit, unit');

        if (invError) throw invError;
        if (inventoryData) {
          const lowStock = inventoryData.filter(item => item.stock_quantity <= (item.critical_limit || 0));
          setLowStockItems(lowStock);
        }

        // Fetch shift discrepancies
        const { data: discData } = await supabase
          .from('shift_discrepancies')
          .select('*, reported_by:reported_by_id(name), verified_by:verified_by_id(name)')
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        setDiscrepancies(discData || []);
      }
    } catch (error: any) {
      console.error("Dashboard error:", error);
      toast.error("Dashboard məlumatları yüklənərkən xəta: " + error.message);
    }
  };

  const handleResolveDiscrepancy = async (id: string, userId: number | null, status: 'resolved' | 'dismissed' | 'enterprise_expense', notes: string = '') => {
    // Validate inputs
    if (status === 'resolved' && (userId === null || isNaN(userId))) {
      toast.error("Zəhmət olmasa məsul şəxsi seçin");
      return;
    }

    setIsResolving(true);
    try {
      const { error } = await supabase.rpc('resolve_shift_discrepancy_v4', {
        p_discrepancy_id: id,
        p_responsible_user_id: userId,
        p_admin_notes: notes,
        p_status: status
      });

      if (error) {
        console.error("RPC Error:", error);
        throw error;
      }

      toast.success(status === 'resolved' ? 'Uğurla həll edildi' : 'Ləğv edildi');
      setResolutionModal(null);
      fetchDashboardData();
    } catch (e: any) {
      console.error("Detailed Discrepancy Error:", e);
      toast.error('Xəta: ' + (e.details || e.message || 'Bilinməyən xəta'));
    } finally {
      setIsResolving(false);
    }
  };

  // 2. Lifecycle Effects
  const fetchTimeoutRef = useRef<NodeJS.Timeout>();

  const debouncedFetch = useCallback(() => {
    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    fetchTimeoutRef.current = setTimeout(() => {
      fetchDashboardData();
    }, 2000);
  }, [dateRange, customRange]);

  useEffect(() => {
    fetchDashboardData();

    const channel = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incomes' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_discrepancies' }, debouncedFetch)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    };
  }, [dateRange, customRange]);

  // Body scroll lock when modals are open
  useEffect(() => {
    const isModalOpen = showLowStockModal || infoModal?.show || resolutionModal?.show;
    if (isModalOpen) {
      document.documentElement.classList.add('scroll-locked');
    } else {
      document.documentElement.classList.remove('scroll-locked');
    }
    return () => { document.documentElement.classList.remove('scroll-locked'); };
  }, [showLowStockModal, infoModal, resolutionModal]);


  const aov = stats.transactions > 0 ? stats.revenue / stats.transactions : 0;

  const cards = [
    { id: 'revenue', name: t('dashboard.revenue'), rawValue: stats.revenue, suffix: ' ₼', decimals: 2, icon: ArrowUpRight, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
    { id: 'netProfit', name: t('dashboard.profit'), rawValue: stats.netProfit || 0, suffix: ' ₼', decimals: 2, icon: TrendingUp, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
    { id: 'aov', name: t('dashboard.aov'), rawValue: aov, suffix: ' ₼', decimals: 2, icon: ShoppingBag, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    { id: 'inventoryValue', name: t('dashboard.inventoryValue'), rawValue: stats.inventoryValue, suffix: ' ₼', decimals: 2, icon: BarChart3, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' },
    { id: 'totalSupplierDebt', name: t('common.totalDebt'), rawValue: stats.totalSupplierDebt, suffix: ' ₼', decimals: 2, icon: Coins, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
    { id: 'totalFixedAssets', name: t('dashboard.fixedAssets'), rawValue: stats.totalFixedAssets, suffix: ' ₼', decimals: 2, icon: Package, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
    { id: 'lowStock', name: t('dashboard.lowStock'), rawValue: stats.lowStock, suffix: '', decimals: 0, icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30', isClickable: true },
  ];

  const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-8 pb-10 p-4 sm:p-6 lg:p-8"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('nav.dashboard')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2 font-medium">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            Biznesinizin cari maliyyə və anbar vəziyyəti
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-inner">
            {(['today', 'week', 'month', 'custom'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={cn(
                  "px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-tight rounded-xl transition-all duration-200",
                  dateRange === range
                    ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-white shadow-sm ring-1 ring-black/5"
                    : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                )}
              >
                {range === 'today' ? 'Bugün' : range === 'week' ? 'Həftəlik' : range === 'month' ? 'Aylıq' : 'Manual'}
              </button>
            ))}
          </div>

          {dateRange === 'custom' && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 bg-white dark:bg-gray-800 p-2 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm"
            >
              <input
                type="date"
                title="Başlanğıc tarixi"
                className="text-xs font-bold bg-transparent border-none focus:ring-0 p-0 text-gray-600 dark:text-gray-400"
                value={customRange.start}
                onChange={e => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
              />
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <input
                type="date"
                title="Son tarix"
                className="text-xs font-bold bg-transparent border-none focus:ring-0 p-0 text-gray-600 dark:text-gray-400"
                value={customRange.end}
                onChange={e => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
              />
            </motion.div>
          )}
        </div>
      </div>

      {/* Shift Management Section (Admin Only) */}
      {discrepancies.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-[2rem] shadow-sm border-2 border-amber-100 dark:border-amber-900/20"
        >
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Növbə Uyğunsuzluqları (Dispute)
            </h3>
            <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
              {discrepancies.length} Gözləyən
            </span>
          </div>

          <div className="grid gap-4">
            {discrepancies.map((disc) => (
              <div key={disc.id} className="bg-gray-50 dark:bg-gray-900/30 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Təhvil verdi:</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{disc.reported_by?.name}</span>
                    <span className="text-gray-300 mx-1">/</span>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Təhvil aldı:</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{disc.verified_by?.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-1">
                    <div className="text-xs font-medium text-gray-500">Sistem: <span className="font-bold text-gray-700 dark:text-gray-300">{disc.system_expected.toFixed(2)} ₼</span></div>
                    <div className="text-xs font-medium text-gray-500">Təhvil verən: <span className="font-bold text-gray-700 dark:text-gray-300">{disc.seller_reported.toFixed(2)} ₼</span></div>
                    <div className="text-xs font-medium text-gray-500">Təhvil alan: {disc.verifier_counted !== null ? <span className="font-bold text-gray-700 dark:text-gray-300">{disc.verifier_counted.toFixed(2)} ₼</span> : <span className="font-bold text-orange-500">Səhər açılışı gözlənilir</span>}</div>
                    <div className={cn(
                      "text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-lg",
                      disc.difference < 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                    )}>
                      Fərq: {disc.difference.toFixed(2)} ₼
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    disabled={isResolving}
                    onClick={() => {
                      setResolutionModal({ show: true, discrepancy: disc });
                      setResolutionForm({
                        responsibleUserId: disc.reported_by_id?.toString() || '',
                        adminNotes: ''
                      });
                    }}
                    className="flex-1 md:flex-none px-6 py-2 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 dark:shadow-none"
                  >
                    Həll et
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden group"
      >
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
          <Wallet className="w-32 h-32" />
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl">
                <Wallet className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">{t('dashboard.totalKassa')}</h3>
                <p className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white tabular-nums tracking-tighter">
                  <AnimatedStat value={(stats.kassa || 0) + (stats.bank_balance || 0)} suffix=" ₼" />
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-12 flex-1 max-w-2xl">
            <div className="bg-gray-50/50 dark:bg-gray-900/30 p-6 rounded-3xl border border-gray-100/50 dark:border-gray-700/30 flex items-center justify-between group/cash hover:border-emerald-500/30 transition-colors">
              <div>
                <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">{t('dashboard.cash')}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">
                  <AnimatedStat value={stats.kassa || 0} suffix=" ₼" />
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center text-emerald-500 shadow-sm border border-gray-100 dark:border-gray-700 group-hover/cash:scale-110 transition-transform">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-gray-50/50 dark:bg-gray-900/30 p-6 rounded-3xl border border-gray-100/50 dark:border-gray-700/30 flex items-center justify-between group/bank hover:border-indigo-500/30 transition-colors">
              <div>
                <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">{t('dashboard.bank')}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">
                  <AnimatedStat value={stats.bank_balance || 0} suffix=" ₼" />
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center text-indigo-500 shadow-sm border border-gray-100 dark:border-gray-700 group-bank:scale-110 transition-transform">
                <CreditCard className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: { staggerChildren: 0.05 }
          }
        }}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4"
      >
        {cards.map((card) => (
          <motion.div
            key={card.id}
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0 }
            }}
            whileHover={{ y: -5 }}
            className={cn(
              "bg-white dark:bg-gray-800 p-5 sm:p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 transition-all cursor-pointer relative overflow-hidden group",
              card.id === 'netProfit' && "shadow-lg shadow-indigo-500/5 ring-1 ring-indigo-500/10"
            )}
            onClick={() => card.isClickable ? setShowLowStockModal(true) : setInfoModal({ show: true, title: reportInfo[card.id as keyof typeof reportInfo].title, content: reportInfo[card.id as keyof typeof reportInfo].content })}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-3 rounded-2xl", card.bg)}>
                <card.icon className={cn("w-6 h-6", card.color)} />
              </div>
              <Percent className="w-4 h-4 text-gray-200 dark:text-gray-700 group-hover:text-indigo-500 transition-colors" />
            </div>
            <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none mb-2">{card.name}</p>
            <p className={cn("text-xl sm:text-2xl font-black tabular-nums tracking-tighter", card.id === 'lowStock' && card.rawValue > 0 ? "text-orange-600" : "text-gray-900 dark:text-white")}>
              <AnimatedStat value={card.rawValue} suffix={card.suffix} decimals={card.decimals} />
            </p>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              Satış Trendi
            </h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.salesData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    borderRadius: '16px',
                    border: 'none',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    fontWeight: 900,
                    fontSize: '12px'
                  }}
                />
                <Area type="monotone" dataKey="amount" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expenses and Pie Charts */}
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                <PieChart className="w-4 h-4 text-emerald-500" />
                Xərc Bölüşümü
              </h3>
            </div>
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="h-[250px] w-full md:w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie
                      data={charts.expensesByCategory}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="amount"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {charts.expensesByCategory.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: '16px',
                        border: 'none',
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        fontWeight: 900,
                        fontSize: '12px'
                      }}
                    />
                  </RePieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                {charts.expensesByCategory.map((item: any, index: number) => (
                  <div key={index} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900/30 p-3 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest truncate">{item.name}</p>
                      <p className="text-xs font-bold text-gray-900 dark:text-white">
                        {item.amount.toFixed(2)} ₼
                      </p>
                    </div>
                  </div>
                ))}
                {charts.expensesByCategory.length === 0 && (
                  <div className="col-span-2 py-8 text-center text-gray-400 font-bold italic text-xs uppercase tracking-widest bg-gray-50 dark:bg-gray-900/30 rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-800">
                    Məlumat yoxdur
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>



      {/* Low Stock Modal */}
      <AnimatePresence>
        {showLowStockModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4 backdrop-blur-sm" onClick={() => setShowLowStockModal(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-3xl p-8 w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl border border-gray-100 dark:border-gray-700 custom-scrollbar"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Kritik Stok Həddi</h2>
                <button onClick={() => setShowLowStockModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all" title="Bağla">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              {lowStockItems.length === 0 ? (
                <div className="py-12 text-center text-gray-400 font-bold italic">Bütün məhsulların stoku yetərlidir.</div>
              ) : (
                <div className="grid gap-3">
                  {lowStockItems.map((item, idx) => (
                    <div key={idx} className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white text-sm">{item.name}</p>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Kritik hədd: {item.critical_limit || 0}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-orange-600 tabular-nums">{item.stock_quantity}</p>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{item.unit}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Resolution Modal */}
      <AnimatePresence>
        {resolutionModal?.show && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4 backdrop-blur-sm" onClick={() => setResolutionModal(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-3xl p-8 w-full max-w-lg shadow-2xl border border-gray-100 dark:border-gray-700"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Uyğunsuzluğu həll et</h3>
                </div>
                <button onClick={() => setResolutionModal(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all" title="Bağla">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="space-y-6 mb-8">
                <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-900/40 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Gözlənilən</span>
                    <span className="font-bold text-gray-900 dark:text-white">{resolutionModal.discrepancy.system_expected.toFixed(2)} ₼</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Fərq</span>
                    <span className={cn("font-black tracking-tight", resolutionModal.discrepancy.difference < 0 ? "text-red-500" : "text-emerald-500")}>
                      {resolutionModal.discrepancy.difference.toFixed(2)} ₼
                    </span>
                  </div>
                </div>

                {resolutionModal.discrepancy.difference < 0 && (
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Məsul Şəxs</label>
                    <select
                      title="Məsul Şəxs"
                      className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
                      value={resolutionForm.responsibleUserId}
                      onChange={e => setResolutionForm({ ...resolutionForm, responsibleUserId: e.target.value })}
                    >
                      <option value="">İstifadəçi seçin...</option>
                      <option value={resolutionModal.discrepancy.reported_by_id}>{resolutionModal.discrepancy.reported_by?.name} (Təhvil verən)</option>
                      <option value={resolutionModal.discrepancy.verified_by_id}>{resolutionModal.discrepancy.verified_by?.name} (Təhvil alan)</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Admin Qeydi</label>
                  <textarea
                    rows={3}
                    className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none"
                    placeholder="Həll yolu barədə qeydlər..."
                    value={resolutionForm.adminNotes}
                    onChange={e => setResolutionForm({ ...resolutionForm, adminNotes: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-4">
                <div className="flex gap-4">
                  <button
                    onClick={() => handleResolveDiscrepancy(resolutionModal.discrepancy.id, null, 'dismissed', resolutionForm.adminNotes)}
                    disabled={isResolving}
                    className="flex-1 bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-50 hover:text-red-600 border border-gray-100 dark:border-gray-700 transition-all"
                  >
                    {resolutionModal.discrepancy.difference > 0 ? 'Səhv qeyd kimi sil' : 'Borc yazmadan ləğv et'}
                  </button>
                  <button
                    onClick={() => handleResolveDiscrepancy(
                      resolutionModal.discrepancy.id,
                      resolutionForm.responsibleUserId ? parseInt(resolutionForm.responsibleUserId) : null,
                      'resolved',
                      resolutionForm.adminNotes
                    )}
                    disabled={isResolving || (resolutionModal.discrepancy.difference < 0 && !resolutionForm.responsibleUserId)}
                    className="flex-[1.5] bg-indigo-600 text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none disabled:opacity-50"
                  >
                    {isResolving 
                      ? 'İşlənilir...' 
                      : (resolutionModal.discrepancy.difference > 0 ? 'Təsdiqlə və Gəlir kimi saxla' : 'Təsdiqlə və Borc yaz')}
                  </button>
                </div>

                {resolutionModal.discrepancy.difference < 0 && (
                  <button
                    onClick={() => handleResolveDiscrepancy(
                      resolutionModal.discrepancy.id,
                      resolutionForm.responsibleUserId ? parseInt(resolutionForm.responsibleUserId) : null,
                      'enterprise_expense',
                      resolutionForm.adminNotes
                    )}
                    disabled={isResolving}
                    className="w-full py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-amber-50 dark:bg-amber-900/20 text-amber-600 border border-amber-100 dark:border-amber-800 hover:bg-amber-100 transition-all"
                  >
                    Müəssisə xərci kimi qeyd et (Bağışla)
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Info Modal */}
      <AnimatePresence>
        {infoModal?.show && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4 backdrop-blur-sm" onClick={() => setInfoModal(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-3xl p-8 w-full max-w-md shadow-2xl border border-gray-100 dark:border-gray-700"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600">
                  <Info className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{infoModal.title}</h3>
              </div>
              <p className="text-gray-600 dark:text-gray-400 font-medium leading-relaxed mb-8">
                {infoModal.content}
              </p>
              <button
                onClick={() => setInfoModal(null)}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
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
