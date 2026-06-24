<script setup lang="ts">
/** نظرة عامة مالية (§4.20أ) — بطاقات (رصيد/وارد/صادر) للشهر + توزّع المصروفات حسب التصنيف. */
import type { Database } from '~/types/database.types'

const supabase = useSupabaseClient<Database>()
const { handle } = useErrorHandler()

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const now = new Date()
const monthItems = MONTHS.map((m, i) => ({ label: m, value: i + 1 }))
const yearItems = [now.getFullYear() - 1, now.getFullYear()].map(y => ({ label: String(y), value: y }))
const month = ref(now.getMonth() + 1)
const year = ref(now.getFullYear())

type Tx = { transaction_date: string, category: string | null, type: 'income' | 'expense', amount: number }
const allTx = ref<Tx[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const { data } = await supabase.from('financial_transactions').select('transaction_date, category, type, amount').returns<Tx[]>()
    allTx.value = data ?? []
  } catch (err) {
    handle(err)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const inMonth = (t: Tx) => {
  const d = new Date(t.transaction_date)
  return d.getMonth() + 1 === month.value && d.getFullYear() === year.value
}
const monthTx = computed(() => allTx.value.filter(inMonth))
const income = computed(() => monthTx.value.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0))
const expense = computed(() => monthTx.value.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0))
// الرصيد الكلّي حتى نهاية الشهر المختار
const balance = computed(() => allTx.value
  .filter((t) => {
    const d = new Date(t.transaction_date)
    return d.getFullYear() < year.value || (d.getFullYear() === year.value && d.getMonth() + 1 <= month.value)
  })
  .reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0))

const byCategory = computed(() => {
  const map: Record<string, number> = {}
  for (const t of monthTx.value) {
    if (t.type === 'expense') map[t.category || 'أخرى'] = (map[t.category || 'أخرى'] ?? 0) + t.amount
  }
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1])
  return entries.map(([cat, amt]) => ({ cat, amt, pct: expense.value ? Math.round(amt / expense.value * 100) : 0 }))
})

const fmt = (n: number) => n.toLocaleString('ar')
</script>

<template>
  <div>
    <div class="picker">
      <UiSelect
        v-model="month"
        :items="monthItems"
        size="md"
        class="sel"
      />
      <UiSelect
        v-model="year"
        :items="yearItems"
        size="md"
        class="sel"
      />
    </div>

    <ClientOnly>
      <div class="cards">
        <div class="card hero">
          <div class="c-lbl">
            الرصيد الحالي (حتى {{ MONTHS[month - 1] }})
          </div>
          <div class="c-val">
            {{ fmt(balance) }} <span class="cur">₪</span>
          </div>
        </div>
        <div class="card">
          <div class="c-lbl">
            إجمالي الوارد للشهر
          </div>
          <div class="c-val in">
            +{{ fmt(income) }}
          </div>
        </div>
        <div class="card">
          <div class="c-lbl">
            إجمالي الصادر للشهر
          </div>
          <div class="c-val out">
            −{{ fmt(expense) }}
          </div>
        </div>
      </div>

      <div class="card breakdown">
        <h3>توزّع المصروفات حسب التصنيف</h3>
        <UiEmptyState
          v-if="!byCategory.length"
          icon="i-lucide-pie-chart"
          title="لا مصروفات في هذا الشهر"
        />
        <div
          v-else
          class="bars"
        >
          <div
            v-for="b in byCategory"
            :key="b.cat"
            class="brow"
          >
            <div class="bhead">
              <span>{{ b.cat }}</span>
              <span class="bamt">{{ fmt(b.amt) }} · {{ b.pct }}%</span>
            </div>
            <div class="btrack">
              <div
                class="bfill"
                :style="{ width: b.pct + '%' }"
              />
            </div>
          </div>
        </div>
      </div>
    </ClientOnly>
  </div>
</template>

<style scoped>
.picker { display: flex; gap: 10px; margin-bottom: 16px; }
.sel { width: 140px; }
.cards { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 16px; margin-bottom: 18px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; box-shadow: var(--shadow); padding: 22px; }
.hero { background: var(--navy); border-color: var(--navy); }
.hero .c-lbl, .hero .c-val { color: #fff; }
.c-lbl { font-size: 13.5px; color: var(--ink-3); }
.c-val { font-size: 30px; font-weight: 700; color: var(--ink); margin-top: 8px; font-variant-numeric: tabular-nums; }
.cur { font-size: 18px; opacity: .7; }
.c-val.in { color: var(--green-ink); }
.c-val.out { color: var(--err); }

.breakdown h3 { margin: 0 0 16px; font-size: 17px; font-weight: 700; color: var(--ink); }
.bars { display: flex; flex-direction: column; gap: 14px; }
.bhead { display: flex; justify-content: space-between; font-size: 14px; color: var(--ink); margin-bottom: 6px; }
.bamt { color: var(--ink-3); font-size: 13px; }
.btrack { height: 10px; border-radius: 999px; background: var(--surface-3); overflow: hidden; }
.bfill { height: 100%; border-radius: 999px; background: var(--blue); }

@media (max-width: 760px) { .cards { grid-template-columns: 1fr; } }
</style>
