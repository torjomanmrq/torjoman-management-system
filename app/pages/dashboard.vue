<script setup lang="ts">
/**
 * لوحة التحكم (§4.3) داخل الهيكل العام.
 * لوحة المدير: بطاقات إحصائية (أعداد حقيقية) + بطاقات إعدادات مربوطة بـ app_settings.
 * بقية الأدوار: ترحيب أساسي يُوسَّع لاحقاً بلوحاتها الخاصة.
 */
import type { Database } from '~/types/database.types'
import { buildJourney, type PlanInput } from '~/utils/journey'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'لوحة التحكم — ترجمان' })

const supabase = useSupabaseClient<Database>()
const { role, fullName, profile } = useProfile()
const { handle } = useErrorHandler()
const toast = useToast()

const isManager = computed(() => role.value === 'manager')
const isTeacher = computed(() => role.value === 'teacher')

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

// ── لوحة المعلّم «حلقتي» ──
type TeacherRow = { id: string, full_name: string, quran_parts: number | null, next: string, done: boolean }
const myHalqa = ref<{ id: string, name: string, daily_time: string | null } | null>(null)
const teacherRows = ref<TeacherRow[]>([])
const teacherLoaded = ref(false)

async function loadTeacherData() {
  try {
    const { data: h } = await supabase.from('halaqat').select('id, name, daily_time').eq('teacher_id', profile.value?.id ?? '').limit(1).maybeSingle()
    myHalqa.value = h
    if (!h) {
      teacherRows.value = []
      teacherLoaded.value = true
      return
    }
    const [{ data: studs }, { data: plan }] = await Promise.all([
      supabase.from('students').select('id, full_name, quran_parts').eq('halaqa_id', h.id).eq('status', 'active').order('full_name'),
      supabase.from('exam_plan').select('id, parts_from, parts_to, stage_type').order('parts_to')
    ])
    const planArr = (plan ?? []) as PlanInput[]
    teacherRows.value = (studs ?? []).map((s) => {
      const j = buildJourney(s.quran_parts, planArr, [])
      return {
        id: s.id,
        full_name: s.full_name,
        quran_parts: s.quran_parts,
        next: j.nextStation ? `الأجزاء ${j.nextStation.from}–${j.nextStation.to}` : (j.totalStations ? 'أكمل الخطة 🎉' : '—'),
        done: !j.nextStation && j.totalStations > 0
      }
    })
    teacherLoaded.value = true
  } catch (err) {
    handle(err)
  }
}

watch(isTeacher, (v) => {
  if (v) loadTeacherData()
}, { immediate: true })

const fmtTime = (t: string | null) => t ? t.slice(0, 5) : '—'

type Tone = 'blue' | 'green' | 'neutral' | 'err'
const statCards = computed(() => [
  { icon: 'i-lucide-graduation-cap', tone: 'blue' as Tone, value: counts.students, label: 'إجمالي الطلاب' },
  { icon: 'i-lucide-users', tone: 'green' as Tone, value: counts.teachers, label: 'المعلمون' },
  { icon: 'i-lucide-shield-check', tone: 'blue' as Tone, value: counts.supervisors, label: 'المشرفون الميدانيون' },
  { icon: 'i-lucide-award', tone: 'green' as Tone, value: counts.quality, label: 'مشرفو الجودة' },
  { icon: 'i-lucide-book-open', tone: 'neutral' as Tone, value: counts.halqat, label: 'الحلقات النشطة' }
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
        <UiStatCard
          v-for="c in statCards"
          :key="c.label"
          :icon="c.icon"
          :tone="c.tone"
          :value="c.value"
          :label="c.label"
          stacked
        />
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

    <template v-else-if="isTeacher">
      <ClientOnly>
        <template v-if="teacherLoaded && !myHalqa">
          <div class="card placeholder">
            <p>لا توجد حلقة معيّنة لك بعد. تواصل مع الإدارة لإسناد حلقتك.</p>
          </div>
        </template>
        <template v-else-if="myHalqa">
          <!-- ترويسة الحلقة + إجراءات سريعة -->
          <div class="card thead">
            <div class="thead-info">
              <div class="ico ico-blue">
                <UIcon
                  name="i-lucide-book-open"
                  class="size-6"
                />
              </div>
              <div>
                <h3>{{ myHalqa.name }}</h3>
                <p>{{ teacherRows.length }} طالب · الوقت اليومي {{ fmtTime(myHalqa.daily_time) }}</p>
              </div>
            </div>
            <div class="thead-actions">
              <UButton
                to="/exams"
                label="ترشيح للاختبار"
                color="primary"
                size="lg"
                icon="i-lucide-clipboard-check"
                :ui="{ base: 'rounded-[13px] font-semibold' }"
              />
              <UButton
                to="/reports"
                label="تقرير الشهر"
                color="neutral"
                variant="outline"
                size="lg"
                icon="i-lucide-file-text"
                :ui="{ base: 'rounded-[13px] font-semibold' }"
              />
            </div>
          </div>

          <!-- طلاب الحلقة -->
          <UiEmptyState
            v-if="!teacherRows.length"
            icon="i-lucide-users"
            title="لا طلاب نشطون في حلقتك"
          />
          <div
            v-else
            class="card table-wrap"
          >
            <table>
              <thead>
                <tr>
                  <th class="ta-start">
                    الطالب
                  </th>
                  <th>الأجزاء المثبتة</th>
                  <th class="ta-start">
                    المحطة المستحقّة القادمة
                  </th>
                  <th class="ta-end">
                    —
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="r in teacherRows"
                  :key="r.id"
                >
                  <td class="ta-start strong">
                    {{ r.full_name }}
                  </td>
                  <td>{{ r.quran_parts != null ? `${r.quran_parts} / 30` : '—' }}</td>
                  <td
                    class="ta-start"
                    :class="{ done: r.done }"
                  >
                    {{ r.next }}
                  </td>
                  <td>
                    <div class="ta-end">
                      <UButton
                        :to="`/students/${r.id}`"
                        label="الملف"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        icon="i-lucide-user"
                        :ui="{ base: 'rounded-[10px]' }"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </ClientOnly>
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

/* لوحة المعلّم */
.thead { padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 18px; }
.thead-info { display: flex; align-items: center; gap: 14px; min-width: 0; }
.thead-info h3 { margin: 0; font-size: 19px; font-weight: 700; color: var(--ink); }
.thead-info p { margin: 5px 0 0; font-size: 14px; color: var(--ink-2); }
.thead-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

.table-wrap { overflow-x: auto; }
.table-wrap table { width: 100%; border-collapse: collapse; font-size: 14.5px; min-width: 560px; }
.table-wrap thead tr { background: var(--surface-2); }
.table-wrap th { padding: 13px 14px; font-weight: 600; color: var(--ink-3); font-size: 13px; white-space: nowrap; text-align: center; }
.table-wrap td { padding: 12px 14px; vertical-align: middle; text-align: center; border-top: 1px solid var(--line); }
.ta-start { text-align: start; }
.ta-end { display: flex; justify-content: flex-end; }
.strong { font-weight: 600; color: var(--ink); }
.done { color: var(--green-ink); font-weight: 600; }

@media (max-width: 1024px) { .stats { grid-template-columns: repeat(2, 1fr); } .settings { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .stats { grid-template-columns: 1fr; } }
</style>
