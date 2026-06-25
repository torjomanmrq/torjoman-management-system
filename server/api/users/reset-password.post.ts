import { requireManager } from '../../utils/supabaseAdmin'
import type { Database } from '~/types/database.types'

/**
 * إعادة تعيين كلمة مرور عامل (طارئة) — المدير فقط (§4.12).
 * يضبط كلمة جديدة بصلاحية الخدمة ويرفع علَم must_change_password ليغيّرها العامل.
 */
export default defineEventHandler(async (event) => {
  const { admin } = await requireManager(event)
  const body = await readBody<{ user_id?: string, password?: string }>(event)

  const userId = body.user_id?.trim()
  const password = body.password ?? ''

  if (!userId) throw createError({ statusCode: 400, statusMessage: 'معرّف المستخدم مطلوب.' })
  if (password.length < 8) throw createError({ statusCode: 400, statusMessage: 'كلمة المرور 8 أحرف على الأقل.' })

  const { error: authErr } = await admin.auth.admin.updateUserById(userId, { password })
  if (authErr) throw createError({ statusCode: 400, statusMessage: authErr.message || 'تعذّرت إعادة التعيين.' })

  const { error: profErr } = await admin.from('profiles')
    .update({ must_change_password: true } as Database['public']['Tables']['profiles']['Update'])
    .eq('id', userId)
  if (profErr) throw createError({ statusCode: 500, statusMessage: profErr.message })

  return { ok: true }
})
