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

  const openShift = async (openingBalance: number) => {
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
      const roundedOpening = Math.round(openingBalance * 100) / 100;
      const { data: newShift, error: shiftErr } = await supabase
        .from('shifts')
        .insert([{
          user_id: userIdInt,
          opening_balance: roundedOpening,
          status: 'open'
        }])
        .select()
        .single();

      if (shiftErr) throw shiftErr;

      // 2. Handle discrepancy if verifier counted differently from UNIFIED SYSTEM BALANCE
      const globalBalance = await getGlobalCashBalance();
      const roundedGlobal = Math.round(globalBalance * 100) / 100;
      const diff = Math.round((roundedOpening - roundedGlobal) * 100) / 100;

      if (Math.abs(diff) > 0.01) {
        try {
          const lastShift = await getLastShift();
          const { data: discData, error: discErr } = await supabase
            .from('shift_discrepancies')
            .insert([{
              shift_id: lastShift?.id || null,
              reported_by_id: lastShift?.user_id || userIdInt,
              verified_by_id: userIdInt,
              system_expected: roundedGlobal,
              seller_reported: roundedGlobal,
              verifier_counted: roundedOpening,
              difference: diff,
              status: 'pending'
            }])
            .select()
            .single();

          if (!discErr && discData) {
            // Immediate Financial Impact
            if (diff < 0) {
              const { data: expData } = await supabase
                .from('expenses')
                .insert([{
                  category: 'Kassa Kəsiri',
                  amount: Math.abs(diff),
                  description: 'Təhvil-təslim kəsiri (Araşdırılır)',
                  date: new Date().toISOString(),
                  payment_method: 'cash',
                  user_id: userIdInt,
                  shift_id: newShift.id
                }])
                .select()
                .single();

              if (expData) {
                await supabase.from('shift_discrepancies').update({ related_expense_id: expData.id }).eq('id', discData.id);
              }
            } else {
              const { data: incData } = await supabase
                .from('incomes')
                .insert([{
                  category: 'Kassa Artığı',
                  amount: Math.abs(diff),
                  description: 'Təhvil-təslim artığı (Araşdırılır)',
                  date: new Date().toISOString(),
                  payment_method: 'cash',
                  user_id: userIdInt,
                  shift_id: newShift.id
                }])
                .select()
                .single();

              if (incData) {
                await supabase.from('shift_discrepancies').update({ related_income_id: incData.id }).eq('id', discData.id);
              }
            }
          }
          toast('Təhvil-təslimdə uyğunsuzluq qeyd edildi.', { icon: '⚠️' });
        } catch (discE: any) {
          console.error('Handover discrepancy error:', discE);
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
      const roundedActual = Math.round(actualBalance * 100) / 100;
      const roundedExpected = Math.round(expectedCash * 100) / 100;

      // 2. Update the shift record
      const { error } = await supabase
        .from('shifts')
        .update({
          closed_at: new Date().toISOString(),
          status: 'closed',
          actual_cash_balance: roundedActual,
          expected_cash_balance: roundedExpected,
          cash_sales: cashSales,
          card_sales: cardSales,
          total_incomes: cashIncomes + cardIncomes,
          total_expenses: cashExpenses + cardExpenses,
          notes: notes
        })
        .eq('id', activeShift.id);

      if (error) throw error;

      // 3. Handle Discrepancy immediately if it exists
      const difference = Math.round((roundedActual - roundedExpected) * 100) / 100;
      if (Math.abs(difference) > 0.01) {
        try {
          // Insert Discrepancy record
          const { data: discData, error: discErr } = await supabase
            .from('shift_discrepancies')
            .insert([{
              shift_id: activeShift.id,
              reported_by_id: parseInt(user.id),
              system_expected: roundedExpected,
              seller_reported: roundedActual,
              verifier_counted: roundedActual, // Seller is Verifier at this stage
              difference: difference,
              status: 'pending'
            }])
            .select()
            .single();

          if (discErr) throw discErr;

          // Create Financial Transaction
          if (difference < 0) {
            // Shortage -> Expense
            const { data: expData, error: expErr } = await supabase
              .from('expenses')
              .insert([{
                category: 'Kassa Kəsiri',
                amount: Math.abs(difference),
                description: 'Növbə kəsiri (Araşdırılır)',
                date: new Date().toISOString(),
                payment_method: 'cash',
                user_id: parseInt(user.id),
                shift_id: activeShift.id
              }])
              .select()
              .single();

            if (!expErr && expData) {
              await supabase.from('shift_discrepancies').update({ related_expense_id: expData.id }).eq('id', discData.id);
            }
          } else {
            // Surplus -> Income
            const { data: incData, error: incErr } = await supabase
              .from('incomes')
              .insert([{
                category: 'Kassa Artığı',
                amount: difference,
                description: 'Növbə artığı (Araşdırılır)',
                date: new Date().toISOString(),
                payment_method: 'cash',
                user_id: parseInt(user.id),
                shift_id: activeShift.id
              }])
              .select()
              .single();

            if (!incErr && incData) {
              await supabase.from('shift_discrepancies').update({ related_income_id: incData.id }).eq('id', discData.id);
            }
          }
          toast('Növbə kəsiri/artığı qeydə alındı.', { icon: '⚠️' });
        } catch (discE: any) {
          console.error('Discrepancy recording error:', discE);
          toast.error('Uyğunsuzluq qeyd edilərkən xəta: ' + discE.message);
        }
      }

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
      const expected = activeShift.opening_balance + cashSales + cashIncomes - cashExpenses;
      return Math.round(expected * 100) / 100;
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
