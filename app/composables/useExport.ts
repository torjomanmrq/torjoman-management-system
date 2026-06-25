/**
 * تصدير الجداول إلى Excel. `exportXlsx` يولّد ملفّ .xlsx حقيقيّاً (exceljs، محمّل
 * ديناميكيّاً) مع ورقة RTL ورأس عريض وعرض أعمدة مناسب. `exportCsv` بديل خفيف.
 */
type Cell = string | number | null | undefined

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function useExport() {
  const cell = (v: Cell): string => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  function exportCsv(filename: string, headers: string[], rows: Cell[][]) {
    const body = [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' })
    download(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`)
  }

  async function exportXlsx(filename: string, headers: string[], rows: Cell[][], sheetName = 'بيانات') {
    const mod = await import('exceljs')
    const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(sheetName.slice(0, 28), { views: [{ rightToLeft: true }] })

    const head = ws.addRow(headers)
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    head.alignment = { horizontal: 'right', vertical: 'middle' }
    head.height = 22
    head.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF094064' } }
    })

    for (const r of rows) {
      const row = ws.addRow(r.map(v => v ?? ''))
      row.alignment = { horizontal: 'right', vertical: 'middle' }
    }

    ws.columns.forEach((col) => {
      let max = 10
      col.eachCell?.({ includeEmpty: false }, (c) => {
        max = Math.max(max, String(c.value ?? '').length + 2)
      })
      col.width = Math.min(40, max)
    })

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    download(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
  }

  return { exportCsv, exportXlsx }
}
