<script setup lang="ts">
/**
 * الاختبارات (§4.16) — موجّهة بالدور:
 * - المعلّم: يرشّح طلابه المستحقّين (بلغوا محطتهم في الخطة) ويرسل القائمة.
 * - المشرف/المدير: يرصد نتيجة كل اختبار وارد (حفظ/فهم/تدبّر/تجويد) من 100.
 * يبني على خطة الاختبارات ورحلة الطالب (الاستحقاق حسب الحفظ).
 */
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'الاختبارات — ترجمان' })

type PlanRow = { id: number, parts_from: number, parts_to: number, stage_type: 'partial' | 'cumulative' }

const supabase = useSupabaseClient<Database>()
const { role, profile } = useProfile()
const { handle } = useErrorHandler()
const toast = useToast()

const isTeacher = computed(() => role.value === 'teacher')
const canGrade = computed(() => role.value === 'manager' || role.value === 'supervisor')

const stageLabel = (s: string) => s === 'partial' ? 'مرحلي' : 'تجميعي'

// خطة الاختبارات + علامة الاجتياز
const { data: plan } = await useAsyncData<PlanRow[]>('exams-plan', async () => {
  const { data } = await supabase.from('exam_plan').select('id, parts_from, parts_to, stage_type').order('parts_to')
  return (data ?? []) as PlanRow[]
}, { server: false, default: () => [] })

const { data: passMark } = await useAsyncData<number>('exams-passmark', async () => {
  const { data } = await supabase.from('app_settings').select('pass_mark').eq('id', 1).single()
  return data?.pass_mark ?? 80
}, { server: false, default: () => 80 })

function eligibleStations(parts: number | null) {
  return (plan.value ?? []).filter(p => (parts ?? 0) >= p.parts_to)
}

// ═══ المعلّم: الترشيح ═══
type RosterStudent = { id: string, full_name: string, quran_parts: number | null, halaqa_id: string | null }
const { data: roster, refresh: refreshRoster } = await useAsyncData<RosterStudent[]>('exams-roster', async () => {
  if (role.value !== 'teacher') return []
  const { data } = await supabase.from('students').select('id, full_name, quran_parts, halaqa_id').eq('status', 'active').order('full_name')
  return data ?? []
}, { server: false, default: () => [], watch: [role] })

// حالة اختبارات الطلاب: المُجتاز (لا يُرشَّح ثانيةً) والمعلّق (بانتظار الرصد)
type ResRow = { student_id: string, exam_list_item: { exam_plan_id: number | null } | null }
type ItemRow = { student_id: string, exam_plan_id: number | null, exam_results: { id: string }[] }
const { data: examState, refresh: refreshState } = await useAsyncData<{ passed: Record<string, number[]>, pending: Record<string, number[]> }>('exams-state', async () => {
  if (role.value !== 'teacher') return { passed: {} as Record<string, number[]>, pending: {} as Record<string, number[]> }
  const [{ data: res }, { data: items }] = await Promise.all([
    supabase.from('exam_results').select('student_id, exam_list_item:exam_list_item_id(exam_plan_id)').eq('passed', true).returns<ResRow[]>(),
    supabase.from('exam_list_items').select('student_id, exam_plan_id, exam_results(id)').returns<ItemRow[]>()
  ])
  const passed: Record<string, number[]> = {}
  for (const r of res ?? []) {
    const pid = r.exam_list_item?.exam_plan_id
    if (pid != null) (passed[r.student_id] ??= []).push(pid)
  }
  const pending: Record<string, number[]> = {}
  for (const it of items ?? []) {
    if (it.exam_plan_id != null && !it.exam_results?.length) (pending[it.student_id] ??= []).push(it.exam_plan_id)
  }
  return { passed, pending }
}, { server: false, default: () => ({ passed: {}, pending: {} }), watch: [role] })

const passedOf = (id: string) => new Set(examState.value?.passed[id] ?? [])
const pendingOf = (id: string) => new Set(examState.value?.pending[id] ?? [])
// المحطات المتاحة للترشيح: بلغها حفظاً + غير مُجتازة + غير معلّقة
function availableStations(s: RosterStudent) {
  const passed = passedOf(s.id)
  const pending = pendingOf(s.id)
  return eligibleStations(s.quran_parts).filter(p => !passed.has(p.id) && !pending.has(p.id))
}

