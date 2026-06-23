<script setup lang="ts">
/**
 * خطة الاختبارات (§4.11).
 * كل مجموعة محطّتان: مرحلي (3 أجزاء) وتجميعي (5)، مخزّنتان كصفّين في exam_plan.
 * تُعرض كصفّ واحد لكل مجموعة. التعديل/الإضافة/الحذف للمدير (RLS: plan_write=is_manager)،
 * والبقية للاطّلاع فقط. المعلّم يحدّد نطاق اختبار الطالب من الخطة لاحقاً (§4.16).
 */
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'خطة الاختبارات — ترجمان' })

type PlanRow = Database['public']['Tables']['exam_plan']['Row']
type Group = { group_number: number, partial: PlanRow | null, cumulative: PlanRow | null }

const supabase = useSupabaseClient<Database>()
const { role: myRole } = useProfile()
const { handle } = useErrorHandler()
const toast = useToast()
const isManager = computed(() => myRole.value === 'manager')

const { data: rows, refresh, pending } = await useAsyncData<PlanRow[]>(
  'exam-plan',
  async () => {
    const { data, error } = await supabase.from('exam_plan').select('*').order('group_number')
    if (error) {
      console.error('[exam-plan] فشل الجلب:', error.message)
      return []
    }
    return data ?? []
  },
  { server: false, default: () => [] }
)

const groups = computed<Group[]>(() => {
  const map = new Map<number, Group>()
  for (const r of rows.value ?? []) {
    const g = map.get(r.group_number) ?? { group_number: r.group_number, partial: null, cumulative: null }
    if (r.stage_type === 'partial') g.partial = r
    else g.cumulative = r
    map.set(r.group_number, g)
  }
  return [...map.values()].sort((a, b) => a.group_number - b.group_number)
})
const range = (r: PlanRow | null) => r ? `${r.parts_from} – ${r.parts_to}` : '—'

// ── إضافة/تعديل ──
const modalOpen = ref(false)
const saving = ref(false)
const editing = ref<Group | null>(null)
const form = reactive({ group_number: '', p_from: '', p_to: '', c_from: '', c_to: '' })

function nextGroupNumber() {
  const max = Math.max(0, ...groups.value.map(g => g.group_number))
  return String(max + 1)
}
function openCreate() {
  editing.value = null
  Object.assign(form, { group_number: nextGroupNumber(), p_from: '', p_to: '', c_from: '', c_to: '' })
  modalOpen.value = true
}
function openEdit(g: Group) {
  editing.value = g
  Object.assign(form, {
    group_number: String(g.group_number),
    p_from: g.partial ? String(g.partial.parts_from) : '',
    p_to: g.partial ? String(g.partial.parts_to) : '',
    c_from: g.cumulative ? String(g.cumulative.parts_from) : '',
    c_to: g.cumulative ? String(g.cumulative.parts_to) : ''
  })
  modalOpen.value = true
}

function validate(s: typeof form) {
  const errors: { name: string, message: string }[] = []
  const n = (v: string) => Number.parseInt(v, 10)
  if (!s.group_number || n(s.group_number) <= 0) errors.push({ name: 'group_number', message: 'رقم المجموعة مطلوب.' })
  for (const [f, t, key] of [[s.p_from, s.p_to, 'p_to'], [s.c_from, s.c_to, 'c_to']] as const) {
    if (!f || !t) errors.push({ name: key, message: 'حدّد المدى كاملاً.' })
    else if (n(f) < 1 || n(t) > 30 || n(f) > n(t)) errors.push({ name: key, message: 'مدى غير صحيح (1–30، من ≤ إلى).' })
  }
  return errors
}

async function save() {
  saving.value = true
  try {
    const gn = Number.parseInt(form.group_number, 10)
    const partial = { group_number: gn, parts_from: +form.p_from, parts_to: +form.p_to, stage_type: 'partial' as const }
    const cumulative = { group_number: gn, parts_from: +form.c_from, parts_to: +form.c_to, stage_type: 'cumulative' as const }

    const ops: PromiseLike<{ error: unknown }>[] = []
    const pId = editing.value?.partial?.id
    const cId = editing.value?.cumulative?.id
    ops.push(pId ? supabase.from('exam_plan').update(partial).eq('id', pId) : supabase.from('exam_plan').insert(partial))
    ops.push(cId ? supabase.from('exam_plan').update(cumulative).eq('id', cId) : supabase.from('exam_plan').insert(cumulative))
    const results = await Promise.all(ops)
    const failed = results.find(r => r.error)
    if (failed?.error) throw failed.error

    toast.add({ title: editing.value ? 'تم تحديث المجموعة.' : 'تمت إضافة المجموعة.', color: 'success', icon: 'i-lucide-circle-check' })
    modalOpen.value = false
    await refresh()
  } catch (err) {
    handle(err)
  } finally {
    saving.value = false
  }
}

