export default defineAppConfig({
  ui: {
    // ربط الألوان الدلالية لـ Nuxt UI بتدرّجات الهوية (انظر app/assets/css/main.css)
    colors: {
      primary: 'navy', // الأساسي
      secondary: 'blue', // الثانوي
      success: 'green', // النجاح
      info: 'blue',
      error: 'err', // خطأ (Terra)
      neutral: 'neutral' // المحايد (مشتقّ من ink/surface/line)
    }
  }
})
