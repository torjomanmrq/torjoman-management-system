<script setup lang="ts">
/**
 * الزيارات الإشرافية (§4.15).
 * المدير/المشرف يجدول زيارة لحلقة ثم يرفع نتائجها (نقاط قوة/تحسين/توصيات/تقييم).
 * RLS: المدير يدير الكل، المشرف زياراته. الحذف للمدير.
 */
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'الزيارات الإشرافية — ترجمان' })

type VisitStatus = Database['public']['Enums']['visit_status']
type VisitRow = Database['public']['Tables']['supervision_visits']['Row'] & {
  halaqa: { name: string, teacher: { full_name: string } | null } | null
  supervisor: { full_name: string } | null
}
type NameRow = { id: string, name?: string, full_name?: string }

const supabase = useSupabaseClient<Database>()
const { role: myRole, profile } = useProfile()
const { handle } = useErrorHandler()
const toast = useToast()

const isManager = computed(() => myRole.value === 'manager')
const canSchedule = computed(() => myRole.value === 'manager' || myRole.value === 'supervisor')

// ── الجلب ──
const { data: visits, refresh, pending } = await useAsyncData<VisitRow[]>(
  'visits-list',
  async () => {
    const { data, error } = await supabase
      .from('supervision_visits')
      .select('*, halaqa:halaqa_id(name, teacher:teacher_id(full_name)), supervisor:supervisor_id(full_name)')
      .order('scheduled_at', { ascending: false })
      .returns<VisitRow[]>()
    if (error) {
      console.error('[visits] فشل الجلب:', error.message)
      return []
    }
    return data ?? []
  },
  { server: false, default: () => [] }
)

const { data: halqat } = await useAsyncData<NameRow[]>('visits-halqat', async () => {
  const { data } = await supabase.from('halaqat').select('id, name').order('name')
  return data ?? []
}, { server: false, default: () => [] })

const { data: supervisors } = await useAsyncData<NameRow[]>('visits-supervisors', async () => {
  const { data } = await supabase.from('profiles').select('id, full_name').eq('role', 'supervisor').eq('status', 'active').order('full_name')
  return data ?? []
}, { server: false, default: () => [] })

const halqaItems = computed(() => (halqat.value ?? []).map(h => ({ label: h.name ?? '', value: h.id })))
const supervisorItems = computed(() => (supervisors.value ?? []).map(s => ({ label: s.full_name ?? '', value: s.id })))

// ── التصفية + الإحصاء ──
const statusF = ref<VisitStatus | 'all'>('all')
const STATUS_META: Record<VisitStatus, { label: string, color: 'info' | 'success' | 'warning' | 'error' }> = {
  scheduled: { label: 'مجدولة', color: 'info' },
  done: { label: 'تمّت', color: 'success' },
  late: { label: 'متأخّرة', color: 'warning' },
  missed: { label: 'فائتة', color: 'error' }
}
const CHIPS: { key: VisitStatus | 'all', label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'scheduled', label: 'مجدولة' },
  { key: 'done', label: 'تمّت' },
  { key: 'late', label: 'متأخّرة' },
  { key: 'missed', label: 'فائتة' }
]
const filtered = computed(() => (visits.value ?? []).filter(v => statusF.value === 'all' || v.status === statusF.value))
const stats = computed(() => {
  const list = visits.value ?? []
  return {
    scheduled: list.filter(v => v.status === 'scheduled').length,
    done: list.filter(v => v.status === 'done').length,
    overdue: list.filter(v => v.status === 'late' || v.status === 'missed').length
  }
})
function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' })
}

// ── جدولة (إنشاء/تعديل موعد) ──
const schedOpen = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const sched = reactive({ halaqa_id: '', supervisor_id: '', scheduled_at: '' })

