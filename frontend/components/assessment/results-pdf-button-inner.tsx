// ami-assessment/frontend/components/assessment/results-pdf-button.tsx
'use client'

import { useState } from 'react'
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'
import { Button } from '@/components/ui/button'
import type { SessionResultsResponse } from '@/lib/types'

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9 },
  title: { fontSize: 14, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 9, color: '#666', marginBottom: 12 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 4 },
  headerRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#334155', paddingVertical: 4, fontWeight: 700 },
  colNo: { width: 24, textAlign: 'center' },
  colKriteria: { width: 130 },
  colSkor: { width: 40, textAlign: 'center' },
  colJust: { flex: 1 },
  colRekom: { flex: 1 },
  colConf: { width: 40, textAlign: 'center' },
})

function ResultsDocument({
  results,
  avgScore,
}: {
  results: SessionResultsResponse
  avgScore: string
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>AMI Assessment — Hasil Penilaian</Text>
        <Text style={styles.subtitle}>
          Session: {results.session_id} • Total: {results.total_indicators} indikator • Skor
          rata-rata: {avgScore}
        </Text>
        <View style={styles.headerRow}>
          <Text style={styles.colNo}>No</Text>
          <Text style={styles.colKriteria}>Kriteria</Text>
          <Text style={styles.colSkor}>Skor</Text>
          <Text style={styles.colJust}>Justifikasi</Text>
          <Text style={styles.colRekom}>Rekomendasi</Text>
          <Text style={styles.colConf}>Conf.</Text>
        </View>
        {results.results.map((r) => (
          <View style={styles.row} key={r.indicator_no} wrap={false}>
            <Text style={styles.colNo}>{r.indicator_no}</Text>
            <Text style={styles.colKriteria}>{r.kriteria || '—'}</Text>
            <Text style={styles.colSkor}>{r.score != null ? r.score.toFixed(1) : '–'}</Text>
            <Text style={styles.colJust}>{r.error ? `Error: ${r.error}` : r.justification || '—'}</Text>
            <Text style={styles.colRekom}>{r.error ? '—' : r.recommendation || '—'}</Text>
            <Text style={styles.colConf}>{r.confidence != null ? r.confidence.toFixed(2) : '—'}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}

export function ResultsPdfButton({
  results,
  avgScore,
}: {
  results: SessionResultsResponse
  avgScore: string
}) {
  const [isGenerating, setIsGenerating] = useState(false)

  async function handleDownload() {
    setIsGenerating(true)
    try {
      const blob = await pdf(<ResultsDocument results={results} avgScore={avgScore} />).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `AMI_Hasil_Penilaian_${results.session_id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Button variant="destructive" onClick={handleDownload} disabled={isGenerating}>
      {isGenerating ? 'Membuat PDF…' : 'Unduh PDF'}
    </Button>
  )
}
