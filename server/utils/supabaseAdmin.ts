import type { H3Event } from 'h3'
import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * يتأكّد أن صاحب الطلب مسجّل ودوره «مدير»، وإلا يرفع خطأ 401/403.
 * يعيد عميل الخدمة (service_role — يتجاوز RLS) لاستخدامه في العمليات الإدارية.
 * عميل الخدمة خادمي فقط ولا يُستورَد في كود العميل أبداً.
 */
export async function requireManager(event: H3Event) {
  const client = await serverSupabaseClient<Database>(event)
  const { data: { user } } = await client.auth.getUser()
  if (!user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'يلزم تسجيل الدخول.' })
  }
  const admin = serverSupabaseServiceRole<Database>(event)
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'manager') {
    throw createError({ statusCode: 403, statusMessage: 'هذه العملية للمدير فقط.' })
  }
  return { admin, user }
}
