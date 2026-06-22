<script setup lang="ts">
/**
 * لوحة مؤقّتة — هدف إعادة التوجيه بعد الدخول.
 * تُستبدل بالهيكل العام (Shell §4.2) ولوحات الأدوار (§4.3) في المهمة التالية.
 */
const { user, signOut } = useAuth()

onMounted(() => {
  if (!user.value) navigateTo('/login')
})

useSeoMeta({ title: 'لوحة التحكم — ترجمان' })
</script>

<template>
  <div class="ph">
    <img
      src="/brand/turjuman-mark.png"
      alt="ترجمان"
      class="ph-mark"
    >
    <h1>أهلاً بك في ترجمان</h1>
    <p
      class="ph-email"
      dir="ltr"
    >
      {{ user?.email }}
    </p>
    <UButton
      label="تسجيل الخروج"
      color="primary"
      icon="i-lucide-log-out"
      :ui="{ base: 'rounded-[13px] font-semibold' }"
      @click="signOut"
    />
    <p class="ph-note">
      لوحة مؤقّتة — يُبنى الهيكل العام ولوحات الأدوار في الخطوة التالية.
    </p>
  </div>
</template>

<style scoped>
.ph { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: var(--bg); color: var(--ink); padding: 24px; text-align: center; }
.ph-mark { height: 80px; width: auto; filter: var(--logo-filter); }
.ph h1 { margin: 0; font-size: 26px; font-weight: 700; }
.ph-email { margin: 0; color: var(--ink-2); font-size: 15px; }
.ph-note { margin-top: 8px; color: var(--ink-3); font-size: 14px; }
</style>
