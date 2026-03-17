import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, Shield, Save, Bell, BellOff, Package, Briefcase, FileText, Send, TrendingUp, TrendingDown, DollarSign, X, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { cn } from '../lib/utils';

export default function Settings() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    notify_low_stock: true,
    notify_shifts: true,
    notify_reports: true
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const { isSupported, subscription, loading: pushLoading, subscribeUser, unsubscribeUser } = usePushNotifications();

  const [bonus, setBonus] = useState<number>(0);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcast, setBroadcast] = useState({ title: '', message: '' });

  useEffect(() => {
    const loadData = async () => {
      const { data: userData } = await supabase.from('users').select('*').eq('username', user?.username).maybeSingle();

      if (userData) {
        setProfile({
          name: userData.name || '',
          email: userData.email || '',
          phone: userData.phone || '',
          role: userData.role || '',
          notify_low_stock: userData.notify_low_stock ?? true,
          notify_shifts: userData.notify_shifts ?? true,
          notify_reports: userData.notify_reports ?? true
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

  const handleSendBroadcast = async () => {
    if (!broadcast.title || !broadcast.message) return;
    setIsBroadcasting(true);
    try {
      const { data: secrets } = await supabase.from('secrets').select('*');
      const url = secrets?.find((s: any) => s.name === 'SUPABASE_URL')?.value;
      const key = secrets?.find((s: any) => s.name === 'SUPABASE_SERVICE_ROLE_KEY')?.value;

      if (!url || !key) throw new Error('API keys not found in database');

      const response = await fetch(`${url}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          title: broadcast.title,
          body: broadcast.message,
          broadcast: true,
          url: '/dashboard'
        })
      });

      if (!response.ok) throw new Error('Failed to send broadcast');
      
      toast.success('Bildiriş bütün işçilərə göndərildi');
      setBroadcast({ title: '', message: '' });
    } catch (e: any) {
      toast.error('Xəta: ' + e.message);
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from('users').update({
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        notify_low_stock: profile.notify_low_stock,
        notify_shifts: profile.notify_shifts,
        notify_reports: profile.notify_reports,
        ...(user?.role === 'admin' ? { role: profile.role } : {})
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
                  id="full-name"
                  type="text"
                  required
                  placeholder={t('hr.fullName')}
                  title={t('hr.fullName')}
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
                  id="email-address"
                  type="email"
                  required
                  placeholder={t('suppliers.email')}
                  title={t('suppliers.email')}
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
                  id="phone-number"
                  type="tel"
                  placeholder={t('settings.phone')}
                  title={t('settings.phone')}
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
                  id="user-role"
                  type="text"
                  required
                  disabled={user?.role !== 'admin'}
                  placeholder={t('hr.role')}
                  title={t('hr.role')}
                  value={profile.role}
                  onChange={e => setProfile({ ...profile, role: e.target.value })}
                  className={cn(
                    "w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow",
                    user?.role !== 'admin' && "opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-800"
                  )}
                />
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-500" />
                Bildiriş Üstünlükləri
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { id: 'notify_low_stock', label: 'Azalan Stok', icon: Package },
                  { id: 'notify_shifts', label: 'Növbələr', icon: Briefcase },
                  { id: 'notify_reports', label: 'Hesabatlar', icon: FileText }
                ].map((item: any) => (
                  <label key={item.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/30 rounded-2xl border border-gray-100 dark:border-gray-700 cursor-pointer hover:border-indigo-200 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm group-hover:text-indigo-600 transition-colors">
                        <item.icon className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{item.label}</span>
                    </div>
                    <div className="relative inline-flex items-center">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={(profile as any)[item.id]}
                        onChange={e => setProfile({ ...profile, [item.id]: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-600 peer-checked:bg-indigo-600"></div>
                    </div>
                  </label>
                ))}
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

      {/* Admin Broadcast Tool */}
      {profile?.role === 'admin' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-[2rem] p-8 shadow-sm border border-gray-100 dark:border-gray-700 mt-8"
        >
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Elan Göndər</h2>
              <p className="text-sm font-medium text-gray-400">Bütün işçilərə dərhal push bildiriş göndərin</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Mesaj Başlığı</label>
              <input
                type="text"
                placeholder="Məsələn: Təcili Elan"
                className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                value={broadcast.title}
                onChange={e => setBroadcast({ ...broadcast, title: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Mesaj Mətni</label>
              <textarea
                rows={3}
                placeholder="Mesajınızı buraya yazın..."
                className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all resize-none"
                value={broadcast.message}
                onChange={e => setBroadcast({ ...broadcast, message: e.target.value })}
              />
            </div>

            <button
              onClick={handleSendBroadcast}
              disabled={isBroadcasting || !broadcast.title || !broadcast.message}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isBroadcasting ? (
                <>İşlənilir...</>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Bildirişi Göndər
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
