/**
 * رحلة الطالب على خطة الاختبارات — حسب الحفظ (الأجزاء المثبتة)، لا الزمن.
 * كل محطة يستحقّها الطالب عند بلوغ حدّها الأعلى من الأجزاء (parts_to ≤ المثبتة).
 */
export type PlanStage = 'partial' | 'cumulative'
export type PlanInput = { parts_from: number, parts_to: number, stage_type: PlanStage }
export type JourneyStation = {
  from: number
  to: number
  stage: PlanStage
  reached: boolean
  isNext: boolean
}

export function buildJourney(quranParts: number | null | undefined, plan: PlanInput[]) {
  const parts = quranParts ?? 0
  const stations: JourneyStation[] = [...plan]
    .map(p => ({ from: p.parts_from, to: p.parts_to, stage: p.stage_type, reached: parts >= p.parts_to, isNext: false }))
    .sort((a, b) => (a.to - b.to) || (a.stage === 'partial' ? -1 : 1))

  const nextIdx = stations.findIndex(s => !s.reached)
  if (nextIdx >= 0) stations[nextIdx]!.isNext = true

  return {
    parts,
    stations,
    reachedCount: stations.filter(s => s.reached).length,
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
