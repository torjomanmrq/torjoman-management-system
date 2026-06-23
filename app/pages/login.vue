<script setup lang="ts">
/**
 * شاشة تسجيل الدخول (§4.1) — للعاملين بالبريد فقط (الطالب لا يدخل النظام).
 * مبنيّة بمكوّنات Nuxt UI (UForm/UInput/UButton/UModal) + تخطيط مخصّص للوحَين.
 * التسجيل مغلق — الحسابات تُنشأ من الإدارة. استعادة كلمة المرور ذاتية عبر البريد.
 */
definePageMeta({ layout: false })

const { user, signIn, sendPasswordReset } = useAuth()
const { handle } = useErrorHandler()
const toast = useToast()

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

useSeoMeta({
  title: 'تسجيل الدخول — ترجمان',
  description: 'سجّل دخولك للوصول إلى لوحتك في منصّة ترجمان القرآني.'
})

// لو كان المستخدم مسجّلاً مسبقاً، انتقل للوحة مباشرةً
onMounted(() => {
  if (user.value) navigateTo('/dashboard')
})

const state = reactive({ email: '', password: '' })
const showPassword = ref(false)
const loading = ref(false)

function validate(s: typeof state) {
  const errors: { name: string, message: string }[] = []
  if (!s.email) errors.push({ name: 'email', message: 'البريد الإلكتروني مطلوب.' })
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)) errors.push({ name: 'email', message: 'صيغة البريد الإلكتروني غير صحيحة.' })
  if (!s.password) errors.push({ name: 'password', message: 'كلمة المرور مطلوبة.' })
  return errors
}

async function onSubmit() {
  loading.value = true
  try {
    await signIn(state.email, state.password)
    await navigateTo('/dashboard')
  } catch (err) {
    handle(err)
  } finally {
    loading.value = false
  }
}

// استعادة كلمة المرور (نافذة)
const forgotOpen = ref(false)
const forgotEmail = ref('')
const forgotSent = ref(false)
const forgotLoading = ref(false)

