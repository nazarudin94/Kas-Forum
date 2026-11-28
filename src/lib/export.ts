import { Capacitor } from '@capacitor/core'
import type { Expense, FinanceSummary, HouseArrears, RondaSchedule, User } from '../types'
import { formatCurrency, formatDate } from './format'

interface KasKitaAndroidPrintBridge {
  printHtml?: (title: string, html: string) => void
  shareCsv?: (filename: string, csvContent: string) => void
}

declare global {
  interface Window {
    KasKitaAndroidPrint?: KasKitaAndroidPrintBridge
  }
}

/**
 * Mengecek apakah pengguna saat ini memiliki hak akses RBAC untuk mengunduh laporan (PDF / CSV).
 * Dikontrol oleh Administrator melalui menu Role Menu pada item 'export'.
 */
export function canExportDocuments(user: User | null | undefined): boolean {
  return Boolean(user?.menus.some((menu) => menu.key === 'export' && menu.canView))
}

/**
 * Mengonversi array baris data menjadi file CSV dan mengunduhnya ke perangkat pengguna.
 * Dilengkapi UTF-8 BOM (\uFEFF) agar terbaca rapi di Microsoft Excel, serta dukungan
 * Native Share pada Android APK / perangkat mobile.
 */
export function downloadCsv(filename: string, rows: (string | number | boolean | null | undefined)[][]): void {
  const safeFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`
  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return '""'
          const str = String(cell).replace(/"/g, '""')
          return `"${str}"`
        })
        .join(','),
    )
    .join('\r\n')

  const fullCsv = '\uFEFF' + csvContent

  // 1. Jika berjalan di dalam APK Android KasKita dengan native bridge
  if (typeof window !== 'undefined' && typeof window.KasKitaAndroidPrint?.shareCsv === 'function') {
    window.KasKitaAndroidPrint.shareCsv(safeFilename, fullCsv)
    return
  }

  // 2. Jika berjalan di Capacitor / Mobile WebView yang mendukung Web Share File API
  if (Capacitor.isNativePlatform() && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([fullCsv], safeFilename, { type: 'text/csv;charset=utf-8;' })
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        void navigator.share({
          title: safeFilename,
          files: [file],
        })
        return
      }
    } catch {
      // Lanjut ke mekanisme anchor download standar
    }
  }

  // 3. Browser standar (Desktop / Chrome Mobile)
  const blob = new Blob([fullCsv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', safeFilename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/**
 * Menampilkan pratinjau dokumen formal siap cetak A4 di dalam modal in-app (tanpa menimpa halaman utama).
 * Aman digunakan di APK Android WebView maupun browser Desktop/Mobile:
 * - Dilengkapi tombol "← Kembali" di bilah atas
 * - Mendukung tombol Back fisik HP Android & tombol Escape
 * - Mendukung dialog Simpan PDF bawaan Android (PrintManager) maupun browser print
 */
export function printHtmlDocument(title: string, bodyHtml: string): void {
  const currentDate = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(new Date())

  const fullHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1a231e;
      background: #ffffff;
      margin: 0;
      padding: 16px;
      font-size: 11pt;
      line-height: 1.4;
    }
    .header-kop {
      border-bottom: 2px solid #204d3d;
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }
    .header-kop .brand {
      font-size: 18pt;
      font-weight: 800;
      color: #204d3d;
      letter-spacing: -0.5px;
    }
    .header-kop .meta {
      text-align: right;
      font-size: 9pt;
      color: #556b60;
    }
    .doc-title {
      font-size: 15pt;
      font-weight: 700;
      text-align: center;
      margin: 15px 0 5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #163328;
    }
    .doc-subtitle {
      text-align: center;
      font-size: 10pt;
      color: #556b60;
      margin-bottom: 20px;
    }
    .summary-boxes {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 20px;
    }
    .summary-box {
      flex: 1 1 150px;
      padding: 10px 14px;
      border: 1px solid #ccd8d1;
      border-radius: 6px;
      background: #f7faf8;
    }
    .summary-box span {
      display: block;
      font-size: 9pt;
      color: #556b60;
      text-transform: uppercase;
      font-weight: 600;
    }
    .summary-box strong {
      display: block;
      font-size: 13pt;
      color: #163328;
      margin-top: 4px;
    }
    .table-scroll {
      width: 100%;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 25px;
      font-size: 9.5pt;
    }
    th {
      background-color: #204d3d;
      color: #ffffff;
      padding: 8px 10px;
      text-align: left;
      font-weight: 600;
      border: 1px solid #204d3d;
    }
    td {
      padding: 7px 10px;
      border: 1px solid #d4dfd9;
      vertical-align: top;
    }
    tr:nth-child(even) td {
      background-color: #f8faf9;
    }
    .text-right {
      text-align: right;
    }
    .text-center {
      text-align: center;
    }
    .tag {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 600;
    }
    .tag-green { background: #e2f4ea; color: #155d3e; }
    .tag-orange { background: #fef3c7; color: #92400e; }
    .tag-gray { background: #eef2f0; color: #44594f; }
    .signatures {
      margin-top: 35px;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      page-break-inside: avoid;
    }
    .sign-col {
      width: 220px;
      text-align: center;
      font-size: 9.5pt;
    }
    .sign-space {
      height: 60px;
    }
    .sign-name {
      font-weight: bold;
      border-bottom: 1px solid #1a231e;
      padding-bottom: 2px;
    }
    .footer-note {
      margin-top: 30px;
      border-top: 1px dashed #ccd8d1;
      padding-top: 8px;
      font-size: 8pt;
      color: #7b8f84;
      text-align: center;
    }
    @media print {
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="header-kop">
    <div>
      <div class="brand">KasKita.</div>
      <div style="font-size: 9pt; color: #556b60;">Sistem Pengelolaan Kas & Ketertiban Lingkungan</div>
    </div>
    <div class="meta">
      <div>Tanggal Cetak: <b>${currentDate}</b></div>
      <div>Dokumen Resmi Lingkungan</div>
    </div>
  </div>

  <div class="doc-title">${title}</div>

  ${bodyHtml}

  <div class="signatures">
    <div class="sign-col">
      <div>Mengetahui,</div>
      <div><b>Ketua Blok / Pengurus</b></div>
      <div class="sign-space"></div>
      <div class="sign-name">( ............................................ )</div>
    </div>
    <div class="sign-col">
      <div>Dibuat Oleh,</div>
      <div><b>Pengurus / Sekretaris</b></div>
      <div class="sign-space"></div>
      <div class="sign-name">( ............................................ )</div>
    </div>
  </div>

  <div class="footer-note">
    Dicetak secara otomatis melalui Sistem Informasi KasKita pada ${new Date().toLocaleString('id-ID')}
  </div>
</body>
</html>`

  // Hapus dialog pratinjau sebelumnya jika masih ada
  const existing = document.getElementById('kaskita-print-preview-dialog')
  if (existing) existing.remove()

  const dialog = document.createElement('dialog')
  dialog.id = 'kaskita-print-preview-dialog'
  dialog.setAttribute('aria-label', `Pratinjau ${title}`)
  Object.assign(dialog.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    maxWidth: '100vw',
    height: '100dvh',
    maxHeight: '100dvh',
    margin: '0',
    padding: '0',
    border: 'none',
    background: '#e6ece8',
    zIndex: '9999',
    display: 'flex',
    flexDirection: 'column',
  })

  // Bilah navigasi atas (Tombol Kembali + Judul + Cetak/Simpan PDF)
  const toolbar = document.createElement('div')
  Object.assign(toolbar.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    padding: '12px 16px',
    background: '#17392f',
    color: '#ffffff',
    boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
    flexShrink: '0',
  })

  const backBtn = document.createElement('button')
  backBtn.type = 'button'
  backBtn.textContent = '← Kembali'
  Object.assign(backBtn.style, {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.28)',
    background: 'rgba(255,255,255,0.12)',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })

  const titleEl = document.createElement('div')
  titleEl.textContent = title
  Object.assign(titleEl.style, {
    fontSize: '13px',
    fontWeight: '700',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: '1',
    textAlign: 'center',
  })

  const printBtn = document.createElement('button')
  printBtn.type = 'button'
  printBtn.textContent = 'Simpan PDF / Cetak'
  Object.assign(printBtn.style, {
    padding: '8px 14px',
    borderRadius: '8px',
    border: 'none',
    background: '#bce58a',
    color: '#17392f',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })

  toolbar.appendChild(backBtn)
  toolbar.appendChild(titleEl)
  toolbar.appendChild(printBtn)

  // Area pratinjau dokumen
  const frameWrap = document.createElement('div')
  Object.assign(frameWrap.style, {
    flex: '1',
    overflow: 'auto',
    padding: '12px',
    display: 'flex',
    justifyContent: 'center',
  })

  const iframe = document.createElement('iframe')
  iframe.title = title
  iframe.srcdoc = fullHtml
  Object.assign(iframe.style, {
    width: 'min(900px, 100%)',
    minHeight: '100%',
    border: '1px solid #cbd5cf',
    borderRadius: '8px',
    background: '#ffffff',
    boxShadow: '0 8px 24px rgba(23, 57, 47, 0.1)',
  })

  frameWrap.appendChild(iframe)
  dialog.appendChild(toolbar)
  dialog.appendChild(frameWrap)
  document.body.appendChild(dialog)

  // Tambahkan state history agar tombol Back browser/gesture HP menutup modal, bukan keluar halaman
  let closedViaPopState = false
  window.history.pushState({ kaskitaPrintModal: true }, '')

  const handlePopState = () => {
    closedViaPopState = true
    if (dialog.open) dialog.close()
  }
  window.addEventListener('popstate', handlePopState)

  const cleanup = () => {
    window.removeEventListener('popstate', handlePopState)
    if (dialog.isConnected) dialog.remove()
    if (!closedViaPopState && window.history.state?.kaskitaPrintModal) {
      window.history.back()
    }
  }

  dialog.addEventListener('close', cleanup, { once: true })
  backBtn.addEventListener('click', () => {
    dialog.close()
  })

  printBtn.addEventListener('click', () => {
    // 1. Jika APK Android memiliki native PrintManager bridge
    if (typeof window.KasKitaAndroidPrint?.printHtml === 'function') {
      window.KasKitaAndroidPrint.printHtml(title, fullHtml)
      return
    }
    // 2. Cetak melalui iframe standar browser
    if (iframe.contentWindow) {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
    }
  })

  dialog.showModal()
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. UNDUH / CETAK LAPORAN KEUANGAN
// ─────────────────────────────────────────────────────────────────────────────

