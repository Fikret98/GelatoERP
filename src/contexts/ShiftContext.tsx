import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
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

      // 2. Mark the opener as the verified_by (receiver) for any pending discrepancy from the last shift
      // This fills in the 'Təhvil Aldı' (received by) field on the existing discrepancy
      const lastShift = await getLastShift();
      if (lastShift?.id) {
        await supabase
          .from('shift_discrepancies')
          .update({ 
            verified_by_id: userIdInt,
            verifier_counted: roundedOpening
          })
          .eq('shift_id', lastShift.id)
          .eq('status', 'pending')
          .is('verified_by_id', null);
      }

      // 3. Check if the opener's entered balance differs from what the closer physically counted
      // This happens when the OPENER counts and gets a different number from the CLOSER
      const lastShiftBalance = lastShift?.actual_cash_balance ?? null;
      if (lastShiftBalance !== null) {
        const roundedLastActual = Math.round(lastShiftBalance * 100) / 100;
        const diff = Math.round((roundedOpening - roundedLastActual) * 100) / 100;

        if (Math.abs(diff) > 0.005) {
          // Only create a new discrepancy if the opener counts differently from the closer
          const { data: discData, error: discErr } = await supabase
            .from('shift_discrepancies')
            .insert([{
              shift_id: lastShift.id,   // Bug 3 fix: link to the OLD shift where the discrepancy occurred
              reported_by_id: lastShift.user_id,
              verified_by_id: userIdInt,
              system_expected: roundedLastActual,
              seller_reported: roundedLastActual,
              verifier_counted: roundedOpening,
              difference: diff,
              status: 'pending'
            }])
            .select()
            .single();

          if (!discErr && discData) {
            if (diff < 0) {
              const { data: expData } = await supabase
                .from('expenses')
                .insert([{
                  category: 'Kassa Kəsiri',
                  amount: Math.abs(diff),
                  description: 'Açılış-bağlanış fərqi (Araşdırılır)',
                  date: new Date().toISOString(),
                  payment_method: 'cash',
                  user_id: userIdInt,
                  shift_id: lastShift.id  // Bug 3 fix: expense belongs to the OLD shift, not new
                }])
                .select().single();
              if (expData) {
                await supabase.from('shift_discrepancies').update({ related_expense_id: expData.id }).eq('id', discData.id);
              }
            } else {
              const { data: incData } = await supabase
                .from('incomes')
                .insert([{
                  category: 'Kassa Artığı',
                  amount: Math.abs(diff),
                  description: 'Açılış-bağlanış fərqi (Araşdırılır)',
                  date: new Date().toISOString(),
                  payment_method: 'cash',
                  user_id: userIdInt,
                  shift_id: lastShift.id  // Bug 3 fix: income belongs to the OLD shift, not new
                }])
                .select().single();
              if (incData) {
                await supabase.from('shift_discrepancies').update({ related_income_id: incData.id }).eq('id', discData.id);
              }
            }
            toast('Açılış məbləği fərqi qeyd edildi.', { icon: '⚠️' });
          }
        }
      }

      setActiveShift(newShift);
      toast.success('Növbə açıldı və bildiriş göndərildi', { icon: '🟢' });
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
      // 1. Get current totals for this shift (to save to shift record)
      const [{ data: salesData }, { data: expData }, { data: incData }] = await Promise.all([
        supabase.from('sales').select('total_amount, payment_method').eq('shift_id', activeShift.id),
        supabase.from('expenses').select('amount, payment_method, category, description').eq('shift_id', activeShift.id),
        supabase.from('incomes').select('amount, payment_method, category, description').eq('shift_id', activeShift.id)
      ]);

      const cashSales = (salesData || [])
        .filter(s => s.payment_method === 'cash')
        .reduce((sum, s) => sum + s.total_amount, 0);
      const cardSales = (salesData || [])
        .filter(s => s.payment_method === 'card')
        .reduce((sum, s) => sum + s.total_amount, 0);

      const cashIncomes = (incData || [])
        .filter(i => i.payment_method === 'cash' && !(i.category === 'Kassa Artığı' && i.description?.includes('Təhvil-təslim')))
        .reduce((sum, i) => sum + i.amount, 0);
      const cardIncomes = (incData || [])
        .filter(i => i.payment_method === 'card')
        .reduce((sum, i) => sum + i.amount, 0);

      const cashExpenses = (expData || [])
        .filter(e => e.payment_method === 'cash' && !(e.category === 'Kassa Kəsiri' && e.description?.includes('Təhvil-təslim')))
        .reduce((sum, e) => sum + e.amount, 0);
      const cardExpenses = (expData || [])
        .filter(e => e.payment_method === 'card')
        .reduce((sum, e) => sum + e.amount, 0);

      // 2. Get current expected balance from SQL Source of Truth (The master value)
      const { data: expectedCash, error: expectedErr } = await supabase.rpc('get_shift_expected_cash', {
        p_shift_id: activeShift.id
      });

      if (expectedErr) throw expectedErr;

      const roundedActual = Math.round(actualBalance * 100) / 100;
      const roundedExpected = expectedCash;

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
      const difference = Math.round((roundedActual - expectedCash) * 100) / 100;
      if (Math.abs(difference) > 0.005) {
        try {
          // Insert Discrepancy record
          const { data: discData, error: discErr } = await supabase
            .from('shift_discrepancies')
            .insert([{
              shift_id: activeShift.id,
              reported_by_id: parseInt(user.id),
              system_expected: roundedExpected,
              seller_reported: roundedActual,
              verifier_counted: null, // Left null until the next shift opens and verifies
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
      toast.success('Növbə bağlandı və bildiriş göndərildi', { icon: '🔴' });
    } catch (e: any) {
      toast.error('Növbə bağlanarkən xəta: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const getExpectedCash = async (): Promise<number> => {
    if (!activeShift) return 0;
    try {
      const { data, error } = await supabase.rpc('get_shift_expected_cash', {
        p_shift_id: activeShift.id
      });
      if (error) throw error;
      return data || 0;
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
    // Bug 2 fix: Prioritize the last shift's physical count (actual_cash_balance)
    // This is what the previous cashier physically counted in the drawer —
    // the most relevant starting point for the next opener.
    const lastShift = await getLastShift();
    if (lastShift?.actual_cash_balance != null) return lastShift.actual_cash_balance;

    // Fallback: use global system cash balance if no prior shift exists
    return await getGlobalCashBalance();
  };

  const value = useMemo(() => ({
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
  }), [activeShift, loading]);

  return (
    <ShiftContext.Provider value={value}>
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