async function sendReset() {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(forgotEmail.value)) {
    toast.add({ title: 'أدخل بريداً إلكترونيّاً صحيحاً.', color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  forgotLoading.value = true
  try {
    await sendPasswordReset(forgotEmail.value)
    forgotSent.value = true
  } catch (err) {
    handle(err)
  } finally {
    forgotLoading.value = false
  }
}

function openForgot() {
  forgotEmail.value = state.email
  forgotSent.value = false
  forgotOpen.value = true
}
</script>

<template>
  <div class="login">
    <!-- FORM SIDE -->
    <div class="form-side">
      <UButton
        :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
        color="neutral"
        variant="subtle"
        size="lg"
        square
        class="theme-toggle"
        aria-label="تبديل الوضع"
        :ui="{ base: 'rounded-xl' }"
        @click="toggleTheme"
      />

      <div class="form-box">
        <div class="brand-head">
          <img
            src="/brand/turjuman-mark.png"
            alt="ترجمان"
            class="mark"
          >
          <h1>تسجيل الدخول</h1>
          <p>أدخل بياناتك للوصول إلى لوحتك في ترجمان</p>
        </div>

        <UForm
          :state="state"
          :validate="validate"
          class="form"
          @submit="onSubmit"
        >
          <UFormField
            label="البريد الإلكتروني"
            name="email"
          >
            <UInput
              v-model="state.email"
              type="email"
              dir="ltr"
              icon="i-lucide-mail"
              placeholder="name@example.com"
              size="xl"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            />
          </UFormField>

          <UFormField
            label="كلمة المرور"
            name="password"
          >
            <UInput
              v-model="state.password"
              :type="showPassword ? 'text' : 'password'"
              icon="i-lucide-lock"
              placeholder="••••••••"
              size="xl"
              class="w-full"
              :ui="{ base: 'rounded-[13px]' }"
            >
              <template #trailing>
                <UButton
                  :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  color="neutral"
                  variant="link"
                  size="sm"
                  :aria-label="showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'"
                  @click="showPassword = !showPassword"
                />
              </template>
            </UInput>
          </UFormField>

          <div class="forgot">
            <button
              type="button"
              class="link"
              @click="openForgot"
            >
              نسيت كلمة المرور؟
            </button>
          </div>

          <UButton
            type="submit"
            label="دخول"
            color="primary"
            size="xl"
            block
            :loading="loading"
            :ui="{ base: 'rounded-[13px] font-semibold' }"
          />
        </UForm>

        <div class="closed-note">
          التسجيل مغلق — الحسابات تُنشأ من قِبل الإدارة.
        </div>

        <NuxtLink
          to="/"
          class="back-link"
        >
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4"
          />
          العودة إلى الصفحة الرئيسية
        </NuxtLink>
      </div>
    </div>

    <!-- BRAND SIDE -->
    <div class="brand-side">
      <img
        src="/brand/turjuman-logo.png"
        alt="ترجمان — حفظ وفهم وعمل"
        class="brand-logo"
      >
      <p>أهلاً بك في ترجمان — منظومة قرآنية تربوية ترافق رحلتك في الحفظ والفهم والعمل.</p>
    </div>

    <!-- FORGOT PASSWORD MODAL -->
    <UModal
      v-model:open="forgotOpen"
      title="استعادة كلمة المرور"
    >
      <template #body>
        <div
          v-if="!forgotSent"
          class="forgot-body"
        >
          <p class="muted">
            أدخل بريدك الإلكتروني المسجّل، وسنرسل لك رابط إعادة تعيين كلمة المرور.
          </p>
          <UInput
            v-model="forgotEmail"
            type="email"
            dir="ltr"
            icon="i-lucide-mail"
            placeholder="name@example.com"
            size="xl"
            class="w-full"
            :ui="{ base: 'rounded-[13px]' }"
          />
          <UButton
            label="إرسال رابط الاستعادة"
            color="primary"
            size="xl"
            block
            :loading="forgotLoading"
            :ui="{ base: 'rounded-[13px] font-semibold' }"
            @click="sendReset"
          />
        </div>
        <div
          v-else
          class="forgot-done"
        >
          <div class="done-ico">
            <UIcon
              name="i-lucide-mail-check"
              class="size-9"
            />
          </div>
          <h3>تفقّد بريدك الإلكتروني</h3>
          <p class="muted">
            أرسلنا رابط إعادة التعيين إلى <strong dir="ltr">{{ forgotEmail }}</strong>. افتح الرابط لمتابعة تعيين كلمة مرور جديدة.
          </p>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.login { min-height: 100vh; display: grid; grid-template-columns: 1.05fr 0.95fr; background: var(--bg); color: var(--ink); }

/* FORM SIDE */
.form-side { display: flex; align-items: center; justify-content: center; padding: 40px 28px; position: relative; }
.theme-toggle { position: absolute; top: 26px; left: 26px; }
.form-box { width: 100%; max-width: 400px; }
.brand-head { text-align: center; margin-bottom: 34px; }
.brand-head .mark { height: 72px; width: auto; margin: 0 auto 14px; display: block; filter: var(--logo-filter); }
.brand-head h1 { margin: 0; font-size: 30px; font-weight: 700; color: var(--ink); }
.brand-head p { margin: 10px 0 0; font-size: 16px; color: var(--ink-2); font-weight: 300; }
.form { display: flex; flex-direction: column; gap: 18px; }
.forgot { display: flex; justify-content: flex-start; margin-top: -4px; }
.link { background: none; border: none; padding: 0; font-size: 15px; font-weight: 600; color: var(--blue-ink); cursor: pointer; font-family: inherit; }
.closed-note { margin-top: 24px; padding: 14px 16px; border-radius: 12px; background: var(--surface-2); border: 1px solid var(--line); text-align: center; font-size: 14px; line-height: 1.7; color: var(--ink-3); }
.back-link { display: flex; align-items: center; justify-content: center; gap: 7px; margin-top: 22px; font-size: 15px; font-weight: 500; color: var(--ink-2); transition: color .2s; }
.back-link:hover { color: var(--ink); }

/* BRAND SIDE */
.brand-side { background: var(--band); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px; text-align: center; }
.brand-side .brand-logo { height: 280px; width: auto; filter: brightness(0) invert(1); opacity: .97; }
.brand-side p { margin: 30px auto 0; max-width: 380px; font-size: 19px; line-height: 2; color: var(--band-sub); font-weight: 300; }

/* MODAL */
.forgot-body { display: flex; flex-direction: column; gap: 16px; }
.muted { margin: 0; font-size: 15px; line-height: 1.8; color: var(--ink-2); }
.forgot-done { text-align: center; padding: 8px 0; }
.done-ico { width: 70px; height: 70px; border-radius: 50%; background: var(--blue-soft); color: var(--blue-ink); display: flex; align-items: center; justify-content: center; margin: 0 auto 18px; }
.forgot-done h3 { margin: 0 0 10px; font-size: 19px; font-weight: 700; color: var(--ink); }

/* RESPONSIVE — تُخفى لوحة العلامة على الجوال */
@media (max-width: 980px) {
  .login { grid-template-columns: 1fr; }
  .brand-side { display: none; }
}
</style>
