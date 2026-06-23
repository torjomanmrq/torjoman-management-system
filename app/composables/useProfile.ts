import type { Database } from '~/types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Role = Database['public']['Enums']['user_role']

/**
 * ملف المستخدم الحالي ودوره — يُقرأ مرة ويُخزَّن في حالة مشتركة (useState).
 * مصدر الدور لإظهار قوائم التنقّل وصلاحيات الواجهة (RLS يفرضها الخادم).
 */
export function useProfile() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const profile = useState<Profile | null>('profile', () => null)

  /** يجلب ملف المستخدم الحالي من جدول profiles (مرة واحدة، إلا إذا أُجبر التحديث). */
  async function fetchProfile(force = false) {
    if (!user.value) {
      profile.value = null
      return null
    }
    if (profile.value && !force) return profile.value
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.value.id)
      .single()
    profile.value = data
    return data
  }

  const role = computed<Role | null>(() => profile.value?.role ?? null)
  const fullName = computed(() => profile.value?.full_name ?? '')
  /** أول حرف من الاسم — بديل الصورة الرمزية. */
  const initial = computed(() => fullName.value.trim().charAt(0) || '؟')

  return { profile, role, fullName, initial, fetchProfile }
}
