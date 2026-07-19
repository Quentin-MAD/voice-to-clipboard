
CREATE TABLE public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  paddle_transaction_id TEXT NOT NULL UNIQUE,
  paddle_subscription_id TEXT,
  environment TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount_eur NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tx read" ON public.payment_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_payment_tx_created ON public.payment_transactions(created_at DESC);
CREATE INDEX idx_payment_tx_env ON public.payment_transactions(environment);
