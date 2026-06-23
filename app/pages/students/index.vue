<script setup lang="ts">
/**
 * دليل الطلاب (§4.23) — الطالب سجلّ بيانات بلا حساب.
 * قائمة + إضافة/تعديل/حذف وربط بالحلقة، تصفية بالحالة والحلقة.
 * RLS: المدير يدير الكل، المعلّم يضيف/يعدّل طلاب حلقته. الحذف للمدير فقط.
 * ملف الطالب الكامل (§4.23) شاشة لاحقة.
 */
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'الطلاب — ترجمان' })

type Gender = Database['public']['Enums']['gender_type']
type StudentStatus = Database['public']['Enums']['student_status']
type StudentRow = Database['public']['Tables']['students']['Row'] & {
  halaqa: { name: string, teacher: { full_name: string } | null } | null
}
type HalqaOpt = { id: string, name: string }

const supabase = useSupabaseClient<Database>()
const { role: myRole, profile } = useProfile()
const { handle } = useErrorHandler()
const toast = useToast()

const canManage = computed(() => myRole.value === 'manager' || myRole.value === 'teacher')
const canDelete = computed(() => myRole.value === 'manager')

const HALQA_NONE = 'none'

// ── الجلب ──
const { data: students, refresh, pending } = await useAsyncData<StudentRow[]>(
  'students-list',
  async () => {
    const { data, error } = await supabase
      .from('students')
      .select('*, halaqa:halaqa_id(name, teacher:teacher_id(full_name))')
      .order('created_at', { ascending: false })
      .returns<StudentRow[]>()
    if (error) {
      console.error('[students] فشل الجلب:', error.message)
      return []
    }
    return data ?? []
  },
  { server: false, default: () => [] }
)

const { data: halqat } = await useAsyncData<HalqaOpt[]>(
  'students-halqat',
  async () => {
    const { data } = await supabase.from('halaqat').select('id, name').order('name')
    return data ?? []
  },
  { server: false, default: () => [] }
)
const halqaItems = computed(() => [{ label: 'بلا حلقة', value: HALQA_NONE }, ...(halqat.value ?? []).map(h => ({ label: h.name, value: h.id }))])

// ── التصفية ──
const statusF = ref<StudentStatus | 'all'>('all')
const halqaF = ref<string>('all')
const STATUS_CHIPS: { key: StudentStatus | 'all', label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'active', label: 'نشط' },
  { key: 'withdrawn', label: 'منقطع' },
  { key: 'graduated', label: 'متخرّج' },
  { key: 'transferred', label: 'منقول' }
]
const halqaFilterItems = computed(() => [{ label: 'كل الحلقات', value: 'all' }, ...(halqat.value ?? []).map(h => ({ label: h.name, value: h.id }))])

const filtered = computed(() => (students.value ?? []).filter(s =>
  (statusF.value === 'all' || s.status === statusF.value)
  && (halqaF.value === 'all' || s.halaqa_id === halqaF.value)
))
function countFor(key: StudentStatus | 'all') {
  const list = students.value ?? []
  return key === 'all' ? list.length : list.filter(s => s.status === key).length
}
function initialOf(name: string) {
  return name.trim().charAt(0) || '؟'
}

const STATUS_META: Record<StudentStatus, { label: string, color: 'success' | 'warning' | 'neutral' | 'info' }> = {
  active: { label: 'نشط', color: 'success' },
  withdrawn: { label: 'منقطع', color: 'warning' },
  graduated: { label: 'متخرّج', color: 'info' },
  transferred: { label: 'منقول', color: 'neutral' }
}

// ── إضافة/تعديل ──
const modalOpen = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({
  full_name: '', national_id: '', gender: 'male' as Gender, halaqa_id: HALQA_NONE,
  guardian_name: '', guardian_phone: '', birth_date: '', quran_parts: '', status: 'active' as StudentStatus
})
const genderItems = [{ label: 'ذكر', value: 'male' }, { label: 'أنثى', value: 'female' }]
const statusItems = [
  { label: 'نشط', value: 'active' },
  { label: 'منقطع', value: 'withdrawn' },
  { label: 'متخرّج', value: 'graduated' },
  { label: 'منقول', value: 'transferred' }
]

function openCreate() {
  editingId.value = null
  Object.assign(form, { full_name: '', national_id: '', gender: 'male', halaqa_id: HALQA_NONE, guardian_name: '', guardian_phone: '', birth_date: '', quran_parts: '', status: 'active' })
  modalOpen.value = true
}
function openEdit(s: StudentRow) {
  editingId.value = s.id
  Object.assign(form, {
    full_name: s.full_name,
    national_id: s.national_id ?? '',
    gender: s.gender ?? 'male',
    halaqa_id: s.halaqa_id ?? HALQA_NONE,
    guardian_name: s.guardian_name ?? '',
    guardian_phone: s.guardian_phone ?? '',
    birth_date: s.birth_date ?? '',
    quran_parts: s.quran_parts != null ? String(s.quran_parts) : '',
    status: s.status
  })
  modalOpen.value = true
}

