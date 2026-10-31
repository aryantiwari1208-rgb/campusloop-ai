-- Run this migration in the Supabase SQL editor before enabling college registration.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS college text;

CREATE INDEX IF NOT EXISTS profiles_college_idx
ON public.profiles (college);

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS college text;

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS products_college_created_at_idx
ON public.products (college, created_at DESC);