export function exportFinancialReportCsv(summary: FinanceSummary, expenses: Expense[] = []): void {
  const dateStr = new Date().toISOString().slice(0, 10)
  const rows: (string | number)[][] = [
    ['LAPORAN REKAPITULASI KEUANGAN LINGKUNGAN KASKITA'],
    ['Tanggal Unduh', formatDateIso(new Date())],
    [],
    ['RINGKASAN SALDO'],
    ['Saldo Kas Saat Ini', formatCurrency(summary.currentBalance)],
    ['Total Pemasukan Disetujui', formatCurrency(summary.totalIncome)],
    ['Total Pengeluaran Disetujui', formatCurrency(summary.totalExpense)],
    [],
    ['RINCIAN POS KEUANGAN'],
    ['ID Pos', 'Nama Pos Kas', 'Kategori', 'Total Pemasukan', 'Total Pengeluaran', 'Saldo Pos Saat Ini', 'Status Pos'],
    ...summary.funds.map((fund) => [
      fund.fund_id,
      fund.fund_name,
      fund.fund_type === 'EVENT' ? 'Kas Kegiatan' : 'Iuran Rutin',
      formatCurrency(fund.total_income),
      formatCurrency(fund.total_expense),
      formatCurrency(fund.current_balance),
      fund.fund_status === 'ACTIVE' ? 'Aktif' : 'Ditutup',
    ]),
  ]

  if (expenses.length > 0) {
    rows.push(
      [],
      ['RIWAYAT PENGELUARAN KAS'],
      ['Tanggal', 'Pos Kas', 'Keperluan / Judul', 'Keterangan', 'Nominal', 'Status'],
      ...expenses.map((exp) => [
        formatDate(exp.expenseDate),
        exp.fundName ?? '—',
        exp.title,
        exp.description ?? '—',
        formatCurrency(exp.amount),
        exp.status === 'APPROVED' ? 'Disetujui' : 'Menunggu',
      ]),
    )
  }

  downloadCsv(`Laporan_Keuangan_KasKita_${dateStr}.csv`, rows)
}