// ── حذف ──
const deleteTarget = ref<Group | null>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    const ids = [deleteTarget.value.partial?.id, deleteTarget.value.cumulative?.id].filter((x): x is number => x != null)
    const { error } = await supabase.from('exam_plan').delete().in('id', ids)
    if (error) throw error
    toast.add({ title: 'تم حذف المجموعة.', color: 'neutral', icon: 'i-lucide-trash-2' })
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
  <div class="plan">
    <div class="head">
      <div>
        <h2>خطة الاختبارات</h2>
        <p>يستحقّ الطالب الاختبار عند بلوغ محطته — مرحلي (3 أجزاء) ثم تجميعي (5 أجزاء).</p>
      </div>
      <UButton
        v-if="isManager"
        label="إضافة مجموعة"
        color="primary"
        size="lg"
        icon="i-lucide-plus"
        :ui="{ base: 'rounded-[13px] font-semibold' }"
        @click="openCreate"
      />
    </div>

    <div
      v-if="pending"
      class="card empty"
    >
      جارٍ التحميل…
    </div>
    <div
      v-else-if="groups.length === 0"
      class="card empty"
    >
      <UIcon
        name="i-lucide-list-ordered"
        class="size-8"
      />
      <h3>لا مجموعات بعد</h3>
      <p>أضِف أول مجموعة لتبدأ خطة الاختبارات.</p>
    </div>
    <div
      v-else
      class="card table-wrap"
    >
      <table>
        <thead>
          <tr>
            <th class="ta-start">
              المجموعة
            </th>
            <th class="ta-start">
              مرحلي (3 أجزاء)
            </th>
            <th class="ta-start">
              تجميعي (5 أجزاء)
            </th>
            <th
              v-if="isManager"
              class="ta-end"
            >
              إجراءات
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="g in groups"
            :key="g.group_number"
          >
            <td class="g-num">
              المجموعة {{ g.group_number }}
            </td>
            <td><span class="pill pill-blue">{{ range(g.partial) }}</span></td>
            <td><span class="pill pill-green">{{ range(g.cumulative) }}</span></td>
            <td v-if="isManager">
              <div class="actions">
                <UButton
                  color="neutral"
                  variant="outline"
                  size="sm"
                  icon="i-lucide-pencil"
                  :ui="{ base: 'rounded-[10px]' }"
                  aria-label="تعديل"
                  @click="openEdit(g)"
                />
                <UButton
                  color="neutral"
                  variant="outline"
                  size="sm"
                  icon="i-lucide-trash-2"
                  :ui="{ base: 'rounded-[10px]' }"
                  aria-label="حذف"
                  @click="deleteTarget = g"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="note">
      <UIcon
        name="i-lucide-info"
        class="size-5"
      />
      <p v-if="isManager">
        بصفتك المدير يمكنك إضافة المجموعات وتعديلها وحذفها. المعلّم يحدّد نطاق اختبار الطالب من الخطة وفق مستواه.
      </p>
      <p v-else>
        الخطة للاطّلاع، والمعلّم يحدّد نطاق اختبار الطالب منها وفق مستواه. تعديل الخطة صلاحية المدير.
      </p>
    </div>

    <!-- نافذة إضافة/تعديل -->
    <UModal
      v-model:open="modalOpen"
      :title="editing ? 'تعديل المجموعة' : 'إضافة مجموعة'"
    >
      <template #body>
        <UForm
          :state="form"
          :validate="validate"
          class="form"
          @submit="save"
        >
          <UFormField
            label="رقم المجموعة"
            name="group_number"
          >
            <UInput
              v-model="form.group_number"
              type="number"
              min="1"
              dir="ltr"
              size="lg"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>
          <div class="seg">
            <span class="seg-title pill-blue">مرحلي (3 أجزاء)</span>
            <div class="row">
              <UFormField
                label="من جزء"
                name="p_from"
                class="f"
              >
                <UInput
                  v-model="form.p_from"
                  type="number"
                  min="1"
                  max="30"
                  dir="ltr"
                  size="lg"
                  class="w-full"
                  :ui="{ base: 'rounded-[13px]' }"
                />
              </UFormField>
              <UFormField
                label="إلى جزء"
                name="p_to"
                class="f"
              >
                <UInput
                  v-model="form.p_to"
                  type="number"
                  min="1"
                  max="30"
                  dir="ltr"
                  size="lg"
                  class="w-full"
                  :ui="{ base: 'rounded-[13px]' }"
                />
              </UFormField>
            </div>
          </div>
          <div class="seg">
            <span class="seg-title pill-green">تجميعي (5 أجزاء)</span>
            <div class="row">
              <UFormField
                label="من جزء"
                name="c_from"
                class="f"
              >
                <UInput
                  v-model="form.c_from"
                  type="number"
                  min="1"
                  max="30"
                  dir="ltr"
                  size="lg"
                  class="w-full"
                  :ui="{ base: 'rounded-[13px]' }"
                />
              </UFormField>
              <UFormField
                label="إلى جزء"
                name="c_to"
                class="f"
              >
                <UInput
                  v-model="form.c_to"
                  type="number"
                  min="1"
                  max="30"
                  dir="ltr"
                  size="lg"
                  class="w-full"
                  :ui="{ base: 'rounded-[13px]' }"
                />
              </UFormField>
            </div>
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
              :label="editing ? 'حفظ التغييرات' : 'إضافة المجموعة'"
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
      title="حذف المجموعة"
      @update:open="v => { if (!v) deleteTarget = null }"
    >
      <template #body>
        <p class="confirm-text">
          هل أنت متأكّد من حذف «<strong>المجموعة {{ deleteTarget?.group_number }}</strong>» بمحطّتيها؟ لا يمكن التراجع.
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
.plan { max-width: 1000px; margin: 0 auto; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: var(--shadow); }

