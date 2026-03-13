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
  openShift: (openingBalance: number) => Promise<void>;
  closeShift: (actualBalance: number, notes?: string) => Promise<void>;
  refreshShift: () => Promise<void>;
  getExpectedCash: () => Promise<number>;
  getLastShift: () => Promise<any | null>;
  getLastShiftClosingBalance: () => Promise<number>;
  getGlobalCashBalance: () => Promise<number>;
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

  const openShift = async (openingBalance: number) => {
    if (!user) return;
    setLoading(true);
    try {
      const userIdInt = parseInt(user.id);

      // 1. Create the new shift first so we have an ID to link discrepancies to
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
      setActiveShift(newShift);

      // 2. Detect transition discrepancy (Accountability between employees)
      const lastShift = await getLastShift();
      const lastClosing = lastShift?.actual_cash_balance || 0;
      const lastUserName = lastShift?.users?.name || 'Naməlum';
      const shiftDiff = openingBalance - lastClosing;

      // 3. Identify if this is a "New" financial event or just aligning with an already-reduced Dashboard
      const globalBalance = await getGlobalCashBalance();
      const globalDiff = openingBalance - globalBalance;

      // If there is ANY physical difference from the last shift, we need an Audit item in HR.
      if (Math.abs(shiftDiff) > 0.01) {
        const auditDesc = `Növbə arası fərq: Əvvəlki işçi: ${lastUserName}, Yeni işçi: ${user.item_name || user.name}. (Əvvəlki: ${lastClosing.toFixed(2)}, Yeni: ${openingBalance.toFixed(2)}, Sistem: ${globalBalance.toFixed(2)})`;
        
        if (shiftDiff < 0) {
          // It's a shortage relative to last person's close
          await supabase.from('expenses').insert([{
            date: new Date().toISOString(),
            category: 'Növbə Arası (Araşdırılır)',
            amount: Math.abs(shiftDiff), 
            description: auditDesc,
            payment_method: 'cash',
            user_id: userIdInt,
            shift_id: newShift.id,
            notes: JSON.stringify({ globalDiff, shiftDiff, type: 'audit_trigger' })
          }]);
        } else {
          // It's an excess relative to last person's close
          await supabase.from('incomes').insert([{
            date: new Date().toISOString(),
            category: 'Növbə Arası (Araşdırılır)',
            amount: Math.abs(shiftDiff),
            description: auditDesc,
            payment_method: 'cash',
            user_id: userIdInt,
            shift_id: newShift.id,
            notes: JSON.stringify({ globalDiff, shiftDiff, type: 'audit_trigger' })
          }]);
        }

        // IMPORTANT: If the Dashboard already reflects this gap (globalDiff is 0), 
        // recording the above transaction will UNFORTUNATELY change the Dashboard again.
        if (Math.abs(globalDiff) < 0.01) {
           if (shiftDiff < 0) {
             // We added an expense, but Dashboard was correct. Offset with income.
             await supabase.from('incomes').insert([{
               category: 'Sistem Tənzimlənməsi (Sinxron)',
               amount: Math.abs(shiftDiff),
               description: 'Təkrarlanmanın qarşısını almaq üçün avtomatik tənzimləmə',
               payment_method: 'cash',
               user_id: userIdInt,
               shift_id: newShift.id
             }]);
           } else {
             // We added an income, but Dashboard was correct. Offset with expense.
             await supabase.from('expenses').insert([{
               category: 'Sistem Tənzimlənməsi (Sinxron)',
               amount: Math.abs(shiftDiff),
               description: 'Təkrarlanmanın qarşısını almaq üçün avtomatik tənzimləmə',
               payment_method: 'cash',
               user_id: userIdInt,
               shift_id: newShift.id
             }]);
           }
        }
      }

      toast.success('Növbə açıldı');
    } catch (e: any) {
      toast.error('Növbə açılarkən xəta: ' + e.message);
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
      
      // 3. Record shortage/excess as financial adjustment to sync system balance
      // We route this through "Növbə Arası (Araşdırılır)" so it appears in HR for approval
      const shortage = expectedCash - actualBalance;
      if (Math.abs(shortage) > 0.01) {
        const auditDesc = `Növbə qapanış fərqi: İşçi: ${user.item_name || user.name}, Növbə: #${activeShift.id}. (Olmalı: ${expectedCash.toFixed(2)}, Faktiki: ${actualBalance.toFixed(2)})`;
        const userIdInt = parseInt(user.id);
        const shiftIdInt = parseInt(activeShift.id);

        if (shortage > 0) {
          // It's a shortage (kəsir) -> Record as Expense (Pending Audit)
          await supabase.from('expenses').insert([{
            date: new Date().toISOString(),
            category: 'Növbə Arası (Araşdırılır)',
            amount: Math.abs(shortage),
            description: auditDesc,
            payment_method: 'cash',
            user_id: userIdInt,
            shift_id: shiftIdInt,
            notes: JSON.stringify({ type: 'closing_audit', expected: expectedCash, actual: actualBalance })
          }]);
        } else {
          // It's an excess (artıq) -> Record as Income (Pending Audit)
          const excess = Math.abs(shortage);
          await supabase.from('incomes').insert([{
            date: new Date().toISOString(),
            category: 'Növbə Arası (Araşdırılır)',
            amount: excess,
            description: auditDesc,
            payment_method: 'cash',
            user_id: userIdInt,
            shift_id: shiftIdInt,
            notes: JSON.stringify({ type: 'closing_audit', expected: expectedCash, actual: actualBalance })
          }]);
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
      getGlobalCashBalance
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
