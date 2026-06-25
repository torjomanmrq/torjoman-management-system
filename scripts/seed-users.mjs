/**
 * بذرة 20 مستخدماً تجريبيّاً (test1..test20) عبر Admin REST API.
 * يُنشئ حساب Auth (بريد مؤكَّد + الكلمة الافتراضية) ثم يضبط الملف بدور موزّع.
 * التشغيل: node --env-file=.env scripts/seed-users.mjs
 */
const URL = process.env.SUPABASE_URL
const KEY = process.env.NUXT_SUPABASE_SECRET_KEY
const PASSWORD = 'Turjuman@2026'

if (!URL || !KEY) {
  console.error('✗ مفاتيح ناقصة: SUPABASE_URL أو NUXT_SUPABASE_SECRET_KEY')
  process.exit(1)
}

// توزيع الأدوار على 20: مدير 1 · جودة 2 · مشرف 4 · معلّم 13
const roleFor = i => i === 1 ? 'manager' : i <= 3 ? 'quality' : i <= 7 ? 'supervisor' : 'teacher'

const h = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function createAuthUser(email, fullName) {
  const r = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } })
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.msg || j.error_description || j.error || JSON.stringify(j))
  return j.id
}

async function upsertProfile(id, fullName, email, role) {
  const r = await fetch(`${URL}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id, full_name: fullName, email, role, status: 'active', must_change_password: true })
  })
  if (!r.ok) throw new Error(await r.text())
}

const counts = {}
let ok = 0
for (let i = 1; i <= 20; i++) {
  const email = `test${i}@test.com`
  const fullName = `test${i}`
  const role = roleFor(i)
  try {
    const id = await createAuthUser(email, fullName)
    await upsertProfile(id, fullName, email, role)
    counts[role] = (counts[role] || 0) + 1
    ok++
    console.log(`✓ ${fullName} (${role})`)
  } catch (e) {
    console.log(`✗ ${fullName}: ${e.message}`)
  }
}
console.log(`\nتمّ: ${ok}/20`, counts)
