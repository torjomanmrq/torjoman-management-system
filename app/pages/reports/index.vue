<script setup lang="ts">
/**
 * التقرير الشهري للحلقة (§4.17).
 * المعلّم يرفع تقرير حلقته (حفظ/مراجعة/غياب/نقاط/درجة لكل طالب + أنشطة مصاحبة)،
 * والمدير يعتمده. صفحات الحفظ/المراجعة محسوبة في القاعدة. RLS: المدير + حلقة المعلّم.
 * يُختار الشهر/السنة (لا مستقبل)، وتقرير واحد لكل (حلقة، شهر، سنة).
 */
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'التقارير الشهرية — ترجمان' })

type ReportStatus = Database['public']['Enums']['report_status']
type ActivityKey = Database['public']['Enums']['activity_key']

const supabase = useSupabaseClient<Database>()
const { role, profile } = useProfile()
const { handle } = useErrorHandler()
const toast = useToast()
const isManager = computed(() => role.value === 'manager')
const isTeacher = computed(() => role.value === 'teacher')

// ── المفاتيح والتسميات ──
const ACTIVITY_GROUPS: { title: string, keys: { key: ActivityKey, label: string }[] }[] = [
  { title: 'اللقاءات التدبّرية', keys: [1, 2, 3, 4].map(n => ({ key: `reflection_${n}` as ActivityKey, label: `تدبّر ${n}` })) },
  { title: 'المراجعة الأسبوعية', keys: [1, 2, 3, 4].map(n => ({ key: `weekly_review_${n}` as ActivityKey, label: `مراجعة ${n}` })) },
  { title: 'المقرر التربوي', keys: [1, 2, 3, 4].map(n => ({ key: `edu_curriculum_${n}` as ActivityKey, label: `مقرر ${n}` })) },
  { title: 'أخرى', keys: [{ key: 'video_lecture' as ActivityKey, label: 'محاضرة مرئية' }, { key: 'values_followup' as ActivityKey, label: 'متابعة القيم' }] }
]
const ALL_KEYS = ACTIVITY_GROUPS.flatMap(g => g.keys.map(k => k.key))

const STATUS_META: Record<ReportStatus, { label: string, color: 'neutral' | 'warning' | 'success' }> = {
  draft: { label: 'مسودّة', color: 'neutral' },
  submitted: { label: 'مُرسل', color: 'warning' },
  approved: { label: 'معتمد', color: 'success' }
}

// ── المُحدِّدات ──
const now = new Date()
const halqaId = ref('')
const month = ref(now.getMonth() + 1)
const year = ref(now.getFullYear())

type NameRow = { id: string, name: string }
const { data: halqat } = await useAsyncData<NameRow[]>('reports-halqat', async () => {
  const { data } = await supabase.from('halaqat').select('id, name').order('name')
  return data ?? []
}, { server: false, default: () => [] })
const halqaItems = computed(() => (halqat.value ?? []).map(h => ({ label: h.name, value: h.id })))
const monthItems = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'].map((m, i) => ({ label: m, value: i + 1 }))
const yearItems = [now.getFullYear() - 1, now.getFullYear()].map(y => ({ label: String(y), value: y }))

// ── حالة التقرير المحمّل ──
type Row = {
  student_id: string
  full_name: string
  memorization_from: number | string
  memorization_to: number | string
  review_to: number | string
  absence_excused: number | string
  absence_unexcused: number | string
  monthly_points: number | string
  student_grade: number | string
  notes: string
}
const loaded = ref(false)
const loading = ref(false)
const report = ref<{ id: string, status: ReportStatus } | null>(null)
const rows = ref<Row[]>([])
const acts = reactive<Record<string, boolean>>({})
const meta = reactive({ general_notes: '', activities_notes: '' })

const canEdit = computed(() => (isManager.value || isTeacher.value) && report.value?.status !== 'approved')
const num = (v: number | string) => (v === '' || v === null || v === undefined) ? null : Number(v)
const pagesOf = (r: Row) => (num(r.memorization_to) ?? 0) - (num(r.memorization_from) ?? 0)
const reviewOf = (r: Row) => (num(r.review_to) ?? 0) - (num(r.memorization_from) ?? 0)

