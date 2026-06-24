import type { Database } from '~/types/database.types'

/**
 * حساب درجات الطلاب وإنجاز الحلقة والتقدير (§4.24) — منطق نقيّ معزول عن الواجهة.
 * الدوال النقيّة مُصدَّرة للاستخدام والاختبار، و useGrades() يجلب الثوابت من app_settings.
 */
export type GradeSettings = { target: number, points: number, attendanceDays: number }
export type StudentGradeInput = {
  memoPages: number // صفحات الحفظ (إلى − من)
  reviewPages: number // صفحات المراجعة
  absenceUnexcused: number // الغياب بدون عذر
  points: number // النقاط المحصّلة
}
export type StudentGrade = { academic: number, regularity: number, points: number, total: number }

const round = (n: number) => Math.round(n)
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** درجة الطالب من 100 = أكاديمي×0.6 + انتظام×0.2 + نقاط×0.2. */
export function computeStudentGrade(s: StudentGradeInput, cfg: GradeSettings): StudentGrade {
  const memoRatio = cfg.target > 0 ? clamp01(s.memoPages / cfg.target) : 0
  const reviewRatio = s.memoPages > 0 ? clamp01(s.reviewPages / s.memoPages) : 0
  const academic = (memoRatio + reviewRatio) / 2 * 100
  const regularity = cfg.attendanceDays > 0
    ? clamp01((cfg.attendanceDays - s.absenceUnexcused) / cfg.attendanceDays) * 100
    : 0
  const pts = cfg.points > 0 ? clamp01(s.points / cfg.points) * 100 : 0
  const total = academic * 0.6 + regularity * 0.2 + pts * 0.2
  return { academic: round(academic), regularity: round(regularity), points: round(pts), total: round(total) }
}

/** إنجاز الحلقة = متوسط درجات الطلاب×0.8 + نسبة الأنشطة المنفّذة×0.2. */
export function computeHalqaAchievement(studentTotals: number[], activitiesPct: number): number {
  const avg = studentTotals.length ? studentTotals.reduce((a, b) => a + b, 0) / studentTotals.length : 0
  return round(avg * 0.8 + activitiesPct * 0.2)
}

/** التقدير اللفظي حسب العتبات. */
export function gradeLabel(score: number): string {
  if (score >= 90) return 'ممتاز'
  if (score >= 80) return 'جيد جداً'
  if (score >= 70) return 'جيد'
  if (score >= 60) return 'مقبول'
  return 'ضعيف'
}

/** لون شارة الإنجاز. */
export function achievementColor(score: number): 'success' | 'info' | 'error' {
  if (score >= 85) return 'success'
  if (score >= 70) return 'info'
  return 'error'
}

export function useGrades() {
  const supabase = useSupabaseClient<Database>()
  const settings = ref<GradeSettings>({ target: 30, points: 100, attendanceDays: 26 })

  async function loadSettings() {
    const { data } = await supabase.from('app_settings')
      .select('target_memorization_pages, default_points, default_attendance_days').eq('id', 1).single()
    if (data) {
      settings.value = {
        target: data.target_memorization_pages,
        points: data.default_points,
        attendanceDays: data.default_attendance_days ?? 26
      }
    }
  }

  return { settings, loadSettings, computeStudentGrade, computeHalqaAchievement, gradeLabel, achievementColor }
}
