#!/usr/bin/env node
/**
 * scripts/seedSupabase.js
 * -----------------------
 * Seeds initial content into Supabase (idempotent — safe to run multiple times).
 *
 * Run from the project root (D:\AlHudaApp):
 *
 *   # 1) Make the admin account (create it first in Supabase: Auth -> Users ->
 *   #    Add user, then set its role):
 *   node src/scripts/seedSupabase.js --admin-email admin@example.com
 *
 *   # 2) Import students from a JSON file (optional) — export of the old app:
 *   node src/scripts/seedSupabase.js --students-file students.json
 *
 *   # 3) Everything at once:
 *   node src/scripts/seedSupabase.js --admin-email admin@example.com --students-file students.json
 *
 * Credentials: reads SUPABASE_URL / SUPABASE_ANON_KEY from the environment,
 * falling back to the values in src/services/supabase.js. Because RLS is
 * disabled on the tables (see supabase/schema.sql), the anon key is enough.
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ctvgzbcrkvswrhkaqstu.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || 'sb_publishable_3FJWwYR5mXjCDyaG4KspEg__4vsIeJI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------------------- seed data ---------------------------------- */

// All static content that used to be hardcoded in the app now lives in the
// app_settings table: subscription plan, ijaza list, meeting link, wallet.
// The app reads them from the local cache (offline-first) with fallbacks.

const SUBSCRIPTION_SETTING = {
  id: 'subscription',
  value: {
    isSubActive: true,
    title: 'الاشتراك الشهري الشامل',
    price: '199',
    description: 'احصل على وصول غير محدود لكافة الكورسات والفرق الصوتية باشتراك واحد.',
  },
};

// The 19 ijaza types (was IJAZA_ITEMS in IjazaScreen).
const IJAZA_SETTING = {
  id: 'ijaza_items',
  value: [
    'إجازة حفص عن عاصم',
    'إجازة عاصم براوييه شعبة وحفص',
    'إجازة قالون عن نافع',
    'إجازة ورش عن نافع',
    'إجازة ابن كثير براوييه',
    'إجازة أبو عمرو براوييه',
    'إجازة ابن عامر براوييه',
    'إجازة حمزة براوييه',
    'إجازة الكسائي براوييه',
    'إجازة أبو جعفر براوييه',
    'إجازة يعقوب براوييه',
    'إجازة خلف العاشر براوييه',
    'إجازة أصحاب الصلة قالون وابن كثير وأبو جعفر',
    'إجازة ابن عامر وعاصم',
    'إجازة الكسائي وخلف العاشر',
    'إجازة أصحاب التوسط ابن عامر وعاصم والكسائي وخلف العاشر',
    'إجازة أصحاب المد ورش وحمزة',
    'إجازة القراءات السبع',
    'إجازة القراءات العشر',
  ],
};

// Live meeting room (was TEAM_MEETING_URL in constants/meetingLinks).
const MEETING_SETTING = {
  id: 'meeting_url',
  value: 'https://meet.google.com/vkx-gfdc-hyn',
};

// Wallet number used by students for manual transfer payments.
const WALLET_SETTING = {
  id: 'wallet_number',
  value: '01093684797',
};

const APP_SETTINGS = [SUBSCRIPTION_SETTING, IJAZA_SETTING, MEETING_SETTING, WALLET_SETTING];

// Students that must always exist in the app (was previously manual).
// They log in with their student_code (e.g. STU-201).
const DEFAULT_STUDENTS = [
  { id: 'stu_ahmed', name: 'أحمد', studentId: 'STU-201', gender: 'boy', stars: 0 },
  { id: 'stu_yassin', name: 'ياسين', studentId: 'STU-202', gender: 'boy', stars: 0 },
];