const nominees = reactive<Record<string, { checked: boolean, planId: string }>>({})
watchEffect(() => {
  for (const s of roster.value ?? []) {
    const avail = availableStations(s)
    const cur = nominees[s.id]
    if (!cur) {
      nominees[s.id] = { checked: false, planId: avail.length ? String(avail[0]!.id) : '' }
    } else if (cur.planId && !avail.some(p => String(p.id) === cur.planId)) {
      cur.planId = avail.length ? String(avail[0]!.id) : ''
      if (!cur.planId) cur.checked = false
    }
  }
})
const nomineeCount = computed(() => Object.values(nominees).filter(n => n.checked).length)

const rosterRows = computed(() => (roster.value ?? []).map((s) => {
  const elig = eligibleStations(s.quran_parts)
  const avail = availableStations(s)
  let blockReason = ''
  if (!elig.length) blockReason = 'لم يبلغ محطة بعد'
  else if (!avail.length) blockReason = pendingOf(s.id).size ? 'بانتظار رصد المشرف' : 'اجتاز كل المتاح'
  return {
    ...s,
    nom: nominees[s.id] ?? { checked: false, planId: '' },
    options: avail.map(p => ({ label: `الأجزاء ${p.parts_from}–${p.parts_to} (${stageLabel(p.stage_type)})`, value: String(p.id) })),
    blockReason
  }
}))

const sending = ref(false)
async function sendNominees() {
  const chosen = (roster.value ?? []).filter(s => nominees[s.id]?.checked && nominees[s.id]?.planId)
  if (!chosen.length) return
  // تحقّق دفاعي: استبعد المُجتاز/المعلّق (الحالتان 1 و2)
  const valid: RosterStudent[] = []
  const skipped: string[] = []
  for (const s of chosen) {
    const pid = Number(nominees[s.id]!.planId)
    if (passedOf(s.id).has(pid)) skipped.push(`${s.full_name} (اجتاز هذا الاختبار مسبقاً)`)
    else if (pendingOf(s.id).has(pid)) skipped.push(`${s.full_name} (مرشّح مسبقاً وبانتظار الرصد)`)
    else valid.push(s)
  }
  if (skipped.length) {
    toast.add({ title: `تُجوهل ${skipped.length}: ${skipped.join(' · ')}`, color: 'warning', icon: 'i-lucide-triangle-alert' })
  }
  if (!valid.length) return
  sending.value = true
  try {
    // مجموعة حسب الحلقة → قائمة لكل حلقة
    const byHalqa = new Map<string, RosterStudent[]>()
    for (const s of valid) {
      if (!s.halaqa_id) continue
      const arr = byHalqa.get(s.halaqa_id) ?? []
      arr.push(s)
      byHalqa.set(s.halaqa_id, arr)
    }
    const today = new Date().toISOString().slice(0, 10)
    for (const [halaqaId, studs] of byHalqa) {
      const { data: list, error: e1 } = await supabase
        .from('exam_lists')
        .insert({ halaqa_id: halaqaId, teacher_id: profile.value!.id, week_date: today, status: 'sent' })
        .select('id').single()
      if (e1 || !list) throw e1
      const items = studs.map(s => ({ exam_list_id: list.id, student_id: s.id, exam_plan_id: Number(nominees[s.id]!.planId) }))
      const { error: e2 } = await supabase.from('exam_list_items').insert(items)
      if (e2) throw e2
    }
    toast.add({ title: `أُرسلت ${valid.length} ترشيحاً للمشرف.`, color: 'success', icon: 'i-lucide-send' })
    for (const n of Object.values(nominees)) n.checked = false
    await Promise.all([refreshRoster(), refreshState()])
  } catch (err) {
    handle(err)
  } finally {
    sending.value = false
  }
}

// ═══ المشرف/المدير: الاختبارات الواردة ═══
type QueueItem = {
  id: string
  student: { id: string, full_name: string } | null
  exam_plan: { parts_from: number, parts_to: number, stage_type: string } | null
  exam_list: { halaqa: { name: string } | null, teacher: { full_name: string } | null } | null
  exam_results: { id: string }[]
}
const { data: queueRaw, refresh: refreshQueue } = await useAsyncData<QueueItem[]>('exams-queue', async () => {
  if (role.value !== 'manager' && role.value !== 'supervisor') return []
  const { data, error } = await supabase
    .from('exam_list_items')
    .select('id, student:student_id(id, full_name), exam_plan:exam_plan_id(parts_from, parts_to, stage_type), exam_list:exam_list_id(halaqa:halaqa_id(name), teacher:teacher_id(full_name)), exam_results(id)')
    .order('created_at', { ascending: true })
    .returns<QueueItem[]>()
  if (error) {
    console.error('[exams] queue:', error.message)
    return []
  }
  return data ?? []
}, { server: false, default: () => [], watch: [role] })
const queue = computed(() => (queueRaw.value ?? []).filter(i => !i.exam_results?.length))

