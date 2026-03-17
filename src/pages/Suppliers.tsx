import React, { useState, useEffect } from 'react';
import { Plus, Phone, Mail, X, History, User, DollarSign, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useShift } from '../contexts/ShiftContext';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import LoadingSpinner from '../components/ui/LoadingSpinner';

export default function Suppliers() {
  const { t } = useLanguage();
  const { activeShift } = useShift();
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', contact: '', email: '' });
  const [paymentData, setPaymentData] = useState({ amount: '', description: '', payment_method: 'cash' as 'cash' | 'bank' });
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);
  
  // Body scroll lock when modals are open
  useEffect(() => {
    if (showModal || showPaymentModal || showHistoryModal) {
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
  }, [showModal, showPaymentModal, showHistoryModal]);

  const fetchData = async () => {
    try {
      setIsLoadingPage(true);
      const [
        { data: supData, error: supErr },
        { data: debtData, error: debtErr }
      ] = await Promise.all([
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('supplier_debts_view').select('*')
      ]);

      if (supErr) throw supErr;
      if (debtErr) throw debtErr;

      setSuppliers(supData || []);
      setDebts(debtData || []);
    } catch (e) {
      console.error(e);
      toast.error('Təchizatçılar yüklənərkən xəta');
    } finally {
      setIsLoadingPage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('suppliers').insert([formData]);
      if (error) throw error;

      setShowModal(false);
      setFormData({ name: '', contact: '', email: '' });
      toast.success(t('suppliers.newSupplier'));
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error('Xəta baş verdi: ' + e.message);
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || !user) return;
    try {
      const { error } = await supabase.from('supplier_payments').insert([{
        supplier_id: selectedSupplier.id,
        amount: parseFloat(paymentData.amount),
        description: paymentData.description,
        created_by: parseInt(user.id),
        payment_method: paymentData.payment_method,
        shift_id: activeShift?.id
      }]);

      if (error) throw error;

      setShowPaymentModal(false);
      setPaymentData({ amount: '', description: '' });
      toast.success(t('common.save'));
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error('Xəta baş verdi: ' + e.message);
    }
  };

  const fetchHistory = async (supplierId: number) => {
    try {
      setIsLoadingHistory(true);
      const { data, error } = await supabase
        .from('supplier_payments')
        .select('*, users(name)')
        .eq('supplier_id', supplierId)
        .order('date', { ascending: false });

      if (error) throw error;
      setHistory(data || []);
      setShowHistoryModal(true);
    } catch (e) {
      console.error(e);
      toast.error('Tarixçə yüklənərkən xəta');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      {isLoadingPage ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <LoadingSpinner message="Təchizatçılar yüklənir..." />
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.suppliers')}</h1>
            <button
              onClick={() => setShowModal(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center hover:bg-indigo-700 transition"
            >
              <Plus className="w-5 h-5 mr-2" />
              {t('suppliers.newSupplier')}
            </button>
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
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {suppliers.map((supplier) => (
              <motion.div
                key={supplier.id}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  show: { opacity: 1, y: 0 }
                }}
                whileHover={{ y: -5 }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 hover:shadow-md transition"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{supplier.name}</h3>
                  <button 
                    onClick={() => fetchHistory(supplier.id)}
                    className="p-2 bg-gray-50 dark:bg-gray-900/50 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors border border-gray-100 dark:border-gray-700"
                    title={t('common.paymentHistory')}
                  >
                    <History className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                    <Phone className="w-4 h-4 mr-3 text-gray-400 dark:text-gray-500" />
                    {supplier.contact || t('suppliers.notSpecified')}
                  </div>
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                    <Mail className="w-4 h-4 mr-3 text-gray-400 dark:text-gray-500" />
                    {supplier.email || t('suppliers.notSpecified')}
                  </div>
                  {(() => {
                    const debtInfo = debts.find(d => d.supplier_id === supplier.id);
                    const currentDebt = debtInfo?.current_debt || 0;
                    return (
                      <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                        <div>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-black">{t('common.debt')}</p>
                          <p className={cn(
                            "text-lg font-black",
                            currentDebt > 0 ? "text-red-500" : "text-green-500"
                          )}>
                            {Number(currentDebt).toFixed(2)} ₼
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedSupplier(supplier);
                            setPaymentData({ amount: currentDebt > 0 ? currentDebt.toString() : '', description: '', payment_method: 'cash' });
                            setShowPaymentModal(true);
                          }}
                          className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                        >
                          {currentDebt > 0 ? t('common.payDebt') : t('common.payAdvance')}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </motion.div>
            ))}
          </motion.div>

          <AnimatePresence>
            {showModal && (
              <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[100] p-0 lg:p-4 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto touch-pan-y pb-28 lg:pb-8 shadow-2xl"
                >
                  <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 lg:hidden" />
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('suppliers.addSupplierTitle')}</h2>
                    <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" title={t('common.close')}>
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('suppliers.companyName')}</label>
                      <input required type="text" title={t('suppliers.companyName')} placeholder={t('suppliers.companyName')} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('suppliers.contactNumber')}</label>
                      <input type="text" title={t('suppliers.contactNumber')} placeholder={t('suppliers.contactNumber')} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.contact} onChange={e => setFormData({ ...formData, contact: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('suppliers.email')}</label>
                      <input type="email" title={t('suppliers.email')} placeholder={t('suppliers.email')} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                    </div>
                    <div className="flex flex-col-reverse lg:flex-row justify-end gap-3 mt-6">
                      <button type="button" onClick={() => setShowModal(false)} className="w-full lg:w-auto px-4 py-3 lg:py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-medium">{t('common.cancel')}</button>
                      <button type="submit" className="w-full lg:w-auto px-4 py-3 lg:py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium">{t('common.save')}</button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showPaymentModal && selectedSupplier && (
              <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[100] p-0 lg:p-4 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto touch-pan-y pb-28 lg:pb-8 shadow-2xl"
                >
                  <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 lg:hidden" />
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      {(() => {
                        const debtInfo = debts.find(d => d.supplier_id === selectedSupplier.id);
                        return debtInfo?.current_debt > 0 ? t('common.payDebt') : t('common.payAdvance');
                      })()}: {selectedSupplier.name}
                    </h2>
                    <button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" title={t('common.close')}>
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>
                  <form onSubmit={handlePayment} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.amountPaid')} (₼)</label>
                      <input required type="number" step="0.01" title={t('common.amountPaid')} placeholder="0.00" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2 font-bold" value={paymentData.amount} onChange={e => setPaymentData({ ...paymentData, amount: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ödəniş Hesabı</label>
                      <div className="grid grid-cols-2 gap-3">
                        {(['cash', 'bank'] as const).map((method) => (
                          <button
                            key={method}
                            type="button"
                            onClick={() => setPaymentData({ ...paymentData, payment_method: method })}
                            className={cn(
                              "py-3 rounded-xl border-2 font-bold text-sm transition-all flex items-center justify-center gap-2",
                              paymentData.payment_method === method
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
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('reports.description')}</label>
                      <textarea title={t('reports.description')} placeholder={t('reports.description')} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2" value={paymentData.description} onChange={e => setPaymentData({ ...paymentData, description: e.target.value })} />
                    </div>
                    <div className="flex flex-col-reverse lg:flex-row justify-end gap-3 mt-6">
                      <button type="button" onClick={() => setShowPaymentModal(false)} className="w-full lg:w-auto px-4 py-3 lg:py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-medium">{t('common.cancel')}</button>
                      <button type="submit" className="w-full lg:w-auto px-4 py-3 lg:py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium">{t('common.save')}</button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showHistoryModal && (
              <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[60] p-0 lg:p-4 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl w-full max-w-lg overflow-y-auto flex flex-col max-h-[85vh] lg:max-h-[90vh] shadow-2xl touch-pan-y pb-28 lg:pb-0"
                >
                  <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                        <History className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('common.paymentHistory')}</h2>
                        <p className="text-xs text-gray-500">{history.length} {t('pos.items')}</p>
                      </div>
                    </div>
                    <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition" title={t('common.close')}>
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>
                  <div className="p-6 overflow-y-auto">
                    {isLoadingHistory ? (
                       <div className="flex justify-center py-10">
                         <LoadingSpinner />
                       </div>
                    ) : history.length === 0 ? (
                      <div className="text-center py-10">
                        <History className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
                        <p className="text-gray-500">{t('common.notFound')}</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {history.map(payment => (
                          <div key={payment.id} className="p-4 rounded-xl border border-gray-100 dark:border-gray-700 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                            <div>
                              <p className="font-black text-lg text-gray-900 dark:text-white">{Number(payment.amount).toFixed(2)} ₼</p>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{payment.description || '-'}</p>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 uppercase font-black">{new Date(payment.date).toLocaleString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}</p>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center text-[10px] uppercase font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-md">
                                <User className="w-3 h-3 mr-1" />
                                {payment.users?.name}
                              </div>
                              <p className="text-[9px] font-black text-gray-400 mt-1 uppercase tracking-widest">
                                {payment.payment_method === 'bank' ? 'Bank' : 'Nağd'}
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
        </>
      )}
    </motion.div>
  );
}
