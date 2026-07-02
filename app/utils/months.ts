/**
 * أسماء الأشهر العربية — مصدر وحيد بدل نسخها في كل شاشة.
 * يُستورد تلقائياً (Nuxt auto-imports من app/utils).
 */
export const MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

/** عناصر UiSelect للأشهر (value: 1–12). */
export const monthItems = MONTH_NAMES.map((m, i) => ({ label: m, value: i + 1 }))

/** اسم الشهر من رقمه (1–12). */
export const monthName = (m: number) => MONTH_NAMES[m - 1] ?? ''
