<script setup lang="ts">
/**
 * الحلقات (§4.13) — للمدير فقط (RLS: halaqat_write = is_manager).
 * إنشاء/تعديل/حذف حلقة وتعيين معلّم ومشرف لها، مع تصفية بالجنس والحالة.
 */
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'الحلقات — ترجمان' })

type Gender = Database['public']['Enums']['gender_type']
type Classification = Database['public']['Enums']['halaqa_classification']
type Status = Database['public']['Enums']['halaqa_status']
type HalaqaRow = Database['public']['Tables']['halaqat']['Row'] & {
  teacher: { full_name: string } | null
  supervisor: { full_name: string } | null
  student_count: { count: number }[]
}
type NameRow = { id: string, full_name: string }

const supabase = useSupabaseClient<Database>()
const { role: myRole } = useProfile()
const { handle } = useErrorHandler()
const toast = useToast()
const isManager = computed(() => myRole.value === 'manager')

// جلب غير حاجز (useLazyAsyncData): لا يوقف عرض الصفحة — تظهر فوراً
// بحالة pending، والسكيلتون يغطّي الانتظار ريثما تصل البيانات. الاستعلامات
// الثلاثة مستقلّة، تعمل بالتوازي تلقائياً (لا حاجة لـ Promise.all هنا).
const { data: halqat, refresh, pending } = useLazyAsyncData<HalaqaRow[]>(
  'halqat-list',
  async () => {
    const { data, error } = await supabase
      .from('halaqat')
      .select('*, teacher:teacher_id(full_name), supervisor:supervisor_id(full_name), student_count:students(count)')
      .order('created_at', { ascending: false })
      .returns<HalaqaRow[]>()
    if (error) {
      console.error('[halqat] فشل الجلب:', error.message)
      return []
    }
    return data ?? []
  },
  { server: false, default: () => [] }
)
const { data: teachers } = useLazyAsyncData<NameRow[]>('teachers-options', async () => {
  const { data } = await supabase.from('profiles').select('id, full_name').eq('role', 'teacher').eq('status', 'active').order('full_name')
  return data ?? []
}, { server: false, default: () => [] })
const { data: supervisors } = useLazyAsyncData<NameRow[]>('supervisors-options', async () => {
  const { data } = await supabase.from('profiles').select('id, full_name').eq('role', 'supervisor').eq('status', 'active').order('full_name')
  return data ?? []
}, { server: false, default: () => [] })

const NO_SUP = 'none'
const teacherItems = computed(() => (teachers.value ?? []).map(t => ({ label: t.full_name, value: t.id })))
const supervisorItems = computed(() => [{ label: 'بلا مشرف', value: NO_SUP }, ...(supervisors.value ?? []).map(s => ({ label: s.full_name, value: s.id }))])

const genderF = ref<Gender | 'all'>('all')
const statusF = ref<Status | 'all'>('all')
const genderChips = [
  { value: 'all' as const, label: 'الكل' },
  { value: 'male' as const, label: 'بنين' },
  { value: 'female' as const, label: 'بنات' }
]
const filtered = computed(() => (halqat.value ?? []).filter(h =>
  (genderF.value === 'all' || h.gender === genderF.value)
  && (statusF.value === 'all' || h.status === statusF.value)
))
const { page, pageCount, total, pageSize, paged, resetPage } = usePagination(filtered, 9)
watch([genderF, statusF], resetPage)
function studentsOf(h: HalaqaRow) {
  return h.student_count?.[0]?.count ?? 0
}
const GENDER_LABEL: Record<Gender, string> = { male: 'بنين', female: 'بنات' }
const CLASS_LABEL: Record<Classification, string> = { a: 'الفئة أ', b: 'الفئة ب' }

