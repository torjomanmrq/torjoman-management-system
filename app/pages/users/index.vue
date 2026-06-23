<script setup lang="ts">
/**
 * إدارة المستخدمين (§4.12) — للمدير فقط.
 * قائمة العاملين + تصفية بالدور + إنشاء حساب (عبر مسار خادمي بصلاحية الخدمة)
 * + تفعيل/تعطيل الحساب. الطالب ليس مستخدماً فلا يظهر هنا.
 */
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'إدارة المستخدمين — ترجمان' })

type Role = Database['public']['Enums']['user_role']
type ProfileRow = Database['public']['Tables']['profiles']['Row']
type UserRow = ProfileRow & { assigner: { full_name: string } | null }

const supabase = useSupabaseClient<Database>()
const { role: myRole } = useProfile()
const { handle } = useErrorHandler()
const toast = useToast()

const isManager = computed(() => myRole.value === 'manager')

const ROLE_LABEL: Record<Role, string> = {
  manager: 'المدير', quality: 'مشرف الجودة', supervisor: 'المشرف', teacher: 'المعلم'
}
const ROLE_COLOR: Record<Role, 'primary' | 'secondary' | 'info' | 'success'> = {
  manager: 'primary', quality: 'secondary', supervisor: 'info', teacher: 'success'
}

// ── جلب القائمة (عميل — RLS يسمح بقراءة الملفات) ──
const { data: users, refresh, pending } = await useAsyncData<UserRow[]>(
  'users-list',
  async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, assigner:assigned_by(full_name)')
      .order('created_at', { ascending: false })
      .returns<UserRow[]>()
    if (error) {
      console.error('[users] فشل الجلب:', error.message)
      return []
    }
    return data ?? []
  },
  { server: false, default: () => [] }
)

// ── التصفية بالدور ──
const filter = ref<Role | 'all'>('all')
const chips: { key: Role | 'all', label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'manager', label: 'المديرون' },
  { key: 'quality', label: 'الجودة' },
  { key: 'supervisor', label: 'المشرفون' },
  { key: 'teacher', label: 'المعلمون' }
]
const filteredUsers = computed(() => {
  const list = users.value ?? []
  return filter.value === 'all' ? list : list.filter(u => u.role === filter.value)
})
function countFor(key: Role | 'all') {
  const list = users.value ?? []
  return key === 'all' ? list.length : list.filter(u => u.role === key).length
}

function initialOf(name: string) {
  return name.trim().charAt(0) || '؟'
}

// ── إنشاء مستخدم ──
const modalOpen = ref(false)
const creating = ref(false)
const form = reactive({ full_name: '', email: '', password: '', role: 'teacher' as Role, phone: '' })
const roleItems = [
  { label: 'معلم', value: 'teacher' },
  { label: 'مشرف ميداني', value: 'supervisor' },
  { label: 'مشرف جودة', value: 'quality' },
  { label: 'مدير', value: 'manager' }
]

function openCreate() {
  form.full_name = ''
  form.email = ''
  form.password = ''
  form.role = 'teacher'
  form.phone = ''
  modalOpen.value = true
}

function validate(s: typeof form) {
  const errors: { name: string, message: string }[] = []
  if (!s.full_name.trim()) errors.push({ name: 'full_name', message: 'الاسم الكامل مطلوب.' })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)) errors.push({ name: 'email', message: 'بريد إلكتروني غير صحيح.' })
  if (s.password.length < 8) errors.push({ name: 'password', message: 'كلمة المرور 8 أحرف على الأقل.' })
  return errors
}

