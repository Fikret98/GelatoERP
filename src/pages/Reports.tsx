import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Plus, Download, FileText, FileSpreadsheet, X, ShoppingBag, Calendar, User, Percent, DollarSign, TrendingUp, TrendingDown, Coins, Briefcase, Info, Calculator } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { useShift } from '../contexts/ShiftContext';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { cn } from '../lib/utils';

export default function Reports() {
  const { t } = useLanguage();
  const { activeShift } = useShift();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'sale' | 'expense' | 'income'>('all');
  const [dateFilters, setDateFilters] = useState({ start: '', end: '' });
  
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [expenseData, setExpenseData] = useState({ date: format(new Date(), "yyyy-MM-dd'T'HH:mm"), category: '', amount: '', description: '', payment_method: 'cash' });
  const [incomeData, setIncomeData] = useState({ date: format(new Date(), "yyyy-MM-dd'T'HH:mm"), category: 'Kassa mədaxil', amount: '', description: '', payment_method: 'cash' });
  
  const [selectedTransaction, setSelectedTransaction] = useState<any | null>(null);
  const [saleDetails, setSaleDetails] = useState<any[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [totalCogs, setTotalCogs] = useState(0);

  const handleTransactionClick = async (transaction: any) => {
    setSelectedTransaction(transaction);
    if (transaction.type === 'sale') {
      setIsLoadingDetails(true);
      try {
        const { data, error } = await supabase
          .from('sale_items')
          .select('*, products(name)')
          .eq('sale_id', transaction.id);
        
        if (error) throw error;
        
        const productIds = (data || []).map(item => item.product_id);
        const { data: costData } = await supabase
          .from('product_costs_view')
          .select('*')
          .in('product_id', productIds);
        
        const costMap = new Map((costData || []).map(c => [c.product_id, c.calculated_cost_price]));
        
        const itemsWithCost = (data || []).map(item => ({
          ...item,
          cost_price: costMap.get(item.product_id) || 0
        }));

        setSaleDetails(itemsWithCost);
      } catch (e) {
        console.error(e);
        toast.error('Detallar yüklənərkən xəta');
      } finally {
        setIsLoadingDetails(false);
      }
    } else if (transaction.type === 'expense' && transaction.category === 'Alış' && transaction.purchase_id) {
      setIsLoadingDetails(true);
      try {
        const { data, error } = await supabase
          .from('inventory_purchases')
          .select('*, inventory(name), suppliers(name)')
          .eq('id', transaction.purchase_id)
          .single();
        
        if (error) throw error;
        setSaleDetails(data ? [data] : []);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoadingDetails(false);
      }
    } else if (transaction.type === 'expense' && transaction.category === 'Əsas Vəsait Alışı' && transaction.asset_id) {
      setIsLoadingDetails(true);
      try {
        const { data, error } = await supabase
          .from('fixed_assets')
          .select('*, suppliers(name)')
          .eq('id', transaction.asset_id)
          .single();
        
        if (error) throw error;
        setSaleDetails(data ? [data] : []);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoadingDetails(false);
      }
    } else {
      setSaleDetails([]);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoadingPage(true);
      const { data, error } = await supabase
        .from('all_transactions_view')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
      
      // Also fetch total COGS for Net Profit
      const { data: cogsData, error: cogsError } = await supabase.from('total_cogs_view').select('total_cogs').maybeSingle();
      if (cogsData) setTotalCogs(cogsData.total_cogs || 0);
    } catch (e) {
      console.error(e);
      toast.error(t('pos.error'));
    } finally {
      setIsLoadingPage(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesType = activeTab === 'all' || t.type === activeTab;
      const tDate = new Date(t.date);
      const matchesStart = !dateFilters.start || tDate >= new Date(dateFilters.start);
      const matchesEnd = !dateFilters.end || tDate <= new Date(dateFilters.end + 'T23:59:59');
      return matchesType && matchesStart && matchesEnd;
    });
  }, [transactions, activeTab, dateFilters]);

  const summary = useMemo(() => {
    return filteredTransactions.reduce((acc, t) => {
      if (t.type === 'sale' || t.type === 'income') acc.totalIn += t.amount;
      else if (t.type === 'expense') acc.totalOut += t.amount;
      return acc;
    }, { totalIn: 0, totalOut: 0 });
  }, [filteredTransactions]);

  const netProfit = useMemo(() => {
    const revenue = filteredTransactions
      .filter(t => t.type === 'sale')
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    return revenue - expenses - (revenue > 0 ? (totalCogs * (revenue / (summary.totalIn || 1))) : 0);
  }, [filteredTransactions, totalCogs, summary.totalIn]);

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!user) return;
      const amount = parseFloat(expenseData.amount);
      
      const { data: balance, error: balanceErr } = await supabase.rpc(
        expenseData.payment_method === 'cash' ? 'get_current_cash_balance' : 'get_current_bank_balance'
      );
      if (balanceErr) throw balanceErr;
      
      if (amount > (balance || 0)) {
        const accountName = expenseData.payment_method === 'cash' ? 'Kassada' : 'Bank hesabında';
        toast.error(`${accountName} kifayət qədər məbləğ yoxdur. Mövcud qalıq: ${Number(balance).toFixed(2)} ₼`);
        return;
      }

      const { error } = await supabase.from('expenses').insert([{
        ...expenseData,
        date: new Date(expenseData.date).toISOString(),
        amount: parseFloat(expenseData.amount),
        user_id: user.id,
        shift_id: activeShift?.id
      }]);

      if (error) throw error;

      setShowExpenseModal(false);
      toast.success(t('reports.addExpense'));
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error('Xəta baş verdi: ' + e.message);
    }
  };

  const handleIncomeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!user) return;
      const { error } = await supabase.from('incomes').insert([{
        ...incomeData,
        date: new Date(incomeData.date).toISOString(),
        amount: parseFloat(incomeData.amount),
        user_id: user.id,
        shift_id: activeShift?.id
      }]);

      if (error) throw error;

      setShowIncomeModal(false);
      toast.success('Mədaxil əlavə edildi');
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error('Xəta baş verdi: ' + e.message);
    }
  };

  const exportToExcel = () => {
    const data = filteredTransactions.map(t => ({
      'Tarix': format(new Date(t.date), 'dd.MM.yyyy HH:mm'),
      'Növ': t.type === 'sale' ? 'Satış' : t.type === 'expense' ? 'Xərc' : 'Mədaxil',
      'Kateqoriya': t.category || (t.type === 'sale' ? 'Satış' : ''),
      'Məbləğ (₼)': (t.type === 'expense' ? -1 : 1) * t.amount,
      'İcraçı': t.users?.name || '',
      'Açıqlama': t.description || ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tranzaksiyalar");
    XLSX.writeFile(wb, `Tranzaksiyalar_${format(new Date(), 'dd_MM_yyyy')}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Gelato ERP - Tranzaksiyalar', 14, 22);
    
    const body = filteredTransactions.map(t => [
      format(new Date(t.date), 'dd.MM.yyyy HH:mm'),
      t.type === 'sale' ? 'Satış' : t.type === 'expense' ? 'Xərc' : 'Mədaxil',
      t.category || (t.type === 'sale' ? 'Satış' : ''),
      `${((t.type === 'expense' ? -1 : 1) * t.amount).toFixed(2)} ₼`,
      t.users?.name || ''
    ]);

    (doc as any).autoTable({
      startY: 30,
      head: [['Tarix', 'Növ', 'Kateqoriya', 'Məbləğ', 'İcraçı']],
      body: body,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`Tranzaksiyalar_${format(new Date(), 'dd_MM_yyyy')}.pdf`);
  };

  useEffect(() => {
    if (selectedTransaction || showExpenseModal || showIncomeModal) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100vw';
      document.body.style.overflow = 'hidden';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = 'unset';
      if (scrollY) window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = 'unset';
    };
  }, [selectedTransaction, showExpenseModal, showIncomeModal]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      {isLoadingPage ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <LoadingSpinner message="Məlumatlar yüklənir..." />
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div>
              <h1 className="text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('nav.reports')}</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2 font-medium">
                <TrendingUp className="w-4 h-4 text-indigo-500" />
                Tranzaksiyaların mərkəzləşdirilmiş idarəolunması
              </p>
            </div>
            <div className="grid grid-cols-2 sm:flex sm:flex-nowrap items-center gap-3 w-full lg:w-auto">
              <button onClick={exportToExcel} className="flex justify-center bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-3 sm:px-5 py-3 rounded-2xl flex items-center hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all font-bold border border-emerald-100 dark:border-emerald-800 text-xs sm:text-sm">
                <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" />
                Excel
              </button>
              <button onClick={exportToPDF} className="flex justify-center bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-3 sm:px-5 py-3 rounded-2xl flex items-center hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-all font-bold border border-rose-100 dark:border-rose-800 text-xs sm:text-sm">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" />
                PDF
              </button>
              <button onClick={() => setShowExpenseModal(true)} className="flex justify-center bg-red-600 text-white px-3 sm:px-5 py-3 rounded-2xl flex items-center hover:bg-red-700 transition-all shadow-lg shadow-red-500/20 font-bold text-xs sm:text-sm">
                <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" />
                {t('reports.addExpense')}
              </button>
              <button onClick={() => setShowIncomeModal(true)} className="flex justify-center bg-indigo-600 text-white px-3 sm:px-5 py-3 rounded-2xl flex items-center hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 font-bold text-xs sm:text-sm">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" />
                Mədaxil
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <motion.div whileHover={{ y: -5 }} className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Cəmi Mədaxil</p>
                  <p className="text-2xl font-black text-emerald-600 tabular-nums">{summary.totalIn.toFixed(2)} ₼</p>
                </div>
              </div>
            </motion.div>
            <motion.div whileHover={{ y: -5 }} className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                  <TrendingDown className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Cəmi Məxaric</p>
                  <p className="text-2xl font-black text-rose-600 tabular-nums">{summary.totalOut.toFixed(2)} ₼</p>
                </div>
              </div>
            </motion.div>
            <motion.div whileHover={{ y: -5 }} className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Coins className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Xalis Qalıq</p>
                  <p className="text-2xl font-black text-blue-600 tabular-nums">{(summary.totalIn - summary.totalOut).toFixed(2)} ₼</p>
                </div>
              </div>
            </motion.div>
            <motion.div whileHover={{ y: -5 }} className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 shadow-lg shadow-indigo-500/5 ring-1 ring-indigo-500/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                  <Briefcase className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Xalis Mənfəət</p>
                  <p className="text-2xl font-black text-indigo-600 tabular-nums">{netProfit.toFixed(2)} ₼</p>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col lg:flex-row gap-4">
            <div className="flex flex-wrap bg-gray-100 dark:bg-gray-900/50 p-1.5 rounded-2xl gap-1">
              {(['all', 'sale', 'expense', 'income'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-6 py-2 rounded-xl text-xs font-black uppercase tracking-tight transition-all",
                    activeTab === tab
                      ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-400"
                  )}
                >
                  {tab === 'all' ? 'Hamısı' : tab === 'sale' ? 'Satışlar' : tab === 'expense' ? 'Xərclər' : 'Mədaxillər'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 lg:ml-auto">
              <div className="relative group">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                <input 
                  type="date" 
                  title="Başlanğıc tarixi"
                  className="pl-11 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  value={dateFilters.start}
                  onChange={e => setDateFilters({ ...dateFilters, start: e.target.value })}
                />
              </div>
              <span className="text-gray-300 dark:text-gray-600 font-bold">-</span>
              <div className="relative group">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                <input 
                  type="date" 
                  title="Son tarix"
                  className="pl-11 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  value={dateFilters.end}
                  onChange={e => setDateFilters({ ...dateFilters, end: e.target.value })}
                />
              </div>
              {(dateFilters.start || dateFilters.end) && (
                <button 
                  onClick={() => setDateFilters({ start: '', end: '' })}
                  className="p-2.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-xl hover:text-red-500 transition-colors"
                  title="Təmizlə"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {filteredTransactions.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-3xl p-12 text-center border border-dashed border-gray-200 dark:border-gray-700">
                <div className="w-16 h-16 bg-gray-50 dark:bg-gray-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Info className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-400 font-medium">Bu kriteriyalara uyğun heç bir tranzaksiya tapılmadı.</p>
              </div>
            ) : (
              filteredTransactions.map((t) => (
                <motion.div
                  layout
                  key={`${t.type}-${t.id}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white dark:bg-gray-800 p-3 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all cursor-pointer group flex items-center gap-3 sm:gap-4"
                  onClick={() => handleTransactionClick(t)}
                >
                  <div className={cn(
                    "w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110",
                    t.type === 'sale' ? "bg-emerald-100 dark:bg-emerald-900/30" :
                    t.type === 'income' ? "bg-indigo-100 dark:bg-indigo-900/30" :
                    "bg-rose-100 dark:bg-rose-900/30"
                  )}>
                    {t.type === 'sale' ? (
                      <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 dark:text-emerald-400" />
                    ) : t.type === 'income' ? (
                      <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <TrendingDown className="w-5 h-5 sm:w-6 sm:h-6 text-rose-600 dark:text-rose-400" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-black text-gray-900 dark:text-white text-sm sm:text-base truncate">
                        {t.type === 'sale' ? `Sifariş #${t.id}` : t.category}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-y-0.5 gap-x-3 text-[9px] sm:text-xs font-bold text-gray-400 dark:text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(t.date), 'dd.MM.yy HH:mm')}
                      </span>
                      <span className="flex items-center gap-1 uppercase tracking-tight">
                        <User className="w-3 h-3" />
                        {t.user_name || '-'}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className={cn(
                      "text-base sm:text-xl font-black tabular-nums",
                      (t.type === 'sale' || t.type === 'income') ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    )}>
                      {(t.type === 'expense' ? '-' : '+')}{t.amount.toFixed(2)} ₼
                    </p>
                    <p className="text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5 flex items-center justify-end gap-1">
                      {t.payment_method === 'card' ? <Coins className="w-2.5 h-2.5" /> : <DollarSign className="w-2.5 h-2.5" />}
                      {t.type === 'sale' ? (t.payment_method === 'card' ? 'Kassa' : 'Nağd Satış') : t.type === 'income' ? 'Mədaxil' : 'Məxaric'}
                    </p>
                  </div>
                </motion.div>
              ))
            )}
          </div>

          <AnimatePresence>
            {selectedTransaction && (
              <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[100] p-0 lg:p-4 backdrop-blur-sm" onClick={() => setSelectedTransaction(null)}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 30 }}
                  onClick={e => e.stopPropagation()}
                  className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-3xl p-6 lg:p-8 w-full max-w-2xl max-h-[85vh] lg:max-h-[92vh] overflow-y-auto shadow-2xl border border-gray-100 dark:border-gray-700 custom-scrollbar touch-pan-y pb-28 lg:pb-8"
                >
                  <div className="w-12 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-4 lg:hidden" />
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <div className={cn(
                        "inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-3",
                        selectedTransaction.type === 'sale' ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30" : "bg-rose-100 text-rose-600 dark:bg-rose-900/30"
                      )}>
                        Tranzaksiya Detalları
                      </div>
                      <h2 className="text-3xl font-black text-gray-900 dark:text-white uppercase">
                        {selectedTransaction.type === 'sale' ? `Sifariş #${selectedTransaction.id}` : selectedTransaction.category}
                      </h2>
                    </div>
                    <button onClick={() => setSelectedTransaction(null)} className="p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-2xl transition-all" title="Bağla">
                      <X className="w-6 h-6 text-gray-400" />
                    </button>
                  </div>

                  <div className="space-y-8">
                    <div className="flex flex-wrap gap-8 items-center justify-between bg-gray-50 dark:bg-gray-900/50 p-6 rounded-3xl border border-gray-100 dark:border-gray-700">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tarix</p>
                        <p className="font-bold text-gray-900 dark:text-white text-base">{format(new Date(selectedTransaction.date), 'dd.MM.yyyy HH:mm')}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ödəniş Üsulu</p>
                        <p className="font-bold text-indigo-600 dark:text-indigo-400 uppercase text-xs tracking-tighter sm:text-base">
                          {selectedTransaction.payment_method === 'card' ? '💳 Kassa' : '💵 Nağd'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">İcraçı</p>
                        <p className="font-bold text-gray-900 dark:text-white text-base uppercase tracking-tighter">{selectedTransaction.user_name || '-'}</p>
                      </div>
                    </div>

                    {selectedTransaction.type === 'sale' && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                          <ShoppingBag className="w-4 h-4 text-indigo-500" />
                          Məhsul Siyahısı
                        </h3>
                        {isLoadingDetails ? (
                          <div className="py-12 flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900/30 rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-800">
                            <LoadingSpinner />
                          </div>
                        ) : (
                          <div className="grid gap-3">
                            {saleDetails.map((item, idx) => (
                              <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-2xl flex items-center justify-between border border-gray-100 dark:border-gray-700 hover:border-indigo-500/20 transition-all shadow-sm">
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-gray-900 dark:text-white text-xs sm:text-sm truncate">{item.products?.name}</p>
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] sm:text-[10px] text-gray-400 font-bold">
                                    <span>{item.quantity} ədəd × {item.price.toFixed(2)} ₼</span>
                                    {item.cost_price > 0 && (
                                      <>
                                        <span className="text-gray-300 dark:text-gray-700">•</span>
                                        <span className="text-emerald-500/80">Marja: {(((item.price - item.cost_price) / item.price) * 100).toFixed(0)}%</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right ml-4">
                                  <p className="font-black text-gray-900 dark:text-white text-xs sm:text-sm">{(item.quantity * item.price).toFixed(2)} ₼</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {selectedTransaction.type === 'expense' && selectedTransaction.category === 'Alış' && selectedTransaction.purchase_id && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                          <ShoppingBag className="w-4 h-4 text-indigo-500" />
                          Alış Detalları
                        </h3>
                        {isLoadingDetails ? (
                          <div className="py-12 flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900/30 rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-800">
                            <LoadingSpinner />
                          </div>
                        ) : (
                          <div className="grid gap-3">
                            {saleDetails.map((item, idx) => (
                              <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-900 dark:text-white text-xs sm:text-sm truncate">{item.inventory?.name}</p>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Təchizatçı: {item.suppliers?.name || '-'}</p>
                                  </div>
                                  <div className="text-right ml-4">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Məbləğ</p>
                                    <p className="font-black text-gray-900 dark:text-white text-xs sm:text-sm">{(item.quantity * item.unit_price).toFixed(2)} ₼</p>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-50 dark:border-gray-700/50">
                                  <div>
                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Kəmiyyət</p>
                                    <p className="text-xs font-bold text-gray-900 dark:text-white">{item.quantity} {item.inventory?.unit || 'ədəd'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Vahid Qiymət</p>
                                    <p className="text-xs font-bold text-gray-900 dark:text-white">{item.unit_price?.toFixed(2)} ₼</p>
                                  </div>
                                </div>
                                <div className="mt-4 p-3 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100/50 dark:border-indigo-800/30 flex justify-between items-center">
                                  <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Ödənilən Məbləğ</p>
                                  <p className="font-black text-indigo-600 dark:text-indigo-400">{item.amount_paid?.toFixed(2)} ₼</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {selectedTransaction.type === 'expense' && selectedTransaction.category === 'Əsas Vəsait Alışı' && selectedTransaction.asset_id && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                          <Briefcase className="w-4 h-4 text-indigo-500" />
                          Əsas Vəsait Detalları
                        </h3>
                        {isLoadingDetails ? (
                          <div className="py-12 flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900/30 rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-800">
                            <LoadingSpinner />
                          </div>
                        ) : (
                          <div className="grid gap-3">
                            {saleDetails.map((item, idx) => (
                              <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-900 dark:text-white text-xs sm:text-sm truncate">{item.name}</p>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Təchizatçı: {item.suppliers?.name || '-'}</p>
                                  </div>
                                  <div className="text-right ml-4">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Məbləğ</p>
                                    <p className="font-black text-gray-900 dark:text-white text-xs sm:text-sm">{item.cost?.toFixed(2)} ₼</p>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-50 dark:border-gray-700/50">
                                  <div>
                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Kəmiyyət</p>
                                    <p className="text-xs font-bold text-gray-900 dark:text-white">{item.quantity} ədəd</p>
                                  </div>
                                  <div>
                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Vahid Qiymət</p>
                                    <p className="text-xs font-bold text-gray-900 dark:text-white">{item.unit_price?.toFixed(2) || (item.cost / item.quantity).toFixed(2)} ₼</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {selectedTransaction.type === 'sale' && !isLoadingDetails && (
                      <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Maliyyə Göstəriciləri</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Calculator className="w-3.5 h-3.5 text-gray-400" />
                              <p className="text-[9px] font-black text-gray-400 uppercase tracking-tight">Maya</p>
                            </div>
                            <p className="font-bold text-gray-900 dark:text-white text-base">
                              {saleDetails.reduce((sum, item) => sum + (item.cost_price * item.quantity), 0).toFixed(2)} <span className="text-xs">₼</span>
                            </p>
                          </div>
                          <div className="bg-emerald-50/50 dark:bg-emerald-900/10 p-4 rounded-2xl border border-emerald-100/50 dark:border-emerald-800/30">
                            <div className="flex items-center gap-1.5 mb-2">
                              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                              <p className="text-[9px] font-black text-emerald-500 uppercase tracking-tight">Qazanc</p>
                            </div>
                            <p className="font-black text-emerald-600 dark:text-emerald-400 text-base">
                              {(selectedTransaction.amount - saleDetails.reduce((sum, item) => sum + (item.cost_price * item.quantity), 0)).toFixed(2)} <span className="text-xs">₼</span>
                            </p>
                          </div>
                          <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-4 rounded-2xl border border-indigo-100/50 dark:border-indigo-800/30 col-span-2 sm:col-span-1">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Percent className="w-3.5 h-3.5 text-indigo-500" />
                              <p className="text-[9px] font-black text-indigo-500 uppercase tracking-tight">Ümumi Marja</p>
                            </div>
                            <p className="font-black text-indigo-600 dark:text-indigo-400 text-base">
                              {selectedTransaction.amount > 0 
                                ? (((selectedTransaction.amount - saleDetails.reduce((sum, item) => sum + (item.cost_price * item.quantity), 0)) / selectedTransaction.amount) * 100).toFixed(1)
                                : 0}%
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedTransaction.description && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Açıqlama</p>
                        <p className="text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl font-medium leading-relaxed italic border border-gray-100 dark:border-gray-700">
                          "{selectedTransaction.description}"
                        </p>
                      </div>
                    )}

                    <div className="pt-4 sm:pt-6 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                      <span className="font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-xs sm:text-sm">Yekun Məbləğ</span>
                      <span className={cn(
                        "text-2xl sm:text-4xl font-black tabular-nums",
                        (selectedTransaction.type === 'sale' || selectedTransaction.type === 'income') ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                      )}>
                        {(selectedTransaction.type === 'expense' ? '-' : '+')}{selectedTransaction.amount.toFixed(2)} <span className="text-base sm:text-xl font-bold">₼</span>
                      </span>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {showExpenseModal && (
            <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[100] p-0 lg:p-4 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 lg:p-8 w-full max-w-md max-h-[85vh] lg:max-h-[90vh] overflow-y-auto shadow-2xl pb-28 lg:pb-8"
              >
                <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 lg:hidden" />
                <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{t('reports.addExpenseTitle')}</h2>
                <form onSubmit={handleExpenseSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="expense-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.date')}</label>
                    <input id="expense-date" required type="datetime-local" title={t('common.date')} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={expenseData.date} onChange={e => setExpenseData({ ...expenseData, date: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="expense-category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('reports.category')}</label>
                    <select id="expense-category" required title={t('reports.category')} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={expenseData.category} onChange={e => setExpenseData({ ...expenseData, category: e.target.value })}>
                      <option value="">{t('common.select')}</option>
                      <option value="İcarə">{t('reports.rent')}</option>
                      <option value="Kommunal">{t('reports.utilities')}</option>
                      <option value="Maaş">{t('reports.salary')}</option>
                      <option value="Digər">{t('reports.other')}</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="expense-amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.cost')} (₼)</label>
                    <input id="expense-amount" required type="number" step="0.01" title={t('common.cost')} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={expenseData.amount} onChange={e => setExpenseData({ ...expenseData, amount: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="expense-desc" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.description')}</label>
                    <textarea id="expense-desc" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" rows={3} value={expenseData.description} onChange={e => setExpenseData({ ...expenseData, description: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ödəniş Üsulu</label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['cash', 'bank'] as const).map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setExpenseData({ ...expenseData, payment_method: method })}
                          className={cn(
                            "py-3 rounded-xl border-2 font-bold text-sm transition-all flex items-center justify-center gap-2",
                            expenseData.payment_method === method
                              ? "border-indigo-600 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:border-indigo-400 dark:text-indigo-400"
                              : "border-gray-100 dark:border-gray-700 text-gray-500 hover:border-gray-200"
                          )}
                        >
                          {method === 'cash' ? <DollarSign className="w-4 h-4" /> : <Coins className="w-4 h-4" />}
                          {method === 'cash' ? 'Nağd' : 'Bank'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setShowExpenseModal(false)} className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-3 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all">{t('common.cancel')}</button>
                    <button type="submit" className="flex-1 bg-red-600 text-white px-4 py-3 rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-500/20">{t('common.save')}</button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}

          {showIncomeModal && (
            <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[100] p-0 lg:p-4 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 lg:p-8 w-full max-w-md max-h-[85vh] lg:max-h-[90vh] overflow-y-auto shadow-2xl pb-28 lg:pb-8"
              >
                <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 lg:hidden" />
                <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Yeni Mədaxil</h2>
                <form onSubmit={handleIncomeSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="income-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.date')}</label>
                    <input id="income-date" required type="datetime-local" title={t('common.date')} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={incomeData.date} onChange={e => setIncomeData({ ...incomeData, date: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="income-category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kateqoriya</label>
                    <input id="income-category" required type="text" title="Kateqoriya" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={incomeData.category} onChange={e => setIncomeData({ ...incomeData, category: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="income-amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Məbləğ (₼)</label>
                    <input id="income-amount" required type="number" step="0.01" title="Məbləğ" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={incomeData.amount} onChange={e => setIncomeData({ ...incomeData, amount: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="income-desc" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.description')}</label>
                    <textarea id="income-desc" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" rows={3} value={incomeData.description} onChange={e => setIncomeData({ ...incomeData, description: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mədaxil Hesabı</label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['cash', 'bank'] as const).map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setIncomeData({ ...incomeData, payment_method: method })}
                          className={cn(
                            "py-3 rounded-xl border-2 font-bold text-sm transition-all flex items-center justify-center gap-2",
                            incomeData.payment_method === method
                              ? "border-indigo-600 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:border-indigo-400 dark:text-indigo-400"
                              : "border-gray-100 dark:border-gray-700 text-gray-500 hover:border-gray-200"
                          )}
                        >
                          {method === 'cash' ? <DollarSign className="w-4 h-4" /> : <Coins className="w-4 h-4" />}
                          {method === 'cash' ? 'Nağd Kassa' : 'Bank Hesabı'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setShowIncomeModal(false)} className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-3 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all">{t('common.cancel')}</button>
                    <button type="submit" className="flex-1 bg-indigo-600 text-white px-4 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20">{t('common.save')}</button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