// The course catalog. The content is PDF books (المحتوى PDF) bundled with the
// app under assets/pdfs/ and referenced by the 'asset:' markers below.
// The app resolves them through services/pdfAssetResolver.js — no videos.
const COURSES = [
  {
    id: 'c1',
    title: 'المقدمة في أحكام التجويد',
    category: 'القرآن الكريم',
    rating: 4.9,
    price: 350,
    enrolled: false,
    instructor: 'الشيخ أحمد السيد',
    description: 'دورة شاملة لإتقان القواعد الأساسية لتلاوة القرآن الكريم ومخارج الحروف والصفات وتطبيق أحكام النون الساكنة والتنوين.',
    curriculum: [
      {
        id: 'm1',
        title: '📚 الكتاب المقرر',
        lessons: [
          {
            id: 'c1_book',
            title: 'كتاب الهدى في تجويد كلام الله',
            pdfName: 'كتاب الهدى في تجويد كلام الله.pdf',
            pdfUri: 'asset:tajweed',
          },
        ],
      },
    ],
  },
  {
    id: 'c2',
    title: 'اللغة العربية وفهم القرآن',
    category: 'اللغة العربية',
    rating: 4.8,
    price: 450,
    enrolled: false,
    instructor: 'د. طارق الهاشمي',
    description: 'تعلم قواعد النحو والصرف الأساسية والمفردات المباشرة لتذوق وفهم آيات كتاب الله عز وجل.',
    curriculum: [
      {
        id: 'm1',
        title: '📚 الكتاب المقرر',
        lessons: [
          {
            id: 'c2_book',
            title: 'كتاب تفسير الهدى',
            pdfName: 'كتاب تفسير الهدى.pdf',
            pdfUri: 'asset:tafsir',
          },
        ],
      },
    ],
  },
  {
    id: 'c3',
    title: 'السيرة النبوية الشريفة',
    category: 'الدراسات الإسلامية',
    rating: 5.0,
    price: 280,
    enrolled: false,
    instructor: 'الشيخ عمر فاروق',
    description: 'دراسة مستفيضة للعهدين المكي والمدني مع استخلاص العبر والدروس التربوية لحياتنا اليومية.',
    curriculum: [
      {
        id: 'm1',
        title: '📚 الكتاب المقرر',
        lessons: [
          {
            id: 'c3_book',
            title: 'كتاب سيرة الهدى',
            pdfName: 'كتاب سيرة الهدى.pdf',
            pdfUri: 'asset:sirah',
          },
        ],
      },
    ],
  },
  {
    id: 'c4',
    title: 'العقيدة الإسلامية',
    category: 'الدراسات الإسلامية',
    rating: 5.0,
    price: 300,
    enrolled: false,
    instructor: 'الشيخ أحمد السيد',
    description: 'دورة تأسيسية في أصول العقيدة الإسلامية: الإيمان بالله وملائكته وكتبه ورسله واليوم الآخر والقدر خيره وشره.',
    curriculum: [
      {
        id: 'm1',
        title: '📚 الكتاب المقرر',
        lessons: [
          {
            id: 'c4_book',
            title: 'كتاب عقيدة الهدى',
            pdfName: 'كتاب عقيدة الهدى.pdf',
            pdfUri: 'asset:aqeeda',
          },
        ],
      },
    ],
  },
];

/* ---------------------------- helpers ------------------------------------ */

function courseToRow(c) {
  const m = { ...c };
  delete m.id;
  delete m.title;
  delete m.description;
  delete m.curriculum;
  return {
    id: c.id,
    title: c.title,
    description: c.description || null,
    published: true,
    metadata: m,
  };
}

function courseToLessonRows(course) {
  const rows = [];
  (course.curriculum || []).forEach((unit, ui) => {
    (unit.lessons || []).forEach((lesson, li) => {
      const isObj = lesson && typeof lesson === 'object';
      rows.push({
        id: isObj && lesson.id ? lesson.id : `${course.id}_${unit.id || `u${ui}`}_${li}`,
        course_id: course.id,
        title: isObj ? lesson.title || lesson.pdfName || 'درس' : String(lesson),
        content: { module: unit.title, moduleId: unit.id || `u${ui}`, lesson },
        position: li,
      });
    });
  });
  return rows;
}

function studentToProfileRow(s) {
  const payload = { ...s };
  delete payload.id;
  delete payload.name;
  delete payload.studentId;
  delete payload.role;
  delete payload.email;
  return {
    id: s.id || `stu_${Date.now()}`,
    full_name: s.name || s.full_name || null,
    student_code: s.studentId || s.student_code || null,
    role: s.role || 'student',
    email: s.email || null,
    metadata: payload,
  };
}

const log = (msg) => console.log(`• ${msg}`);
const ok = (msg) => console.log(`✔ ${msg}`);
const fail = (msg) => console.log(`✖ ${msg}`);

/* ----------------------------- seeding ----------------------------------- */

/**
 * Verifies the new schema is live (TEXT ids). The app's offline ids (c1,
 * STU-…) only round-trip if `courses.id` accepts TEXT. If the old schema is
 * still active (uuid ids) or nothing is created, we stop with clear guidance.
 */
async function probeSchema() {
  const probeId = `probe_${Date.now()}`;
  const { error } = await supabase
    .from('courses')
    .upsert({ id: probeId, title: '__probe__' });
  if (!error) {
    // Cleanup safety: remove the probe row (and any leftovers) if present.
    await supabase.from('courses').delete().eq('id', probeId).catch(() => {});
    return true;
  }
  const code = String(error.code || '');
  const isSchemaIssue =
    code === '22P02' || code === '42P01' || code === '42703' ||
    /invalid input syntax for type uuid/i.test(String(error.message));
  if (!isSchemaIssue) {
    fail(`تعذّر الاتصال بقاعدة البيانات: ${error.message}`);
    return false;
  }
  fail('الاسكيما على Supabase ليست جاهزة بعد (قديمة أو غير منشأة).');
  console.log('  👉 افتح SQL Editor في لوحة Supabase وشغّل هذين السطرين أولاً:');
  console.log('');
  console.log('     DROP SCHEMA public CASCADE;');
  console.log('     CREATE SCHEMA public;');
  console.log('');
  console.log('  ثم الصق محتوى ملف supabase/schema.sql كاملاً وشغّله (Run).');
  console.log('  وبعدها أعد تشغيل هذا السكربت.');
  console.log('  (التفاصيل كاملة في SUPABASE_SETUP.md)');
  return false;
}