async function load() {
  if (!halqaId.value) return
  loading.value = true
  try {
    const { data: rep } = await supabase
      .from('monthly_reports')
      .select('id, status, general_notes, activities_notes')
      .eq('halaqa_id', halqaId.value).eq('report_month', month.value).eq('report_year', year.value)
      .maybeSingle()
    report.value = rep ? { id: rep.id, status: rep.status } : null
    meta.general_notes = rep?.general_notes ?? ''
    meta.activities_notes = rep?.activities_notes ?? ''

    let repRows: { student_id: string, memorization_from: number | null, memorization_to: number | null, review_to: number | null, absence_excused: number, absence_unexcused: number, monthly_points: number | null, student_grade: number | null, notes: string | null }[] = []
    const doneKeys = new Set<string>()
    if (rep) {
      const [{ data: rs }, { data: ra }] = await Promise.all([
        supabase.from('monthly_report_students').select('*').eq('report_id', rep.id),
        supabase.from('monthly_report_activities').select('activity_key, done').eq('report_id', rep.id)
      ])
      repRows = rs ?? []
      for (const a of ra ?? []) if (a.done) doneKeys.add(a.activity_key)
    }

    const { data: studs } = await supabase.from('students').select('id, full_name').eq('halaqa_id', halqaId.value).eq('status', 'active').order('full_name')
    rows.value = (studs ?? []).map((s) => {
      const ex = repRows.find(r => r.student_id === s.id)
      return {
        student_id: s.id,
        full_name: s.full_name,
        memorization_from: ex?.memorization_from ?? '',
        memorization_to: ex?.memorization_to ?? '',
        review_to: ex?.review_to ?? '',
        absence_excused: ex?.absence_excused ?? '',
        absence_unexcused: ex?.absence_unexcused ?? '',
        monthly_points: ex?.monthly_points ?? '',
        student_grade: ex?.student_grade ?? '',
        notes: ex?.notes ?? ''
      }
    })
    for (const k of ALL_KEYS) acts[k] = doneKeys.has(k)
    loaded.value = true
  } catch (err) {
    handle(err)
  } finally {
    loading.value = false
  }
}

// ── قائمة التقارير (استعراض سريع) ──
type ListRow = {
  id: string
  halaqa_id: string
  report_month: number
  report_year: number
  status: ReportStatus
  halaqa: { name: string, teacher: { full_name: string } | null } | null
}
const { data: reportsList, refresh: refreshList } = await useAsyncData<ListRow[]>('reports-list', async () => {
  const { data } = await supabase
    .from('monthly_reports')
    .select('id, halaqa_id, report_month, report_year, status, halaqa:halaqa_id(name, teacher:teacher_id(full_name))')
    .order('report_year', { ascending: false })
    .order('report_month', { ascending: false })
    .returns<ListRow[]>()
  return data ?? []
}, { server: false, default: () => [] })

const listFilter = ref<ReportStatus | 'all'>('all')
const countByStatus = (st: ReportStatus) => (reportsList.value ?? []).filter(r => r.status === st).length
const submittedCount = computed(() => countByStatus('submitted'))
const listChips = computed(() => [
  { value: 'all' as const, label: 'الكل', count: (reportsList.value ?? []).length },
  { value: 'submitted' as const, label: 'بانتظار الاعتماد', count: countByStatus('submitted') },
  { value: 'approved' as const, label: 'معتمد', count: countByStatus('approved') },
  { value: 'draft' as const, label: 'مسودّة', count: countByStatus('draft') }
])
const listFiltered = computed(() => (reportsList.value ?? []).filter(r => listFilter.value === 'all' || r.status === listFilter.value))

