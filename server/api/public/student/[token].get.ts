import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * رابط اطّلاع الطالب (عام، بلا حساب) — يجلب الطالب بالـ view_token بصلاحية الخدمة
 * ويُرجِع حقولاً آمنة فقط (دون رقم الهوية/الجوالات/البريد — خصوصية).
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
    throw createError({ statusCode: 400, statusMessage: 'رمز غير صالح.' })
  }

  const admin = serverSupabaseServiceRole<Database>(event)
  const { data, error } = await admin
    .from('students')
    .select('full_name, status, quran_parts, tajweed_level, halaqa:halaqa_id(name, daily_time, teacher:teacher_id(full_name))')
    .eq('view_token', token)
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, statusMessage: 'الرابط غير صحيح أو لم يعد متاحاً.' })
  }
  return data
})
