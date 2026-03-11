import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Plus, Download, FileText, FileSpreadsheet } from 'lucide-react';
import { motion } from 'motion/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function Reports() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [incomes, setIncomes] = useState<any[]>([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [expenseData, setExpenseData] = useState({ date: format(new Date(), 'yyyy-MM-dd HH:mm'), category: '', amount: '', description: '' });
  const [incomeData, setIncomeData] = useState({ date: format(new Date(), 'yyyy-MM-dd HH:mm'), category: 'Kassa mədaxil', amount: '', description: '' });
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [saleDetails, setSaleDetails] = useState<any[]>([]);
  const [selectedExpense, setSelectedExpense] = useState<any | null>(null);
  const [selectedIncome, setSelectedIncome] = useState<any | null>(null);

  const handleSaleClick = async (sale: any) => {
    setSelectedSale(sale);
    try {
      const { data, error } = await supabase
        .from('sale_items')
        .select('*, products(name)')
        .eq('sale_id', sale.id);
      if (error) throw error;
      setSaleDetails(data || []);
    } catch (e) {
      console.error(e);
      toast.error('Detallar yüklənərkən xəta');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [
        { data: salesData, error: salesErr },
        { data: expData, error: expErr },
        { data: incData, error: incErr }
      ] = await Promise.all([
        supabase.from('sales').select('*, users(name)').order('date', { ascending: false }),
        supabase.from('expenses').select('*, users(name)').order('date', { ascending: false }),
        supabase.from('incomes').select('*, users(name)').order('date', { ascending: false })
      ]);

      if (salesErr) throw salesErr;
      if (expErr) throw expErr;
      if (incErr) throw incErr;

      setSales(salesData || []);
      setExpenses(expData || []);
      setIncomes(incData || []);
    } catch (e) {
      console.error(e);
      toast.error('Məlumatların yüklənməsində xəta');
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('expenses').insert([{
        ...expenseData,
        amount: parseFloat(expenseData.amount),
        user_id: user?.id ? parseInt(user.id) : null
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
      const { error } = await supabase.from('incomes').insert([{
        ...incomeData,
        amount: parseFloat(incomeData.amount),
        user_id: user?.id ? parseInt(user.id) : null
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
    const wb = XLSX.utils.book_new();

    // Sales Sheet
    const salesData = sales.map(s => ({
      'Tarix': format(new Date(s.date), 'dd.MM.yyyy HH:mm'),
      'Məbləğ (₼)': s.total_amount
    }));
    const wsSales = XLSX.utils.json_to_sheet(salesData);
    XLSX.utils.book_append_sheet(wb, wsSales, "Satışlar");

    // Expenses Sheet
    const expData = expenses.map(e => ({
      'Tarix': format(new Date(e.date), 'dd.MM.yyyy HH:mm'),
      'İcraçı': e.users?.name || e.category,
      'Məbləğ (₼)': e.amount,
      'Açıqlama': e.description || ''
    }));
    const wsExp = XLSX.utils.json_to_sheet(expData);
    XLSX.utils.book_append_sheet(wb, wsExp, "Xərclər");

    // Incomes Sheet
    const incData = incomes.map(i => ({
      'Tarix': format(new Date(i.date), 'dd.MM.yyyy HH:mm'),
      'İcraçı': i.users?.name || i.category,
      'Məbləğ (₼)': i.amount,
      'Açıqlama': i.description || ''
    }));
    const wsInc = XLSX.utils.json_to_sheet(incData);
    XLSX.utils.book_append_sheet(wb, wsInc, "Mədaxillər");

    XLSX.writeFile(wb, `Hesabat_${format(new Date(), 'dd_MM_yyyy')}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Gelato ERP - Ümumi Hesabat', 14, 22);

    doc.setFontSize(14);
    doc.text('Satışlar', 14, 35);

    const salesBody = sales.map(s => [
      format(new Date(s.date), 'dd.MM.yyyy HH:mm'),
      `${s.total_amount.toFixed(2)} ₼`
    ]);

    (doc as any).autoTable({
      startY: 40,
      head: [['Tarix', 'Məbləğ']],
      body: salesBody,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    });

    let finalY = (doc as any).lastAutoTable.finalY || 40;

    doc.text('Xərclər', 14, finalY + 15);

    const expBody = expenses.map(e => [
      format(new Date(e.date), 'dd.MM.yyyy HH:mm'),
      e.users?.name || e.category,
      `${e.amount.toFixed(2)} ₼`
    ]);

    (doc as any).autoTable({
      startY: finalY + 20,
      head: [['Tarix', 'Kateqoriya', 'Məbləğ']],
      body: expBody,
      theme: 'grid',
      headStyles: { fillColor: [239, 68, 68] }
    });

    finalY = (doc as any).lastAutoTable.finalY || finalY + 40;
    doc.text('Mədaxillər', 14, finalY + 15);

    const incBody = incomes.map(i => [
      format(new Date(i.date), 'dd.MM.yyyy HH:mm'),
      i.users?.name || i.category,
      `${i.amount.toFixed(2)} ₼`
    ]);

    (doc as any).autoTable({
      startY: finalY + 20,
      head: [['Tarix', 'Kateqoriya', 'Məbləğ']],
      body: incBody,
      theme: 'grid',
      headStyles: { fillColor: [34, 197, 94] }
    });

    doc.save(`Hesabat_${format(new Date(), 'dd_MM_yyyy')}.pdf`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.reports')}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={exportToExcel}
            className="bg-green-600 text-white px-4 py-2 rounded-xl flex items-center hover:bg-green-700 transition shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Excel
          </button>
          <button
            onClick={exportToPDF}
            className="bg-red-500 text-white px-4 py-2 rounded-xl flex items-center hover:bg-red-600 transition shadow-sm"
          >
            <FileText className="w-4 h-4 mr-2" />
            PDF
          </button>
          <button
            onClick={() => setShowExpenseModal(true)}
            className="bg-red-600 text-white px-4 py-2 rounded-xl flex items-center hover:bg-red-700 transition shadow-sm"
          >
            <Plus className="w-5 h-5 mr-2" />
            {t('reports.addExpense')}
          </button>
          <button
            onClick={() => setShowIncomeModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-xl flex items-center hover:bg-green-700 transition shadow-sm"
          >
            <Plus className="w-5 h-5 mr-2" />
            Mədaxil Əlavə Et
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Report */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('reports.latestSales')}</h2>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto pb-4">
            <table className="w-full text-left text-sm min-w-[400px]">
              <thead className="bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700 sticky top-0">
                <tr>
                  <th className="px-6 py-3 font-medium">{t('common.date')}</th>
                  <th className="px-6 py-3 font-medium">{t('common.cost')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {sales.map((sale) => (
                  <tr
                    key={sale.id}
                    onClick={() => handleSaleClick(sale)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-3 text-gray-900 dark:text-gray-300">{format(new Date(sale.date), 'dd.MM.yyyy HH:mm')}</td>
                    <td className="px-6 py-3 text-gray-500 dark:text-gray-400 text-xs">{sale.users?.name || '-'}</td>
                    <td className="px-6 py-3 font-bold text-green-600 dark:text-green-400">+{sale.total_amount.toFixed(2)} ₼</td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-400 dark:text-gray-500">{t('reports.noSales')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expenses Report */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('reports.latestExpenses')}</h2>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto pb-4">
            <table className="w-full text-left text-sm min-w-[500px]">
              <thead className="bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700 sticky top-0">
                <tr>
                  <th className="px-6 py-3 font-medium">{t('common.date')}</th>
                  <th className="px-6 py-3 font-medium">İcraçı</th>
                  <th className="px-6 py-3 font-medium">Məbləğ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {expenses.map((exp) => (
                  <tr
                    key={exp.id}
                    onClick={() => setSelectedExpense(exp)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-3 text-gray-900 dark:text-gray-300">{format(new Date(exp.date), 'dd.MM.yyyy HH:mm')}</td>
                    <td className="px-6 py-3 text-gray-900 dark:text-gray-300">{exp.users?.name || exp.category}</td>
                    <td className="px-6 py-3 font-bold text-red-600 dark:text-red-400">-{exp.amount.toFixed(2)} ₼</td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-400 dark:text-gray-500">{t('reports.noExpenses')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Incomes Report */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Son Mədaxillər (Kassa)</h2>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto pb-4">
            <table className="w-full text-left text-sm min-w-[500px]">
              <thead className="bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700 sticky top-0">
                <tr>
                  <th className="px-6 py-3 font-medium">{t('common.date')}</th>
                  <th className="px-6 py-3 font-medium">İcraçı</th>
                  <th className="px-6 py-3 font-medium">Məbləğ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {incomes.map((inc) => (
                  <tr
                    key={inc.id}
                    onClick={() => setSelectedIncome(inc)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-3 text-gray-900 dark:text-gray-300">{format(new Date(inc.date), 'dd.MM.yyyy HH:mm')}</td>
                    <td className="px-6 py-3 text-gray-900 dark:text-gray-300">{inc.users?.name || inc.category}</td>
                    <td className="px-6 py-3 font-bold text-green-600 dark:text-green-400">+{inc.amount.toFixed(2)} ₼</td>
                  </tr>
                ))}
                {incomes.length === 0 && (
                  <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-400 dark:text-gray-500">Mədaxil tapılmadı</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[60] p-0 lg:p-4">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
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
                <input id="expense-amount" required title={t('common.cost')} placeholder="0.00" type="number" step="0.01" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={expenseData.amount} onChange={e => setExpenseData({ ...expenseData, amount: e.target.value })} />
              </div>
              <div>
                <label htmlFor="expense-desc" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('reports.description')}</label>
                <textarea id="expense-desc" title={t('reports.description')} placeholder={t('reports.description')} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" rows={3} value={expenseData.description} onChange={e => setExpenseData({ ...expenseData, description: e.target.value })}></textarea>
              </div>
              <div className="flex flex-col-reverse lg:flex-row justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowExpenseModal(false)} className="w-full lg:w-auto px-4 py-3 lg:py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-medium">{t('common.cancel')}</button>
                <button type="submit" className="w-full lg:w-auto px-4 py-3 lg:py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium">{t('common.save')}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      {/* Sale Details Modal */}
      {selectedSale && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Sifariş Detalları #{selectedSale.id}</h2>
              <button
                onClick={() => setSelectedSale(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors font-bold text-xl h-10 w-10 flex items-center justify-center"
                title="Bağla"
              >
                &times;
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 pb-4 border-b border-gray-100 dark:border-gray-700">
                <span>Tarix: {format(new Date(selectedSale.date), 'dd.MM.yyyy HH:mm')}</span>
                <span>Satıcı: {selectedSale.users?.name || '-'}</span>
              </div>
              <div className="space-y-3">
                {saleDetails.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl">
                    <div>
                      <div className="font-bold text-gray-900 dark:text-white">{item.products?.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{item.quantity} ədəd × {item.price.toFixed(2)} ₼</div>
                    </div>
                    <div className="font-black text-indigo-600 dark:text-indigo-400">{(item.quantity * item.price).toFixed(2)} ₼</div>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                <span className="font-bold text-gray-900 dark:text-white">Cəmi:</span>
                <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{selectedSale.total_amount.toFixed(2)} ₼</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Income Details Modal */}
      {selectedIncome && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Mədaxil Detalları #{selectedIncome.id}</h2>
              <button
                onClick={() => setSelectedIncome(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors font-bold text-xl h-10 w-10 flex items-center justify-center"
                title="Bağla"
              >
                &times;
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Tarix və Saat</label>
                  <p className="font-bold text-gray-900 dark:text-white">{format(new Date(selectedIncome.date), 'dd.MM.yyyy HH:mm')}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Kimin tərəfindən</label>
                  <p className="font-bold text-gray-900 dark:text-white">{selectedIncome.users?.name || '-'}</p>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Kateqoriya</label>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{selectedIncome.category}</p>
              </div>
              {selectedIncome.description && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Açıqlama</label>
                  <p className="text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl">{selectedIncome.description}</p>
                </div>
              )}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                <span className="font-bold text-gray-900 dark:text-white">Məbləğ:</span>
                <span className="text-2xl font-black text-green-600 dark:text-green-400">{selectedIncome.amount.toFixed(2)} ₼</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showIncomeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[60] p-0 lg:p-4">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
          >
            <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 lg:hidden" />
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Mədaxil Əlavə Et (Kassa)</h2>
            <form onSubmit={handleIncomeSubmit} className="space-y-4">
              <div>
                <label htmlFor="income-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.date')}</label>
                <input id="income-date" required type="datetime-local" title={t('common.date')} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={incomeData.date} onChange={e => setIncomeData({ ...incomeData, date: e.target.value })} />
              </div>
              <div>
                <label htmlFor="income-category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kateqoriya</label>
                <select id="income-category" required title="Kateqoriya" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={incomeData.category} onChange={e => setIncomeData({ ...incomeData, category: e.target.value })}>
                  <option value="Kassa mədaxil">Kassa mədaxil (Sahibkar)</option>
                  <option value="Digər">Digər</option>
                </select>
              </div>
              <div>
                <label htmlFor="income-amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Məbləğ (₼)</label>
                <input id="income-amount" required title="Məbləğ" placeholder="0.00" type="number" step="0.01" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={incomeData.amount} onChange={e => setIncomeData({ ...incomeData, amount: e.target.value })} />
              </div>
              <div>
                <label htmlFor="income-desc" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('reports.description')}</label>
                <textarea id="income-desc" title={t('reports.description')} placeholder={t('reports.description')} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" rows={3} value={incomeData.description} onChange={e => setIncomeData({ ...incomeData, description: e.target.value })}></textarea>
              </div>
              <div className="flex flex-col-reverse lg:flex-row justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowIncomeModal(false)} className="w-full lg:w-auto px-4 py-3 lg:py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-medium">{t('common.cancel')}</button>
                <button type="submit" className="w-full lg:w-auto px-4 py-3 lg:py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium">{t('common.save')}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[60] p-0 lg:p-4">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
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
                <input id="expense-amount" required title={t('common.cost')} placeholder="0.00" type="number" step="0.01" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={expenseData.amount} onChange={e => setExpenseData({ ...expenseData, amount: e.target.value })} />
              </div>
              <div>
                <label htmlFor="expense-desc" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('reports.description')}</label>
                <textarea id="expense-desc" title={t('reports.description')} placeholder={t('reports.description')} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" rows={3} value={expenseData.description} onChange={e => setExpenseData({ ...expenseData, description: e.target.value })}></textarea>
              </div>
              <div className="flex flex-col-reverse lg:flex-row justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowExpenseModal(false)} className="w-full lg:w-auto px-4 py-3 lg:py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-medium">{t('common.cancel')}</button>
                <button type="submit" className="w-full lg:w-auto px-4 py-3 lg:py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium">{t('common.save')}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Expense Details Modal */}
      {selectedExpense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Xərc Detalları #{selectedExpense.id}</h2>
              <button
                onClick={() => setSelectedExpense(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors font-bold text-xl h-10 w-10 flex items-center justify-center"
                title="Bağla"
              >
                &times;
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Tarix və Saat</label>
                  <p className="font-bold text-gray-900 dark:text-white">{format(new Date(selectedExpense.date), 'dd.MM.yyyy HH:mm')}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Kimin tərəfindən</label>
                  <p className="font-bold text-gray-900 dark:text-white">{selectedExpense.users?.name || '-'}</p>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Kateqoriya</label>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{selectedExpense.category}</p>
              </div>
              {selectedExpense.description && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Açıqlama</label>
                  <p className="text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl">{selectedExpense.description}</p>
                </div>
              )}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                <span className="font-bold text-gray-900 dark:text-white">Məbləğ:</span>
                <span className="text-2xl font-black text-red-600 dark:text-red-400">{selectedExpense.amount.toFixed(2)} ₼</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
