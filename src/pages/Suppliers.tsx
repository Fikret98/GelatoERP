import React, { useState, useEffect } from 'react';
import { Plus, Phone, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import LoadingSpinner from '../components/ui/LoadingSpinner';

export default function Suppliers() {
  const { t } = useLanguage();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', contact: '', email: '' });
  const [paymentData, setPaymentData] = useState({ amount: '', description: '' });
  const [isLoadingPage, setIsLoadingPage] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

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
    if (!selectedSupplier) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('supplier_payments').insert([{
        supplier_id: selectedSupplier.id,
        amount: parseFloat(paymentData.amount),
        description: paymentData.description,
        created_by: user?.id ? parseInt(user.id) : null
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
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{supplier.name}</h3>
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
                        setPaymentData({ amount: currentDebt > 0 ? currentDebt.toString() : '', description: '' });
                        setShowPaymentModal(true);
                      }}
                      className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                    >
                      {t('common.payDebt')}
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
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[60] p-0 lg:p-4">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
          >
            <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 lg:hidden" />
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{t('suppliers.addSupplierTitle')}</h2>
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
          <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-[60] p-0 lg:p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
            >
              <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 lg:hidden" />
              <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{t('common.payDebt')}: {selectedSupplier.name}</h2>
              <form onSubmit={handlePayment} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.amountPaid')} (₼)</label>
                  <input required type="number" step="0.01" title={t('common.amountPaid')} placeholder="0.00" className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2 font-bold" value={paymentData.amount} onChange={e => setPaymentData({ ...paymentData, amount: e.target.value })} />
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
        </>
      )}
    </motion.div>
  );
}
