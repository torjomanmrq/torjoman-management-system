import type { ComputedRef, Ref } from 'vue'

/**
 * ترقيم صفحات على جهة العميل (§4.16ج) — يقسّم قائمة محمّلة إلى صفحات.
 * يثبّت الصفحة ضمن المدى عند تقلّص النتائج. لإعادة الضبط للصفحة الأولى عند تغيير
 * الفلتر، نادِ resetPage() من مراقب الفلتر في الصفحة.
 */
export function usePagination<T>(source: Ref<T[]> | ComputedRef<T[]>, pageSize = 12) {
  const page = ref(1)
  const total = computed(() => source.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

  watch(pageCount, (pc) => {
    if (page.value > pc) page.value = pc
  })

  const paged = computed(() => {
    const start = (page.value - 1) * pageSize
    return source.value.slice(start, start + pageSize)
  })

  function resetPage() {
    page.value = 1
  }

  return { page, total, pageCount, pageSize, paged, resetPage }
}
