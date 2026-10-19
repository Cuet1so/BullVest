CREATE OR REPLACE VIEW public.metrics_dashboard AS
SELECT 
  COUNT(p.id) AS total_users,
  COUNT(CASE WHEN p.role = 'free' THEN 1 END) AS free_users,
  COUNT(CASE WHEN p.role = 'pro' THEN 1 END) AS pro_users,
  COUNT(CASE WHEN p.role = 'admin' THEN 1 END) AS admin_users,
  ROUND(
    (COUNT(CASE WHEN p.role = 'pro' THEN 1 END)::DECIMAL / NULLIF(COUNT(p.id), 0)) * 100, 2
  ) AS conversion_rate_percentage,
  (SELECT COUNT(*) FROM public.transactions) AS total_trades_executed,
  (SELECT COALESCE(SUM(shares * price), 0) FROM public.transactions) AS total_volume_traded
FROM public.profiles p;

GRANT SELECT ON public.metrics_dashboard TO authenticated;
