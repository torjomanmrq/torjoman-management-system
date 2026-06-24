/**
 * رحلة الطالب على خطة الاختبارات — حسب الحفظ (الأجزاء المثبتة)، لا الزمن.
 * يستحقّ المحطة عند بلوغ حدّها الأعلى (parts_to ≤ المثبتة)، وتُظهر نتيجتها إن وُجدت.
 */
export type PlanStage = 'partial' | 'cumulative'
export type PlanInput = { id: number, parts_from: number, parts_to: number, stage_type: PlanStage }
export type ResultInput = { exam_plan_id: number | null, passed: boolean | null }
export type StationResult = 'passed' | 'failed' | null
export type JourneyStation = {
  id: number
  from: number
  to: number
  stage: PlanStage
  reached: boolean
  isNext: boolean
  result: StationResult
}

export function buildJourney(
  quranParts: number | null | undefined,
  plan: PlanInput[],
  results: ResultInput[] = []
) {
  const parts = quranParts ?? 0
  const byPlan = new Map<number, StationResult>()
  for (const r of results) {
    if (r.exam_plan_id == null) continue
    // النجاح يَغلِب: إن وُجد اجتياز لا يُلغى برسوب لاحق
    const prev = byPlan.get(r.exam_plan_id)
    if (prev === 'passed') continue
    byPlan.set(r.exam_plan_id, r.passed ? 'passed' : 'failed')
  }

  const stations: JourneyStation[] = [...plan]
    .map(p => ({
      id: p.id,
      from: p.parts_from,
      to: p.parts_to,
      stage: p.stage_type,
      reached: parts >= p.parts_to,
      isNext: false,
      result: byPlan.get(p.id) ?? null
    }))
    .sort((a, b) => (a.to - b.to) || (a.stage === 'partial' ? -1 : 1))

  // المستحقّة القادمة: أوّل محطة بلغها ولم يجتزها بعد
  const nextIdx = stations.findIndex(s => s.reached && s.result !== 'passed')
  if (nextIdx >= 0) stations[nextIdx]!.isNext = true

  return {
    parts,
    stations,
    reachedCount: stations.filter(s => s.reached).length,
    passedCount: stations.filter(s => s.result === 'passed').length,
    totalStations: stations.length,
    nextStation: nextIdx >= 0 ? stations[nextIdx]! : null
  }
}

export const stageLabel = (s: PlanStage) => s === 'partial' ? 'مرحلي (3 أجزاء)' : 'تجميعي (5 أجزاء)'

/** «منذ الالتحاق» نصّاً عربيّاً مبسّطاً. */
export function sinceLabel(date: string | null | undefined): string {
  if (!date) return '—'
  const months = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / (30.4 * 24 * 3600 * 1000)))
  if (months < 1) return 'أقل من شهر'
  if (months < 12) return `${months} شهر`
  const y = Math.floor(months / 12)
  const m = months % 12
  return m ? `${y} سنة و${m} شهر` : `${y} سنة`
}
