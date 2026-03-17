import React, { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, CreditCard, X, Package } from 'lucide-react';
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
  const { activeShift, openShift, closeShift, getExpectedCash, getLastShiftClosingBalance, loading: shiftLoading } = useShift();
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<{ product: any, quantity: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  
  // Shift Modals
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [openingBalance, setOpeningBalance] = useState<string>('');
  const [suggestedBalance, setSuggestedBalance] = useState<number>(0);
  const [closingActual, setClosingActual] = useState<string>('');
  const [closingExpected, setClosingExpected] = useState<number>(0);
  const [shiftNotes, setShiftNotes] = useState('');

  // 1. Data Fetching & Utility Functions
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

  const checkShiftStatus = async () => {
    const lastBalance = await getLastShiftClosingBalance();
    setSuggestedBalance(lastBalance);
    setOpeningBalance(lastBalance.toFixed(2));
  };

  const addToCart = (product: any) => {
    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
    toast.success(`${product.name} səbətə əlavə edildi`, {
      icon: '🛒',
      position: 'bottom-center',
      className: 'mb-24 lg:mb-0'
    });
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

  // 2. Lifecycle Effects
  useEffect(() => {
    fetchProducts();
    checkShiftStatus();
  }, []);

  // Body scroll lock when mobile cart is open
  useEffect(() => {
    if (showMobileCart) {
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
  }, [showMobileCart]);

  // 3. Shift Management Functions

  const handleOpenShift = async () => {
    try {
      const balance = parseFloat(openingBalance);
      if (isNaN(balance)) {
        toast.error('Düzgün məbləğ daxil edin');
        return;
      }
      await openShift(balance);
      setShowOpenModal(false);
    } catch (e) {
      // Error handled in ShiftContext
    }
  };

  const handleCloseShift = async () => {
    try {
      const balance = parseFloat(closingActual);
      if (isNaN(balance)) {
        toast.error('Düzgün məbləğ daxil edin');
        return;
      }
      await closeShift(balance, shiftNotes);
      setShowCloseModal(false);
      setClosingActual('');
      setShiftNotes('');
    } catch (e) {
      // Error handled in ShiftContext
    }
  };

  const startClosingProcess = async () => {
    const expected = await getExpectedCash();
    setClosingExpected(expected);
    setClosingActual(expected.toString());
    setShowCloseModal(true);
  };
  const handleCheckout = async () => {
    if (!activeShift) {
      toast.error('Zəhmət olmasa əvvəlcə növbəni açın!', { icon: '🔐' });
      setShowOpenModal(true);
      return;
    }
    if (cart.length === 0 || !user || loading) return;

    setLoading(true);
    try {
      const saleItems = cart.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
        price: item.product.price
      }));

      const { error: rpcError } = await supabase.rpc('process_sale', {
        p_total_amount: total,
        p_items: saleItems,
        p_seller_id: parseInt(user.id),
        p_payment_method: paymentMethod,
        p_shift_id: activeShift.id
      });

      if (rpcError) throw rpcError;

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

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex-1 flex flex-col gap-6 min-h-0 relative"
    >
      {/* Shift Ribbon */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-3 h-3 rounded-full animate-pulse",
            activeShift ? "bg-green-500" : "bg-red-500"
          )} />
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
              Növbə: {activeShift ? 'AÇIQ' : 'BAĞLI'}
            </p>
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              {activeShift ? `Başladı: ${new Date(activeShift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Növbəni açmağınız xahiş olunur'}
            </p>
          </div>
        </div>
        
        <button
          onClick={() => activeShift ? startClosingProcess() : setShowOpenModal(true)}
          className={cn(
            "px-6 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-indigo-200 dark:shadow-none",
            activeShift 
              ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800 hover:bg-red-500 hover:text-white" 
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          )}
        >
          {activeShift ? 'Növbəni Təhvil Ver' : 'Növbəni Aç'}
        </button>
      </div>

      <AnimatePresence>
        {/* Open Shift Modal */}
        {showOpenModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
              onClick={() => !shiftLoading && setShowOpenModal(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-gray-700 p-8"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl">
                  <Plus className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Növbəni Aç</h3>
                  <p className="text-sm text-gray-500">Kassa balansını təsdiqləyin</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-gray-50 dark:bg-gray-900/30 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Əvvəlki növbədən qalan (Gözlənilən)</p>
                  <p className="text-2xl font-black text-gray-900 dark:text-white">{suggestedBalance.toFixed(2)} ₼</p>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Sizdə olan (Fiziki Məbləğ)</label>
                  <input
                    type="number"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 text-xl font-black text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-0 transition-colors"
                    placeholder="Məbləği daxil edin..."
                    autoFocus
                  />
                  {Math.abs(parseFloat(openingBalance || '0') - suggestedBalance) > 0.01 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mt-2 flex items-center gap-1">
                      <X className="w-3 h-3" /> Fərq: {(parseFloat(openingBalance || '0') - suggestedBalance).toFixed(2)} ₼ (Dispute yaradılacaq)
                    </p>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowOpenModal(false)}
                    className="flex-1 py-4 rounded-2xl font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                  >
                    Ləğv et
                  </button>
                  <button
                    onClick={handleOpenShift}
                    disabled={shiftLoading || !openingBalance}
                    className="flex-2 py-4 rounded-2xl font-black bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {shiftLoading ? '...' : 'Növbəni Aç'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Handover Modal */}
        {showCloseModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
              onClick={() => !shiftLoading && setShowCloseModal(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-gray-700 p-8"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-2xl">
                  <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Növbəni Təhvil Ver</h3>
                  <p className="text-sm text-gray-500">Günü yekunlaşdırın</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-900/30 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Gözlənilən</p>
                    <p className="text-lg font-black text-gray-900 dark:text-white">{closingExpected.toFixed(2)} ₼</p>
                  </div>
                  <div className={cn(
                    "p-4 rounded-2xl border flex flex-col justify-center",
                    Math.abs(parseFloat(closingActual || '0') - closingExpected) < 0.01 
                      ? "bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800"
                  )}>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Fərq</p>
                    <p className={cn(
                      "text-lg font-black",
                      Math.abs(parseFloat(closingActual || '0') - closingExpected) < 0.01 
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    )}>
                      {(parseFloat(closingActual || '0') - closingExpected).toFixed(2)} ₼
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Təhvil verilən real məbləğ</label>
                  <input
                    type="number"
                    value={closingActual}
                    onChange={(e) => setClosingActual(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 text-xl font-black text-gray-900 dark:text-white focus:border-red-500 focus:ring-0 transition-colors"
                    placeholder="Fiziki məbləği daxil edin..."
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Qeydlər</label>
                  <textarea
                    value={shiftNotes}
                    onChange={(e) => setShiftNotes(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-0 transition-colors"
                    rows={2}
                    placeholder="Varsa uyğunsuzluq səbəbini qeyd edin..."
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowCloseModal(false)}
                    className="flex-1 py-4 rounded-2xl font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                  >
                    Ləğv et
                  </button>
                  <button
                    onClick={handleCloseShift}
                    disabled={shiftLoading || !closingActual}
                    className="flex-2 py-4 rounded-2xl font-black bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {shiftLoading ? '...' : 'Təhvil Ver'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {isLoadingPage ? (
        <div className="flex-1 flex items-center justify-center min-h-[60vh]">
          <LoadingSpinner message="Satış ekranı yüklənir..." />
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row gap-4 h-full min-h-0 lg:overflow-hidden px-4 sm:px-6 lg:px-8 pb-4 lg:pb-8">
          {/* Left Side: Products Grid */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-white dark:bg-gray-800/50 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm lg:overflow-hidden">
            <div className="p-5 flex items-center justify-between border-b border-gray-100/50 dark:border-gray-700/50 bg-white/50 dark:bg-gray-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('nav.pos')}</h1>
              </div>
              <div className="bg-white dark:bg-gray-700 px-3 py-1 rounded-full border border-gray-100 dark:border-gray-600 shadow-sm">
                <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase">
                  {products.length} Məhsul
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 custom-scrollbar">
              <motion.div 
                variants={{
                  hidden: { opacity: 0 },
                  show: {
                    opacity: 1,
                    transition: { staggerChildren: 0.04 }
                  }
                }}
                initial="hidden"
                animate="show"
                className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 pb-8"
              >
                {products.length === 0 ? (
                  <div className="col-span-full py-20 text-center">
                    <Package className="w-16 h-16 text-gray-200 dark:text-gray-700 mx-auto mb-4" />
                    <p className="text-gray-400 font-bold italic">Məhsul tapılmadı.</p>
                  </div>
                ) : (
                  products.map(product => (
                    <motion.button
                      key={product.id}
                      variants={{
                        hidden: { opacity: 0, scale: 0.95 },
                        show: { opacity: 1, scale: 1 }
                      }}
                      whileHover={{ y: -4, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => addToCart(product)}
                      className="group bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 border border-gray-100 dark:border-gray-700 hover:border-indigo-500/50 transition-all duration-300 text-left flex flex-col h-full relative overflow-hidden"
                    >
                      <div className="w-full aspect-square bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-900/10 dark:to-gray-800 rounded-xl mb-3 flex items-center justify-center border border-indigo-100/50 dark:border-indigo-800/10 group-hover:scale-105 transition-transform duration-500 overflow-hidden shrink-0">
                        <span className="text-3xl drop-shadow-md select-none transform group-hover:rotate-12 transition-transform duration-500">
                          {product.category === 'dondurma' ? '🍦' : product.category === 'kokteyl' ? '🍹' : '🍰'}
                        </span>
                      </div>
                      
                      <div className="flex-1 min-h-0 flex flex-col justify-between">
                        <h3 className="font-bold text-gray-900 dark:text-white leading-snug text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2 uppercase tracking-tight">{product.name}</h3>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[9px] uppercase tracking-widest font-black text-gray-400 dark:text-gray-500">{product.category}</span>
                          <div className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                            {product.price.toFixed(2)} ₼
                          </div>
                        </div>
                      </div>

                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 duration-300">
                        <div className="bg-indigo-600 text-white p-1.5 rounded-lg shadow-lg">
                          <Plus className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </motion.button>
                  ))
                )}
              </motion.div>
            </div>
          </div>

          {/* Right Side: Cart Section - Sticky in Viewport */}
          <div className={`
            fixed lg:sticky lg:top-0 inset-x-0 bottom-0 z-[200] lg:z-auto
            h-[85vh] lg:h-[calc(100vh-12rem)] lg:w-[350px] lg:min-w-[350px]
            bg-white dark:bg-gray-800
            rounded-t-[2.5rem] lg:rounded-[2rem] 
            shadow-[0_-20px_50px_-15px_rgba(0,0,0,0.1)] lg:shadow-md
            border-t lg:border border-indigo-100/50 dark:border-gray-800
            flex flex-col overflow-hidden
            transition-all duration-500
            ${showMobileCart ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'}
          `}>
            {/* Cart Header */}
            <div className="p-5 border-b border-gray-100 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-900/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <h2 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('pos.cart')}</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-indigo-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-black">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)} ədəd
                </span>
                <button onClick={() => setShowMobileCart(false)} className="lg:hidden p-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg" title="Bağla">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Cart Items List - Independent Scroll */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-none">
              <AnimatePresence mode="popLayout" initial={false}>
                {cart.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center text-gray-400 text-center opacity-50"
                  >
                    <ShoppingCart className="w-10 h-10 mb-2" />
                    <p className="text-xs font-bold italic">{t('pos.emptyCart')}</p>
                  </motion.div>
                ) : (
                  cart.map(item => (
                    <motion.div 
                      key={item.product.id}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="group flex flex-col p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0 pr-2">
                          <h4 className="font-bold text-gray-900 dark:text-white text-xs uppercase tracking-tight truncate">{item.product.name}</h4>
                        </div>
                        <div className="text-xs font-black text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                          {(item.product.price * item.quantity).toFixed(2)} ₼
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm">
                          <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Azalt">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-black w-6 text-center text-gray-900 dark:text-white text-[11px]">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1 text-gray-400 hover:text-indigo-500 transition-colors" title="Artır">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <button onClick={() => removeFromCart(item.product.id)} className="p-1.5 text-red-400 hover:text-red-600 transition-colors" title="Sil">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Cart Footer - Pinned to bottom of sidebar */}
            <div className="p-5 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800 space-y-4">
              <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                <button
                  onClick={() => setPaymentMethod('cash')}
                  className={cn(
                    "flex-1 flex items-center justify-center py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    paymentMethod === 'cash' ? "bg-indigo-600 text-white shadow-lg" : "text-gray-400"
                  )}
                >
                  💵 Nağd
                </button>
                <button
                  onClick={() => setPaymentMethod('card')}
                  className={cn(
                    "flex-1 flex items-center justify-center py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    paymentMethod === 'card' ? "bg-indigo-600 text-white shadow-lg" : "text-gray-400"
                  )}
                >
                  💳 Kart
                </button>
              </div>

              <div className="flex justify-between items-end border-b border-gray-200 dark:border-gray-700 pb-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">{t('pos.total')}</span>
                  <span className="text-2xl font-black text-gray-900 dark:text-white leading-none tracking-tighter">{total.toFixed(2)} ₼</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[9px] font-bold text-green-500 uppercase tracking-widest leading-none mb-1">Bonus</span>
                  <span className="text-xs font-black text-green-500 leading-none">+{(total * 0.05).toFixed(2)}</span>
                </div>
              </div>
              
              <button
                onClick={handleCheckout}
                disabled={cart.length === 0 || loading}
                className="group relative w-full h-14 bg-indigo-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-xl shadow-indigo-500/20 overflow-hidden flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    <span>{t('pos.checkout')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Cart Floating Link */}
      {cart.length > 0 && !showMobileCart && (
        <motion.button
          initial={{ scale: 0, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowMobileCart(true)}
          className="lg:hidden fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-6 z-[250] bg-indigo-600 text-white px-5 py-4 rounded-2xl shadow-2xl shadow-indigo-600/40 flex items-center gap-3 border-4 border-white dark:border-gray-800"
        >
          <div className="relative">
            <ShoppingCart className="w-5 h-5" />
            <span className="absolute -top-3 -right-3 bg-red-500 text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-indigo-600">
              {cart.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          </div>
          <span className="font-black text-xs uppercase tracking-widest">Səbət</span>
        </motion.button>
      )}
    </motion.div>
  );
}
