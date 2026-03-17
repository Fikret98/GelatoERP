import React, { useState, useEffect } from 'react';
import { Plus, Search, X, Calendar, Package, Truck, ShoppingCart, Edit2, DollarSign, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useShift } from '../contexts/ShiftContext';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import LoadingSpinner from '../components/ui/LoadingSpinner';

export default function Inventory() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { activeShift } = useShift();
  const [items, setItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [formData, setFormData] = useState({ name: '', unit: 'kq', unit_cost: '', stock_quantity: '', supplier_id: '', critical_limit: '' });
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseItem, setPurchaseItem] = useState<any>(null);
  const [purchaseForm, setPurchaseForm] = useState({ quantity: '', unit_cost: '', supplier_id: '', amount_paid: '', payment_method: 'cash' as 'cash' | 'bank' });
  const [userId, setUserId] = useState<number | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  // Body scroll lock when modals are open
  useEffect(() => {
    if (showModal || selectedItem || showPurchaseModal) {
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
  }, [showModal, selectedItem, showPurchaseModal]);

  const fetchData = async () => {
    try {
      setIsLoadingPage(true);
      const [
        { data: invData, error: invErr },
        { data: supData, error: supErr }
      ] = await Promise.all([
        supabase.from('inventory').select('*').order('name'),
        supabase.from('suppliers').select('*').order('name')
      ]);

      if (invErr) throw invErr;
      if (supErr) throw supErr;

      setItems(invData || []);
      setSuppliers(supData || []);
    } catch (e) {
      console.error(e);
      toast.error('Məlumatların yüklənməsində xəta');
    } finally {
      setIsLoadingPage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        unit_cost: parseFloat(formData.unit_cost),
        stock_quantity: parseFloat(formData.stock_quantity),
        critical_limit: parseFloat(formData.critical_limit || '0'),
        supplier_id: formData.supplier_id ? parseInt(formData.supplier_id) : null
      };

      if (editingItem) {
        const { error } = await supabase.from('inventory').update(payload).eq('id', editingItem.id);
        if (error) throw error;
        toast.success(t('common.save'));
      } else {
        const { error } = await supabase.from('inventory').insert([payload]);
        if (error) throw error;
        toast.success(t('inventory.newItem'));
      }

      setShowModal(false);
      setEditingItem(null);
      setFormData({ name: '', unit: 'kq', unit_cost: '', stock_quantity: '', supplier_id: '', critical_limit: '' });
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error('Xəta baş verdi: ' + e.message);
    }
  };

  const handleItemClick = async (item: any) => {
    setSelectedItem(item);
    setIsLoadingHistory(true);
    try {
      const [{ data, error }] = await Promise.all([
        supabase
          .from('inventory_purchases_detailed')
          .select('*')
          .eq('inventory_id', item.id)
          .order('purchase_date', { ascending: false }),
        new Promise(resolve => setTimeout(resolve, 800)) // Minimum visual delay for the animation
      ]);

      if (error) throw error;

      const formattedPurchases = (data || []).map(p => ({
        ...p,
        date: p.purchase_date,
        supplier_name: p.supplier_name || '',
        buyer_name: p.buyer_name || ''
      }));

      setPurchases(formattedPurchases);
    } catch (e) {
      console.error(e);
      toast.error('Tarixçə yüklənərkən xəta');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const openPurchaseModal = (item: any) => {
    setPurchaseItem(item);
    setPurchaseForm({
      quantity: '',
      unit_cost: item.unit_cost.toString(),
      supplier_id: item.supplier_id ? item.supplier_id.toString() : '',
      amount_paid: '',
      payment_method: 'cash'
    });
    setShowPurchaseModal(true);
  };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const q = parseFloat(purchaseForm.quantity);
      const unitCost = parseFloat(purchaseForm.unit_cost);
      const totalCost = q * unitCost;

      // Validate balance based on payment method
      const { data: balance, error: balanceErr } = await supabase.rpc(
        purchaseForm.payment_method === 'cash' ? 'get_current_cash_balance' : 'get_current_bank_balance'
      );
      if (balanceErr) throw balanceErr;

      if (totalCost > (balance || 0)) {
        const accountName = purchaseForm.payment_method === 'cash' ? 'Kassada' : 'Bank hesabında';
        toast.error(`${accountName} kifayət qədər məbləğ yoxdur. Mövcud qalıq: ${Number(balance).toFixed(2)} ₼. Lazım olan: ${totalCost.toFixed(2)} ₼`);
        return;
      }

      if (!purchaseForm.supplier_id) {
        toast.error('Zəhmət olmasa təchizatçı seçin');
        return;
      }

      // 1. Insert new purchase record into the NEW table
      // The DB triggers (tr_update_cogs, tr_log_purchase_expense) handle stock, COGS, and expenses!
      const { error: insertErr } = await supabase.from('inventory_purchases').insert([{
        inventory_id: purchaseItem.id,
        quantity: q,
        unit_price: unitCost,
        supplier_id: purchaseForm.supplier_id ? parseInt(purchaseForm.supplier_id) : null,
        amount_paid: purchaseForm.amount_paid ? parseFloat(purchaseForm.amount_paid) : totalCost,
        created_by: user?.id ? parseInt(user.id) : null,
        payment_method: purchaseForm.payment_method,
        shift_id: activeShift?.id
      }]);

      if (insertErr) throw insertErr;

      setShowPurchaseModal(false);
      toast.success(t('inventory.quickPurchase'));

      // Update tables viewing
      fetchData();

      // Update selected item explicitly so the modal shows the fresh data
      if (selectedItem && selectedItem.id === purchaseItem.id) {
        // We re-fetch or manually update. For simplicity, let's close historical view to force reload on next click
        setSelectedItem(null);
      }
    } catch (e: any) {
      console.error(e);
      toast.error('Xəta baş verdi: ' + e.message);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6 p-4 sm:p-6 lg:p-8"
    >
      {isLoadingPage ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <LoadingSpinner message="Anbar məlumatları yüklənir..." />
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white uppercase tracking-tight">{t('inventory.title')}</h1>

        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl flex items-center hover:bg-indigo-700 transition text-xs sm:text-sm font-bold"
        >
          <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" />
          {t('inventory.newItem')}
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder={t('common.search')}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 font-medium border-b border-gray-100 dark:border-gray-700">
              <tr>
                <th className="px-6 py-4">{t('common.name')}</th>
                <th className="px-6 py-4">{t('common.unit')}</th>
                <th className="px-6 py-4">{t('common.cost')}</th>
                <th className="px-6 py-4">{t('common.stock')}</th>
                <th className="px-6 py-4 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <motion.tbody 
              variants={{
                show: { transition: { staggerChildren: 0.05 } }
              }}
              initial="hidden"
              animate="show"
              className="divide-y divide-gray-100 dark:divide-gray-700"
            >
              {items.map((item) => (
                <motion.tr
                  key={item.id}
                  variants={{
                    hidden: { opacity: 0, x: -10 },
                    show: { opacity: 1, x: 0 }
                  }}
                  onClick={() => handleItemClick(item)}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors group"
                >
                  <td className="px-6 py-4 font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 mt-1">{item.name}</td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{item.unit}</td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400 font-mono">{Number(item.unit_cost || 0).toFixed(2)} ₼</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className={cn(
                        "font-bold",
                        item.stock_quantity <= (item.critical_limit || 0) ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
                      )}>
                        {item.stock_quantity} {item.unit}
                      </span>
                      {item.stock_quantity <= (item.critical_limit || 0) && (
                        <span className="text-[10px] uppercase tracking-wider font-black bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded mt-1 w-fit">KRITIK</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingItem(item);
                          setFormData({
                            name: item.name,
                            unit: item.unit,
                            unit_cost: item.unit_cost.toString(),
                            stock_quantity: item.stock_quantity.toString(),
                            supplier_id: item.supplier_id ? item.supplier_id.toString() : '',
                            critical_limit: (item.critical_limit || 0).toString()
                          });
                          setShowModal(true);
                        }}
                        className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700"
                        title={t('common.edit')}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openPurchaseModal(item);
                        }}
                        className="p-2 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors border border-emerald-100 dark:border-emerald-800"
                        title={t('common.newPurchase')}
                      >
                        <ShoppingCart className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="sm:hidden grid grid-cols-1 divide-y divide-gray-100 dark:divide-gray-700">
          {items.map((item) => (
            <motion.div
              layout
              key={`mobile-${item.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 active:bg-gray-50 dark:active:bg-gray-700 transition-colors"
              onClick={() => handleItemClick(item)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1 min-w-0 pr-4">
                  <h3 className="font-black text-gray-900 dark:text-white text-base leading-tight truncate">
                    {item.name}
                  </h3>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black mt-1">
                    {item.unit}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingItem(item);
                      setFormData({
                        name: item.name,
                        unit: item.unit,
                        unit_cost: item.unit_cost.toString(),
                        stock_quantity: item.stock_quantity.toString(),
                        supplier_id: item.supplier_id ? item.supplier_id.toString() : '',
                        critical_limit: (item.critical_limit || 0).toString()
                      });
                      setShowModal(true);
                    }}
                    className="p-2.5 bg-gray-50 dark:bg-gray-900/50 text-gray-400 rounded-xl border border-gray-100 dark:border-gray-700"
                    title={t('common.edit')}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openPurchaseModal(item);
                    }}
                    className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-500/20"
                    title={t('common.newPurchase')}
                  >
                    <ShoppingCart className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-900/30 p-3 rounded-2xl border border-gray-100 dark:border-gray-700">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Maya Dəyəri</p>
                  <p className="text-sm font-black text-gray-900 dark:text-white">
                    {Number(item.unit_cost || 0).toFixed(2)} ₼
                  </p>
                </div>
                <div className={cn(
                  "p-3 rounded-2xl border transition-colors",
                  item.stock_quantity <= (item.critical_limit || 0) 
                    ? "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/50" 
                    : "bg-gray-50 dark:bg-gray-900/30 border-gray-100 dark:border-gray-700"
                )}>
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Cari Stok</p>
                  <div className="flex items-center gap-2">
                    <p className={cn(
                      "text-sm font-black",
                      item.stock_quantity <= (item.critical_limit || 0) ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"
                    )}>
                      {item.stock_quantity}
                    </p>
                    {item.stock_quantity <= (item.critical_limit || 0) && (
                      <span className="text-[8px] font-black bg-red-600 text-white px-1.5 rounded-sm uppercase">Kritik</span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[100] p-0 lg:p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl overflow-x-hidden touch-pan-y pb-28 lg:pb-8"
            >
            <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 lg:hidden" />
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
              {editingItem ? t('common.edit') : t('inventory.addTitle')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="inv-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.name')}</label>
                <input id="inv-name" title={t('common.name')} required type="text" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="inv-unit" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.unit')}</label>
                  <select
                    id="inv-unit"
                    title={t('common.unit')}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2"
                    value={['kq', 'litr', 'ədəd'].includes(formData.unit) ? formData.unit : 'digər'}
                    onChange={e => {
                      if (e.target.value !== 'digər') {
                        setFormData({ ...formData, unit: e.target.value });
                      } else {
                        setFormData({ ...formData, unit: '' });
                      }
                    }}
                  >
                    <option value="kq">{t('inventory.kg')}</option>
                    <option value="litr">{t('inventory.liter')}</option>
                    <option value="ədəd">{t('inventory.piece')}</option>
                    <option value="digər">Digər...</option>
                  </select>
                  {!['kq', 'litr', 'ədəd'].includes(formData.unit) && (
                    <input
                      type="text"
                      required
                      placeholder="Məs: top, metr, qutu"
                      title="Xüsusi vahid"
                      className="w-full mt-2 border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.unit}
                      onChange={e => setFormData({ ...formData, unit: e.target.value })}
                    />
                  )}
                </div>
                <div>
                  <label htmlFor="inv-cost" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.cost')} (₼)</label>
                  <input id="inv-cost" title={t('common.cost')} required type="number" step="0.01" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.unit_cost} onChange={e => setFormData({ ...formData, unit_cost: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="inv-stock" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.stock')}</label>
                  <input id="inv-stock" title={t('common.stock')} required type="number" step="0.01" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.stock_quantity} onChange={e => setFormData({ ...formData, stock_quantity: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="inv-limit" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kritik hədd</label>
                  <input id="inv-limit" title="Kritik hədd" required type="number" step="0.01" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.critical_limit} onChange={e => setFormData({ ...formData, critical_limit: e.target.value })} />
                </div>
              </div>
              <div>
                <label htmlFor="inv-supplier" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.supplier')}</label>
                <select id="inv-supplier" title={t('common.supplier')} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.supplier_id} onChange={e => setFormData({ ...formData, supplier_id: e.target.value })}>
                  <option value="">{t('common.select')}</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col-reverse lg:flex-row justify-end gap-3 mt-8">
                <button type="button" onClick={() => setShowModal(false)} className="w-full lg:w-auto px-4 py-3 lg:py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-medium">{t('common.cancel')}</button>
                <button type="submit" className="w-full lg:w-auto px-4 py-3 lg:py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium">{t('common.save')}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

      {/* Purchase History Modal */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[100] p-0 lg:p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] lg:max-h-[90vh] shadow-2xl touch-pan-y pb-28 lg:pb-0"
            >
              <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 lg:hidden" />
              <div className="p-4 lg:p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedItem.name}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('inventory.purchaseHistory')}</p>
                </div>
                <button
                  onClick={() => setSelectedItem(null)}
                  title={t('common.close')}
                  className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              <div className="px-5 pt-5 pb-1 space-y-3">
                <div className="bg-indigo-50 dark:bg-indigo-900/40 rounded-xl p-4 border border-indigo-100 dark:border-indigo-800 flex justify-between items-center">
                  <p className="text-sm text-indigo-900 dark:text-indigo-200">
                    <strong>{t('inventory.stock')}: <span className="text-lg mx-1">{selectedItem.stock_quantity}</span> {selectedItem.unit}</strong>
                  </p>
                  <div className="text-right">
                    <p className="text-xs text-indigo-700 dark:text-indigo-300 uppercase font-black">Minimum Stok</p>
                    <p className="text-sm font-bold text-indigo-900 dark:text-indigo-100">{selectedItem.critical_limit || 0} {selectedItem.unit}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 pt-4 overflow-y-auto flex-1">
                {purchases.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>{t('inventory.noHistory')}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {purchases.map((purchase) => (
                      <div key={purchase.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-indigo-100 dark:hover:border-indigo-900 hover:shadow-sm transition-all">
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                            <Truck className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white">{purchase.supplier_name || t('inventory.unknownSupplier')}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-black">Alıb: {purchase.buyer_name || '-'}</p>
                            <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 mt-1">
                              <Calendar className="w-3.5 h-3.5 mr-1" />
                              {new Date(purchase.date).toLocaleDateString(language === 'az' ? 'az-AZ' : 'en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-lg text-indigo-600 dark:text-indigo-400">
                            +{purchase.quantity} <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{selectedItem.unit}</span>
                          </p>
                          <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                            {Number(purchase.unit_price || 0).toFixed(2)} ₼ / {selectedItem.unit}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Purchase Modal */}
      <AnimatePresence>
        {showPurchaseModal && purchaseItem && (
          <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[100] p-0 lg:p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl touch-pan-y pb-28 lg:pb-8"
            >
            <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 lg:hidden" />
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{t('inventory.newPurchaseTitle')}: {purchaseItem.name}</h2>
            <form onSubmit={handlePurchaseSubmit} className="space-y-4">
              <div>
                <label htmlFor="p-qty" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.quantity')} ({purchaseItem.unit})</label>
                <input id="p-qty" title={t('common.quantity')} required type="number" step="0.01" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={purchaseForm.quantity} onChange={e => {
                  const val = e.target.value;
                  setPurchaseForm(prev => ({ 
                    ...prev, 
                    quantity: val,
                    amount_paid: (parseFloat(val || '0') * parseFloat(prev.unit_cost || '0')).toFixed(2)
                  }));
                }} />
              </div>
              <div>
                <label htmlFor="p-cost" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.cost')} (₼)</label>
                <input id="p-cost" title={t('common.cost')} required type="number" step="0.01" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={purchaseForm.unit_cost} onChange={e => {
                  const val = e.target.value;
                  setPurchaseForm(prev => ({ 
                    ...prev, 
                    unit_cost: val,
                    amount_paid: (parseFloat(val || '0') * parseFloat(prev.quantity || '0')).toFixed(2)
                  }));
                }} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ödəniş Hesabı</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['cash', 'bank'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPurchaseForm({ ...purchaseForm, payment_method: method })}
                      className={cn(
                        "py-3 rounded-xl border-2 font-bold text-sm transition-all flex items-center justify-center gap-2",
                        purchaseForm.payment_method === method
                          ? "border-indigo-600 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:border-indigo-400 dark:text-indigo-400"
                          : "border-gray-100 dark:border-gray-700 text-gray-500 hover:border-gray-200"
                      )}
                    >
                      {method === 'cash' ? <DollarSign className="w-4 h-4" /> : <Coins className="w-4 h-4" />}
                      {method === 'cash' ? 'Kassa' : 'Bank'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-2">
                <p className="text-[10px] text-gray-500 italic">
                  Yekun: {(Number(purchaseForm.quantity || 0) * Number(purchaseForm.unit_cost || 0)).toFixed(2)} ₼
                </p>
              </div>
              <div>
                <label htmlFor="p-supplier" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.supplier')}</label>
                <select id="p-supplier" title={t('common.supplier')} required className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={purchaseForm.supplier_id} onChange={e => setPurchaseForm({ ...purchaseForm, supplier_id: e.target.value })}>
                  <option value="">{t('common.select')}</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col-reverse lg:flex-row justify-end gap-3 mt-8">
                <button type="button" onClick={() => setShowPurchaseModal(false)} className="w-full lg:w-auto px-4 py-3 lg:py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-medium">{t('common.cancel')}</button>
                <button type="submit" className="w-full lg:w-auto px-4 py-3 lg:py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium">{t('common.save')}</button>
              </div>
            </form>
          </motion.div>
        </div>
        )}
      </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}