.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
.head h2 { margin: 0; font-size: 26px; font-weight: 700; color: var(--ink); }
.head p { margin: 8px 0 0; font-size: 16px; color: var(--ink-2); font-weight: 300; }

.empty { padding: 56px 24px; text-align: center; color: var(--ink-2); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty h3 { margin: 6px 0 0; font-size: 19px; font-weight: 700; color: var(--ink); }
.empty p { margin: 0; font-size: 15px; font-weight: 300; }

.table-wrap { overflow: hidden; }
.table-wrap table { width: 100%; border-collapse: collapse; font-size: 15px; }
.table-wrap thead tr { background: var(--surface-2); }
.table-wrap th { padding: 15px 24px; font-weight: 600; color: var(--ink-3); font-size: 13px; white-space: nowrap; }
.ta-start { text-align: start; }
.ta-end { text-align: end; }
.table-wrap tbody tr { border-top: 1px solid var(--line); }
.table-wrap td { padding: 16px 24px; vertical-align: middle; }
.g-num { font-weight: 600; color: var(--ink); white-space: nowrap; }
.pill { display: inline-flex; align-items: center; height: 30px; padding: 0 14px; border-radius: 999px; font-size: 14.5px; font-weight: 700; }
.pill-blue { background: var(--blue-soft); color: var(--blue-ink); }
.pill-green { background: var(--green-soft); color: var(--green-ink); }
.actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }

.note { margin-top: 18px; padding: 16px 20px; border-radius: 14px; background: var(--surface-2); border: 1px solid var(--line); display: flex; gap: 12px; align-items: flex-start; color: var(--blue-ink); }
.note p { margin: 0; font-size: 15px; line-height: 1.8; color: var(--ink-2); }

.form { display: flex; flex-direction: column; gap: 16px; }
.seg { background: var(--surface-2); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; }
.seg-title { display: inline-flex; align-items: center; height: 28px; padding: 0 12px; border-radius: 999px; font-size: 13px; font-weight: 700; margin-bottom: 12px; }
.row { display: flex; gap: 14px; flex-wrap: wrap; }
.row .f { flex: 1; min-width: 120px; }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }
.confirm-text { font-size: 15.5px; color: var(--ink-2); line-height: 1.8; margin: 0 0 18px; }
</style>