function openSchedule() {
  editingId.value = null
  sched.halaqa_id = ''
  sched.supervisor_id = myRole.value === 'supervisor' ? (profile.value?.id ?? '') : ''
  sched.scheduled_at = ''
  schedOpen.value = true
}
function openEditSchedule(v: VisitRow) {
  editingId.value = v.id
  sched.halaqa_id = v.halaqa_id
  sched.supervisor_id = v.supervisor_id
  sched.scheduled_at = v.scheduled_at ? v.scheduled_at.slice(0, 16) : ''
  schedOpen.value = true
}
function validateSched(s: typeof sched) {
  const e: { name: string, message: string }[] = []
  if (!s.halaqa_id) e.push({ name: 'halaqa_id', message: 'اختر الحلقة.' })
  if (!s.supervisor_id) e.push({ name: 'supervisor_id', message: 'اختر المشرف.' })
  if (!s.scheduled_at) e.push({ name: 'scheduled_at', message: 'حدّد موعد الزيارة.' })
  return e
}
async function saveSchedule() {
  saving.value = true
  try {
    const payload = { halaqa_id: sched.halaqa_id, supervisor_id: sched.supervisor_id, scheduled_at: new Date(sched.scheduled_at).toISOString() }
    const { error } = editingId.value
      ? await supabase.from('supervision_visits').update(payload).eq('id', editingId.value)
      : await supabase.from('supervision_visits').insert(payload)
    if (error) throw error
    toast.add({ title: editingId.value ? 'تم تحديث موعد الزيارة.' : 'تمت جدولة الزيارة.', color: 'success', icon: 'i-lucide-calendar-check' })
    schedOpen.value = false
    await refresh()
  } catch (err) {
    handle(err)
  } finally {
    saving.value = false
  }
}

// ── تنفيذ (رفع النتائج) ──
const execOpen = ref(false)
const execTarget = ref<VisitRow | null>(null)
const execSaving = ref(false)
const result = reactive({ flow_rating: '', strengths: '', improvements: '', recommendations: '', notes: '' })
const ratingItems = [
  { label: 'ممتاز', value: 'ممتاز' },
  { label: 'جيد جداً', value: 'جيد جداً' },
  { label: 'جيد', value: 'جيد' },
  { label: 'يحتاج تحسين', value: 'يحتاج تحسين' }
]
function openExec(v: VisitRow) {
  execTarget.value = v
  result.flow_rating = v.flow_rating ?? 'ممتاز'
  result.strengths = v.strengths ?? ''
  result.improvements = v.improvements ?? ''
  result.recommendations = v.recommendations ?? ''
  result.notes = v.notes ?? ''
  execOpen.value = true
}
async function saveResult() {
  if (!execTarget.value) return
  execSaving.value = true
  try {
    const payload = {
      flow_rating: result.flow_rating || null,
      strengths: result.strengths.trim() || null,
      improvements: result.improvements.trim() || null,
      recommendations: result.recommendations.trim() || null,
      notes: result.notes.trim() || null,
      executed_at: execTarget.value.executed_at ?? new Date().toISOString(),
      status: 'done' as VisitStatus
    }
    const { error } = await supabase.from('supervision_visits').update(payload).eq('id', execTarget.value.id)
    if (error) throw error
    toast.add({ title: 'تم رفع نتيجة الزيارة.', color: 'success', icon: 'i-lucide-circle-check' })
    execOpen.value = false
    await refresh()
  } catch (err) {
    handle(err)
  } finally {
    execSaving.value = false
  }
}

