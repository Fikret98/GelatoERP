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

      // 2. Check for "Opening Gap" (Scenario 2)
      // Compare what the user counted vs what the System (Global Cash) expects
      const globalBalance = await getGlobalCashBalance();
      const roundedGlobal = Math.round(globalBalance * 100) / 100;
      const openingDiff = Math.round((roundedOpening - roundedGlobal) * 100) / 100;

      if (Math.abs(openingDiff) > 0.005) {
        // Create an "Opening Gap" discrepancy linked to the LAST shift for accountability
        const lastShift = await getLastShift();
        const { data: discData, error: discErr } = await supabase
          .from('shift_discrepancies')
          .insert([{
            shift_id: lastShift?.id || null, // Best effort link to previous shift
            reported_by_id: lastShift?.user_id || null,
            verified_by_id: userIdInt,
            system_expected: roundedGlobal,
            seller_reported: roundedGlobal,
            verifier_counted: roundedOpening,
            difference: openingDiff,
            status: 'pending',
            type: 'opening_gap'
          }])
          .select()
          .single();

        if (!discErr && discData) {
          // Create automated financial adjustment (Scenario 6)
          if (openingDiff < 0) {
            const { data: expData } = await supabase
              .from('expenses')
              .insert([{
                category: 'Kassa Kəsiri (Açılış)',
                amount: Math.abs(openingDiff),
                description: 'Növbə açılışında aşkar edilən fərq.',
                date: new Date().toISOString(),
                payment_method: 'cash',
                user_id: userIdInt,
                shift_id: lastShift?.id || null,
                is_system_generated: true
              }])
              .select().single();
            if (expData) {
              await supabase.from('shift_discrepancies').update({ related_expense_id: expData.id }).eq('id', discData.id);
            }
          } else {
            const { data: incData } = await supabase
              .from('incomes')
              .insert([{
                category: 'Kassa Artığı (Açılış)',
                amount: openingDiff,
                description: 'Növbə açılışında aşkar edilən fərq.',
                date: new Date().toISOString(),
                payment_method: 'cash',
                user_id: userIdInt,
                shift_id: lastShift?.id || null,
                is_system_generated: true
              }])
              .select().single();
            if (incData) {
              await supabase.from('shift_discrepancies').update({ related_income_id: incData.id }).eq('id', discData.id);
            }
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

      // 3. Handle "Closing Gap" (Scenario 3)
      const difference = Math.round((roundedActual - roundedExpected) * 100) / 100;
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
              verifier_counted: null,
              difference: difference,
              status: 'pending',
              type: 'closing_gap'
            }])
            .select()
            .single();

          if (discErr) throw discErr;

          // Create Financial Transaction (is_system_generated = true)
          if (difference < 0) {
            const { data: expData, error: expErr } = await supabase
              .from('expenses')
              .insert([{
                category: 'Kassa Kəsiri (Bağlanış)',
                amount: Math.abs(difference),
                description: 'Növbə qapanışında kəsir müəyyən edildi.',
                date: new Date().toISOString(),
                payment_method: 'cash',
                user_id: parseInt(user.id),
                shift_id: activeShift.id,
                is_system_generated: true
              }])
              .select()
              .single();
            if (!expErr && expData) {
              await supabase.from('shift_discrepancies').update({ related_expense_id: expData.id }).eq('id', discData.id);
            }
          } else {
            const { data: incData, error: incErr } = await supabase
              .from('incomes')
              .insert([{
                category: 'Kassa Artığı (Bağlanış)',
                amount: difference,
                description: 'Növbə qapanışında artıq müəyyən edildi.',
                date: new Date().toISOString(),
                payment_method: 'cash',
                user_id: parseInt(user.id),
                shift_id: activeShift.id,
                is_system_generated: true
              }])
              .select()
              .single();
            if (!incErr && incData) {
              await supabase.from('shift_discrepancies').update({ related_income_id: incData.id }).eq('id', discData.id);
            }
          }
          toast('Növbə fərqi qeydə alındı.', { icon: '⚠️' });
        } catch (discE: any) {
          console.error('Discrepancy recording error:', discE);
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
    // Sync with Global Cash Balance as per user request to avoid discrepancy between "Nağd Kassa" and Open Modal
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
