<script setup lang="ts">
/**
 * لوحة التحكم (§4.3) داخل الهيكل العام.
 * لوحة المدير: بطاقات إحصائية (أعداد حقيقية) + بطاقات إعدادات مربوطة بـ app_settings.
 * بقية الأدوار: ترحيب أساسي يُوسَّع لاحقاً بلوحاتها الخاصة.
 */
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'لوحة التحكم — ترجمان' })

const supabase = useSupabaseClient<Database>()
const { role, fullName } = useProfile()
const { handle } = useErrorHandler()
const toast = useToast()

const isManager = computed(() => role.value === 'manager')

// ── أعداد البطاقات (للمدير) ──
const counts = reactive({ students: 0, teachers: 0, supervisors: 0, quality: 0, halqat: 0 })

async function countOf(table: 'students' | 'halaqat') {
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true })
  return count ?? 0
}
async function countRole(r: Database['public']['Enums']['user_role']) {
  const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', r)
  return count ?? 0
}

// ── إعدادات المدير (app_settings) ──
const settings = reactive({ pass_mark: 80, target_memorization_pages: 30, default_points: 100, default_attendance_days: 26 })
const drafts = reactive({ pass_mark: '80', target_memorization_pages: '30', default_points: '100', default_attendance_days: '26' })

async function loadSettings() {
  const { data } = await supabase.from('app_settings').select('*').eq('id', 1).single()
  if (data) {
    settings.pass_mark = data.pass_mark
    settings.target_memorization_pages = data.target_memorization_pages
    settings.default_points = data.default_points
    settings.default_attendance_days = data.default_attendance_days ?? 26
    drafts.pass_mark = String(settings.pass_mark)
    drafts.target_memorization_pages = String(settings.target_memorization_pages)
    drafts.default_points = String(settings.default_points)
    drafts.default_attendance_days = String(settings.default_attendance_days)
  }
}

type SettingKey = keyof typeof settings
const saving = ref<SettingKey | null>(null)

