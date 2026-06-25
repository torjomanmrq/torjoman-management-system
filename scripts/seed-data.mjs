/**
 * بذر بيانات مترابطة للتجريب (idempotent):
 *  - ربط المشرفين بمشرفي الجودة (quality_supervisor_id).
 *  - 3 حلقات مُسندة لمعلّمين ومشرف.
 *  - طلاب لكل حلقة بأجزاء وتواريخ التحاق متنوّعة.
 *  - تخصيص حوافز للشهر الحالي لكل حلقة (معتمد).
 * يفترض تشغيل seed-users.mjs أولاً. التشغيل: node --env-file=.env scripts/seed-data.mjs
 */
const URL = process.env.SUPABASE_URL
const KEY = process.env.NUXT_SUPABASE_SECRET_KEY
if (!URL || !KEY) {
  console.error('✗ مفاتيح ناقصة')
  process.exit(1)
}

const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const api = path => `${URL}/rest/v1/${path}`
const get = async (path) => {
  const r = await fetch(api(path), { headers: H })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}
const post = async (path, body, prefer = 'return=representation') => {
  const r = await fetch(api(path), { method: 'POST', headers: { ...H, Prefer: prefer }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(await r.text())
  return prefer.includes('representation') ? r.json() : null
}
const patch = async (path, body) => {
  const r = await fetch(api(path), { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(await r.text())
}

// 1) خريطة المستخدمين التجريبيين
const profiles = await get('profiles?select=id,email,role&email=like.test*%40test.com')
const byEmail = Object.fromEntries(profiles.map(p => [p.email, p]))
const id = n => byEmail[`test${n}@test.com`]?.id
const manager = id(1)
if (!manager) {
  console.error('✗ لم يُعثر على المستخدمين التجريبيين — شغّل seed-users.mjs أولاً')
  process.exit(1)
}

// 2) ربط المشرفين بمشرفي الجودة
const qLinks = [[4, 2], [5, 2], [6, 3], [7, 3]]
for (const [sup, qual] of qLinks) {
  if (id(sup) && id(qual)) await patch(`profiles?id=eq.${id(sup)}`, { quality_supervisor_id: id(qual) })
}
console.log('✓ رُبط المشرفون بمشرفي الجودة')

// 3) الحلقات (idempotent بالاسم)
const existing = await get('halaqat?select=id,name')
const haveName = new Set(existing.map(h => h.name))
const plan = [
  { name: 'حلقة الإيمان', teacher: 8, supervisor: 4 },
  { name: 'حلقة الإحسان', teacher: 9, supervisor: 4 },
  { name: 'حلقة الفرقان', teacher: 10, supervisor: 5 }
]
const halqaId = {}
for (const h of plan) {
  if (haveName.has(h.name)) {
    const found = existing.find(x => x.name === h.name)
    halqaId[h.name] = found.id
    console.log(`• الحلقة موجودة: ${h.name}`)
    continue
  }
  const [row] = await post('halaqat', [{
    name: h.name, teacher_id: id(h.teacher), supervisor_id: id(h.supervisor),
    gender: 'male', daily_time: '16:00:00', status: 'active', assigned_by: manager
  }])
  halqaId[h.name] = row.id
  console.log(`✓ أُنشئت الحلقة: ${h.name}`)
}

// 4) الطلاب لكل حلقة (إن لم يكن للحلقة طلاب)
const names = ['أحمد', 'محمد', 'يوسف', 'إبراهيم', 'عبدالله', 'خالد', 'عمر', 'سلمان']
const parts = [3, 7, 11, 16, 22]
const enroll = ['2025-02-01', '2025-04-15', '2024-11-10', '2025-06-01', '2024-09-20']
let studentsAdded = 0
for (const h of plan) {
  const hid = halqaId[h.name]
  const cur = await get(`students?select=id&halaqa_id=eq.${hid}`)
  if (cur.length) {
    console.log(`• للحلقة ${h.name} طلاب مسبقاً (${cur.length})`)
    continue
  }
  const batch = names.slice(0, 5).map((nm, i) => ({
    full_name: `${nm} (${h.name})`, halaqa_id: hid, gender: 'male',
    quran_parts: parts[i], enrollment_date: enroll[i], status: 'active'
  }))
  await post('students', batch, 'return=minimal')
  studentsAdded += batch.length
  console.log(`✓ أُضيف 5 طلاب لـ${h.name}`)
}

// 5) تخصيص حوافز الشهر الحالي (معتمد) لكل حلقة
const now = new Date()
const m = now.getMonth() + 1
const y = now.getFullYear()
const amounts = { 'حلقة الإيمان': 500, 'حلقة الإحسان': 400, 'حلقة الفرقان': 600 }
for (const h of plan) {
  const hid = halqaId[h.name]
  const ex = await get(`halaqa_incentives?select=id&halaqa_id=eq.${hid}&incentive_month=eq.${m}&incentive_year=eq.${y}`)
  if (ex.length) {
    console.log(`• تخصيص ${h.name} موجود`)
    continue
  }
  await post('halaqa_incentives', [{
    halaqa_id: hid, incentive_month: m, incentive_year: y, allocated_amount: amounts[h.name],
    approved: true, approved_by: manager
  }], 'return=minimal')
  console.log(`✓ خُصّص ${amounts[h.name]}₪ لـ${h.name} (${m}/${y})`)
}

console.log(`\nتمّ ✓ — حلقات: ${plan.length} · طلاب جدد: ${studentsAdded}`)
