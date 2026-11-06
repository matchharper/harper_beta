ALTER TABLE public.company_data
  ADD COLUMN IF NOT EXISTS estimated_average_salary text;

COMMENT ON COLUMN public.company_data.estimated_average_salary IS
  'Company-wide estimated average annual employee salary from public research, preserving currency, source year, geography/population, compensation basis and source URL. Context for role salary estimation, not a disclosed role salary. NULL means not researched; unknown means no supported average was found. Refreshed with the existing company_data cache.';
