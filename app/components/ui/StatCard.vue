<script setup lang="ts">
/**
 * بطاقة إحصائية: أيقونة ملوّنة + رقم + تسمية. stacked = الأيقونة فوق الرقم.
 * الرقم يُعدّ تصاعدياً عند تغيّره (وصول العدد الحقيقي بعد الجلب غير الحاجز)
 * بدل الظهور دفعة واحدة — عبر requestAnimationFrame، عميل فقط.
 */
const props = defineProps<{
  icon: string
  value: string | number
  label: string
  tone?: 'blue' | 'green' | 'neutral' | 'err'
  stacked?: boolean
}>()

const displayValue = ref(props.value)
let rafId: number | null = null

function animateTo(target: number, from: number) {
  if (rafId) cancelAnimationFrame(rafId)
  const duration = 700
  const start = performance.now()
  function tick(now: number) {
    const t = Math.min(1, (now - start) / duration)
    const eased = 1 - (1 - t) ** 3
    displayValue.value = Math.round(from + (target - from) * eased)
    rafId = t < 1 ? requestAnimationFrame(tick) : null
  }
  rafId = requestAnimationFrame(tick)
}

watch(() => props.value, (newVal, oldVal) => {
  if (import.meta.client && typeof newVal === 'number' && typeof oldVal === 'number') {
    animateTo(newVal, oldVal)
  } else {
    displayValue.value = newVal
  }
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<template>
  <div
    class="stat"
    :class="{ stacked }"
  >
    <div
      class="ico"
      :class="`ico-${tone || 'blue'}`"
    >
      <UIcon
        :name="icon"
        class="size-6"
      />
    </div>
    <div>
      <div class="num">
        {{ displayValue }}
      </div>
      <div class="lbl">
        {{ label }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 22px; box-shadow: var(--shadow); display: flex; align-items: center; gap: 15px; }
.stat.stacked { flex-direction: column; align-items: flex-start; gap: 0; padding: 24px; }
.ico { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex: none; }
.stat.stacked .ico { margin-bottom: 18px; }
.ico-blue { background: var(--blue-soft); color: var(--blue-ink); }
.ico-green { background: var(--green-soft); color: var(--green-ink); }
.ico-neutral { background: var(--surface-3); color: var(--ink); }
.ico-err { background: var(--err-soft); color: var(--err); }
.num { font-size: 28px; font-weight: 700; color: var(--ink); line-height: 1; }
.stat.stacked .num { font-size: 34px; }
.lbl { font-size: 14px; color: var(--ink-2); margin-top: 6px; }
.stat.stacked .lbl { font-size: 15px; margin-top: 8px; }
</style>
