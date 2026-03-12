import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

// VAPID Public Key - This should ideally be in an environment variable
// If you don't have one, you can generate it using 'npx web-push generate-vapid-keys'
const VAPID_PUBLIC_KEY = 'BFeYQPH-QTk5rwGxzL3IOr-Ya3OanMTyb9-miBy69qSP4IfAopE5tuLEX2XiPFZtnSseilLNT2URtuIuyNVfjB4';

function urlBase64ToUint8Array(base64String: string) {
  const sanitized = base64String.trim().replace(/\s/g, '');
  const padding = '='.repeat((4 - (sanitized.length % 4)) % 4);
  const base64 = (sanitized + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  try {
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  } catch (err) {
    console.error('VAPID key decoding failed. String:', base64);
    throw err;
  }
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      checkSubscription();
    } else {
      setLoading(false);
    }
  }, []);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      setSubscription(sub);
    } catch (error) {
      console.error('Error checking push subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeUser = async () => {
    try {
      setLoading(true);

      // Proactive permission check
      if (Notification.permission === 'denied') {
        toast.error('Bildiriş icazəsi bloklanıb. Zəhmət olmasa brauzer tənzimləmələrindən (sayt adının solundakı kilid işarəsi) icazə verin.');
        setLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      // Save to Supabase
      if (!user) throw new Error('User not authenticated');

      const p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(sub.getKey('p256dh')!) as any));
      const auth = btoa(String.fromCharCode.apply(null, new Uint8Array(sub.getKey('auth')!) as any));

      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint: sub.endpoint,
          p256dh: p256dh,
          auth: auth
        }, { onConflict: 'endpoint' });

      if (error) throw error;

      setSubscription(sub);
      toast.success('Bildirişlər aktiv edildi!');
    } catch (error: any) {
      console.error('Error subscribing to push:', error);
      if (Notification.permission === 'denied') {
        toast.error('Bildiriş icazəsi bloklanıb. Zəhmət olmasa brauzer tənzimləmələrindən icazə verin.');
      } else {
        toast.error('Bildirişləri aktiv edərkən xəta baş verdi.');
      }
    } finally {
      setLoading(false);
    }
  };

  const unsubscribeUser = async () => {
    try {
      setLoading(true);
      if (subscription) {
        await subscription.unsubscribe();
        
        // Remove from Supabase
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', subscription.endpoint);
          
        setSubscription(null);
        toast.success('Bildirişlər deaktiv edildi.');
      }
    } catch (error) {
      console.error('Error unsubscribing from push:', error);
      toast.error('Deaktiv edərkən xəta baş verdi.');
    } finally {
      setLoading(false);
    }
  };

  return {
    isSupported,
    subscription,
    loading,
    subscribeUser,
    unsubscribeUser
  };
}