// ── إنشاء/تعديل ──
const modalOpen = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({
  name: '', teacher_id: '', supervisor_id: NO_SUP, daily_time: '',
  gender: 'male' as Gender, classification: 'a' as Classification, status: 'active' as Status
})
const genderItems = [{ label: 'بنين', value: 'male' }, { label: 'بنات', value: 'female' }]
const classItems = [{ label: 'الفئة أ', value: 'a' }, { label: 'الفئة ب', value: 'b' }]
const statusItems = [{ label: 'نشطة', value: 'active' }, { label: 'متوقفة', value: 'stopped' }]
function openCreate() {
  editingId.value = null
  Object.assign(form, { name: '', teacher_id: '', supervisor_id: NO_SUP, daily_time: '', gender: 'male', classification: 'a', status: 'active' })
  modalOpen.value = true
}
function openEdit(h: HalaqaRow) {
  editingId.value = h.id
  Object.assign(form, {
    name: h.name,
    teacher_id: h.teacher_id,
    supervisor_id: h.supervisor_id ?? NO_SUP,
    daily_time: h.daily_time ? h.daily_time.slice(0, 5) : '',
    gender: h.gender ?? 'male',
    classification: h.classification ?? 'a',
    status: h.status
  })
  modalOpen.value = true
}
function validate(s: typeof form) {
  const errors: { name: string, message: string }[] = []
  if (!s.name.trim()) errors.push({ name: 'name', message: 'اسم الحلقة مطلوب.' })
  if (!s.teacher_id) errors.push({ name: 'teacher_id', message: 'تعيين المعلّم مطلوب.' })
  return errors
}
async function save() {
  saving.value = true
  try {
    const payload = {
      name: form.name.trim(),
      teacher_id: form.teacher_id,
      supervisor_id: form.supervisor_id === NO_SUP ? null : form.supervisor_id,
      daily_time: form.daily_time || null,
      gender: form.gender,
      classification: form.classification,
      status: form.status
    }
    const { error } = editingId.value
      ? await supabase.from('halaqat').update(payload).eq('id', editingId.value)
      : await supabase.from('halaqat').insert(payload)
    if (error) throw error
    toast.add({ title: editingId.value ? 'تم تحديث الحلقة.' : 'تم إنشاء الحلقة.', color: 'success', icon: 'i-lucide-circle-check' })
    modalOpen.value = false
    await refresh()
  } catch (err) {
    handle(err)
  } finally {
    saving.value = false
  }
}

