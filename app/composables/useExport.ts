/**
 * تصدير جداول إلى ملفّ يفتح في Excel — CSV بترميز UTF-8 BOM (يدعم العربية، بلا تبعيات).
 * ملاحظة: ملفّ CSV يفتحه Excel مباشرةً؛ ترقية لاحقة لـ .xlsx حقيقي عند الحاجة.
 */
export function useExport() {
  const cell = (v: string | number | null | undefined): string => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  function exportCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
    const body = [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return { exportCsv }
}
