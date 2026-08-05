/**
 * Pemformat waktu berbahasa Indonesia yang dipakai lintas fitur.
 *
 * Sebelumnya tinggal di `features/evidence/presentation/utils/evidence-format.ts`
 * dan sudah diimpor lintas fitur oleh Dashboard Project LED. Begitu Dashboard
 * Prodi jadi pemakai ketiga, tempatnya pindah ke `core` dengan alasan yang sama
 * seperti {@link ../components/ui/stat-card StatCard}: bentuknya sama di semua
 * dashboard, yang berbeda hanya nilainya. `formatBytes`/`getFileVisual` sengaja
 * ditinggal di evidence karena keduanya memang khusus berkas.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Tanggal lengkap tanpa jam: "12 Agustus 2027". */
export function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
}

/** Tanggal beserta jam: "12 Agustus 2027 14.30". */
export function formatDateTime(iso: string): string {
	return new Date(iso).toLocaleString('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

/** Waktu relatif ke masa lalu ("2 jam lalu"). Murni pemanis tampilan. */
export function formatRelativeTime(iso: string): string {
	const diffMs = Date.now() - new Date(iso).getTime();
	const diffMinutes = Math.round(diffMs / 60000);

	if (diffMinutes < 1) return 'baru saja';
	if (diffMinutes < 60) return `${diffMinutes} menit lalu`;

	const diffHours = Math.round(diffMinutes / 60);
	if (diffHours < 24) return `${diffHours} jam lalu`;

	const diffDays = Math.round(diffHours / 24);
	if (diffDays < 30) return `${diffDays} hari lalu`;

	return new Date(iso).toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});
}

/**
 * ISO → nilai `<input type="date">` ("2027-08-12"). String kosong untuk `null`,
 * karena input HTML tidak mengenal nilai kosong selain itu.
 */
export function toDateInputValue(iso: string | null): string {
	if (!iso) return '';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	// Dibangun dari komponen waktu lokal, bukan `toISOString()`, supaya tanggal
	// tidak bergeser sehari untuk zona waktu di timur UTC.
	const bulan = `${date.getMonth() + 1}`.padStart(2, '0');
	const hari = `${date.getDate()}`.padStart(2, '0');
	return `${date.getFullYear()}-${bulan}-${hari}`;
}

/** Nilai `<input type="date">` → ISO; `null` bila dikosongkan. */
export function fromDateInputValue(value: string): string | null {
	if (!value.trim()) return null;
	const date = new Date(`${value}T00:00:00`);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Selisih hari kalender antara `iso` dan `now`, positif bila `iso` masih di
 * depan. Dihitung dari tengah malam masing-masing tanggal supaya "besok" selalu
 * bernilai 1 — bukan 0 hanya karena jamnya kebetulan lebih pagi.
 */
export function daysUntil(iso: string, now: number = Date.now()): number {
	const target = new Date(iso);
	const today = new Date(now);
	target.setHours(0, 0, 0, 0);
	today.setHours(0, 0, 0, 0);
	return Math.round((target.getTime() - today.getTime()) / MS_PER_DAY);
}

/**
 * Jarak waktu dalam satuan yang enak dibaca: "34 hari lagi", "2 tahun 1 bulan
 * lagi", "terlambat 5 hari", "hari ini".
 *
 * Satuannya naik seiring jaraknya karena presisi hari tidak berguna untuk
 * tenggat yang masih bertahun-tahun — "782 hari lagi" tidak memberi tahu apa
 * pun yang tidak diberi tahu "2 tahun 1 bulan lagi".
 */
export function formatDayCount(days: number): string {
	if (days === 0) return 'hari ini';
	if (days < 0) return `terlambat ${describeSpan(-days)}`;
	return `${describeSpan(days)} lagi`;
}

function describeSpan(days: number): string {
	if (days < 60) return `${days} hari`;

	const months = Math.floor(days / 30);
	if (months < 12) return `${months} bulan`;

	const years = Math.floor(months / 12);
	const sisaBulan = months % 12;
	return sisaBulan === 0 ? `${years} tahun` : `${years} tahun ${sisaBulan} bulan`;
}
