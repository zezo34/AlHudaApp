-- ============================================================================
-- enable_realtime.sql — تفعيل Supabase Realtime على كل جداول التطبيق
-- ----------------------------------------------------------------------------
-- شغّله مرة واحدة فقط في: Supabase Dashboard ← SQL Editor ← New query ← Run
-- أو بالطريقة الرسومية: Database ← Replication ← فعّل كل الجداول يدوياً.
--
-- من غير الخطوة دي، التطبيق شغال طبيعي بس التغييرات مش هتوصل "فوراً" —
-- هتحتاج تفتح وتقفل التطبيق (أو أي Refresh يدوي) عشان تشوف البيانات الجديدة.
-- بعد تشغيل الملف ده، أي تعديل من أي جهاز بيظهر في كل الأجهزة لحظياً.
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'profiles','courses','lessons','course_enrollments','exams','exam_results',
    'recitation_reports','live_sessions','payments','subscriptions',
    'app_settings','leave_requests','parent_notifications'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    -- فعّل فقط الجداول اللي موجودة فعلاً (الاسكيما القديمة مفيش فيها
    -- app_settings / leave_requests / parent_notifications مثلاً)
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        RAISE NOTICE 'Realtime enabled: %', t;
      EXCEPTION
        WHEN duplicate_object THEN NULL; -- مفعّل من قبل
        WHEN undefined_table THEN NULL;  -- الـ publication مش موجود
      END;
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- تأكيد: اعرض الجداول المفعّلة حالياً في الـ publication
-- ----------------------------------------------------------------------------
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
