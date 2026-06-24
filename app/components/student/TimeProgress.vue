<script setup lang="ts">
/**
 * مؤشّر التقدّم الزمني للطالب (§4.18) — يقارن حفظه الفعلي بالمتوقّع زمنيّاً منذ
 * الالتحاق (المتوقّع = الأشهر × الهدف الشهري). يعرض: متقدّم / في المسار / متأخّر.
 * ملاحظة v1: لا يخصم أيام الغياب بعذر من الزمن المتوقّع (تحسين لاحق).
 */
const props = defineProps<{
  enrollmentDate?: string | null
  memorizationPages?: number | null
  targetPerMonth?: number | null
}>()

const assessment = computed(() => {
  const target = props.targetPerMonth ?? 0
  const actual = props.memorizationPages ?? 0
  if (!props.enrollmentDate || target <= 0 || actual <= 0) return null

  const elapsedMs = Date.now() - new Date(props.enrollmentDate).getTime()
  const months = Math.max(1, elapsedMs / (30 * 24 * 3600 * 1000))
  const expected = months * target
  if (expected <= 0) return null

  const ratio = actual / expected
  let status: 'ahead' | 'onTrack' | 'behind'
  if (ratio >= 1.05) status = 'ahead'
  else if (ratio >= 0.85) status = 'onTrack'
  else status = 'behind'

  return { status, actual, expected: Math.round(expected) }
})

const META: Record<string, { label: string, color: string, icon: string }> = {
  ahead: { label: 'متقدّم', color: 'ahead', icon: 'i-lucide-trending-up' },
  onTrack: { label: 'في المسار', color: 'ontrack', icon: 'i-lucide-check' },
  behind: { label: 'متأخّر', color: 'behind', icon: 'i-lucide-trending-down' }
}
</script>

<template>
  <div
    v-if="assessment"
    class="tp"
    :class="META[assessment.status]!.color"
  >
    <UIcon
      :name="META[assessment.status]!.icon"
      class="size-4"
    />
    <span class="tp-label">التقدّم الزمني: {{ META[assessment.status]!.label }}</span>
    <span class="tp-detail">({{ assessment.actual }} من ~{{ assessment.expected }} صفحة متوقّعة)</span>
  </div>
</template>

<style scoped>
.tp { display: inline-flex; align-items: center; gap: 7px; flex-wrap: wrap; padding: 8px 13px; border-radius: 999px; font-size: 13.5px; font-weight: 600; }
.tp-detail { font-weight: 400; opacity: .85; }
.ahead { background: var(--green-soft); color: var(--green-ink); }
.ontrack { background: var(--blue-soft); color: var(--blue-ink); }
.behind { background: var(--err-soft); color: var(--err); }
</style>