// ── حذف ──
const deleteTarget = ref<VisitRow | null>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    const { error } = await supabase.from('supervision_visits').delete().eq('id', deleteTarget.value.id)
    if (error) throw error
    toast.add({ title: 'تم حذف الزيارة.', color: 'neutral', icon: 'i-lucide-trash-2' })
    deleteTarget.value = null
    await refresh()
  } catch (err) {
    handle(err)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="visits">
    <div class="head">
      <div>
        <h2>الزيارات الإشرافية</h2>
        <p>جدولة الزيارات ومتابعة الالتزام بمواعيدها ورفع نتائجها.</p>
      </div>
      <UButton
        v-if="canSchedule"
        label="جدولة زيارة"
        color="primary"
        size="lg"
        icon="i-lucide-plus"
        :ui="{ base: 'rounded-[13px] font-semibold' }"
        @click="openSchedule"
      />
    </div>

    <!-- بطاقات إحصائية -->
    <div class="stats">
      <div class="stat">
        <div class="ico ico-blue">
          <UIcon
            name="i-lucide-calendar"
            class="size-6"
          />
        </div>
        <div>
          <div class="num">
            {{ stats.scheduled }}
          </div><div class="lbl">
            زيارة مجدولة
          </div>
        </div>
      </div>
      <div class="stat">
        <div class="ico ico-green">
          <UIcon
            name="i-lucide-circle-check-big"
            class="size-6"
          />
        </div>
        <div>
          <div class="num">
            {{ stats.done }}
          </div><div class="lbl">
            زيارة تمّت
          </div>
        </div>
      </div>
      <div class="stat">
        <div class="ico ico-err">
          <UIcon
            name="i-lucide-circle-alert"
            class="size-6"
          />
        </div>
        <div>
          <div class="num">
            {{ stats.overdue }}
          </div><div class="lbl">
            متأخّرة / فائتة
          </div>
        </div>
      </div>
    </div>

    <!-- شرائح -->
    <div class="chips">
      <button
        v-for="c in CHIPS"
        :key="c.key"
        class="chip"
        :class="{ on: statusF === c.key }"
        @click="statusF = c.key"
      >
        {{ c.label }}
      </button>
    </div>

    <div
      v-if="pending"
      class="card empty"
    >
      جارٍ التحميل…
    </div>
    <div
      v-else-if="filtered.length === 0"
      class="card empty"
    >
      <UIcon
        name="i-lucide-clipboard-check"
        class="size-8"
      />
      <h3>لا زيارات في هذا التصنيف</h3>
      <p>{{ canSchedule ? 'جدوِل زيارة جديدة لتظهر هنا.' : 'لا زيارات في نطاقك حاليّاً.' }}</p>
    </div>
    <div
      v-else
      class="card table-wrap"
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
              المشرف
            </th>
            <th class="ta-start">
              الموعد
            </th>
            <th class="ta-start">
              التقييم
            </th>
            <th class="ta-start">
              الحالة
            </th>
            <th class="ta-end">
              إجراءات
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="v in filtered"
            :key="v.id"
          >
            <td class="strong">
              {{ v.halaqa?.name || '—' }}
            </td>
            <td class="muted">
              {{ v.halaqa?.teacher?.full_name || '—' }}
            </td>
            <td class="muted">
              {{ v.supervisor?.full_name || '—' }}
            </td>
            <td class="muted">
              {{ fmtDate(v.scheduled_at) }}
            </td>
            <td class="muted">
              {{ v.flow_rating || '—' }}
            </td>
            <td>
              <UBadge
                :label="STATUS_META[v.status].label"
                :color="STATUS_META[v.status].color"
                variant="soft"
              />
            </td>
            <td>
              <div class="actions">
                <UButton
                  :label="v.status === 'done' ? 'النتيجة' : 'تنفيذ'"
                  :color="v.status === 'done' ? 'neutral' : 'primary'"
                  :variant="v.status === 'done' ? 'outline' : 'solid'"
                  size="sm"
                  :icon="v.status === 'done' ? 'i-lucide-eye' : 'i-lucide-clipboard-pen'"
                  :ui="{ base: 'rounded-[10px]' }"
                  @click="openExec(v)"
                />
                <UButton
                  v-if="canSchedule"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  icon="i-lucide-pencil"
                  :ui="{ base: 'rounded-[10px]' }"
                  aria-label="تعديل الموعد"
                  @click="openEditSchedule(v)"
                />
                <UButton
                  v-if="isManager"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  icon="i-lucide-trash-2"
                  :ui="{ base: 'rounded-[10px]' }"
                  aria-label="حذف"
                  @click="deleteTarget = v"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- نافذة الجدولة -->
    <UModal
      v-model:open="schedOpen"
      :title="editingId ? 'تعديل موعد الزيارة' : 'جدولة زيارة'"
    >
      <template #body>
        <UForm
          :state="sched"
          :validate="validateSched"
          class="form"
          @submit="saveSchedule"
        >
          <UFormField
            label="الحلقة"
            name="halaqa_id"
          >
            <USelect
              v-model="sched.halaqa_id"
              :items="halqaItems"
              placeholder="اختر الحلقة"
              size="lg"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>
          <UFormField
            label="المشرف"
            name="supervisor_id"
            :hint="supervisorItems.length ? '' : 'لا مشرفون بعد — أنشئ مشرفاً من إدارة المستخدمين'"
          >
            <USelect
              v-model="sched.supervisor_id"
              :items="supervisorItems"
              placeholder="اختر المشرف"
              size="lg"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>
          <UFormField
            label="موعد الزيارة"
            name="scheduled_at"
          >
            <UInput
              v-model="sched.scheduled_at"
              type="datetime-local"
              dir="ltr"
              size="lg"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>
          <div class="form-actions">
            <UButton
              label="إلغاء"
              color="neutral"
              variant="ghost"
              size="lg"
              :ui="{ base: 'rounded-[13px]' }"
              @click="schedOpen = false"
            />
            <UButton
              type="submit"
              :label="editingId ? 'حفظ' : 'جدولة'"
              color="primary"
              size="lg"
              :loading="saving"
              :ui="{ base: 'rounded-[13px] font-semibold' }"
            />
          </div>
        </UForm>
      </template>
    </UModal>

    <!-- نافذة التنفيذ/النتيجة -->
    <UModal
      v-model:open="execOpen"
      :title="`نتيجة زيارة ${execTarget?.halaqa?.name || ''}`"
    >
      <template #body>
        <div class="form">
          <UFormField label="تقييم سير الحلقة">
            <USelect
              v-model="result.flow_rating"
              :items="ratingItems"
              size="lg"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>
          <UFormField label="نقاط القوة">
            <UTextarea
              v-model="result.strengths"
              :rows="2"
              size="lg"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>
          <UFormField label="جوانب التحسين">
            <UTextarea
              v-model="result.improvements"
              :rows="2"
              size="lg"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>
          <UFormField label="التوصيات">
            <UTextarea
              v-model="result.recommendations"
              :rows="2"
              size="lg"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>
          <UFormField label="ملاحظات إضافية">
            <UTextarea
              v-model="result.notes"
              :rows="2"
              size="lg"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>
          <div class="form-actions">
            <UButton
              label="إغلاق"
              color="neutral"
              variant="ghost"
              size="lg"
              :ui="{ base: 'rounded-[13px]' }"
              @click="execOpen = false"
            />
            <UButton
              label="حفظ النتيجة"
              color="primary"
              size="lg"
              icon="i-lucide-check"
              :loading="execSaving"
              :ui="{ base: 'rounded-[13px] font-semibold' }"
              @click="saveResult"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- تأكيد الحذف -->
    <UModal
      :open="!!deleteTarget"
      title="حذف الزيارة"
      @update:open="v => { if (!v) deleteTarget = null }"
    >
      <template #body>
        <p class="confirm-text">
          هل أنت متأكّد من حذف زيارة حلقة «<strong>{{ deleteTarget?.halaqa?.name }}</strong>»؟ لا يمكن التراجع.
        </p>
        <div class="form-actions">
          <UButton
            label="إلغاء"
            color="neutral"
            variant="ghost"
            size="lg"
            :ui="{ base: 'rounded-[13px]' }"
            @click="deleteTarget = null"
          />
          <UButton
            label="حذف"
            color="error"
            size="lg"
            icon="i-lucide-trash-2"
            :loading="deleting"
            :ui="{ base: 'rounded-[13px] font-semibold' }"
            @click="confirmDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.visits { max-width: 1280px; margin: 0 auto; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: var(--shadow); }

.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
.head h2 { margin: 0; font-size: 26px; font-weight: 700; color: var(--ink); }
.head p { margin: 8px 0 0; font-size: 16px; color: var(--ink-2); font-weight: 300; }

.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 22px; }
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 22px; box-shadow: var(--shadow); display: flex; align-items: center; gap: 15px; }
.ico { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex: none; }
.ico-blue { background: var(--blue-soft); color: var(--blue-ink); }
.ico-green { background: var(--green-soft); color: var(--green-ink); }
.ico-err { background: var(--err-soft); color: var(--err); }
.num { font-size: 28px; font-weight: 700; color: var(--ink); line-height: 1; }
.lbl { font-size: 14px; color: var(--ink-2); margin-top: 6px; }

