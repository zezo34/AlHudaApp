-- ============================================================================
-- AlHudaApp — تعطيل Row Level Security (RLS) على كل جداول public
-- ============================================================================
-- للتطوير/الاختبار فقط. افتح SQL Editor في نفس مشروع ctvgzbcrkvswrhkaqstu
-- والصق المحتوى كاملاً ثم اضغط Run.
--
-- يعطّل RLS على كل الجداول الحالية (القديمة أو الجديدة) + أي جدول يضاف لاحقاً
-- في نفس الـ schema — آمن تعيد تشغيله أي عدد من المرات.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END
$$ LANGUAGE plpgsql;

-- تلميح: السكربت الجديد (schema.sql / setup_all.sql) بيعطّل RLS تلقائياً،
-- فالسكربت ده مش محتاج تتشغله تاني بعد ما ترقّي الاسكيما.
