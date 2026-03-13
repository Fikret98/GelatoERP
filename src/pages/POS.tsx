import React, { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, CreditCard, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import LoadingSpinner from '../components/ui/LoadingSpinner';

import { useAuth } from '../contexts/AuthContext';
import { useShift } from '../contexts/ShiftContext';
import { cn } from '../lib/utils';

export default function POS() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<{ product: any, quantity: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [saleSuccess, setSaleSuccess] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const { activeShift, openShift, closeShift, loading: shiftLoading } = useShift();
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [openingBalance, setOpeningBalance] = useState('');
  const [actualBalance, setActualBalance] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');


  useEffect(() => {
    fetchProducts();
  }, []);

  // Body scroll lock when mobile cart or shift modal is open
  useEffect(() => {
    if (showMobileCart || showShiftModal) {
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
  }, [showMobileCart, showShiftModal]);

  const fetchProducts = async () => {
    try {
      setIsLoadingPage(true);
      const { data, error } = await supabase
        .from('pos_products_view')
        .select('*');

      if (error) throw error;
      setProducts(data || []);
    } catch (e) {
      console.error(e);
      toast.error(t('pos.error'));
    } finally {
      setIsLoadingPage(false);
    }
  };

  const addToCart = (product: any) => {
    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        const newQuantity = item.quantity + delta;
        return newQuantity > 0 ? { ...item, quantity: newQuantity } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  const handleCheckout = async () => {
    if (cart.length === 0 || !user) return;
    if (!activeShift) {
      toast.error('Növbə açılmayıb. Zəhmət olmasa növbəni açın.');
      setShowShiftModal(true);
      return;
    }

    setLoading(true);
    try {
      const saleItems = cart.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
        price: item.product.price
      }));

      const { data: saleId, error: rpcError } = await supabase.rpc('process_sale', {
        p_total_amount: total,
        p_items: saleItems,
        p_seller_id: parseInt(user.id),
        p_payment_method: paymentMethod,
        p_shift_id: parseInt(activeShift.id)
      });

      if (rpcError) {
        if (rpcError.message.includes('Anbar xətası')) {
          toast.error(rpcError.message);
          return;
        }
        throw rpcError;
      }

      setCart([]);
      setPaymentMethod('cash');
      toast.success(t('pos.success'));
    } catch (e: any) {
      console.error(e);
      toast.error(t('pos.errorPrefix') + (e.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    await openShift(parseFloat(openingBalance));
    setShowShiftModal(false);
    setOpeningBalance('');
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    await closeShift(parseFloat(actualBalance));
    setShowShiftModal(false);
    setActualBalance('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col lg:flex-row gap-6 h-full lg:h-[calc(100vh-8rem)] relative"
    >
      {isLoadingPage ? (
        <div className="flex-1 flex items-center justify-center min-h-[60vh]">
          <LoadingSpinner message="Satış ekranı yüklənir..." />
        </div>
      ) : (
        <>
          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto w-full pr-0 lg:pr-2 pt-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white uppercase tracking-tight">{t('nav.pos')}</h1>
          <div className="flex items-center gap-2">
            <span className="text-[10px] sm:text-sm font-medium text-gray-500 dark:text-gray-400">Növbə:</span>
            {activeShift ? (
              <button
                onClick={() => setShowShiftModal(true)}
                className="text-[10px] sm:text-sm font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-emerald-100 dark:border-emerald-800 flex items-center gap-1.5"
              >
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                Aktiv
              </button>
            ) : (
              <button
                onClick={() => setShowShiftModal(true)}
                className="text-[10px] sm:text-sm font-black text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-red-100 dark:border-red-800"
              >
                Bağlı
              </button>
            )}
          </div>
        </div>
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
          className="p-1 sm:p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6 pb-20"
        >
          {products.map(product => (
            <motion.button
              key={product.id}
              variants={{
                hidden: { opacity: 0, scale: 0.95 },
                show: { opacity: 1, scale: 1 }
              }}
              whileHover={{ y: -4, shadow: "0 10px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" }}
              whileTap={{ scale: 0.98 }}
              onClick={() => addToCart(product)}
              className="bg-white dark:bg-gray-800 p-3 sm:p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 transition-all text-left flex flex-col h-full group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-indigo-600 text-white p-1.5 rounded-lg shadow-lg shadow-indigo-200 dark:shadow-none">
                  <Plus className="w-4 h-4" />
                </div>
              </div>
              
              <div className="w-full aspect-square bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-900/20 dark:to-gray-800 rounded-2xl mb-4 flex items-center justify-center border border-indigo-100/50 dark:border-indigo-800/20 group-hover:scale-105 transition-transform duration-300 overflow-hidden shrink-0">
                <span className="text-2xl sm:text-3xl lg:text-4xl drop-shadow-sm select-none">
                  {product.category === 'dondurma' ? '🍦' : product.category === 'kokteyl' ? '🍹' : '🍰'}
                </span>
              </div>
              
              <div className="flex-1 min-h-0 flex flex-col justify-between">
                <h3 className="font-black text-gray-900 dark:text-white leading-tight text-xs sm:text-base lg:text-lg group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2 h-8 sm:h-10 lg:h-12">{product.name}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest font-black text-gray-400 dark:text-gray-500">{product.category}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div className="text-base sm:text-xl font-black text-indigo-600 dark:text-indigo-400 flex items-baseline gap-0.5">
                  {product.price.toFixed(2)} <span className="text-[10px] sm:text-xs">₼</span>
                </div>
              </div>
            </motion.button>
          ))}
        </motion.div>
      </div>

      {/* Floating View Cart Button (Mobile Only) */}
      {!showMobileCart && cart.length > 0 && (
        <div className="lg:hidden fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-[60]">
          <button
            onClick={() => setShowMobileCart(true)}
            className="w-full bg-indigo-600 text-white shadow-lg p-4 rounded-2xl flex items-center justify-between font-bold"
          >
            <div className="flex items-center">
              <ShoppingCart className="w-5 h-5 mr-2" />
              {t('pos.cart')}
            </div>
            <div className="flex items-center space-x-3">
              <span className="bg-white/20 px-2 py-1 rounded-lg text-sm">
                {cart.reduce((sum, item) => sum + item.quantity, 0)} {t('pos.items')}
              </span>
              <span>{total.toFixed(2)} ₼</span>
            </div>
          </button>
        </div>
      )}

      {/* Cart Sidebar / Mobile Bottom Sheet */}
      <div className={`
        fixed inset-0 z-[100] bg-black/50 lg:hidden transition-opacity
        ${showMobileCart ? 'opacity-100' : 'opacity-0 pointer-events-none'}
      `} onClick={() => setShowMobileCart(false)} />

      <div className={`
        fixed bottom-0 left-0 right-0 z-[200] h-[85vh] lg:h-full
        lg:static lg:w-96
        bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-2xl shadow-xl lg:shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col
        transition-transform duration-300 lg:transform-none
        ${showMobileCart ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'}
      `}>
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 rounded-t-3xl lg:rounded-t-2xl">
          <h2 className="text-lg font-bold flex items-center text-gray-900 dark:text-white">
            <ShoppingCart className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400" />
            {t('pos.cart')}
          </h2>
          <div className="flex items-center">
            <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 px-2.5 py-0.5 rounded-full text-sm font-bold mr-2 lg:mr-0">
              {cart.reduce((sum, item) => sum + item.quantity, 0)} {t('pos.items')}
            </span>
            <button onClick={() => setShowMobileCart(false)} className="lg:hidden p-1 bg-gray-200 dark:bg-gray-700 rounded-full" title="Bağla">
              <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <AnimatePresence mode="popLayout">
            {cart.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500"
              >
                <ShoppingCart className="w-12 h-12 mb-3 opacity-20" />
                <p>{t('pos.emptyCart')}</p>
              </motion.div>
            ) : (
              cart.map(item => (
                <motion.div 
                  key={item.product.id}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600"
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <h4 className="font-bold text-gray-900 dark:text-white truncate">{item.product.name}</h4>
                    <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">{(item.product.price * item.quantity).toFixed(2)} ₼</div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1 hover:bg-white dark:hover:bg-gray-600 rounded-md text-gray-500 dark:text-gray-400" title="Azalt">
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-bold w-6 text-center text-gray-900 dark:text-white">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1 hover:bg-white dark:hover:bg-gray-600 rounded-md text-gray-500 dark:text-gray-400" title="Artır">
                      <Plus className="w-4 h-4" />
                    </button>
                    <button onClick={() => removeFromCart(item.product.id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 rounded-md ml-2" title="Sil">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom)+4rem)] lg:pb-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl space-y-4">
          {/* Payment Method Toggle */}
          <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <button
              onClick={() => setPaymentMethod('cash')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all",
                paymentMethod === 'cash' 
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none" 
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              )}
            >
              💵 Nağd
            </button>
            <button
              onClick={() => setPaymentMethod('card')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all",
                paymentMethod === 'card' 
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none" 
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              )}
            >
              💳 Kart
            </button>
          </div>

          <div className="flex justify-between items-center px-1">
            <span className="text-gray-600 dark:text-gray-400 font-medium">{t('pos.total')}</span>
            <span className="text-2xl font-black text-gray-900 dark:text-white">{total.toFixed(2)} ₼</span>
          </div>
          
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || loading || !activeShift}
            className="w-full bg-indigo-600 text-white rounded-xl py-4 font-bold text-lg hover:bg-indigo-700 transition disabled:opacity-50 shadow-lg shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-2"
          >
            {loading ? '...' : (
              <>
                <CreditCard className="w-5 h-5" />
                {t('pos.checkout')}
              </>
            )}
          </button>
          {!activeShift && !loading && (
            <p className="text-[10px] text-center text-red-500 font-bold uppercase tracking-widest mt-2 animate-pulse">
              Satış üçün növbəni açın
            </p>
          )}
        </div>
      </div>

      {/* Shift Management Modal */}
      <AnimatePresence>
        {showShiftModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[300] flex items-end lg:items-center justify-center p-0 lg:p-4" onClick={() => setShowShiftModal(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-3xl p-6 lg:p-8 w-full max-w-md shadow-2xl relative border border-gray-100 dark:border-gray-700 pb-[calc(2rem+env(safe-area-inset-bottom))] lg:pb-8"
            >
              <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 lg:hidden" />
              
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {activeShift ? 'Növbəni Bağla (Z-Hesabat)' : 'Növbəni Aç'}
                </h2>
                <button onClick={() => setShowShiftModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" title={t('common.cancel')}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {activeShift ? (
                <form onSubmit={handleCloseShift} className="space-y-6">
                  <div>
                    <label htmlFor="actual-balance" className="block text-sm font-bold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-widest">
                      Kassada olan faktiki nağd məbləğ (₼)
                    </label>
                    <input
                      id="actual-balance"
                      title="Faktiki nağd məbləğ"
                      required
                      type="number"
                      step="0.01"
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-4 text-xl font-black text-indigo-600 dark:text-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                      placeholder="0.00"
                      value={actualBalance}
                      onChange={e => setActualBalance(e.target.value)}
                    />
                    <p className="mt-2 text-[10px] text-gray-500 font-medium">
                      * Sistem kəsir və ya artıq məbləği avtomatik hesablayacaq.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={shiftLoading}
                    className="w-full bg-red-600 text-white rounded-2xl py-4 font-black text-lg hover:bg-red-700 transition shadow-lg shadow-red-200 dark:shadow-none"
                  >
                    {shiftLoading ? '...' : 'Növbəni Bağla'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleOpenShift} className="space-y-6">
                  <div>
                    <label htmlFor="opening-balance" className="block text-sm font-bold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-widest">
                      Kassa Açılış Balansı (₼)
                    </label>
                    <input
                      id="opening-balance"
                      title="Açılış balansı"
                      required
                      type="number"
                      step="0.01"
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-4 text-xl font-black text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none"
                      placeholder="0.00"
                      value={openingBalance}
                      onChange={e => setOpeningBalance(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={shiftLoading}
                    className="w-full bg-emerald-600 text-white rounded-2xl py-4 font-black text-lg hover:bg-emerald-700 transition shadow-lg shadow-emerald-200 dark:shadow-none"
                  >
                    {shiftLoading ? '...' : 'Növbəni Aç'}
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}