.chips { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
.chip { height: 38px; padding: 0 18px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line-2); color: var(--ink-2); font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; transition: all .15s; }
.chip:hover { background: var(--surface-2); }
.chip.on { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }

.empty { padding: 56px 24px; text-align: center; color: var(--ink-2); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty h3 { margin: 6px 0 0; font-size: 19px; font-weight: 700; color: var(--ink); }
.empty p { margin: 0; font-size: 15px; font-weight: 300; }

.table-wrap { overflow: hidden; }
.table-wrap table { width: 100%; border-collapse: collapse; font-size: 15px; }
.table-wrap thead tr { background: var(--surface-2); }
.table-wrap th { padding: 14px 18px; font-weight: 600; color: var(--ink-3); font-size: 13px; white-space: nowrap; }
.ta-start { text-align: start; }
.ta-end { text-align: end; }
.table-wrap tbody tr { border-top: 1px solid var(--line); }
.table-wrap td { padding: 14px 18px; vertical-align: middle; white-space: nowrap; }
.strong { font-weight: 600; color: var(--ink); }
.muted { color: var(--ink-2); }
.actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }

.form { display: flex; flex-direction: column; gap: 14px; }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }
.confirm-text { font-size: 15.5px; color: var(--ink-2); line-height: 1.8; margin: 0 0 18px; }

@media (max-width: 768px) { .stats { grid-template-columns: 1fr; } }
</style>
