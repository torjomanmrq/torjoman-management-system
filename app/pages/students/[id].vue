<script setup lang="ts">
/**
 * ملف الطالب (§4.23) — عرض تفصيلي لسجلّ الطالب (بلا حساب دخول).
 * بيانات أساسية + قرآنية + سكن + وليّ الأمر والتواصل. رحلة الطالب (§4.22)
 * تُضاف مع وحدتي التقارير والاختبارات.
 */
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'dashboard' })

type StudentRow = Database['public']['Tables']['students']['Row'] & {
  halaqa: { name: string, daily_time: string | null, teacher: { full_name: string } | null } | null
}

const route = useRoute()
const supabase = useSupabaseClient<Database>()
const { role } = useProfile()
const { handle } = useErrorHandler()
const toast = useToast()
const id = computed(() => String(route.params.id))
const canManage = computed(() => role.value === 'manager' || role.value === 'teacher')

const { data: student, pending, refresh } = await useAsyncData<StudentRow | null>(
  () => `student-${id.value}`,
  async () => {
    const { data, error } = await supabase
      .from('students')
      .select('*, halaqa:halaqa_id(name, daily_time, teacher:teacher_id(full_name))')
      .eq('id', id.value)
      .single<StudentRow>()
    if (error) {
      console.error('[student] فشل الجلب:', error.message)
      return null
    }
    return data
  },
  { server: false, default: () => null }
)

// خطة الاختبارات لرسم رحلة الطالب (حسب الحفظ)
const { data: plan } = await useAsyncData('journey-exam-plan', async () => {
  const { data } = await supabase.from('exam_plan').select('parts_from, parts_to, stage_type').order('parts_to')
  return data ?? []
}, { server: false, default: () => [] })

useSeoMeta({ title: () => student.value ? `${student.value.full_name} — ترجمان` : 'ملف الطالب — ترجمان' })

const GENDER: Record<string, string> = { male: 'ذكر', female: 'أنثى' }
const STATUS_META: Record<string, { label: string, color: 'success' | 'warning' | 'neutral' | 'info' }> = {
  active: { label: 'نشط', color: 'success' },
  withdrawn: { label: 'منقطع', color: 'warning' },
  graduated: { label: 'متخرّج', color: 'info' },
  transferred: { label: 'منقول', color: 'neutral' }
}
function ageFrom(d: string | null) {
  if (!d) return '—'
  const years = Math.floor((Date.now() - new Date(d).getTime()) / (365.25 * 24 * 3600 * 1000))
  return years > 0 ? `${years} سنة` : '—'
}
const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === '') ? '—' : String(v)

const initial = computed(() => student.value?.full_name?.trim().charAt(0) || '؟')

// رابط الاطّلاع العام (للقراءة فقط)
function copyLink() {
  if (!student.value) return
  navigator.clipboard.writeText(`${window.location.origin}/s/${student.value.view_token}`)
  toast.add({ title: 'تم نسخ رابط الاطّلاع.', color: 'success', icon: 'i-lucide-copy-check' })
}
const regenerating = ref(false)
async function regenerateLink() {
  if (!student.value) return
  regenerating.value = true
  try {
    const { error } = await supabase.from('students').update({ view_token: crypto.randomUUID() }).eq('id', student.value.id)
    if (error) throw error
    await refresh()
    toast.add({ title: 'أُعيد توليد الرابط — القديم لم يعد صالحاً.', color: 'success', icon: 'i-lucide-refresh-cw' })
  } catch (err) {
    handle(err)
  } finally {
    regenerating.value = false
  }
}

type Field = { label: string, value: string, ltr?: boolean }
const sections = computed<{ title: string, icon: string, tone: string, fields: Field[] }[]>(() => {
  const s = student.value
  if (!s) return []
  return [
    {
      title: 'البيانات الأساسية',
      icon: 'i-lucide-id-card',
      tone: 'blue',
      fields: [
        { label: 'الاسم رباعي', value: dash(s.full_name) },
        { label: 'الجنس', value: (s.gender && GENDER[s.gender]) || '—' },
        { label: 'تاريخ الميلاد', value: dash(s.birth_date), ltr: true },
        { label: 'العمر', value: ageFrom(s.birth_date) },
        { label: 'رقم الهوية', value: dash(s.national_id), ltr: true },
        { label: 'عدد الأفراد', value: dash(s.family_count) }
      ]
    },
    {
      title: 'بيانات قرآنية',
      icon: 'i-lucide-book-open',
      tone: 'green',
      fields: [
        { label: 'الأجزاء المثبتة', value: s.quran_parts != null ? `${s.quran_parts} جزء` : '—' },
        { label: 'الأحكام (التجويد)', value: dash(s.tajweed_level) }
      ]
    },
    {
      title: 'السكن',
      icon: 'i-lucide-home',
      tone: 'neutral',
      fields: [
        { label: 'المنطقة / المدينة', value: dash(s.residence) },
        { label: 'أقرب مسجد', value: dash(s.nearest_mosque) }
      ]
    },
    {
      title: 'وليّ الأمر والتواصل',
      icon: 'i-lucide-phone',
      tone: 'blue',
      fields: [
        { label: 'اسم وليّ الأمر', value: dash(s.guardian_name) },
        { label: 'جوال وليّ الأمر', value: dash(s.guardian_phone), ltr: true },
        { label: 'جوال الطالب', value: dash(s.phone), ltr: true },
        { label: 'بريد وليّ الأمر', value: dash(s.guardian_email), ltr: true },
        { label: 'تاريخ الالتحاق', value: dash(s.enrollment_date), ltr: true }
      ]
    }
  ]
})
</script>

