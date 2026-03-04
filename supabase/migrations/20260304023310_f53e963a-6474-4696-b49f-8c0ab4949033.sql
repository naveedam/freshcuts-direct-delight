
-- Audit log for order edits
CREATE TABLE public.order_edit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL,
  action text NOT NULL DEFAULT 'edit',
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot_before jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_after jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_edit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage order edit logs"
  ON public.order_edit_logs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
