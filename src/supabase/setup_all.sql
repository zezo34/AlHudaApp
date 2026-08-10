-- ============================================================================
-- AlHudaApp — ONE-CLICK setup: upgrade schema + fill ALL static data
-- ============================================================================
-- How to use:
--   1. Supabase dashboard → SQL Editor → New query
--   2. Paste the ENTIRE content of this file, click [Run]
--   3. Done: all tables created (13) and filled with the app's content
--      (4 courses with their PDF books, students أحمد/ياسين, subscription,
--      19 ijaza types, meeting link, wallet number).
--
--   The PDF books themselves ship inside the app (assets/pdfs/*.pdf); lessons
--   reference them via 'asset:' markers resolved offline by the app.
--
-- Then create the admin account: Auth → Users → Add user (email + password).
-- Tell the developer the email so the profile can be marked as admin
-- (role = 'admin'), or run:  node src/scripts/seedSupabase.js --admin-email ...
--
-- This file is safe to re-run (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Upgrade guard: the OLD v1 tables (uuid ids) are dropped ONLY when the
--    old schema is detected. All old tables are empty (verified), so nothing
--    is lost. If the new schema is already live, this block is skipped and
--    the script is safe to re-run any number of times.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'id' AND data_type = 'uuid'
  ) THEN
    FOREACH t IN ARRAY ARRAY[
      'subscriptions','payments','live_sessions','recitation_reports',
      'exam_results','exams','course_enrollments','lessons','courses','profiles'
    ] LOOP
      EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t);
    END LOOP;
  END IF;
END $$;

-- ============================================================================
-- AlHudaApp — Supabase schema (deployable, offline-first friendly)
-- ============================================================================
-- Run this ENTIRE script in the Supabase SQL editor (as an admin).
--
-- Changes vs. the original schema you pasted:
--   1. All `id` primary keys are now TEXT instead of UUID. The app generates
--      its own stable string ids (e.g. course 'c1', student codes) so the same
--      ids work online AND offline (cached on device) without translation.
--      New rows still get a random id via `gen_random_uuid()::text`.
--   2. New column: profiles.student_code  -> used by students to log in with
--      their code (e.g. STU-101). Looked up by the app on login.
--   3. New tables required by the app:
--         leave_requests        (طلبات الإجازة)
--         parent_notifications  (إشعارات الأولياء)
--         app_settings          (إعدادات عامة مثل بيانات الاشتراك)
--   4. App-facing status columns (exam_results.status, leave_requests.status)
--      are TEXT because the app uses Arabic status strings.
--   5. `student_id` / `profile_id` columns are plain indexed TEXT (not FK).
--      Some screens pass the student's internal id, others the code; the app
--      data layer normalizes them to student_code on write and cleans up all
--      of a student's records explicitly when an account is deleted.
--
-- RLS is DISABLED for all tables (development/testing), as in your original
-- script. The "Go live" checklist at the end of SUPABASE_SETUP.md shows how to
-- enable RLS safely before production.

-- 1) Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- provides gen_random_uuid()

-- 2) Custom enum types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_enum') THEN
    CREATE TYPE public.role_enum AS ENUM ('admin','student','parent','teacher','instructor');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_enum') THEN
    CREATE TYPE public.payment_status_enum AS ENUM ('pending','succeeded','failed','refunded');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recitation_status_enum') THEN
    CREATE TYPE public.recitation_status_enum AS ENUM ('pending','reviewed','approved','rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enrollment_status_enum') THEN
    CREATE TYPE public.enrollment_status_enum AS ENUM ('active','completed','cancelled');
  END IF;
END
$$ LANGUAGE plpgsql;

-- 3) Profiles (users & students)
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,     -- auth.users.id (uuid as text) or app-generated id
  email TEXT UNIQUE,
  full_name TEXT,
  student_code TEXT,                                       -- e.g. 'STU-101' — used for student/parent login
  role public.role_enum NOT NULL DEFAULT 'student',
  phone TEXT,
  avatar_url TEXT,
  parent_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,                      -- full app student object (stars, reports, progress, ...)
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_student_code
  ON public.profiles (student_code); -- unique; NULLs allowed (admin/parents)
CREATE INDEX IF NOT EXISTS idx_profiles_parent_id ON public.profiles (parent_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);

-- 4) Courses
CREATE TABLE IF NOT EXISTS public.courses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  level TEXT,
  instructor_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb, -- full app course object (category, rating, price, instructor name, ...)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courses_instructor ON public.courses (instructor_id);
CREATE INDEX IF NOT EXISTS idx_courses_slug ON public.courses (slug);

-- 5) Lessons (course content / modules). The app's "curriculum" (modules with
--    lessons) is flattened here; content.module / content.moduleId restore it.
CREATE TABLE IF NOT EXISTS public.lessons (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content JSONB DEFAULT '{}'::jsonb, -- { module, moduleId, lesson }
  position INT DEFAULT 0,
  duration_seconds INT,
  resources JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON public.lessons (course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course_position ON public.lessons (course_id, position);

-- 6) Course enrollments
CREATE TABLE IF NOT EXISTS public.course_enrollments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id TEXT, -- student code (normalized by the app data layer)
  enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  status public.enrollment_status_enum DEFAULT 'active',
  progress JSONB DEFAULT '{}'::jsonb,
  notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_course_student
  ON public.course_enrollments (course_id, student_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_course_enrollments_student ON public.course_enrollments (student_id);

-- 7) Exams. The app's full exam object (question, type, options, answers,
--    rewardStars, isWeekly, ...) is stored in `settings`.
CREATE TABLE IF NOT EXISTS public.exams (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  course_id TEXT REFERENCES public.courses(id) ON DELETE SET NULL,
  lesson_id TEXT REFERENCES public.lessons(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB DEFAULT '{}'::jsonb,
  total_marks NUMERIC DEFAULT 0,
  created_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exams_course ON public.exams (course_id);
CREATE INDEX IF NOT EXISTS idx_exams_lesson ON public.exams (lesson_id);

-- 8) Exam results (submissions)
CREATE TABLE IF NOT EXISTS public.exam_results (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  exam_id TEXT, -- plain ref, NO FK: results must land even when the exam row syncs later
  student_id TEXT, -- student code (normalized by the app data layer)
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC,
  max_score NUMERIC,
  evaluated BOOLEAN DEFAULT FALSE,
  evaluator_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  evaluation JSONB DEFAULT '{}'::jsonb,   -- full app result object
  ai_feedback JSONB DEFAULT '{}'::jsonb,
  teacher_feedback JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'قيد المراجعة ⏳',   -- Arabic app status string
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_results_exam_student ON public.exam_results (exam_id, student_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_student ON public.exam_results (student_id);

-- 9) Recitation reports / session reports / Ijaza requests
CREATE TABLE IF NOT EXISTS public.recitation_reports (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id TEXT, -- student code (normalized by the app data layer)
  teacher_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  audio_url TEXT,
  transcript TEXT,
  timestamps JSONB DEFAULT '{}'::jsonb,
  score NUMERIC,
  status public.recitation_status_enum DEFAULT 'reviewed',
  issued_certificate BOOLEAN DEFAULT FALSE,
  certificate_data JSONB DEFAULT '{}'::jsonb,
  notes JSONB DEFAULT '{}'::jsonb,   -- full app session-report object
  requested_at TIMESTAMP WITH TIME ZONE,
  reviewed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_recitation_student ON public.recitation_reports (student_id);
CREATE INDEX IF NOT EXISTS idx_recitation_status ON public.recitation_reports (status);

-- 10) Live sessions
CREATE TABLE IF NOT EXISTS public.live_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  course_id TEXT REFERENCES public.courses(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  host_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  meeting_url TEXT,
  recording_url TEXT,
  capacity INT,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_sessions_course ON public.live_sessions (course_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_host ON public.live_sessions (host_id);

-- 11) Payments (also used for manual transfer requests — full object in metadata)
CREATE TABLE IF NOT EXISTS public.payments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  profile_id TEXT, -- student code (normalized by the app data layer)
  course_id TEXT REFERENCES public.courses(id) ON DELETE SET NULL,
  amount NUMERIC(10,2),
  currency TEXT DEFAULT 'EGP',
  status public.payment_status_enum DEFAULT 'pending',
  provider TEXT,
  provider_payment_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb, -- full app payment-request object
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_profile ON public.payments (profile_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments (status);

-- 12) Subscriptions (simplified)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  profile_id TEXT, -- student code
  plan TEXT,
  status TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  canceled_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_profile ON public.subscriptions (profile_id);

-- ============================================================================
-- App-specific tables (طلبات الإجازة، إشعارات الأولياء، الإعدادات العامة)
-- ============================================================================

-- 13) Leave / vacation requests
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id TEXT, -- student code (normalized by the app data layer)
  student_name TEXT,
  title TEXT,
  reason TEXT,
  cost NUMERIC,
  status TEXT,                      -- Arabic status string
  data JSONB DEFAULT '{}'::jsonb,   -- full app request object
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_student ON public.leave_requests (student_id);

-- 14) Parent notifications
CREATE TABLE IF NOT EXISTS public.parent_notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  parent_id TEXT,
  student_name TEXT,
  message TEXT,
  course_title TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  data JSONB DEFAULT '{}'::jsonb,   -- full app notification object
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_notifications_parent ON public.parent_notifications (parent_id);

-- 15) App settings (key/value). e.g. id = 'subscription' -> value = plan data
CREATE TABLE IF NOT EXISTS public.app_settings (
  id TEXT PRIMARY KEY,
  value JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at on every UPDATE of the main tables
CREATE OR REPLACE FUNCTION public.set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN (
    'profiles','courses','lessons','course_enrollments','exams','exam_results',
    'recitation_reports','live_sessions','payments','subscriptions','app_settings'
  )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_set_updated_at ON public.%1$s;', tbl);
    EXECUTE format('CREATE TRIGGER trg_%1$s_set_updated_at BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();', tbl);
  END LOOP;
END
$$ LANGUAGE plpgsql;

-- Auto-create a profiles row when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, student_code, role, created_at, updated_at)
  VALUES (
    NEW.id::text,
    NEW.email,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'full_name',''),
      NULLIF(NEW.raw_user_meta_data ->> 'name',''),
      NEW.email
    ),
    NULLIF(NEW.raw_user_meta_data ->> 'student_code',''),
    'student',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- إنشاء الترigger على auth.users داخل كتلة محمية بالاستثناءات: لو حصلت مشكلة
-- صلاحيات، السكربت يكمّل بدل ما يرجع بالكامل (transaction rollback).
DO $$
BEGIN
  BEGIN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();
    RAISE NOTICE 'auth trigger installed ok';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'auth trigger skipped (permission?): %', SQLERRM;
  END;
END $$;

-- ============================================================================
-- Row Level Security: DISABLED for development/testing (per request).
-- ============================================================================
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrollments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.recitation_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;

-- Example policies (uncomment when you enable RLS before production):
-- CREATE POLICY "Public read courses" ON public.courses FOR SELECT USING (true);
-- CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (auth.uid()::text = id OR auth.jwt() ->> 'role' = 'admin');

-- All done. Next: run scripts/seedSupabase.js (see SUPABASE_SETUP.md).


-- ---------------------------------------------------------------------------
-- Backfill: ensure a profiles row exists for every auth.users row (in case the
-- admin auth user was created before this script was run). Safe to re-run.
-- ---------------------------------------------------------------------------
-- Backfill بروفايلات مستخدمي auth.users — داخل كتلة محمية (مش بيفشل السكربت لو مفيش صلاحية قراءة).
DO $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at)
    SELECT u.id::text,
           u.email,
           COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name',''), NULLIF(u.raw_user_meta_data ->> 'name',''), u.email),
           'student',
           now(),
           now()
    FROM auth.users u
    ON CONFLICT (id) DO NOTHING;
    RAISE NOTICE 'profiles backfill ok';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'backfill skipped: %', SQLERRM;
  END;
END $$;

INSERT INTO public.app_settings (id, value) VALUES
  ('subscription', '{"isSubActive":true,"title":"الاشتراك الشهري الشامل","price":"199","description":"احصل على وصول غير محدود لكافة الكورسات والفرق الصوتية باشتراك واحد."}'),
  ('ijaza_items', '["إجازة حفص عن عاصم","إجازة عاصم براوييه شعبة وحفص","إجازة قالون عن نافع","إجازة ورش عن نافع","إجازة ابن كثير براوييه","إجازة أبو عمرو براوييه","إجازة ابن عامر براوييه","إجازة حمزة براوييه","إجازة الكسائي براوييه","إجازة أبو جعفر براوييه","إجازة يعقوب براوييه","إجازة خلف العاشر براوييه","إجازة أصحاب الصلة قالون وابن كثير وأبو جعفر","إجازة ابن عامر وعاصم","إجازة الكسائي وخلف العاشر","إجازة أصحاب التوسط ابن عامر وعاصم والكسائي وخلف العاشر","إجازة أصحاب المد ورش وحمزة","إجازة القراءات السبع","إجازة القراءات العشر"]'),
  ('meeting_url', '"https://meet.google.com/vkx-gfdc-hyn"'),
  ('wallet_number', '"01093684797"')
ON CONFLICT (id) DO NOTHING;

-- تحديث رابط غرفة الاجتماع المباشر إلى Google Meet (للقواعد الموجودة مسبقاً)
UPDATE public.app_settings SET value = '"https://meet.google.com/vkx-gfdc-hyn"' WHERE id = 'meeting_url';

INSERT INTO public.profiles (id, email, full_name, student_code, role, metadata) VALUES
  ('stu_ahmed', NULL, 'أحمد', 'STU-201', 'student', '{"gender":"boy","stars":0}'),
  ('stu_yassin', NULL, 'ياسين', 'STU-202', 'student', '{"gender":"boy","stars":0}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.courses (id, title, description, published, metadata) VALUES
  ('c1', 'المقدمة في أحكام التجويد', 'دورة شاملة لإتقان القواعد الأساسية لتلاوة القرآن الكريم ومخارج الحروف والصفات وتطبيق أحكام النون الساكنة والتنوين.', true, '{"category":"القرآن الكريم","rating":4.9,"price":350,"enrolled":false,"instructor":"الشيخ أحمد السيد"}'),
  ('c2', 'اللغة العربية وفهم القرآن', 'تعلم قواعد النحو والصرف الأساسية والمفردات المباشرة لتذوق وفهم آيات كتاب الله عز وجل.', true, '{"category":"اللغة العربية","rating":4.8,"price":450,"enrolled":false,"instructor":"د. طارق الهاشمي"}'),
  ('c3', 'السيرة النبوية الشريفة', 'دراسة مستفيضة للعهدين المكي والمدني مع استخلاص العبر والدروس التربوية لحياتنا اليومية.', true, '{"category":"الدراسات الإسلامية","rating":5,"price":280,"enrolled":false,"instructor":"الشيخ عمر فاروق"}'),
  ('c4', 'العقيدة الإسلامية', 'دورة تأسيسية في أصول العقيدة الإسلامية: الإيمان بالله وملائكته وكتبه ورسله واليوم الآخر والقدر خيره وشره.', true, '{"category":"الدراسات الإسلامية","rating":5,"price":300,"enrolled":false,"instructor":"الشيخ أحمد السيد"}')
ON CONFLICT (id) DO NOTHING;

-- المحتوى: كتب PDF (لا فيديوهات). الدرس يحمل pdfUri='asset:...' والكتاب مدمج
-- داخل التطبيق (assets/pdfs/*.pdf) ويُفتح أوفلاين عبر services/pdfAssetResolver.js
INSERT INTO public.lessons (id, course_id, title, content, position) VALUES
  ('c1_book', 'c1', 'كتاب الهدى في تجويد كلام الله', '{"module":"📚 الكتاب المقرر","moduleId":"m1","lesson":{"id":"c1_book","title":"كتاب الهدى في تجويد كلام الله","pdfName":"كتاب الهدى في تجويد كلام الله.pdf","pdfUri":"asset:tajweed"}}', 0),
  ('c2_book', 'c2', 'كتاب تفسير الهدى', '{"module":"📚 الكتاب المقرر","moduleId":"m1","lesson":{"id":"c2_book","title":"كتاب تفسير الهدى","pdfName":"كتاب تفسير الهدى.pdf","pdfUri":"asset:tafsir"}}', 0),
  ('c3_book', 'c3', 'كتاب سيرة الهدى', '{"module":"📚 الكتاب المقرر","moduleId":"m1","lesson":{"id":"c3_book","title":"كتاب سيرة الهدى","pdfName":"كتاب سيرة الهدى.pdf","pdfUri":"asset:sirah"}}', 0),
  ('c4_book', 'c4', 'كتاب عقيدة الهدى', '{"module":"📚 الكتاب المقرر","moduleId":"m1","lesson":{"id":"c4_book","title":"كتاب عقيدة الهدى","pdfName":"كتاب عقيدة الهدى.pdf","pdfUri":"asset:aqeeda"}}', 0)
ON CONFLICT (id) DO NOTHING;

