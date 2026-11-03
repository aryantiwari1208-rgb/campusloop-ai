-- Run this migration in the Supabase SQL editor before accepting product photos.
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS image_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;
