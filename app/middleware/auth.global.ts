/**
 * حماية المسارات (§4.3) — تعمل على كل تنقّل.
 * المسارات العامّة: Landing، الدخول، صفحات auth. ما عداها يتطلّب جلسة.
 * - غير مسجّل يحاول دخول مسار محميّ → يُحوَّل إلى /login.
 * - مسجّل يفتح /login → يُحوَّل إلى /dashboard.
 * (الصلاحيات حسب الدور تُفرَض خادميّاً عبر RLS؛ هذه طبقة تجربة المستخدم.)
 */
const PUBLIC_PATHS = ['/', '/login']

export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()
  // /s/<token> صفحة اطّلاع الطالب العامّة (بلا حساب)
  const isPublic = PUBLIC_PATHS.includes(to.path) || to.path.startsWith('/auth') || to.path.startsWith('/s/')

  if (!user.value && !isPublic) {
    return navigateTo('/login')
  }
  if (user.value && to.path === '/login') {
    return navigateTo('/dashboard')
  }
})