// ── حذف ──
const deleteTarget = ref<HalaqaRow | null>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    const { error } = await supabase.from('halaqat').delete().eq('id', deleteTarget.value.id)
    if (error) throw error
    toast.add({ title: 'تم حذف الحلقة.', color: 'neutral', icon: 'i-lucide-trash-2' })
    deleteTarget.value = null
    await refresh()
  } catch (err) {
    handle(err, 'تعذّر الحذف — قد تكون الحلقة مرتبطة بطلاب.')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="halqat">
    <UiPageHeader
      title="الحلقات"
      :subtitle="isManager ? 'لكل حلقة معلّم ووقت يومي ثابت — أنشئ الحلقات وعيّن معلميها ومشرفيها.' : 'الحلقات ضمن نطاقك — عرض للاطّلاع.'"
    >
      <template
        v-if="isManager"
        #actions
      >
        <UButton
          label="إنشاء حلقة"
          color="primary"
          size="lg"
          icon="i-lucide-plus"
          :ui="{ base: 'rounded-[13px] font-semibold' }"
          @click="openCreate"
        />
      </template>
    </UiPageHeader>

    <div class="filters">
      <UiFilterChips
        v-model="genderF"
        :options="genderChips"
      />
      <USelect
        v-model="statusF"
        :items="[{ label: 'كل الحالات', value: 'all' }, ...statusItems]"
        size="md"
        class="status-sel"
        :ui="{ base: 'rounded-[11px]' }"
      />
    </div>

    <ClientOnly>
      <div
        v-if="pending"
        class="grid"
      >
        <UiSkeletonCard
          v-for="i in 6"
          :key="i"
        />
      </div>
      <UiEmptyState
        v-else-if="filtered.length === 0"
        icon="i-lucide-book-open"
        title="لا حلقات بعد"
        :description="isManager ? 'أنشئ أول حلقة وعيّن لها معلّماً لتظهر هنا.' : 'لا حلقات ضمن نطاقك بعد.'"
      />
      <div
        v-else
        class="grid"
      >
        <div
          v-for="h in paged"
          :key="h.id"
          class="hcard"
        >
          <div class="hcard-top">
            <div class="hcard-id">
              <div class="hicon">
                <UIcon
                  name="i-lucide-book-open"
                  class="size-6"
                />
              </div>
              <div>
                <h3>{{ h.name }}</h3>
                <div class="teacher">
                  {{ h.teacher?.full_name || '—' }}
                </div>
                <div
                  class="sup"
                  :class="{ orphan: !h.supervisor }"
                >
                  <UIcon
                    name="i-lucide-shield"
                    class="size-[13px]"
                  />
                  {{ h.supervisor?.full_name || 'بلا مشرف' }}
                </div>
              </div>
            </div>
            <div class="badges">
              <UBadge
                v-if="h.gender"
                :label="GENDER_LABEL[h.gender]"
                :color="h.gender === 'male' ? 'info' : 'secondary'"
                variant="soft"
                size="sm"
              />
              <UBadge
                v-if="h.classification"
                :label="CLASS_LABEL[h.classification]"
                color="neutral"
                variant="soft"
                size="sm"
              />
            </div>
          </div>

          <div class="meta">
            <span><UIcon
              name="i-lucide-users"
              class="size-4"
            />{{ studentsOf(h) }} طالب</span>
            <span v-if="h.daily_time"><UIcon
              name="i-lucide-clock"
              class="size-4"
            />{{ h.daily_time.slice(0, 5) }}</span>
            <UBadge
              :label="h.status === 'active' ? 'نشطة' : 'متوقفة'"
              :color="h.status === 'active' ? 'success' : 'neutral'"
              variant="soft"
              size="sm"
            />
          </div>

          <div class="hcard-actions">
            <UButton
              :to="`/halqat/${h.id}`"
              label="تفاصيل"
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-lucide-eye"
              block
              :ui="{ base: 'rounded-[11px]' }"
            />
            <UButton
              v-if="isManager"
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-lucide-pencil"
              :ui="{ base: 'rounded-[11px]' }"
              aria-label="تعديل"
              @click="openEdit(h)"
            />
            <UButton
              v-if="isManager"
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-lucide-trash-2"
              :ui="{ base: 'rounded-[11px]' }"
              aria-label="حذف"
              @click="deleteTarget = h"
            />
          </div>
        </div>
      </div>
      <UiPaginator
        v-if="filtered.length"
        :page="page"
        :page-count="pageCount"
        :total="total"
        :page-size="pageSize"
        @update:page="page = $event"
      />
    </ClientOnly>

    <!-- نافذة إنشاء/تعديل -->
    <UModal
      v-model:open="modalOpen"
      :title="editingId ? 'تعديل الحلقة' : 'إنشاء حلقة جديدة'"
    >
      <template #body>
        <UForm
          :state="form"
          :validate="validate"
          class="form"
          @submit="save"
        >
          <UFormField
            label="اسم الحلقة"
            name="name"
          >
            <UInput
              v-model="form.name"
              size="lg"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>
          <div class="row">
            <UFormField
              label="المعلّم"
              name="teacher_id"
              class="f"
            >
              <UiSelect
                v-model="form.teacher_id"
                :items="teacherItems"
                placeholder="اختر معلّماً"
                size="lg"
              />
            </UFormField>
            <UFormField
              label="المشرف"
              name="supervisor_id"
              class="f"
            >
              <UiSelect
                v-model="form.supervisor_id"
                :items="supervisorItems"
                size="lg"
              />
            </UFormField>
          </div>
          <div class="row">
            <UFormField
              label="الوقت اليومي"
              name="daily_time"
              class="f"
            >
              <UInput
                v-model="form.daily_time"
                type="time"
                dir="ltr"
                size="lg"
                class="w-full"
                :ui="{ base: 'rounded-[13px]' }"
              />
            </UFormField>
            <UFormField
              label="الجنس"
              name="gender"
              class="f"
            >
              <USelect
                v-model="form.gender"
                :items="genderItems"
                size="lg"
                class="w-full"
                :ui="{ base: 'rounded-[13px]' }"
              />
            </UFormField>
          </div>
          <div class="row">
            <UFormField
              label="التصنيف"
              name="classification"
              class="f"
            >
              <USelect
                v-model="form.classification"
                :items="classItems"
                size="lg"
                class="w-full"
                :ui="{ base: 'rounded-[13px]' }"
              />
            </UFormField>
            <UFormField
              label="الحالة"
              name="status"
              class="f"
            >
              <USelect
                v-model="form.status"
                :items="statusItems"
                size="lg"
                class="w-full"
                :ui="{ base: 'rounded-[13px]' }"
              />
            </UFormField>
          </div>
          <div class="form-actions">
            <UButton
              label="إلغاء"
              color="neutral"
              variant="ghost"
              size="lg"
              :ui="{ base: 'rounded-[13px]' }"
              @click="modalOpen = false"
            />
            <UButton
              type="submit"
              :label="editingId ? 'حفظ التغييرات' : 'إنشاء الحلقة'"
              color="primary"
              size="lg"
              :loading="saving"
              :ui="{ base: 'rounded-[13px] font-semibold' }"
            />
          </div>
        </UForm>
      </template>
    </UModal>

    <!-- تأكيد الحذف -->
    <UiConfirmModal
      :open="!!deleteTarget"
      title="حذف الحلقة"
      :loading="deleting"
      @update:open="v => { if (!v) deleteTarget = null }"
      @confirm="confirmDelete"
    >
      هل أنت متأكّد من حذف حلقة «<strong>{{ deleteTarget?.name }}</strong>»؟ لا يمكن التراجع.
    </UiConfirmModal>
  </div>
</template>

<style scoped>
.halqat { max-width: 1280px; margin: 0 auto; }
.filters { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 20px; }
.status-sel { min-width: 150px; }

.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
.hcard { background: var(--surface); border: 1px solid var(--line); border-radius: 22px; padding: 24px; box-shadow: var(--shadow); transition: transform .2s, box-shadow .2s, border-color .2s; }
.hcard:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: var(--blue-soft); }
.hcard-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.hcard-id { display: flex; align-items: center; gap: 13px; min-width: 0; }
.hicon { width: 50px; height: 50px; border-radius: 14px; background: var(--surface-3); color: var(--ink); display: flex; align-items: center; justify-content: center; flex: none; }
.hcard-id h3 { margin: 0; font-size: 19px; font-weight: 700; color: var(--ink); }
.teacher { font-size: 14px; color: var(--ink-2); margin-top: 3px; }
.sup { font-size: 12.5px; margin-top: 5px; display: inline-flex; align-items: center; gap: 5px; color: var(--green-ink); }
.sup.orphan { color: var(--ink-3); }
.badges { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex: none; }
.meta { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding-top: 16px; border-top: 1px solid var(--line); margin-bottom: 16px; }
.meta span { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; color: var(--ink-2); }
.hcard-actions { display: flex; gap: 8px; }
.hcard-actions > :first-child { flex: 1; }

.form { display: flex; flex-direction: column; gap: 14px; }
.row { display: flex; gap: 14px; flex-wrap: wrap; }
.row .f { flex: 1; min-width: 150px; }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }

@media (max-width: 1024px) { .grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
</style>
