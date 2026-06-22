<script setup lang="ts">
/**
 * جذر التطبيق — لا هيكل عام هنا.
 * كل صفحة/تخطيط يحدّد واجهته: Landing لها nav خاص، ولوحة التحكم لها Shell.
 * اللغة والاتجاه (ar/rtl) مضبوطان في nuxt.config. UApp يوفّر خدمات Nuxt UI العامّة.
 */
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
