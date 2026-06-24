<script setup lang="ts">
/** رأس الصفحة الموحّد: عنوان + وصف + إجراءات (slot). */
defineProps<{ title: string, subtitle?: string }>()
</script>

<template>
  <div class="head">
    <div>
      <h2>{{ title }}</h2>
      <p v-if="subtitle">
        {{ subtitle }}
      </p>
    </div>
    <div
      v-if="$slots.actions"
      class="head-actions"
    >
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
.head h2 { margin: 0; font-size: 26px; font-weight: 700; color: var(--ink); }
.head p { margin: 8px 0 0; font-size: 16px; color: var(--ink-2); font-weight: 300; }
.head-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
</style>