<template>
  <div class="sp">
    <NuxtLink
      to="/students"
      class="back"
    >
      <UIcon
        name="i-lucide-chevron-right"
        class="size-[18px]"
      />
      <span>عودة إلى الطلاب</span>
    </NuxtLink>

    <ClientOnly>
      <UiEmptyState
        v-if="pending"
        title="جارٍ التحميل…"
      />
      <UiEmptyState
        v-else-if="!student"
        icon="i-lucide-user-x"
        title="الطالب غير موجود"
        description="قد يكون حُذف أو ليس ضمن نطاقك."
      />

      <template v-else>
        <!-- شريط علوي -->
        <div class="band">
          <div class="av">
            {{ initial }}
          </div>
          <div class="band-info">
            <div class="band-top">
              <h2>{{ student.full_name }}</h2>
              <UBadge
                :label="STATUS_META[student.status]?.label"
                :color="STATUS_META[student.status]?.color"
                variant="soft"
              />
            </div>
            <div class="band-sub">
              {{ student.halaqa?.name || 'بلا حلقة' }}
              <template v-if="student.halaqa?.teacher?.full_name">
                · المعلّم {{ student.halaqa.teacher.full_name }}
              </template>
              <template v-if="student.halaqa?.daily_time">
                · {{ student.halaqa.daily_time.slice(0, 5) }}
              </template>
            </div>
          </div>
          <div
            v-if="canManage"
            class="band-actions"
          >
            <UButton
              label="نسخ رابط الاطّلاع"
              icon="i-lucide-link"
              color="neutral"
              variant="ghost"
              size="md"
              :ui="{ base: 'rounded-xl bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25' }"
              @click="copyLink"
            />
            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              size="md"
              :loading="regenerating"
              :ui="{ base: 'rounded-xl bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25' }"
              aria-label="إعادة توليد الرابط"
              title="إعادة توليد الرابط (يُبطل القديم)"
              @click="regenerateLink"
            />
          </div>
        </div>

        <!-- بطاقات البيانات -->
        <div class="grid">
          <section
            v-for="sec in sections"
            :key="sec.title"
            class="card"
          >
            <h3>
              <span
                class="ico"
                :class="`ico-${sec.tone}`"
              ><UIcon
                :name="sec.icon"
                class="size-5"
              /></span>
              {{ sec.title }}
            </h3>
            <div class="fields">
              <div
                v-for="f in sec.fields"
                :key="f.label"
                class="field"
              >
                <div class="f-label">
                  {{ f.label }}
                </div>
                <div
                  class="f-value"
                  :dir="f.ltr ? 'ltr' : undefined"
                >
                  {{ f.value }}
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- رحلة الطالب على خطة الاختبارات (حسب الحفظ) -->
        <section class="card journey">
          <h3>
            <span class="ico ico-green"><UIcon
              name="i-lucide-route"
              class="size-5"
            /></span>
            رحلة الطالب على خطة الاختبارات
          </h3>
          <StudentJourney
            :quran-parts="student.quran_parts"
            :plan="plan"
            :enrollment-date="student.enrollment_date"
          />
        </section>
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.sp { max-width: 1000px; margin: 0 auto; }
.back { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 18px; font-size: 14.5px; font-weight: 600; color: var(--ink-2); cursor: pointer; }
.back:hover { color: var(--ink); }

.band { background: var(--band); border-radius: 22px; padding: 28px 30px; box-shadow: var(--shadow-lg); margin-bottom: 24px; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.av { width: 70px; height: 70px; border-radius: 20px; background: rgba(255, 255, 255, .16); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; flex: none; }
.band-info { min-width: 0; flex: 1; }
.band-top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.band-top h2 { margin: 0; font-size: 25px; font-weight: 700; color: #fff; }
.band-sub { font-size: 15px; color: var(--band-sub); margin-top: 6px; }
.band-actions { display: flex; align-items: center; gap: 8px; flex: none; }

.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 22px; align-items: start; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 24px; box-shadow: var(--shadow); }
.card h3 { margin: 0 0 18px; font-size: 17px; font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 10px; }
.ico { width: 36px; height: 36px; border-radius: 11px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.ico-blue { background: var(--blue-soft); color: var(--blue-ink); }
.ico-green { background: var(--green-soft); color: var(--green-ink); }
.ico-neutral { background: var(--surface-3); color: var(--ink); }
.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.field { background: var(--surface-2); border: 1px solid var(--line); border-radius: 14px; padding: 13px 15px; }
.f-label { font-size: 12px; color: var(--ink-3); margin-bottom: 7px; font-weight: 500; }
.f-value { font-size: 15.5px; font-weight: 700; color: var(--ink); }

.journey { margin-top: 22px; }
.soon { margin: 0; font-size: 14.5px; line-height: 1.8; color: var(--ink-2); font-weight: 300; }

@media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
</style>
