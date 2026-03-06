import React, { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, CreditCard, X } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';

import { useAuth } from '../contexts/AuthContext';

export default function POS() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<{ product: any, quantity: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const [{ data: prodData, error: prodErr }, { data: costData }] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('product_costs_view').select('*')
      ]);

      if (prodErr) throw prodErr;

      const costMap = new Map((costData || []).map(c => [c.product_id, c.calculated_cost_price]));

      const productsWithCost = (prodData || []).map(p => {
        const costPrice = costMap.get(p.id) || 0;
        return { ...p, costPrice };
      });

      setProducts(productsWithCost);
    } catch (e) {
      console.error(e);
      toast.error(t('pos.error'));
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
        p_seller_id: parseInt(user.id)
      });

      if (rpcError) {
        if (rpcError.message.includes('Anbar xətası')) {
          toast.error(rpcError.message);
          return;
        }
        throw rpcError;
      }

      setCart([]);
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col lg:flex-row gap-6 h-full lg:h-[calc(100vh-8rem)] pb-20 lg:pb-0 relative"
    >
      {/* Products Grid */}
      <div className="flex-1 overflow-y-auto w-full pr-0 lg:pr-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.pos')}</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Giriş edilib:</span>
            <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-800">
              {user?.name}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
          {products.map(product => (
            <button
              key={product.id}
              onClick={() => addToCart(product)}
              className="bg-white dark:bg-gray-800 p-3 lg:p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-md transition text-left flex flex-col h-full"
            >
              <div className="w-full aspect-square bg-indigo-50 dark:bg-indigo-900/30 rounded-xl mb-3 flex items-center justify-center">
                <span className="text-3xl">🍦</span>
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white leading-tight mb-1">{product.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 capitalize mb-2">{product.category}</p>
              <div className="mt-auto font-bold text-indigo-600 dark:text-indigo-400 text-lg">{product.price.toFixed(2)} ₼</div>
            </button>
          ))}
        </div>
      </div>

      {/* Floating View Cart Button (Mobile Only) */}
      {!showMobileCart && cart.length > 0 && (
        <div className="lg:hidden fixed bottom-24 left-4 right-4 z-40">
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
        fixed inset-0 z-[70] bg-black/50 lg:hidden transition-opacity
        ${showMobileCart ? 'opacity-100' : 'opacity-0 pointer-events-none'}
      `} onClick={() => setShowMobileCart(false)} />

      <div className={`
        fixed bottom-0 left-0 right-0 z-[70] h-[85vh] lg:h-full
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
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
              <ShoppingCart className="w-12 h-12 mb-3 opacity-20" />
              <p>{t('pos.emptyCart')}</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.product.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
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
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl">
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-600 dark:text-gray-400 font-medium">{t('pos.total')}</span>
            <span className="text-2xl font-black text-gray-900 dark:text-white">{total.toFixed(2)} ₼</span>
          </div>
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || loading}
            className="w-full bg-indigo-600 text-white rounded-xl py-4 font-bold text-lg hover:bg-indigo-700 transition disabled:opacity-50 shadow-lg shadow-indigo-200 dark:shadow-none"
            title={t('pos.checkout')}
          >
            {loading ? '...' : t('pos.checkout')}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
