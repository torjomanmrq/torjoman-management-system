<script setup lang="ts" generic="T extends string | number">
/** شرائح تصفية موحّدة (v-model) مع عدّاد اختياري لكل شريحة. */
defineProps<{
  modelValue: T
  options: { value: T, label: string, count?: number }[]
}>()
defineEmits<{ 'update:modelValue': [T] }>()
</script>

<template>
  <div class="chips">
    <button
      v-for="o in options"
      :key="String(o.value)"
      class="chip"
      :class="{ on: modelValue === o.value }"
      @click="$emit('update:modelValue', o.value)"
    >
      {{ o.label }}
      <span
        v-if="o.count != null"
        class="chip-n"
      >{{ o.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.chips { display: flex; flex-wrap: wrap; gap: 10px; }
.chip { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line-2); color: var(--ink-2); font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; transition: all .15s; }
.chip:hover { background: var(--surface-2); }
.chip.on { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.chip-n { font-size: 12px; opacity: .8; background: rgba(0, 0, 0, .08); border-radius: 999px; padding: 1px 7px; }
.chip.on .chip-n { background: rgba(255, 255, 255, .22); }
</style>
