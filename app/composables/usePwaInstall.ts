/**
 * منطق تحفيز تثبيت التطبيق (PWA) — يلتقط حدث beforeinstallprompt ويقرّر متى
 * يظهر البانر المخصّص. لا يظهر إن كان مثبّتاً مسبقاً (standalone) أو أُغلق مؤخّراً.
 * iOS لا يدعم التثبيت البرمجي، فنكتفي بإظهار إرشاد يدوي.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'turjuman:pwa-install-dismissed'
const DISMISS_DAYS = 14 // لا يُعاد الظهور قبل أسبوعين من الإغلاق
const SHOW_DELAY_MS = 3000 // مهلة قبل الظهور (كي يرى المستخدم القيمة أولاً)

export function usePwaInstall() {
  const deferred = ref<BeforeInstallPromptEvent | null>(null)
  const ready = ref(false) // انقضت المهلة
  const installed = ref(false)

  // نعمل على العميل فقط (الأحداث والـ localStorage غير متاحة على الخادم)
  const isStandalone = () => {
    if (import.meta.server) return false
    return window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true
  }

  const isIOS = () => {
    if (import.meta.server) return false
    const ua = window.navigator.userAgent
    const iOSDevice = /iphone|ipad|ipod/i.test(ua)
    const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
    return (iOSDevice || iPadOS) && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)
  }

  const dismissedRecently = () => {
    if (import.meta.server) return false
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (Number.isNaN(ts)) return false
    return (Date.now() - ts) < DISMISS_DAYS * 24 * 60 * 60 * 1000
  }

  // يظهر البانر إذا: انقضت المهلة، وغير مثبّت، وغير مُغلَق مؤخّراً،
  // و(قابل للتثبيت فعلاً عبر الحدث أو نظام iOS الذي يحتاج إرشاداً).
  const visible = computed(() =>
    ready.value
    && !installed.value
    && (!!deferred.value || isIOS())
    && !isStandalone()
    && !dismissedRecently())

  const ios = ref(false)

  let onPrompt: ((e: Event) => void) | null = null
  let onInstalled: (() => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  onMounted(() => {
    if (isStandalone()) {
      installed.value = true
      return
    }
    ios.value = isIOS()

    onPrompt = (e: Event) => {
      e.preventDefault() // امنع تلميح Chrome الافتراضي؛ نعرض بانرنا بدلاً منه
      deferred.value = e as BeforeInstallPromptEvent
    }
    onInstalled = () => {
      installed.value = true
      deferred.value = null
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)

    timer = setTimeout(() => {
      ready.value = true
    }, SHOW_DELAY_MS)
  })

  onUnmounted(() => {
    if (onPrompt) window.removeEventListener('beforeinstallprompt', onPrompt)
    if (onInstalled) window.removeEventListener('appinstalled', onInstalled)
    if (timer) clearTimeout(timer)
  })

  /** يستدعي حوار التثبيت الأصلي (Chrome/Android). */
  async function install() {
    const evt = deferred.value
    if (!evt) return
    await evt.prompt()
    const choice = await evt.userChoice
    deferred.value = null
    if (choice.outcome === 'accepted') installed.value = true
  }

  /** يُخفي البانر ويتذكّر الإغلاق (لا يعود قبل DISMISS_DAYS). */
  function dismiss() {
    if (!import.meta.server) localStorage.setItem(DISMISS_KEY, String(Date.now()))
    ready.value = false
  }

  return { visible, ios, install, dismiss }
}
