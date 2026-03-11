import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, Shield, Save, Bell, BellOff } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';

export default function Settings() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    role: ''
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const { isSupported, subscription, loading: pushLoading, subscribeUser, unsubscribeUser } = usePushNotifications();

  const [bonus, setBonus] = useState<number>(0);

  useEffect(() => {
    const loadData = async () => {
      const { data: userData } = await supabase.from('users').select('*').eq('username', user?.username).maybeSingle();

      if (userData) {
        setProfile({
          name: userData.name || '',
          email: userData.email || '',
          phone: userData.phone || '',
          role: userData.role || ''
        });

        const { data: bonusData } = await supabase
          .from('seller_bonuses_view')
          .select('total_bonus')
          .eq('seller_name', userData.name || '')
          .maybeSingle();

        if (bonusData) setBonus(bonusData.total_bonus);
      }
    };

    if (user) loadData();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from('users').update({
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        role: profile.role
      }).eq('username', user?.username);

      if (error) throw error;

      setSaved(true);
      toast.success(t('common.save'));
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error(error);
      toast.error('Gözlənilməz xəta baş verdi');
    }
    setLoading(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.settings')}</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="flex items-center space-x-6">
            <div className="w-24 h-24 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-inner">
              <span className="text-4xl font-black">{profile.name.charAt(0) || 'U'}</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{profile.name || t('settings.user')}</h2>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-gray-500 dark:text-gray-400 font-medium">{profile.role || t('settings.roleNotAssigned')}</p>
                {bonus > 0 && (
                  <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold rounded-full">
                    Bu aykı bonus: {bonus.toFixed(2)} ₼
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center">
                  <User className="w-4 h-4 mr-2 text-gray-400 dark:text-gray-500" />
                  {t('hr.fullName')}
                </label>
                <input
                  type="text"
                  required
                  value={profile.name}
                  onChange={e => setProfile({ ...profile, name: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center">
                  <Mail className="w-4 h-4 mr-2 text-gray-400 dark:text-gray-500" />
                  {t('suppliers.email')}
                </label>
                <input
                  type="email"
                  required
                  value={profile.email}
                  onChange={e => setProfile({ ...profile, email: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center">
                  <Phone className="w-4 h-4 mr-2 text-gray-400 dark:text-gray-500" />
                  {t('settings.phone')}
                </label>
                <input
                  type="tel"
                  value={profile.phone}
                  onChange={e => setProfile({ ...profile, phone: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center">
                  <Shield className="w-4 h-4 mr-2 text-gray-400 dark:text-gray-500" />
                  {t('hr.role')}
                </label>
                <input
                  type="text"
                  required
                  value={profile.role}
                  onChange={e => setProfile({ ...profile, role: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                />
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end space-x-4">
              {saved && (
                <motion.span
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-green-600 dark:text-green-400 font-medium flex items-center"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {t('common.save')}
                </motion.span>
              )}
              <button
                type="submit"
                disabled={loading}
                className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center hover:bg-indigo-700 transition disabled:opacity-50 shadow-sm hover:shadow-md"
              >
                {loading ? '...' : t('common.save')}
              </button>
            </div>
          </form>
        </div>

        <div className="p-6 sm:p-8 border-t border-gray-100 dark:border-gray-700 bg-gray-50/20 dark:bg-gray-900/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className={`p-3 rounded-xl ${subscription ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                {subscription ? <Bell className="w-6 h-6" /> : <BellOff className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Push Bildirişlər</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {subscription ? 'Bildirişlər aktivdir' : 'Vacib sistem xəbərdarlıqlarını cihazınızda alın'}
                </p>
              </div>
            </div>
            {isSupported ? (
              <div className="flex flex-col items-end space-y-2">
                <button
                  onClick={subscription ? unsubscribeUser : subscribeUser}
                  disabled={pushLoading}
                  className={`px-6 py-2 rounded-xl font-bold transition-all ${
                    subscription 
                      ? 'border-2 border-red-500 text-red-500 hover:bg-red-50' 
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  } disabled:opacity-50`}
                >
                  {pushLoading ? '...' : subscription ? 'Deaktiv et' : 'Aktiv et'}
                </button>
                {subscription && (
                  <button
                    onClick={async () => {
                      try {
                        const { error } = await supabase.functions.invoke('send-push', {
                          body: {
                            user_id: user?.id,
                            title: '🚀 Professional Test',
                            body: 'Təbriklər! Push bildirişlər artıq zəngin media dəstəyi ilə işləyir.',
                            url: '/settings',
                            image: 'https://images.unsplash.com/photo-1586717791821-3f44a563dc4c?w=800&q=80',
                            actions: [
                              { action: 'view_pos', title: 'Satışa keç' },
                              { action: 'close', title: 'Bağla' }
                            ]
                          }
                        });
                        if (error) throw error;
                        toast.success('Test bildirişi göndərildi!');
                      } catch (err) {
                        console.error(err);
                        toast.error('Test göndərilərkən xəta baş verdi.');
                      }
                    }}
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                  >
                    Test Bildirişi Göndər
                  </button>
                )}
              </div>
            ) : (
              <span className="text-xs text-red-500 font-medium font-bold">Dəstəklənmir</span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
