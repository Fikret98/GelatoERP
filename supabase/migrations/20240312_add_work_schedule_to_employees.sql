-- Migration to add work_schedule column to employees table
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS work_schedule TEXT;

-- Update the view or other dependencies if necessary (not needed for simple text field)