function validate(s: typeof form) {
  const errors: { name: string, message: string }[] = []
  if (!s.full_name.trim()) errors.push({ name: 'full_name', message: 'اسم الطالب مطلوب.' })
  if (s.quran_parts && (Number(s.quran_parts) < 0 || Number(s.quran_parts) > 30)) errors.push({ name: 'quran_parts', message: 'الأجزاء بين 0 و30.' })
  return errors
}

async function save() {
  saving.value = true
  try {
    const payload = {
      full_name: form.full_name.trim(),
      national_id: form.national_id.trim() || null,
      gender: form.gender,
      halaqa_id: form.halaqa_id === HALQA_NONE ? null : form.halaqa_id,
      guardian_name: form.guardian_name.trim() || null,
      guardian_phone: form.guardian_phone.trim() || null,
      birth_date: form.birth_date || null,
      quran_parts: form.quran_parts ? Number(form.quran_parts) : null,
      status: form.status
    }
    const { error } = editingId.value
      ? await supabase.from('students').update(payload).eq('id', editingId.value)
      : await supabase.from('students').insert({ ...payload, created_by: profile.value?.id ?? null })
    if (error) throw error
    toast.add({ title: editingId.value ? 'تم تحديث بيانات الطالب.' : 'تمت إضافة الطالب.', color: 'success', icon: 'i-lucide-circle-check' })
    modalOpen.value = false
    await refresh()
  } catch (err) {
    handle(err)
  } finally {
    saving.value = false
  }
}

// ── حذف ──
const deleteTarget = ref<StudentRow | null>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    const { error } = await supabase.from('students').delete().eq('id', deleteTarget.value.id)
    if (error) throw error
    toast.add({ title: 'تم حذف الطالب.', color: 'neutral', icon: 'i-lucide-trash-2' })
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
  <div class="students">
    <div class="head">
      <div>
        <h2>الطلاب</h2>
        <p>سجلّ الطلاب وبياناتهم وربطهم بالحلقات — الطالب سجلّ بيانات بلا حساب دخول.</p>
      </div>
      <UButton
        v-if="canManage"
        label="إضافة طالب"
        color="primary"
        size="lg"
        icon="i-lucide-plus"
        :ui="{ base: 'rounded-[13px] font-semibold' }"
        @click="openCreate"
      />
    </div>

    <div class="filters">
      <div class="chips">
        <button
          v-for="c in STATUS_CHIPS"
          :key="c.key"
          class="chip"
          :class="{ on: statusF === c.key }"
          @click="statusF = c.key"
        >
          {{ c.label }}
          <span class="chip-n">{{ countFor(c.key) }}</span>
        </button>
      </div>
      <USelect
        v-model="halqaF"
        :items="halqaFilterItems"
        size="md"
        class="halqa-sel"
        :ui="{ base: 'rounded-[11px]' }"
      />
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
        name="i-lucide-graduation-cap"
        class="size-8"
      />
      <h3>لا طلاب بعد</h3>
      <p>{{ canManage ? 'أضِف أول طالب واربطه بحلقته ليظهر هنا.' : 'لا طلاب في نطاقك حاليّاً.' }}</p>
    </div>
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
            <th class="ta-start">
              الحلقة
            </th>
            <th class="ta-start">
              المعلّم
            </th>
            <th class="ta-start">
              الأجزاء المحفوظة
            </th>
            <th class="ta-start">
              الحالة
            </th>
            <th
              v-if="canManage"
              class="ta-end"
            >
              إجراءات
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in filtered"
            :key="s.id"
          >
            <td>
              <div class="user-cell">
                <div class="av">
                  {{ initialOf(s.full_name) }}
                </div>
                <div>
                  <div class="u-name">
                    {{ s.full_name }}
                  </div>
                  <div
                    v-if="s.national_id"
                    class="u-sub"
                    dir="ltr"
                  >
                    {{ s.national_id }}
                  </div>
                </div>
              </div>
            </td>
            <td class="muted">
              {{ s.halaqa?.name || '—' }}
            </td>
            <td class="muted">
              {{ s.halaqa?.teacher?.full_name || '—' }}
            </td>
            <td class="muted">
              {{ s.quran_parts != null ? `${s.quran_parts} جزء` : '—' }}
            </td>
            <td>
              <UBadge
                :label="STATUS_META[s.status].label"
                :color="STATUS_META[s.status].color"
                variant="soft"
              />
            </td>
            <td v-if="canManage">
              <div class="actions">
                <UButton
                  color="neutral"
                  variant="outline"
                  size="sm"
                  icon="i-lucide-pencil"
                  :ui="{ base: 'rounded-[10px]' }"
                  aria-label="تعديل"
                  @click="openEdit(s)"
                />
                <UButton
                  v-if="canDelete"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  icon="i-lucide-trash-2"
                  :ui="{ base: 'rounded-[10px]' }"
                  aria-label="حذف"
                  @click="deleteTarget = s"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- نافذة إضافة/تعديل -->
    <UModal
      v-model:open="modalOpen"
      :title="editingId ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد'"
    >
      <template #body>
        <UForm
          :state="form"
          :validate="validate"
          class="form"
          @submit="save"
        >
          <UFormField
            label="اسم الطالب"
            name="full_name"
          >
            <UInput
              v-model="form.full_name"
              size="lg"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>
          <div class="row">
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
            <UFormField
              label="الحلقة"
              name="halaqa_id"
              class="f"
            >
              <USelect
                v-model="form.halaqa_id"
                :items="halqaItems"
                size="lg"
                class="w-full"
                :ui="{ base: 'rounded-[13px]' }"
              />
            </UFormField>
          </div>
          <div class="row">
            <UFormField
              label="رقم الهوية"
              name="national_id"
              class="f"
            >
              <UInput
                v-model="form.national_id"
                dir="ltr"
                size="lg"
                class="w-full"
                :ui="{ base: 'rounded-[13px]' }"
              />
            </UFormField>
            <UFormField
              label="تاريخ الميلاد"
              name="birth_date"
              class="f"
            >
              <UInput
                v-model="form.birth_date"
                type="date"
                dir="ltr"
                size="lg"
                class="w-full"
                :ui="{ base: 'rounded-[13px]' }"
              />
            </UFormField>
          </div>
          <div class="row">
            <UFormField
              label="اسم وليّ الأمر"
              name="guardian_name"
              class="f"
            >
              <UInput
                v-model="form.guardian_name"
                size="lg"
                class="w-full"
                :ui="{ base: 'rounded-[13px]' }"
              />
            </UFormField>
            <UFormField
              label="هاتف وليّ الأمر"
              name="guardian_phone"
              class="f"
            >
              <UInput
                v-model="form.guardian_phone"
                dir="ltr"
                size="lg"
                class="w-full"
                :ui="{ base: 'rounded-[13px]' }"
              />
            </UFormField>
          </div>
          <div class="row">
            <UFormField
              label="الأجزاء المحفوظة"
              name="quran_parts"
              class="f"
            >
              <UInput
                v-model="form.quran_parts"
                type="number"
                min="0"
                max="30"
                dir="ltr"
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
              :label="editingId ? 'حفظ التغييرات' : 'إضافة الطالب'"
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
    <UModal
      :open="!!deleteTarget"
      title="حذف الطالب"
      @update:open="v => { if (!v) deleteTarget = null }"
    >
      <template #body>
        <p class="confirm-text">
          هل أنت متأكّد من حذف الطالب «<strong>{{ deleteTarget?.full_name }}</strong>»؟ لا يمكن التراجع.
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
.students { max-width: 1280px; margin: 0 auto; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: var(--shadow); }