// نافذة الرصد
const gradeOpen = ref(false)
const gradeTarget = ref<QueueItem | null>(null)
const grading = ref(false)
const scores = reactive({
  q1_memorization: '', q1_understanding: '', q1_reflection: '',
  q2_memorization: '', q2_understanding: '', q2_reflection: '',
  q3_memorization: '', q3_understanding: '', q3_reflection: '',
  tajweed_score: '', notes: ''
})
const scoreFields = [
  { key: 'q1_memorization' as const, label: 'س1 حفظ' },
  { key: 'q1_understanding' as const, label: 'س1 فهم' },
  { key: 'q1_reflection' as const, label: 'س1 تدبّر' },
  { key: 'q2_memorization' as const, label: 'س2 حفظ' },
  { key: 'q2_understanding' as const, label: 'س2 فهم' },
  { key: 'q2_reflection' as const, label: 'س2 تدبّر' },
  { key: 'q3_memorization' as const, label: 'س3 حفظ' },
  { key: 'q3_understanding' as const, label: 'س3 فهم' },
  { key: 'q3_reflection' as const, label: 'س3 تدبّر' },
  { key: 'tajweed_score' as const, label: 'التجويد' }
]
const liveTotal = computed(() => scoreFields.reduce((sum, f) => sum + (Number(scores[f.key]) || 0), 0))

function openGrade(item: QueueItem) {
  gradeTarget.value = item
  for (const f of scoreFields) scores[f.key] = ''
  scores.notes = ''
  gradeOpen.value = true
}
async function saveGrade() {
  if (!gradeTarget.value?.student) return
  grading.value = true
  try {
    const payload = {
      student_id: gradeTarget.value.student.id,
      exam_list_item_id: gradeTarget.value.id,
      examiner_id: profile.value?.id ?? null,
      pass_mark_snapshot: passMark.value ?? 80,
      exam_date: new Date().toISOString().slice(0, 10),
      q1_memorization: Number(scores.q1_memorization) || 0,
      q1_understanding: Number(scores.q1_understanding) || 0,
      q1_reflection: Number(scores.q1_reflection) || 0,
      q2_memorization: Number(scores.q2_memorization) || 0,
      q2_understanding: Number(scores.q2_understanding) || 0,
      q2_reflection: Number(scores.q2_reflection) || 0,
      q3_memorization: Number(scores.q3_memorization) || 0,
      q3_understanding: Number(scores.q3_understanding) || 0,
      q3_reflection: Number(scores.q3_reflection) || 0,
      tajweed_score: Number(scores.tajweed_score) || 0,
      notes: scores.notes.trim() || null
    }
    const { error } = await supabase.from('exam_results').insert(payload)
    if (error) throw error
    toast.add({ title: 'تم رصد النتيجة.', color: 'success', icon: 'i-lucide-circle-check' })
    gradeOpen.value = false
    await refreshQueue()
    await refreshResults()
  } catch (err) {
    handle(err)
  } finally {
    grading.value = false
  }
}

// ═══ النتائج ═══
type ResultRow = {
  id: string
  exam_date: string
  total_score: number | null
  passed: boolean | null
  student: { full_name: string } | null
  exam_list_item: { exam_plan: { parts_from: number, parts_to: number } | null } | null
}
const { data: results, refresh: refreshResults } = await useAsyncData<ResultRow[]>('exams-results', async () => {
  const { data, error } = await supabase
    .from('exam_results')
    .select('id, exam_date, total_score, passed, student:student_id(full_name), exam_list_item:exam_list_item_id(exam_plan:exam_plan_id(parts_from, parts_to))')
    .order('exam_date', { ascending: false })
    .limit(50)
    .returns<ResultRow[]>()
  if (error) {
    console.error('[exams] results:', error.message)
    return []
  }
  return data ?? []
}, { server: false, default: () => [] })
</script>