async function submitCreate() {
  creating.value = true
  try {
    const created = await $fetch('/api/users', { method: 'POST', body: { ...form } })
    toast.add({ title: `تم إنشاء حساب «${created.full_name}».`, color: 'success', icon: 'i-lucide-circle-check' })
    modalOpen.value = false
    await refresh()
  } catch (err) {
    const msg = (err as { statusMessage?: string, data?: { statusMessage?: string } })?.data?.statusMessage
      || (err as { statusMessage?: string })?.statusMessage
    toast.add({ title: msg || 'تعذّر إنشاء الحساب.', color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    creating.value = false
  }
}

// ── تفعيل/تعطيل ──
const togglingId = ref<string | null>(null)
async function toggleStatus(u: UserRow) {
  const next = u.status === 'disabled' ? 'active' : 'disabled'
  togglingId.value = u.id
  try {
    const { error } = await supabase.from('profiles').update({ status: next }).eq('id', u.id)
    if (error) throw error
    toast.add({ title: next === 'active' ? 'تم تفعيل الحساب.' : 'تم تعطيل الحساب.', color: next === 'active' ? 'success' : 'neutral', icon: next === 'active' ? 'i-lucide-circle-check' : 'i-lucide-ban' })
    await refresh()
  } catch (err) {
    handle(err)
  } finally {
    togglingId.value = null
  }
}

const STATUS_META: Record<string, { label: string, color: 'success' | 'warning' | 'neutral' }> = {
  active: { label: 'نشط', color: 'success' },
  pending: { label: 'بانتظار التفعيل', color: 'warning' },
  disabled: { label: 'معطّل', color: 'neutral' }
}
</script>

<template>
  <div class="users">
    <div
      v-if="!isManager"
      class="card forbidden"
    >
      <UIcon
        name="i-lucide-lock"
        class="size-8"
      />
      <p>هذه الصفحة للمدير فقط.</p>
    </div>

    <template v-else>
      <!-- رأس -->
      <div class="head">
        <div>
          <h2>إدارة المستخدمين</h2>
          <p>{{ (users || []).length }} مستخدم في المنظومة — الحسابات تُنشأ من قِبل الإدارة فقط.</p>
        </div>
        <UButton
          label="إنشاء مستخدم"
          color="primary"
          size="lg"
          icon="i-lucide-plus"
          :ui="{ base: 'rounded-[13px] font-semibold' }"
          @click="openCreate"
        />
      </div>

      <!-- شرائح التصفية -->
      <div class="chips">
        <button
          v-for="c in chips"
          :key="c.key"
          class="chip"
          :class="{ on: filter === c.key }"
          @click="filter = c.key"
        >
          {{ c.label }}
          <span class="chip-n">{{ countFor(c.key) }}</span>
        </button>
      </div>

      <!-- القائمة -->
      <div
        v-if="pending"
        class="card empty"
      >
        جارٍ التحميل…
      </div>
      <div
        v-else-if="filteredUsers.length === 0"
        class="card empty"
      >
        <UIcon
          name="i-lucide-users"
          class="size-8"
        />
        <h3>لا مستخدمون في هذا التصنيف</h3>
        <p>جرّب تصنيفاً آخر، أو أنشئ مستخدماً جديداً.</p>
      </div>
      <div
        v-else
        class="card table-wrap"
      >
        <table>
          <thead>
            <tr>
              <th class="ta-start">
                المستخدم
              </th>
              <th class="ta-start">
                الدور
              </th>
              <th class="ta-start">
                عيّنه
              </th>
              <th class="ta-start">
                الحالة
              </th>
              <th class="ta-end">
                إجراءات
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="u in filteredUsers"
              :key="u.id"
            >
              <td>
                <div class="user-cell">
                  <div class="av">
                    {{ initialOf(u.full_name) }}
                  </div>
                  <div class="user-info">
                    <div class="u-name">
                      {{ u.full_name }}
                    </div>
                    <div
                      class="u-email"
                      dir="ltr"
                    >
                      {{ u.email }}
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <UBadge
                  :label="ROLE_LABEL[u.role]"
                  :color="ROLE_COLOR[u.role]"
                  variant="soft"
                />
              </td>
              <td class="muted">
                {{ u.assigner?.full_name || '—' }}
              </td>
              <td>
                <UBadge
                  :label="STATUS_META[u.status]?.label"
                  :color="STATUS_META[u.status]?.color"
                  variant="soft"
                />
              </td>
              <td>
                <div class="actions">
                  <UButton
                    :label="u.status === 'disabled' ? 'تفعيل' : 'تعطيل'"
                    :color="u.status === 'disabled' ? 'success' : 'neutral'"
                    variant="outline"
                    size="sm"
                    :icon="u.status === 'disabled' ? 'i-lucide-power' : 'i-lucide-ban'"
                    :loading="togglingId === u.id"
                    :disabled="u.id === undefined"
                    :ui="{ base: 'rounded-[10px]' }"
                    @click="toggleStatus(u)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- نافذة الإنشاء -->
    <UModal
      v-model:open="modalOpen"
      title="إنشاء مستخدم جديد"
    >
      <template #body>
        <UForm
          :state="form"
          :validate="validate"
          class="form"
          @submit="submitCreate"
        >
          <UFormField
            label="الاسم الكامل"
            name="full_name"
          >
            <UInput
              v-model="form.full_name"
              size="lg"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>
          <UFormField
            label="البريد الإلكتروني"
            name="email"
          >
            <UInput
              v-model="form.email"
              type="email"
              dir="ltr"
              icon="i-lucide-mail"
              size="lg"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>
          <UFormField
            label="كلمة المرور المبدئية"
            name="password"
            hint="8 أحرف على الأقل"
          >
            <UInput
              v-model="form.password"
              type="text"
              dir="ltr"
              icon="i-lucide-key-round"
              size="lg"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>
          <div class="row">
            <UFormField
              label="الدور"
              name="role"
              class="flex-1"
            >
              <USelect
                v-model="form.role"
                :items="roleItems"
                size="lg"
                class="w-full"
                :ui="{ base: 'rounded-[13px]' }"
              />
            </UFormField>
            <UFormField
              label="الهاتف (اختياري)"
              name="phone"
              class="flex-1"
            >
              <UInput
                v-model="form.phone"
                dir="ltr"
                size="lg"
                class="w-full"
                :ui="{ base: 'rounded-[13px]' }"
              />
            </UFormField>
          </div>
          <div class="form-actions">
            <UButton
              label="إلغاء"
              color="neutral"
              variant="ghost"
              size="lg"
              :ui="{ base: 'rounded-[13px]' }"
              @click="modalOpen = false"
            />
            <UButton
              type="submit"
              label="إنشاء الحساب"
              color="primary"
              size="lg"
              :loading="creating"
              :ui="{ base: 'rounded-[13px] font-semibold' }"
            />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.users { max-width: 1280px; margin: 0 auto; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: var(--shadow); }

.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
.head h2 { margin: 0; font-size: 26px; font-weight: 700; color: var(--ink); }
.head p { margin: 8px 0 0; font-size: 16px; color: var(--ink-2); font-weight: 300; }

.chips { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
.chip { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line-2); color: var(--ink-2); font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; transition: all .15s; }
.chip:hover { background: var(--surface-2); }
.chip.on { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.chip-n { font-size: 12px; opacity: .8; background: rgba(0, 0, 0, .08); border-radius: 999px; padding: 1px 7px; }
.chip.on .chip-n { background: rgba(255, 255, 255, .22); }

.empty { padding: 56px 24px; text-align: center; color: var(--ink-2); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty h3 { margin: 6px 0 0; font-size: 19px; font-weight: 700; color: var(--ink); }
.empty p { margin: 0; font-size: 15px; font-weight: 300; }

.table-wrap { overflow: hidden; }
.table-wrap table { width: 100%; border-collapse: collapse; font-size: 15px; }
.table-wrap thead tr { background: var(--surface-2); }
.table-wrap th { padding: 14px 20px; font-weight: 600; color: var(--ink-3); font-size: 13px; white-space: nowrap; }
.ta-start { text-align: start; }
.ta-end { text-align: end; }
.table-wrap tbody tr { border-top: 1px solid var(--line); }
.table-wrap td { padding: 14px 20px; vertical-align: middle; }
.muted { color: var(--ink-2); white-space: nowrap; }
.user-cell { display: flex; align-items: center; gap: 11px; }
.av { width: 40px; height: 40px; border-radius: 11px; background: var(--navy); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; flex: none; }
.u-name { font-weight: 600; color: var(--ink); }
.u-email { font-size: 13px; color: var(--ink-3); }
.actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }

.form { display: flex; flex-direction: column; gap: 16px; }
.row { display: flex; gap: 14px; flex-wrap: wrap; }
.row > * { flex: 1; min-width: 160px; }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }

@media (max-width: 620px) { .u-email { display: none; } }
</style>
