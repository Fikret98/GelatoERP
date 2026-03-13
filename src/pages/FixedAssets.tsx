import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar, DollarSign, Tag, MoreVertical, Edit2, Trash2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import LoadingSpinner from '../components/ui/LoadingSpinner';

export default function FixedAssets() {
  const { t } = useLanguage();
  const { user: authUser } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    purchase_date: new Date().toISOString().split('T')[0],
    cost: '',
    status: 'active',
    description: ''
  });

  useEffect(() => {
    fetchAssets();
  }, []);

  // Body scroll lock when modals are open
  useEffect(() => {
    if (showModal) {
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
  }, [showModal]);

  const fetchAssets = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('fixed_assets')
        .select('*')
        .order('purchase_date', { ascending: false });

      if (error) throw error;
      setAssets(data || []);
    } catch (e) {
      console.error(e);
      toast.error(t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        cost: parseFloat(formData.cost),
        created_by: authUser?.id ? parseInt(authUser.id) : null
      };

      if (editingAsset) {
        const { error } = await supabase
          .from('fixed_assets')
          .update(payload)
          .eq('id', editingAsset.id);
        if (error) throw error;
        toast.success(t('common.save'));
      } else {
        const { error } = await supabase
          .from('fixed_assets')
          .insert([payload]);
        if (error) throw error;
        toast.success(t('common.add'));
      }

      setShowModal(false);
      resetForm();
      fetchAssets();
    } catch (e: any) {
      console.error(e);
      toast.error('Xəta baş verdi: ' + e.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('common.confirm'))) return;
    try {
      const { error } = await supabase
        .from('fixed_assets')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success(t('common.delete'));
      fetchAssets();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      purchase_date: new Date().toISOString().split('T')[0],
      cost: '',
      status: 'active',
      description: ''
    });
    setEditingAsset(null);
  };

  const filteredAssets = assets.filter(asset => 
    asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalValue = assets.reduce((acc, curr) => acc + (Number(curr.cost) || 0), 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-lg text-[10px] font-black uppercase">{t('assets.active')}</span>;
      case 'maintenance':
        return <span className="px-2 py-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded-lg text-[10px] font-black uppercase">{t('assets.maintenance')}</span>;
      case 'disposed':
        return <span className="px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-[10px] font-black uppercase">{t('assets.disposed')}</span>;
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('assets.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('assets.totalValue')}: <span className="font-bold text-indigo-600 dark:text-indigo-400">{totalValue.toFixed(2)} ₼</span>
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none"
        >
          <Plus className="w-5 h-5 mr-2" />
          {t('assets.newAsset')}
        </button>
      </div>

      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
        <input
          type="text"
          placeholder={t('common.search')}
          className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAssets.map((asset) => (
            <motion.div
              key={asset.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all relative group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                  <Tag className="w-6 h-6" />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditingAsset(asset); setFormData({ ...asset, cost: asset.cost.toString() }); setShowModal(true); }}
                    className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    title={t('common.edit')}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(asset.id)}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    title={t('common.delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{asset.name}</h3>
              
              <div className="space-y-3">
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                  <Calendar className="w-4 h-4 mr-2 opacity-60" />
                  {new Date(asset.purchase_date).toLocaleDateString()}
                </div>
                <div className="flex items-center text-sm font-bold text-gray-900 dark:text-white">
                  <DollarSign className="w-4 h-4 mr-2 text-green-500" />
                  {Number(asset.cost).toFixed(2)} ₼
                </div>
                <div className="pt-2 flex justify-between items-center border-t border-gray-50 dark:border-gray-700 mt-4">
                  {getStatusBadge(asset.status)}
                  {asset.description && (
                    <div className="group/desc relative">
                      <AlertCircle className="w-4 h-4 text-gray-400 cursor-help" />
                      <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-[10px] rounded shadowing-xl opacity-0 group-hover/desc:opacity-100 pointer-events-none transition-opacity z-10">
                        {asset.description}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end lg:items-center justify-center z-[100] p-0 lg:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 50 }}
              className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto touch-pan-y pb-28 lg:pb-8 shadow-2xl"
            >
              <h2 className="text-xl font-bold mb-6 text-gray-900 dark:text-white">
                {editingAsset ? t('common.edit') : t('assets.addTitle')}
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('assets.assetName')}</label>
                  <input
                    required
                    type="text"
                    title={t('assets.assetName')}
                    className="w-full border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('assets.purchaseDate')}</label>
                    <input
                      required
                      type="date"
                      title={t('assets.purchaseDate')}
                      className="w-full border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      value={formData.purchase_date}
                      onChange={e => setFormData({ ...formData, purchase_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('assets.cost')} (₼)</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      title={t('assets.cost')}
                      className="w-full border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      value={formData.cost}
                      onChange={e => setFormData({ ...formData, cost: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('assets.status')}</label>
                  <select
                    title={t('assets.status')}
                    className="w-full border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="active">{t('assets.active')}</option>
                    <option value="maintenance">{t('assets.maintenance')}</option>
                    <option value="disposed">{t('assets.disposed')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('reports.description')}</label>
                  <textarea
                    title={t('reports.description')}
                    className="w-full border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none transition-all h-24 resize-none"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="flex flex-col-reverse lg:flex-row justify-end gap-3 mt-8">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="w-full lg:w-auto px-6 py-3 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-bold transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="w-full lg:w-auto px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
