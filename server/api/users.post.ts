import { requireManager } from '../utils/supabaseAdmin'
import type { Database } from '~/types/database.types'

type Role = Database['public']['Enums']['user_role']
const ALLOWED_ROLES: Role[] = ['manager', 'quality', 'supervisor', 'teacher']

/**
 * إنشاء حساب مستخدم عامل (مدير فقط).
 * ينشئ حساب المصادقة بصلاحية الخدمة (مؤكَّد البريد) ثم يضبط ملفه في profiles.
 */
export default defineEventHandler(async (event) => {
  const { admin, user } = await requireManager(event)
  const body = await readBody<{ full_name?: string, email?: string, password?: string, role?: Role, phone?: string }>(event)

  const fullName = body.full_name?.trim()
  const email = body.email?.trim().toLowerCase()
  const password = body.password ?? ''
  const role = body.role
  const phone = body.phone?.trim() || null

  if (!fullName) throw createError({ statusCode: 400, statusMessage: 'الاسم الكامل مطلوب.' })
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw createError({ statusCode: 400, statusMessage: 'بريد إلكتروني غير صحيح.' })
  if (password.length < 8) throw createError({ statusCode: 400, statusMessage: 'كلمة المرور 8 أحرف على الأقل.' })
  if (!role || !ALLOWED_ROLES.includes(role)) throw createError({ statusCode: 400, statusMessage: 'الدور غير صالح.' })

  // 1) إنشاء حساب المصادقة (مؤكَّد البريد مباشرةً)
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName }
  })
  if (authErr || !created.user) {
    const msg = /already|exists|registered/i.test(authErr?.message ?? '')
      ? 'هذا البريد مسجّل مسبقاً.'
      : (authErr?.message ?? 'تعذّر إنشاء الحساب.')
    throw createError({ statusCode: 400, statusMessage: msg })
  }

  // 2) ضبط الملف (upsert تحسّباً لأي trigger أنشأ صفّاً مبدئيّاً)
  const { error: profErr } = await admin.from('profiles').upsert({
    id: created.user.id,
    full_name: fullName,
    email,
    role,
    phone,
    status: 'active',
    assigned_by: user.id
  }, { onConflict: 'id' })

  if (profErr) {
    // تراجُع: احذف حساب المصادقة حتى لا يبقى يتيماً بلا ملف
    await admin.auth.admin.deleteUser(created.user.id)
    throw createError({ statusCode: 500, statusMessage: `تعذّر حفظ الملف: ${profErr.message}` })
  }

  return { id: created.user.id, full_name: fullName, email, role, status: 'active' }
})
