import type { Database } from '~/types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Role = Database['public']['Enums']['user_role']

/**
 * ملف المستخدم الحالي ودوره.
 * يُجلب عبر useAsyncData مع watch على user — فيُعاد الجلب تلقائيّاً عند جهوزية
 * الجلسة على العميل (يتفادى بقاء البيانات فارغة بعد ترطيب SSR).
 * مصدر الدور لإظهار قوائم التنقّل وصلاحيات الواجهة (RLS يفرضها الخادم).
 */
export function useProfile() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  const { data: profile, refresh, pending } = useAsyncData<Profile | null>(
    'current-profile',
    async () => {
      if (!user.value) return null
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.value.id)
        .single()
      return data
    },
    { watch: [user], default: () => null }
  )

  const role = computed<Role | null>(() => profile.value?.role ?? null)
  const fullName = computed(() => profile.value?.full_name ?? '')
  /** أول حرف من الاسم — بديل الصورة الرمزية. */
  const initial = computed(() => fullName.value.trim().charAt(0) || '؟')

  return { profile, role, fullName, initial, pending, fetchProfile: refresh }
}