async function openReport(r: ListRow) {
  halqaId.value = r.halaqa_id
  month.value = r.report_month
  year.value = r.report_year
  await load()
  await nextTick()
  document.querySelector('.statusbar')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const saving = ref(false)
async function save() {
  if (!halqaId.value) return
  saving.value = true
  try {
    let rid = report.value?.id
    if (!rid) {
      const { data, error } = await supabase.from('monthly_reports')
        .insert({ halaqa_id: halqaId.value, report_month: month.value, report_year: year.value, status: 'draft', general_notes: meta.general_notes || null, activities_notes: meta.activities_notes || null })
        .select('id, status').single()
      if (error || !data) throw error
      report.value = { id: data.id, status: data.status }
      rid = data.id
    } else {
      const { error } = await supabase.from('monthly_reports').update({ general_notes: meta.general_notes || null, activities_notes: meta.activities_notes || null }).eq('id', rid)
      if (error) throw error
    }

    // الطلاب: استبدال كامل
    await supabase.from('monthly_report_students').delete().eq('report_id', rid)
    const rowPayload = rows.value
      .filter(r => [r.memorization_from, r.memorization_to, r.review_to, r.absence_excused, r.absence_unexcused, r.monthly_points, r.student_grade, r.notes].some(v => v !== '' && v !== null))
      .map(r => ({
        report_id: rid!,
        student_id: r.student_id,
        memorization_from: num(r.memorization_from),
        memorization_to: num(r.memorization_to),
        review_to: num(r.review_to),
        absence_excused: num(r.absence_excused) ?? 0,
        absence_unexcused: num(r.absence_unexcused) ?? 0,
        monthly_points: num(r.monthly_points),
        student_grade: num(r.student_grade),
        notes: r.notes.trim() || null
      }))
    if (rowPayload.length) {
      const { error } = await supabase.from('monthly_report_students').insert(rowPayload)
      if (error) throw error
    }

    // الأنشطة: استبدال كامل (المنجزة فقط)
    await supabase.from('monthly_report_activities').delete().eq('report_id', rid)
    const actPayload = ALL_KEYS.filter(k => acts[k]).map(k => ({ report_id: rid!, activity_key: k, done: true }))
    if (actPayload.length) {
      const { error } = await supabase.from('monthly_report_activities').insert(actPayload)
      if (error) throw error
    }

    toast.add({ title: 'تم حفظ التقرير.', color: 'success', icon: 'i-lucide-save' })
    await refreshList()
  } catch (err) {
    handle(err)
  } finally {
    saving.value = false
  }
}

const transitioning = ref(false)
async function setStatus(status: ReportStatus) {
  if (!report.value) {
    toast.add({ title: 'احفظ التقرير أولاً.', color: 'warning', icon: 'i-lucide-info' })
    return
  }
  transitioning.value = true
  try {
    const patch: Database['public']['Tables']['monthly_reports']['Update'] = { status }
    if (status === 'submitted') patch.submitted_at = new Date().toISOString()
    if (status === 'approved') {
      patch.approved_by = profile.value?.id ?? null
      patch.approved_at = new Date().toISOString()
    }
    const { error } = await supabase.from('monthly_reports').update(patch).eq('id', report.value.id)
    if (error) throw error
    report.value.status = status
    toast.add({ title: status === 'submitted' ? 'أُرسل التقرير للمدير.' : status === 'approved' ? 'تم اعتماد التقرير.' : 'أُعيد فتح التقرير.', color: 'success', icon: 'i-lucide-circle-check' })
    await refreshList()
  } catch (err) {
    handle(err)
  } finally {
    transitioning.value = false
  }
}
</script>

<template>
  <div class="reports">
    <UiPageHeader
      title="التقارير الشهرية"
      subtitle="تقرير الحلقة الشهري: حفظ ومراجعة وغياب وأنشطة لكل طالب — يرفعه المعلّم ويعتمده المدير."
    />

    <!-- قائمة التقارير -->
    <ClientOnly>
      <div class="card list-card">
        <div class="list-head">
          <h3>
            تقارير الحلقات
            <UBadge
              v-if="submittedCount"
              :label="`${submittedCount} بانتظار الاعتماد`"
              color="warning"
              variant="soft"
              size="sm"
            />
          </h3>
          <UiFilterChips
            v-model="listFilter"
            :options="listChips"
          />
        </div>
        <UiEmptyState
          v-if="!listFiltered.length"
          icon="i-lucide-folder"
          title="لا تقارير في هذا التصنيف"
          description="أنشئ تقريراً جديداً من الأسفل (اختر حلقة وشهراً)."
        />
        <div
          v-else
          class="table-wrap"
        >
          <table>
            <thead>
              <tr>
                <th class="ta-start">
                  الحلقة
                </th>
                <th class="ta-start">
                  المعلّم
                </th>
                <th class="ta-start">
                  الشهر
                </th>
                <th class="ta-start">
                  الحالة
                </th>
                <th class="ta-end">
                  —
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in listFiltered"
                :key="r.id"
              >
                <td class="strong">
                  {{ r.halaqa?.name || '—' }}
                </td>
                <td class="muted">
                  {{ r.halaqa?.teacher?.full_name || '—' }}
                </td>
                <td class="muted">
                  {{ monthItems[r.report_month - 1]?.label }} {{ r.report_year }}
                </td>
                <td>
                  <UBadge
                    :label="STATUS_META[r.status].label"
                    :color="STATUS_META[r.status].color"
                    variant="soft"
                  />
                </td>
                <td>
                  <div class="ta-end">
                    <UButton
                      label="فتح"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      icon="i-lucide-folder-open"
                      :ui="{ base: 'rounded-[10px]' }"
                      @click="openReport(r)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </ClientOnly>

    <!-- إنشاء/اختيار يدوي -->
    <div class="card pick">
      <div class="pick-fields">
        <div class="pf">
          <label>الحلقة</label>
          <UiSelect
            v-model="halqaId"
            :items="halqaItems"
            placeholder="اختر الحلقة"
            size="lg"
          />
        </div>
        <div class="pf sm">
          <label>الشهر</label>
          <UiSelect
            v-model="month"
            :items="monthItems"
            size="lg"
          />
        </div>
        <div class="pf sm">
          <label>السنة</label>
          <UiSelect
            v-model="year"
            :items="yearItems"
            size="lg"
          />
        </div>
        <UButton
          label="تحميل"
          color="primary"
          size="lg"
          icon="i-lucide-folder-open"
          :disabled="!halqaId"
          :loading="loading"
          :ui="{ base: 'rounded-[13px] font-semibold self-end' }"
          @click="load"
        />
      </div>
    </div>

    <ClientOnly>
      <UiEmptyState
        v-if="!loaded"
        icon="i-lucide-calendar-range"
        title="اختر الحلقة والشهر ثم اضغط «تحميل»"
        description="يظهر التقرير للتعبئة، ويُنشأ تلقائيّاً عند أول حفظ."
      />

      <template v-else>
        <!-- شريط الحالة -->
        <div class="statusbar card">
          <div class="sb-info">
            <UBadge
              :label="report ? STATUS_META[report.status].label : 'جديد (لم يُحفظ)'"
              :color="report ? STATUS_META[report.status].color : 'neutral'"
              variant="soft"
              size="lg"
            />
            <span class="sb-sub">{{ rows.length }} طالب · {{ monthItems[month - 1]?.label }} {{ year }}</span>
          </div>
          <div class="sb-actions">
            <UButton
              v-if="canEdit"
              label="حفظ"
              color="primary"
              size="lg"
              icon="i-lucide-save"
              :loading="saving"
              :ui="{ base: 'rounded-[13px] font-semibold' }"
              @click="save"
            />
            <UButton
              v-if="isTeacher && report && report.status === 'draft'"
              label="إرسال للمدير"
              color="success"
              size="lg"
              icon="i-lucide-send"
              :loading="transitioning"
              :ui="{ base: 'rounded-[13px] font-semibold' }"
              @click="setStatus('submitted')"
            />
            <UButton
              v-if="isManager && report && report.status !== 'approved'"
              label="اعتماد"
              color="success"
              size="lg"
              icon="i-lucide-badge-check"
              :loading="transitioning"
              :ui="{ base: 'rounded-[13px] font-semibold' }"
              @click="setStatus('approved')"
            />
            <UButton
              v-if="isManager && report && report.status === 'approved'"
              label="إعادة فتح"
              color="neutral"
              variant="outline"
              size="lg"
              icon="i-lucide-lock-open"
              :loading="transitioning"
              :ui="{ base: 'rounded-[13px]' }"
              @click="setStatus('draft')"
            />
          </div>
        </div>

        <!-- جدول الطلاب -->
        <UiEmptyState
          v-if="!rows.length"
          icon="i-lucide-users"
          title="لا طلاب نشطون في هذه الحلقة"
        />
        <div
          v-else
          class="card table-wrap"
        >
          <table>
            <thead>
              <tr>
                <th class="ta-start sticky">
                  الطالب
                </th>
                <th>من صفحة</th>
                <th>إلى صفحة</th>
                <th>حفظ</th>
                <th>مراجعة لـ</th>
                <th>صفحات المراجعة</th>
                <th>غياب بعذر</th>
                <th>بلا عذر</th>
                <th>النقاط</th>
                <th>الدرجة</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in rows"
                :key="r.student_id"
              >
                <td class="ta-start sticky strong">
                  {{ r.full_name }}
                </td>
                <td>
                  <input
                    v-model="r.memorization_from"
                    :disabled="!canEdit"
                    type="number"
                    class="cell"
                    dir="ltr"
                  >
                </td>
                <td>
                  <input
                    v-model="r.memorization_to"
                    :disabled="!canEdit"
                    type="number"
                    class="cell"
                    dir="ltr"
                  >
                </td>
                <td class="calc">
                  {{ pagesOf(r) }}
                </td>
                <td>
                  <input
                    v-model="r.review_to"
                    :disabled="!canEdit"
                    type="number"
                    class="cell"
                    dir="ltr"
                  >
                </td>
                <td class="calc">
                  {{ reviewOf(r) }}
                </td>
                <td>
                  <input
                    v-model="r.absence_excused"
                    :disabled="!canEdit"
                    type="number"
                    class="cell"
                    dir="ltr"
                  >
                </td>
                <td>
                  <input
                    v-model="r.absence_unexcused"
                    :disabled="!canEdit"
                    type="number"
                    class="cell"
                    dir="ltr"
                  >
                </td>
                <td>
                  <input
                    v-model="r.monthly_points"
                    :disabled="!canEdit"
                    type="number"
                    class="cell"
                    dir="ltr"
                  >
                </td>
                <td>
                  <input
                    v-model="r.student_grade"
                    :disabled="!canEdit"
                    type="number"
                    class="cell"
                    dir="ltr"
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- الأنشطة المصاحبة -->
        <div class="card acts">
          <h3>الأنشطة المصاحبة</h3>
          <div class="act-groups">
            <div
              v-for="g in ACTIVITY_GROUPS"
              :key="g.title"
              class="act-group"
            >
              <div class="ag-title">
                {{ g.title }}
              </div>
              <label
                v-for="k in g.keys"
                :key="k.key"
                class="act-item"
              >
                <UCheckbox
                  v-model="acts[k.key]"
                  :disabled="!canEdit"
                />
                <span>{{ k.label }}</span>
              </label>
            </div>
          </div>
          <UFormField
            label="ملاحظات الأنشطة"
            class="mt"
          >
            <UTextarea
              v-model="meta.activities_notes"
              :rows="2"
              :disabled="!canEdit"
              size="lg"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>
        </div>

        <!-- ملاحظات عامّة -->
        <div class="card">
          <UFormField label="ملاحظات عامّة على الحلقة">
            <UTextarea
              v-model="meta.general_notes"
              :rows="3"
              :disabled="!canEdit"
              size="lg"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>
        </div>
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.reports { max-width: 1280px; margin: 0 auto; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: var(--shadow); padding: 20px; margin-bottom: 18px; }

.list-card { padding: 0; }
.list-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; padding: 18px 20px; border-bottom: 1px solid var(--line); }
.list-head h3 { margin: 0; font-size: 17px; font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 10px; }