async function saveSetting(key: SettingKey, unit: string) {
  const val = Number.parseInt(drafts[key], 10)
  if (!Number.isFinite(val) || val <= 0) {
    toast.add({ title: 'أدخل قيمة صحيحة موجبة.', color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  saving.value = key
  try {
    const patch = { [key]: val } as Database['public']['Tables']['app_settings']['Update']
    const { error } = await supabase.from('app_settings').update(patch).eq('id', 1)
    if (error) throw error
    settings[key] = val
    toast.add({ title: `تم الاعتماد (${val} ${unit}).`, color: 'success', icon: 'i-lucide-circle-check' })
  } catch (err) {
    handle(err)
  } finally {
    saving.value = null
  }
}

async function loadManagerData() {
  const [st, te, su, qu, ha] = await Promise.all([
    countOf('students'), countRole('teacher'), countRole('supervisor'), countRole('quality'), countOf('halaqat')
  ])
  counts.students = st
  counts.teachers = te
  counts.supervisors = su
  counts.quality = qu
  counts.halqat = ha
  await loadSettings()
}

// يُحمَّل عند معرفة الدور (الملف قد يصل بعد أول تصيير على العميل)
watch(isManager, (v) => {
  if (v) loadManagerData()
}, { immediate: true })

const statCards = computed(() => [
  { icon: 'i-lucide-graduation-cap', tone: 'blue', value: counts.students, label: 'إجمالي الطلاب' },
  { icon: 'i-lucide-users', tone: 'green', value: counts.teachers, label: 'المعلمون' },
  { icon: 'i-lucide-shield-check', tone: 'blue', value: counts.supervisors, label: 'المشرفون الميدانيون' },
  { icon: 'i-lucide-award', tone: 'green', value: counts.quality, label: 'مشرفو الجودة' },
  { icon: 'i-lucide-book-open', tone: 'neutral', value: counts.halqat, label: 'الحلقات النشطة' }
])

const settingCards = [
  { key: 'target_memorization_pages' as const, icon: 'i-lucide-book-open', tone: 'blue', title: 'صفحات الحفظ المستهدفة شهرياً', unit: 'صفحة', desc: 'الحدّ الأدنى لصفحات الحفظ لكل طالب — يُحتسب عليه المكوّن الأكاديمي.' },
  { key: 'default_points' as const, icon: 'i-lucide-star', tone: 'green', title: 'النقاط الافتراضية الشهرية', unit: 'نقطة', desc: 'الحدّ الأقصى لنقاط الطالب هذا الشهر — يُحتسب عليه مكوّن النقاط.' },
  { key: 'default_attendance_days' as const, icon: 'i-lucide-calendar-check', tone: 'neutral', title: 'أيام الدوام الافتراضية شهرياً', unit: 'يوم', desc: 'مقام ثابت لحساب نسبة الانتظام، يظهر للمعلم للقراءة فقط.' },
  { key: 'pass_mark' as const, icon: 'i-lucide-check-check', tone: 'green', title: 'علامة الاجتياز في الاختبار', unit: '%', desc: 'الحدّ الأدنى من 100 لاجتياز اختبار الطالب — يسري على الاختبارات اللاحقة.' }
]
</script>

<template>
  <div class="dash">
    <div class="welcome">
      <h2>أهلاً، {{ fullName }} 👋</h2>
      <p>إليك نظرة عامة على المشروع.</p>
    </div>

    <template v-if="isManager">
      <!-- بطاقات إحصائية -->
      <div class="stats">
        <div
          v-for="c in statCards"
          :key="c.label"
          class="card stat"
        >
          <div
            class="ico"
            :class="`ico-${c.tone}`"
          >
            <UIcon
              :name="c.icon"
              class="size-6"
            />
          </div>
          <div class="stat-num">
            {{ c.value }}
          </div>
          <div class="stat-label">
            {{ c.label }}
          </div>
        </div>
      </div>

      <!-- بطاقات الإعدادات -->
      <div class="settings">
        <div
          v-for="s in settingCards"
          :key="s.key"
          class="card setting"
        >
          <div class="setting-head">
            <div
              class="ico"
              :class="`ico-${s.tone}`"
            >
              <UIcon
                :name="s.icon"
                class="size-6"
              />
            </div>
            <div class="setting-text">
              <h3>{{ s.title }}</h3>
              <p>{{ s.desc }} <span class="cur">المعتمد: {{ settings[s.key] }} {{ s.unit }}</span></p>
            </div>
          </div>
          <div class="setting-edit">
            <UInput
              v-model="drafts[s.key]"
              inputmode="numeric"
              size="lg"
              :ui="{ base: 'rounded-[13px] text-center font-bold w-24' }"
            />
            <span class="unit">{{ s.unit }}</span>
            <UButton
              label="اعتماد"
              color="primary"
              size="lg"
              icon="i-lucide-check"
              :loading="saving === s.key"
              :ui="{ base: 'rounded-[13px] font-semibold' }"
              @click="saveSetting(s.key, s.unit)"
            />
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="card placeholder">
        <p>لوحة دورك ({{ role }}) قيد البناء — تُضاف في الخطوات التالية.</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dash { max-width: 1280px; margin: 0 auto; }
.welcome { margin-bottom: 28px; }
.welcome h2 { margin: 0; font-size: 28px; font-weight: 700; color: var(--ink); }
.welcome p { margin: 8px 0 0; font-size: 16px; color: var(--ink-2); font-weight: 300; }

.card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: var(--shadow); }
.ico { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex: none; }
.ico-blue { background: var(--blue-soft); color: var(--blue-ink); }
.ico-green { background: var(--green-soft); color: var(--green-ink); }
.ico-neutral { background: var(--surface-3); color: var(--ink); }

/* الإحصائيات */
.stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 18px; margin-bottom: 24px; }
.stat { padding: 24px; }
.stat .ico { margin-bottom: 18px; }
.stat-num { font-size: 34px; font-weight: 700; color: var(--ink); line-height: 1; }
.stat-label { font-size: 15px; color: var(--ink-2); margin-top: 8px; }

/* الإعدادات */
.settings { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.setting { padding: 22px 24px; display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.setting-head { display: flex; align-items: center; gap: 14px; min-width: 0; }
.setting-text { min-width: 0; }
.setting-text h3 { margin: 0; font-size: 17px; font-weight: 700; color: var(--ink); }
.setting-text p { margin: 5px 0 0; font-size: 14px; color: var(--ink-2); font-weight: 300; line-height: 1.6; }
.cur { font-weight: 600; color: var(--ink); }
.setting-edit { display: flex; align-items: center; gap: 10px; flex: none; }
.unit { font-size: 15px; font-weight: 600; color: var(--ink-3); }

.placeholder { padding: 40px; text-align: center; color: var(--ink-2); }

@media (max-width: 1024px) { .stats { grid-template-columns: repeat(2, 1fr); } .settings { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .stats { grid-template-columns: 1fr; } }
</style>