<template>
  <div class="exams">
    <UiPageHeader
      title="الاختبارات"
      :subtitle="isTeacher ? 'رشّح طلابك الذين بلغوا محطتهم في الخطة وأرسل القائمة للمشرف.' : 'الاختبارات الواردة من المعلّمين — افتح كلّ اختبار وارصد نتيجته من 100.'"
    />

    <ClientOnly>
      <!-- ═══ المعلّم: الترشيح ═══ -->
      <template v-if="isTeacher">
        <UiEmptyState
          v-if="!(roster || []).length"
          icon="i-lucide-users"
          title="لا طلاب في حلقتك"
          description="أضِف طلاباً لحلقتك أولاً من شاشة الطلاب."
        />
        <div
          v-else
          class="card table-wrap"
        >
          <table>
            <thead>
              <tr>
                <th class="ta-start">
                  ترشيح
                </th>
                <th class="ta-start">
                  الطالب
                </th>
                <th class="ta-start">
                  المحفوظ
                </th>
                <th class="ta-start">
                  الاختبار المستحقّ
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in rosterRows"
                :key="row.id"
              >
                <td>
                  <UCheckbox
                    v-if="row.options.length"
                    v-model="row.nom.checked"
                  />
                  <span
                    v-else
                    class="muted"
                  >—</span>
                </td>
                <td class="strong">
                  {{ row.full_name }}
                </td>
                <td class="muted">
                  {{ row.quran_parts != null ? `${row.quran_parts} جزء` : '—' }}
                </td>
                <td>
                  <UiSelect
                    v-if="row.options.length"
                    v-model="row.nom.planId"
                    :items="row.options"
                    size="sm"
                  />
                  <span
                    v-else
                    class="tag tag-soon"
                  >{{ row.blockReason }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="send-bar">
            <span>المحدّدون: <strong>{{ nomineeCount }}</strong></span>
            <UButton
              label="إرسال للمشرف"
              color="primary"
              size="lg"
              icon="i-lucide-send"
              :disabled="nomineeCount === 0"
              :loading="sending"
              :ui="{ base: 'rounded-[13px] font-semibold' }"
              @click="sendNominees"
            />
          </div>
        </div>
      </template>

      <!-- ═══ المشرف/المدير: الواردة ═══ -->
      <template v-else-if="canGrade">
        <h3 class="sec-title">
          الاختبارات الواردة <span class="count">{{ queue.length }}</span>
        </h3>
        <UiEmptyState
          v-if="!queue.length"
          icon="i-lucide-clipboard-check"
          title="لا اختبارات واردة"
          description="ستظهر هنا ترشيحات المعلّمين فور إرسالها."
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
                <th class="ta-start">
                  الحلقة
                </th>
                <th class="ta-start">
                  المعلّم
                </th>
                <th class="ta-start">
                  النطاق
                </th>
                <th class="ta-end">
                  إجراء
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="it in queue"
                :key="it.id"
              >
                <td class="strong">
                  {{ it.student?.full_name || '—' }}
                </td>
                <td class="muted">
                  {{ it.exam_list?.halaqa?.name || '—' }}
                </td>
                <td class="muted">
                  {{ it.exam_list?.teacher?.full_name || '—' }}
                </td>
                <td class="muted">
                  <span v-if="it.exam_plan">الأجزاء {{ it.exam_plan.parts_from }}–{{ it.exam_plan.parts_to }} ({{ stageLabel(it.exam_plan.stage_type) }})</span>
                  <span v-else>—</span>
                </td>
                <td>
                  <div class="actions">
                    <UButton
                      label="رصد النتيجة"
                      color="primary"
                      size="sm"
                      icon="i-lucide-clipboard-pen"
                      :ui="{ base: 'rounded-[10px]' }"
                      @click="openGrade(it)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <UiEmptyState
        v-else
        icon="i-lucide-lock"
        title="لا صلاحية"
        description="هذه الشاشة للمعلّم (الترشيح) والمشرف/المدير (الرصد)."
      />

      <!-- ═══ النتائج (للجميع) ═══ -->
      <h3 class="sec-title mt">
        أحدث النتائج
      </h3>
      <UiEmptyState
        v-if="!(results || []).length"
        icon="i-lucide-file-text"
        title="لا نتائج بعد"
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
              <th class="ta-start">
                النطاق
              </th>
              <th class="ta-start">
                التاريخ
              </th>
              <th class="ta-start">
                العلامة
              </th>
              <th class="ta-start">
                النتيجة
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in results"
              :key="r.id"
            >
              <td class="strong">
                {{ r.student?.full_name || '—' }}
              </td>
              <td class="muted">
                <span v-if="r.exam_list_item?.exam_plan">{{ r.exam_list_item.exam_plan.parts_from }}–{{ r.exam_list_item.exam_plan.parts_to }}</span>
                <span v-else>—</span>
              </td>
              <td class="muted">
                {{ r.exam_date }}
              </td>
              <td><strong>{{ r.total_score ?? '—' }}</strong> / 100</td>
              <td>
                <UBadge
                  :label="r.passed ? 'مجتاز' : 'غير مجتاز'"
                  :color="r.passed ? 'success' : 'error'"
                  variant="soft"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </ClientOnly>

    <!-- نافذة الرصد -->
    <UModal
      v-model:open="gradeOpen"
      :title="`رصد نتيجة: ${gradeTarget?.student?.full_name || ''}`"
    >
      <template #body>
        <div class="grade">
          <p class="grade-hint">
            كل خانة من 10 (المجموع من 100). علامة الاجتياز: <strong>{{ passMark }}</strong>.
          </p>
          <div class="score-grid">
            <UFormField
              v-for="f in scoreFields"
              :key="f.key"
              :label="f.label"
            >
              <UInput
                v-model="scores[f.key]"
                type="number"
                min="0"
                max="10"
                dir="ltr"
                size="md"
                class="w-full"
                :ui="{ base: 'rounded-[11px] text-center' }"
              />
            </UFormField>
          </div>
          <div
            class="total"
            :class="{ ok: liveTotal >= (passMark || 80) }"
          >
            المجموع: <strong>{{ liveTotal }}</strong> / 100
            <span class="pill">{{ liveTotal >= (passMark || 80) ? 'مجتاز' : 'غير مجتاز' }}</span>
          </div>
          <UFormField label="ملاحظات (اختياري)">
            <UTextarea
              v-model="scores.notes"
              :rows="2"
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
              @click="gradeOpen = false"
            />
            <UButton
              label="حفظ النتيجة"
              color="primary"
              size="lg"
              icon="i-lucide-check"
              :loading="grading"
              :ui="{ base: 'rounded-[13px] font-semibold' }"
              @click="saveGrade"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.exams { max-width: 1280px; margin: 0 auto; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: var(--shadow); }
.table-wrap { overflow-x: auto; }
.table-wrap table { width: 100%; border-collapse: collapse; font-size: 15px; }
@media (max-width: 640px) { .table-wrap table { min-width: 600px; } }
.table-wrap thead tr { background: var(--surface-2); }
.table-wrap th { padding: 14px 18px; font-weight: 600; color: var(--ink-3); font-size: 13px; white-space: nowrap; }
.ta-start { text-align: start; }
.ta-end { text-align: end; }
.table-wrap tbody tr { border-top: 1px solid var(--line); }
.table-wrap td { padding: 13px 18px; vertical-align: middle; white-space: nowrap; }
.strong { font-weight: 600; color: var(--ink); }
.muted { color: var(--ink-2); }
.actions { display: flex; justify-content: flex-end; }
.tag { display: inline-flex; align-items: center; height: 26px; padding: 0 11px; border-radius: 999px; font-size: 12.5px; font-weight: 700; }
.tag-soon { background: var(--surface-3); color: var(--ink-3); }

.send-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; border-top: 1px solid var(--line); flex-wrap: wrap; }
.send-bar strong { color: var(--ink); }

.sec-title { font-size: 18px; font-weight: 700; color: var(--ink); margin: 0 0 14px; display: flex; align-items: center; gap: 9px; }
.sec-title.mt { margin-top: 30px; }
.count { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 999px; background: var(--blue-soft); color: var(--blue-ink); font-size: 13px; }

.grade { display: flex; flex-direction: column; gap: 16px; }
.grade-hint { margin: 0; font-size: 14px; color: var(--ink-2); }
.score-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
.total { display: flex; align-items: center; gap: 10px; font-size: 16px; color: var(--ink-2); padding: 12px 16px; border-radius: 13px; background: var(--surface-2); border: 1px solid var(--line); }
.total strong { font-size: 22px; color: var(--ink); }
.total .pill { margin-inline-start: auto; height: 28px; padding: 0 12px; display: inline-flex; align-items: center; border-radius: 999px; background: var(--err-soft); color: var(--err); font-size: 13px; font-weight: 700; }
.total.ok .pill { background: var(--green-soft); color: var(--green-ink); }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; }

@media (max-width: 620px) { .score-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
