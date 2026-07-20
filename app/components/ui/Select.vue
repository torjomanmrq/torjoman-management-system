<script setup lang="ts" generic="T extends string | number">
/**
 * غلاف موحّد حول USelect:
 * - يوسّع القائمة المنسدلة (content: w-fit) فلا يُقصّ النص الطويل في الخيارات.
 * - استدارة موحّدة (rounded-[13px])، وعرض كامل افتراضيّاً — إلا إذا مرّر الأب
 *   class مخصّص (مثل عرض ثابت لفلتر)، فيُحترم عرضه بدل فرض w-full عليه.
 * يمرّر بقية الخصائص (items/placeholder/size/disabled…) عبر $attrs.
 * تجاوز أيّ مفتاح أنماط عبر تمرير :ui.
 */
defineOptions({ inheritAttrs: false })
const model = defineModel<T>()
const props = defineProps<{ ui?: Record<string, string> }>()
const attrs = useAttrs()

const mergedUi = computed(() => ({
  base: 'rounded-[13px]',
  content: 'w-fit min-w-(--reka-select-trigger-width) max-w-[min(92vw,32rem)]',
  ...(props.ui || {})
}))
</script>

<template>
  <USelect
    v-model="model"
    v-bind="attrs"
    :ui="mergedUi"
    :class="attrs.class ? undefined : 'w-full'"
  />
</template>