.pick-fields { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
.pf { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 8px; }
.pf.sm { flex: 0 0 140px; min-width: 120px; }
.pf label { font-size: 13px; font-weight: 600; color: var(--ink-2); }

.statusbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.sb-info { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sb-sub { font-size: 14px; color: var(--ink-2); }
.sb-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

.table-wrap { overflow-x: auto; padding: 0; }
.table-wrap table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 900px; }
.table-wrap thead tr { background: var(--surface-2); }
.table-wrap th { padding: 12px 10px; font-weight: 600; color: var(--ink-3); font-size: 12.5px; white-space: nowrap; text-align: center; }
.table-wrap th.ta-start { text-align: start; }
.table-wrap td { padding: 8px 10px; vertical-align: middle; text-align: center; border-top: 1px solid var(--line); white-space: nowrap; }
.ta-start { text-align: start; }
.strong { font-weight: 600; color: var(--ink); }
.sticky { position: sticky; inset-inline-start: 0; background: var(--surface); z-index: 1; }
thead .sticky { background: var(--surface-2); }
.calc { font-weight: 700; color: var(--green-ink); background: var(--green-soft); }
.cell { width: 70px; height: 38px; padding: 0 8px; border-radius: 9px; border: 1px solid var(--line-2); background: var(--surface-2); color: var(--ink); font-size: 14px; text-align: center; outline: none; }
.cell:focus { border-color: var(--blue); box-shadow: 0 0 0 3px var(--ring); }
.cell:disabled { opacity: .6; cursor: not-allowed; }

.acts h3 { margin: 0 0 16px; font-size: 17px; font-weight: 700; color: var(--ink); }
.act-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 18px; }
.ag-title { font-size: 13px; font-weight: 700; color: var(--ink-3); margin-bottom: 10px; }
.act-item { display: flex; align-items: center; gap: 9px; padding: 7px 0; font-size: 14.5px; color: var(--ink); cursor: pointer; }
.mt { margin-top: 18px; }

@media (max-width: 620px) { .pf, .pf.sm { flex: 1 1 100%; } }
</style>
