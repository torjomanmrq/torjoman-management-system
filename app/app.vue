<script setup lang="ts">
/**
 * جذر التطبيق — NuxtLayout يطبّق التخطيط حسب الصفحة.
 * Landing والدخول: layout=false (واجهة كاملة خاصة). لوحة التحكم: layout=dashboard (Shell).
 * اللغة والاتجاه (ar/rtl) مضبوطان في nuxt.config. UApp يوفّر خدمات Nuxt UI العامّة.
 */
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <PwaInstallBanner />
  </UApp>
</template>