async function seedAppSettings() {
  for (const setting of APP_SETTINGS) {
    const { error } = await supabase
      .from('app_settings')
      .upsert(setting, { onConflict: 'id' });
    if (error) throw new Error(`app_settings ${setting.id}: ${error.message}`);
  }
  ok(`إعدادات التطبيق (${APP_SETTINGS.length}): الاشتراك، قائمة الإجازات، رابط الاجتماع، رقم المحفظة`);
}

async function seedCourses() {
  for (const c of COURSES) {
    const { error } = await supabase.from('courses').upsert(courseToRow(c), { onConflict: 'id' });
    if (error) throw new Error(`courses ${c.id}: ${error.message}`);

    await supabase.from('lessons').delete().eq('course_id', c.id);
    const lessonRows = courseToLessonRows(c);
    if (lessonRows.length) {
      const { error: lerr } = await supabase.from('lessons').upsert(lessonRows, { onConflict: 'id' });
      if (lerr) throw new Error(`lessons ${c.id}: ${lerr.message}`);
    }
  }
  ok(`الكورسات (${COURSES.length}) + دروسها`);
}

async function setAdminRole(email) {
  if (!email) return;
  const { data, error } = await supabase.from('profiles').select('id,email,role').eq('email', email.trim().toLowerCase());
  if (error) throw new Error(`profiles lookup: ${error.message}`);

  if (!data || data.length === 0) {
    fail(
      `لم نجد بروفايل للبريد ${email}. أنشئ المستخدم أولاً من لوحة Supabase (Auth ← Users ← Add user) ثم أعد تشغيل السكربت.`
    );
    return;
  }
  for (const row of data) {
    await supabase.from('profiles').update({ role: 'admin' }).eq('id', row.id);
  }
  ok(`تم تعيين ${email} كمسؤول (role = admin)`);
}

async function seedStudents(filePath) {
  if (!filePath) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  const list = JSON.parse(raw);
  const students = Array.isArray(list) ? list : list.students || [];
  if (!students.length) {
    fail('ملف الطلاب فارغ أو غير صالح.');
    return;
  }
  const rows = students
    .filter((s) => s && s.name)
    .map((s) => studentToProfileRow(s));
  const { error } = await supabase.from('profiles').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`profiles upsert: ${error.message}`);
  ok(`تم استيراد ${rows.length} طالب/طالبة`);
}

/** Always-required students (أحمد وياسين). Idempotent upsert. */
async function seedDefaultStudents() {
  const rows = DEFAULT_STUDENTS.map((s) => studentToProfileRow(s));
  const { error } = await supabase.from('profiles').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`profiles upsert (default students): ${error.message}`);
  ok(`تم إضافة الطلاب الأساسيين (${rows.length}): أحمد وياسين (STU-201 / STU-202)`);
}

/* ------------------------------- main ------------------------------------- */

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };
  const adminEmail = getArg('--admin-email');
  const studentsFile = getArg('--students-file');

  console.log('══ AlHudaApp — Supabase seed ══');
  log(`Supabase: ${SUPABASE_URL}`);

  if (!adminEmail && !studentsFile) {
    console.log('\n(بدون بريد أدمن أو ملف طلاب — سيتم بذر المحتوى والطلاب الأساسيين فقط)');
    console.log('  للترقية: أعد التشغيل مع --admin-email admin@example.com');
  }

  try {
    const schemaReady = await probeSchema();
    if (!schemaReady) return; // رسالة الفحص توضّح الخطوة التالية
    await seedAppSettings();
    await seedCourses();
    await seedDefaultStudents();
    await setAdminRole(adminEmail);
    await seedStudents(studentsFile);

    console.log('\n✔ اكتمل البذر بنجاح!');
    console.log('\nالخطوات التالية:');
    console.log('  1. أعد تشغيل التطبيق (npx expo start).');
    console.log('  2. سجّل دخول الأدمن بالبريد وكلمة السر اللذين أنشأتهما في Supabase.');
    console.log('  3. سجّل دخول الطلاب بكود الطالب (مثل STU-101).');
    console.log('  4. على أي جهاز فيه بيانات قديمة من النسخة السابقة، سترفع تلقائياً لأول مرة.');
  } catch (e) {
    fail(`فشل البذر: ${e.message}`);
    process.exit(1);
  }
}

main();