export function exportFinancialReportPrint(summary: FinanceSummary, expenses: Expense[] = []): void {
  const summaryBoxes = `
    <div class="doc-subtitle">Ringkasan kondisi kas dan saldo per pos keuangan lingkungan</div>
    <div class="summary-boxes">
      <div class="summary-box">
        <span>Saldo Kas Saat Ini</span>
        <strong style="color: #1f604b;">${formatCurrency(summary.currentBalance)}</strong>
      </div>
      <div class="summary-box">
        <span>Total Pemasukan</span>
        <strong style="color: #19523c;">${formatCurrency(summary.totalIncome)}</strong>
      </div>
      <div class="summary-box">
        <span>Total Pengeluaran</span>
        <strong style="color: #8c382f;">${formatCurrency(summary.totalExpense)}</strong>
      </div>
    </div>
  `

  const tableRows = summary.funds
    .map(
      (fund, index) => `
    <tr>
      <td class="text-center">${index + 1}</td>
      <td><b>${escapeHtml(fund.fund_name)}</b></td>
      <td>${fund.fund_type === 'EVENT' ? 'Kas Kegiatan' : 'Iuran Rutin'}</td>
      <td class="text-right">${formatCurrency(fund.total_income)}</td>
      <td class="text-right">${formatCurrency(fund.total_expense)}</td>
      <td class="text-right"><b>${formatCurrency(fund.current_balance)}</b></td>
      <td class="text-center">
        <span class="tag ${fund.fund_status === 'ACTIVE' ? 'tag-green' : 'tag-gray'}">
          ${fund.fund_status === 'ACTIVE' ? 'Aktif' : 'Ditutup'}
        </span>
      </td>
    </tr>
  `,
    )
    .join('')

  const expensesSection = expenses.length === 0
    ? ''
    : `
    <h3 style="font-size: 11pt; color: #163328; margin: 18px 0 8px;">Rincian Pengeluaran Kas</h3>
    <table>
      <thead>
        <tr>
          <th style="width: 35px;" class="text-center">No</th>
          <th style="width: 105px;">Tanggal</th>
          <th style="width: 135px;">Pos Kas</th>
          <th>Keperluan / Keterangan</th>
          <th style="width: 120px;" class="text-right">Nominal</th>
        </tr>
      </thead>
      <tbody>
        ${expenses
          .map(
            (exp, index) => `
          <tr>
            <td class="text-center">${index + 1}</td>
            <td>${escapeHtml(formatDate(exp.expenseDate))}</td>
            <td>${escapeHtml(exp.fundName ?? '—')}</td>
            <td><b>${escapeHtml(exp.title)}</b>${exp.description ? `<br><small style="color:#556b60;">${escapeHtml(exp.description)}</small>` : ''}</td>
            <td class="text-right"><b>${formatCurrency(exp.amount)}</b></td>
          </tr>
        `,
          )
          .join('')}
      </tbody>
    </table>
  `

  const tableHtml = `
    ${summaryBoxes}
    <h3 style="font-size: 11pt; color: #163328; margin: 15px 0 8px;">Rincian Saldo Per Pos Keuangan</h3>
    <table>
      <thead>
        <tr>
          <th style="width: 35px;" class="text-center">No</th>
          <th>Nama Pos Kas</th>
          <th>Kategori</th>
          <th class="text-right">Total Masuk</th>
          <th class="text-right">Total Keluar</th>
          <th class="text-right">Saldo Saat Ini</th>
          <th style="width: 70px;" class="text-center">Status</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
    ${expensesSection}
  `

  printHtmlDocument('Laporan Keuangan Kas Lingkungan', tableHtml)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. UNDUH / CETAK JADWAL RONDA
// ─────────────────────────────────────────────────────────────────────────────

const DAY_SORT_ORDER: Record<string, number> = {
  SENIN: 1,
  SELASA: 2,
  RABU: 3,
  KAMIS: 4,
  JUMAT: 5,
  SABTU: 6,
  MINGGU: 7,
}

export function exportRondaScheduleCsv(schedules: RondaSchedule[]): void {
  const dateStr = new Date().toISOString().slice(0, 10)
  const sorted = [...schedules].sort((a, b) => {
    const dayDiff = (DAY_SORT_ORDER[a.dayKey] ?? 8) - (DAY_SORT_ORDER[b.dayKey] ?? 8)
    if (dayDiff !== 0) return dayDiff
    return a.houseCode.localeCompare(b.houseCode)
  })

  const rows: (string | number)[][] = [
    ['JADWAL RONDA MALAM LINGKUNGAN KASKITA'],
    ['Tanggal Unduh', formatDateIso(new Date())],
    [],
    ['Hari Ronda', 'Kode Rumah', 'Blok', 'No Rumah', 'Nama Kepala Keluarga / Warga', 'No Telepon / WhatsApp', 'Catatan Tugas'],
    ...sorted.map((item) => [
      item.dayLabel,
      item.houseCode,
      item.blockCode,
      item.houseNumber,
      item.headName ?? '—',
      item.phone ?? item.phoneMasked ?? '—',
      item.notes ?? '—',
    ]),
  ]

  downloadCsv(`Jadwal_Ronda_Lingkungan_${dateStr}.csv`, rows)
}

export function exportRondaSchedulePrint(schedules: RondaSchedule[]): void {
  const days = [
    { key: 'SENIN', label: 'Malam Senin' },
    { key: 'SELASA', label: 'Malam Selasa' },
    { key: 'RABU', label: 'Malam Rabu' },
    { key: 'KAMIS', label: 'Malam Kamis' },
    { key: 'JUMAT', label: 'Malam Jumat' },
    { key: 'SABTU', label: 'Malam Sabtu' },
    { key: 'MINGGU', label: 'Malam Minggu' },
  ]

  const sectionsHtml = days
    .map((day) => {
      const daySchedules = schedules
        .filter((s) => s.dayKey === day.key)
        .sort((a, b) => a.houseCode.localeCompare(b.houseCode))

      const rows = daySchedules.length === 0
        ? `<tr><td colspan="5" class="text-center" style="color: #7b8f84; font-style: italic;">Belum ada warga yang ditugaskan pada regu ${day.label}.</td></tr>`
        : daySchedules
            .map(
              (item, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td><b>${escapeHtml(item.houseCode)}</b></td>
              <td>${escapeHtml(item.headName ?? 'Warga')} (Blok ${escapeHtml(item.blockCode)})</td>
              <td>${escapeHtml(item.phone ?? item.phoneMasked ?? '—')}</td>
              <td>${item.notes ? `<i>${escapeHtml(item.notes)}</i>` : '—'}</td>
            </tr>
          `,
            )
            .join('')

      return `
        <div style="margin-bottom: 20px; page-break-inside: avoid;">
          <div style="background: #eef5f1; border-left: 4px solid #204d3d; padding: 6px 12px; font-weight: bold; font-size: 11pt; color: #163328; margin-bottom: 6px;">
            ${day.label} (${daySchedules.length} Rumah Bertugas)
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 35px;" class="text-center">No</th>
                <th style="width: 90px;">No Rumah</th>
                <th>Nama Warga</th>
                <th style="width: 140px;">Kontak HP / WA</th>
                <th>Keterangan / Tugas</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `
    })
    .join('')

  const bodyHtml = `
    <div class="doc-subtitle">Pembagian regu ronda malam lingkungan untuk pos keamanan dan ketertiban bersama</div>
    <div style="background: #fff8e8; border: 1px solid #e8dbb0; padding: 8px 14px; border-radius: 6px; font-size: 9pt; color: #6a5316; margin-bottom: 18px;">
      <b>Petunjuk Petugas Ronda:</b> Hadir tepat waktu di Pos Keamanan Lingkungan. Lakukan patroli berkala setiap jam ganjil dan pastikan portal tertutup pada jam yang telah disepakati. Jika ada hal darurat, segera hubungi koordinator keamanan.
    </div>
    ${sectionsHtml}
  `

  printHtmlDocument('Jadwal Ronda Malam Lingkungan', bodyHtml)
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. UNDUH / CETAK DAFTAR WARGA & RUMAH
// ─────────────────────────────────────────────────────────────────────────────

export function exportWargaListCsv(houses: HouseArrears[]): void {
  const dateStr = new Date().toISOString().slice(0, 10)
  const sorted = [...houses].sort((a, b) => a.houseCode.localeCompare(b.houseCode))

  const rows: (string | number)[][] = [
    ['DAFTAR RUMAH & WARGA LINGKUNGAN KASKITA'],
    ['Tanggal Unduh', formatDateIso(new Date())],
    ['Total Rumah', houses.length],
    [],
    [
      'Kode Rumah',
      'Blok',
      'Nomor Rumah',
      'Kepala Keluarga / Warga',
      'Status Hunian',
      'Kontak Pemilik (Jika Dikontrakan)',
      'Status KTP',
      'Status KK',
      'Status Kelengkapan Berkas',
      'Status Akun',
      'Kontak Telepon / WA',
      'Jumlah Tagihan Menunggak',
      'Total Nominal Tunggakan (Rp)',
      'Status Rumah',
    ],
    ...sorted.map((h) => [
      h.houseCode,
      h.blockCode,
      h.houseNumber,
      h.headName,
      h.occupancyStatus === 'RENTED' ? 'Dikontrakan' : h.occupancyStatus === 'VACANT' ? 'Belum Dihuni' : 'Dihuni Pemilik',
      h.ownerPhone ?? '—',
      h.ktpVerified ? 'Terverifikasi' : 'Belum',
      h.kkVerified ? 'Terverifikasi' : 'Belum',
      h.ktpVerified && h.kkVerified ? 'Lengkap (KTP & KK)' : (!h.ktpVerified && !h.kkVerified ? 'Belum Ada Berkas' : 'Belum Lengkap'),
      h.hasAccount ? 'Akun Aktif' : 'Belum Aktivasi',
      h.phone ?? h.phoneMasked ?? '—',
      h.outstandingBillCount,
      String(h.outstandingAmount),
      h.isActive ? 'Aktif' : 'Nonaktif',
    ]),
  ]

  downloadCsv(`Daftar_Warga_Lingkungan_${dateStr}.csv`, rows)
}

export function exportWargaListPrint(houses: HouseArrears[]): void {
  const sorted = [...houses].sort((a, b) => a.houseCode.localeCompare(b.houseCode))
  const totalArrears = sorted.reduce((acc, h) => acc + BigInt(h.outstandingAmount || 0), 0n)
  const activeCount = sorted.filter((h) => h.isActive).length
  const docsCompleteCount = sorted.filter((h) => h.ktpVerified && h.kkVerified).length

  const summaryBoxes = `
    <div class="doc-subtitle">Data inventaris rumah, penghuni, kelengkapan berkas administrasi, serta rekap tagihan</div>
    <div class="summary-boxes">
      <div class="summary-box">
        <span>Total Rumah</span>
        <strong>${sorted.length} Rumah (${activeCount} Aktif)</strong>
      </div>
      <div class="summary-box">
        <span>Kelengkapan Berkas (KTP & KK)</span>
        <strong style="color: ${docsCompleteCount === sorted.length ? '#1f604b' : '#b45309'};">${docsCompleteCount} / ${sorted.length} Lengkap</strong>
      </div>
      <div class="summary-box">
        <span>Total Akun Terdaftar</span>
        <strong>${sorted.filter((h) => h.hasAccount).length} Akun</strong>
      </div>
      <div class="summary-box">
        <span>Total Tunggakan Kas</span>
        <strong style="color: ${totalArrears > 0n ? '#8c382f' : '#1f604b'};">${formatCurrency(totalArrears)}</strong>
      </div>
    </div>
  `

  const rowsHtml = sorted
    .map(
      (h, idx) => `
    <tr>
      <td class="text-center">${idx + 1}</td>
      <td><b>${escapeHtml(h.houseCode)}</b></td>
      <td>${escapeHtml(h.headName)}</td>
      <td>${h.occupancyStatus === 'RENTED' ? `Dikontrakan${h.ownerPhone ? `<br><small style="color:#1b4332;">Pemilik: ${escapeHtml(h.ownerPhone)}</small>` : ''}` : h.occupancyStatus === 'VACANT' ? 'Belum Dihuni' : 'Dihuni Pemilik'}</td>
      <td>${escapeHtml(h.phone ?? h.phoneMasked ?? '—')}</td>
      <td class="text-center">
        <span class="tag ${h.hasAccount ? 'tag-green' : 'tag-gray'}">
          ${h.hasAccount ? 'Aktif' : 'Belum'}
        </span>
      </td>
      <td class="text-center">
        <span class="tag ${h.ktpVerified && h.kkVerified ? 'tag-green' : 'tag-orange'}" style="display:block;margin-bottom:2px;font-size:10px;">
          ${h.ktpVerified && h.kkVerified ? '✓ Lengkap' : 'Belum Lengkap'}
        </span>
        <small style="color:#555;font-size:10px;">
          KTP: ${h.ktpVerified ? '✓' : '—'} · KK: ${h.kkVerified ? '✓' : '—'}
        </small>
      </td>
      <td class="text-center">${h.outstandingBillCount}</td>
      <td class="text-right"><b>${formatCurrency(h.outstandingAmount)}</b></td>
    </tr>
  `,
    )
    .join('')

  const bodyHtml = `
    ${summaryBoxes}
    <table>
      <thead>
        <tr>
          <th style="width: 30px;" class="text-center">No</th>
          <th style="width: 75px;">No Rumah</th>
          <th>Nama Kepala Keluarga</th>
          <th style="width: 100px;">Hunian</th>
          <th style="width: 120px;">Kontak HP/WA</th>
          <th style="width: 60px;" class="text-center">Akun</th>
          <th style="width: 125px;" class="text-center">Status Administrasi</th>
          <th style="width: 65px;" class="text-center">Tunggakan</th>
          <th style="width: 110px;" class="text-right">Nominal</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `

  printHtmlDocument('Daftar Rumah dan Warga Lingkungan', bodyHtml)
}

function formatDateIso(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
