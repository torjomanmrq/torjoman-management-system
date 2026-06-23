import type { Database } from '~/types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Role = Database['public']['Enums']['user_role']

/**
 * ملف المستخدم الحالي ودوره.
 * يُجلب على العميل (server:false) حيث الجلسة مضمونة. نقرأ المستخدم من
 * supabase.auth.getUser() داخل الجلب لتفادي سباق توقيت الـ ref التفاعلي.
 * watch على user يعيد الجلب عند تغيّر حالة المصادقة.
 * مصدر الدور لإظهار قوائم التنقّل وصلاحيات الواجهة (RLS يفرضها الخادم).
 */
export function useProfile() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  const { data: profile, refresh, pending } = useAsyncData<Profile | null>(
    'current-profile',
    async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', auth.user.id)
        .single()
      if (error) console.error('[useProfile] فشل جلب الملف:', error.message)
      return data
    },
    { server: false, watch: [user], default: () => null }
  )

  const role = computed<Role | null>(() => profile.value?.role ?? null)
  const status = computed(() => profile.value?.status ?? null)
  const fullName = computed(() => profile.value?.full_name ?? '')
  /** أول حرف من الاسم — بديل الصورة الرمزية. */
  const initial = computed(() => fullName.value.trim().charAt(0) || '؟')

  return { profile, role, status, fullName, initial, pending, fetchProfile: refresh }
}