.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
.head h2 { margin: 0; font-size: 26px; font-weight: 700; color: var(--ink); }
.head p { margin: 8px 0 0; font-size: 16px; color: var(--ink-2); font-weight: 300; }

.filters { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 20px; }
.chips { display: flex; flex-wrap: wrap; gap: 10px; }
.chip { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line-2); color: var(--ink-2); font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; transition: all .15s; }
.chip:hover { background: var(--surface-2); }
.chip.on { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.chip-n { font-size: 12px; opacity: .8; background: rgba(0, 0, 0, .08); border-radius: 999px; padding: 1px 7px; }
.chip.on .chip-n { background: rgba(255, 255, 255, .22); }
.halqa-sel { min-width: 180px; }

.empty { padding: 56px 24px; text-align: center; color: var(--ink-2); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty h3 { margin: 6px 0 0; font-size: 19px; font-weight: 700; color: var(--ink); }
.empty p { margin: 0; font-size: 15px; font-weight: 300; }

.table-wrap { overflow: hidden; }
.table-wrap table { width: 100%; border-collapse: collapse; font-size: 15px; }
.table-wrap thead tr { background: var(--surface-2); }
.table-wrap th { padding: 14px 20px; font-weight: 600; color: var(--ink-3); font-size: 13px; white-space: nowrap; }
.ta-start { text-align: start; }
.ta-end { text-align: end; }
.table-wrap tbody tr { border-top: 1px solid var(--line); }
.table-wrap td { padding: 14px 20px; vertical-align: middle; }
.muted { color: var(--ink-2); white-space: nowrap; }
.user-cell { display: flex; align-items: center; gap: 11px; }
.av { width: 40px; height: 40px; border-radius: 11px; background: var(--green-ink); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; flex: none; }
.u-name { font-weight: 600; color: var(--ink); }
.u-sub { font-size: 13px; color: var(--ink-3); }
.actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }

.form { display: flex; flex-direction: column; gap: 14px; }
.row { display: flex; gap: 14px; flex-wrap: wrap; }
.row .f { flex: 1; min-width: 150px; }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
.confirm-text { font-size: 15.5px; color: var(--ink-2); line-height: 1.8; margin: 0 0 18px; }

@media (max-width: 640px) { .u-sub { display: none; } }
</style>
