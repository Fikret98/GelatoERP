import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { toast } from 'react-hot-toast';

interface Shift {
  id: string;
  user_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_balance: number;
  status: 'open' | 'closed';
}

interface ShiftContextType {
  activeShift: Shift | null;
  loading: boolean;
  openShift: (openingBalance: number, verifiedLastBalance?: number) => Promise<void>;
  closeShift: (actualBalance: number, notes?: string) => Promise<void>;
  refreshShift: () => Promise<void>;
  getExpectedCash: () => Promise<number>;
  getLastShift: () => Promise<any | null>;
  getLastShiftClosingBalance: () => Promise<number>;
  getGlobalCashBalance: () => Promise<number>;
  checkSecurityBlock: () => Promise<{ isBlocked: boolean, limit: number, currentDiscrepancy: number }>;
}

const ShiftContext = createContext<ShiftContextType | undefined>(undefined);

export function ShiftProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshShift = async () => {
    if (!user) {
      setActiveShift(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_active_shift', {
        p_user_id: parseInt(user.id)
      });

      if (error) throw error;
      setActiveShift(data && data.length > 0 ? data[0] : null);
    } catch (e) {
      console.error('Error fetching shift:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshShift();
  }, [user]);

  const checkSecurityBlock = async () => {
    try {
      const [{ data: settings }, { data: pendingDiscrepancies }] = await Promise.all([
        supabase.from('app_settings').select('value').eq('key', 'shift_security').single(),
        supabase.from('shift_discrepancies').select('difference').eq('status', 'pending')
      ]);

      const limit = (settings?.value as any)?.critical_limit || 50;
      const currentMaxDiscrepancy = Math.max(...(pendingDiscrepancies || []).map(d => Math.abs(d.difference)), 0);

      return {
        isBlocked: currentMaxDiscrepancy > limit,
        limit,
        currentDiscrepancy: currentMaxDiscrepancy
      };
    } catch (e) {
      console.error('Error checking security block:', e);
      return { isBlocked: false, limit: 50, currentDiscrepancy: 0 };
    }
  };

  const openShift = async (openingBalance: number, verifiedLastBalance?: number) => {
    if (!user) return;
    setLoading(true);
    try {
      const userIdInt = parseInt(user.id);

      // Check for security block first
      const { isBlocked, limit } = await checkSecurityBlock();
      if (isBlocked) {
        throw new Error(`Limit (${limit} ₼) üzərində həll olunmamış kəsir tapıldı. Admin təsdiqi gözlənilir.`);
      }

      // 1. Create the new shift
      const { data: newShift, error: shiftErr } = await supabase
        .from('shifts')
        .insert([{
          user_id: userIdInt,
          opening_balance: openingBalance,
          status: 'open'
        }])
        .select()
        .single();

      if (shiftErr) throw shiftErr;

      // 2. Handle discrepancy if verifier counted differently from previous seller
      if (verifiedLastBalance !== undefined) {
        const lastShift = await getLastShift();
        if (lastShift && Math.abs(lastShift.actual_cash_balance - verifiedLastBalance) > 0.01) {
          await supabase.from('shift_discrepancies').insert([{
            shift_id: lastShift.id,
            reported_by_id: lastShift.user_id,
            verified_by_id: userIdInt,
            system_expected: lastShift.expected_cash_balance,
            seller_reported: lastShift.actual_cash_balance,
            verifier_counted: verifiedLastBalance,
            difference: verifiedLastBalance - lastShift.actual_cash_balance,
            status: 'pending'
          }]);
          toast('Təhvil-təslimdə uyğunsuzluq qeyd edildi.', { icon: '⚠️' });
        }
      }

      setActiveShift(newShift);
      toast.success('Növbə açıldı');
    } catch (e: any) {
      toast.error('Növbə açılarkən xəta: ' + e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const closeShift = async (actualBalance: number, notes?: string) => {
    if (!activeShift) return;
    setLoading(true);
    try {
      // 1. Get current totals for this shift
      const [{ data: salesData }, { data: expData }, { data: incData }] = await Promise.all([
        supabase.from('sales').select('total_amount, payment_method').eq('shift_id', activeShift.id),
        supabase.from('expenses').select('amount, payment_method').eq('shift_id', activeShift.id),
        supabase.from('incomes').select('amount, payment_method').eq('shift_id', activeShift.id)
      ]);

      const cashSales = (salesData || [])
        .filter(s => s.payment_method === 'cash')
        .reduce((sum, s) => sum + s.total_amount, 0);
      const cardSales = (salesData || [])
        .filter(s => s.payment_method === 'card')
        .reduce((sum, s) => sum + s.total_amount, 0);

      const cashIncomes = (incData || [])
        .filter(i => i.payment_method === 'cash')
        .reduce((sum, i) => sum + i.amount, 0);
      const cardIncomes = (incData || [])
        .filter(i => i.payment_method === 'card')
        .reduce((sum, i) => sum + i.amount, 0);

      const cashExpenses = (expData || [])
        .filter(e => e.payment_method === 'cash')
        .reduce((sum, e) => sum + e.amount, 0);
      const cardExpenses = (expData || [])
        .filter(e => e.payment_method === 'card')
        .reduce((sum, e) => sum + e.amount, 0);
      
      const expectedCash = activeShift.opening_balance + cashSales + cashIncomes - cashExpenses;

      // 2. Update the shift record
      const { error } = await supabase
        .from('shifts')
        .update({
          closed_at: new Date().toISOString(),
          status: 'closed',
          actual_cash_balance: actualBalance,
          expected_cash_balance: expectedCash,
          cash_sales: cashSales,
          card_sales: cardSales,
          total_incomes: cashIncomes + cardIncomes,
          total_expenses: cashExpenses + cardExpenses,
          notes: notes
        })
        .eq('id', activeShift.id);

      if (error) throw error;
      
      setActiveShift(null);
      toast.success('Növbə bağlandı');
    } catch (e: any) {
      toast.error('Növbə bağlanarkən xəta: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const getExpectedCash = async (): Promise<number> => {
    if (!activeShift) return 0;
    try {
      const [{ data: salesData }, { data: expData }, { data: incData }] = await Promise.all([
        supabase.from('sales').select('total_amount').eq('shift_id', activeShift.id).eq('payment_method', 'cash'),
        supabase.from('expenses').select('amount').eq('shift_id', activeShift.id).eq('payment_method', 'cash'),
        supabase.from('incomes').select('amount').eq('shift_id', activeShift.id).eq('payment_method', 'cash')
      ]);

      const cashSales = (salesData || []).reduce((sum, s) => sum + s.total_amount, 0);
      const cashIncomes = (incData || []).reduce((sum, i) => sum + i.amount, 0);
      const cashExpenses = (expData || []).reduce((sum, e) => sum + e.amount, 0);
      
      return activeShift.opening_balance + cashSales + cashIncomes - cashExpenses;
    } catch (e) {
      console.error('Error calculating expected cash:', e);
      return activeShift.opening_balance;
    }
  };

  const getLastShift = async (): Promise<any | null> => {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('*, users(name)')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (e) {
      console.error('Error fetching last shift:', e);
      return null;
    }
  };

  const getGlobalCashBalance = async (): Promise<number> => {
    try {
      const { data, error } = await supabase.rpc('get_current_cash_balance');
      if (error) throw error;
      return data || 0;
    } catch (e) {
      console.error('Error fetching global cash balance:', e);
      return 0;
    }
  };

  const getLastShiftClosingBalance = async (): Promise<number> => {
    // We prioritize the global system balance as the suggested opening balance
    // This ensures all transactions (linked or unlinked) are accounted for
    const globalBalance = await getGlobalCashBalance();
    if (globalBalance > 0) return globalBalance;

    const lastShift = await getLastShift();
    return lastShift?.actual_cash_balance || 0;
  };

  return (
    <ShiftContext.Provider value={{ 
      activeShift, 
      loading, 
      openShift, 
      closeShift, 
      refreshShift,
      getExpectedCash,
      getLastShift,
      getLastShiftClosingBalance,
      getGlobalCashBalance,
      checkSecurityBlock
    }}>
      {children}
    </ShiftContext.Provider>
  );
}

export function useShift() {
  const context = useContext(ShiftContext);
  if (context === undefined) {
    throw new Error('useShift must be used within a ShiftProvider');
  }
  return context;
}
