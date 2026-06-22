/**
 * المصادقة — غلاف مُنمّط حول Supabase Auth.
 * الدخول للعاملين بالبريد فقط (الطالب ليس مستخدماً — لا دخول).
 * يعرّض المستخدم الحالي ودوالّ الدخول/الخروج/استعادة كلمة المرور.
 */
export function useAuth() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  /** دخول بالبريد وكلمة المرور. يرمي الخطأ ليلتقطه المستدعي عبر useErrorHandler. */
  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  /** تسجيل الخروج ثم العودة لشاشة الدخول. */
  async function signOut() {
    await supabase.auth.signOut()
    await navigateTo('/login')
  }

  /** إرسال رابط استعادة كلمة المرور إلى البريد (استرجاع ذاتي — §4.1). */
  async function sendPasswordReset(email: string) {
    const redirectTo = import.meta.client ? `${window.location.origin}/auth/confirm` : undefined
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) throw error
  }

  return { user, signIn, signOut, sendPasswordReset }
}
