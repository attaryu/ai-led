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

/**
 * Jarak waktu ke masa lalu, belum berimbuhan.
 *
 * Tangga satuannya dipisah dari pemformatnya supaya dua ejaan yang dipakai
 * aplikasi ini — "2 jam lalu" di kolom tabel dan "2 jam yang lalu" di kalimat
 * berjalan — tidak bisa menyimpang satu sama lain.
 */
type Elapsed =
	/** Terlalu baru untuk punya satuan; kalimatnya berdiri sendiri. */
	| { kind: 'baru-saja' }
	/** Berimbuhan, mis. "3 menit". */
	| { kind: 'relatif'; teks: string }
	/** Sudah terlalu jauh untuk dihitung mundur; tanggal apa adanya. */
	| { kind: 'tanggal'; teks: string };

function describeElapsed(iso: string): Elapsed {
	const diffMs = Date.now() - new Date(iso).getTime();
	const diffMinutes = Math.round(diffMs / 60000);

	if (diffMinutes < 1) return { kind: 'baru-saja' };
	if (diffMinutes < 60) return { kind: 'relatif', teks: `${diffMinutes} menit` };

	const diffHours = Math.round(diffMinutes / 60);
	if (diffHours < 24) return { kind: 'relatif', teks: `${diffHours} jam` };

	const diffDays = Math.round(diffHours / 24);
	if (diffDays < 30) return { kind: 'relatif', teks: `${diffDays} hari` };

	return {
		kind: 'tanggal',
		teks: new Date(iso).toLocaleDateString('id-ID', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
		}),
	};
}

/** Waktu relatif ke masa lalu ("2 jam lalu"). Murni pemanis tampilan. */
export function formatRelativeTime(iso: string): string {
	const elapsed = describeElapsed(iso);
	if (elapsed.kind === 'baru-saja') return 'baru saja';
	if (elapsed.kind === 'tanggal') return elapsed.teks;
	return `${elapsed.teks} lalu`;
}

/**
 * Varian kalimat berjalan: "Tersimpan 3 menit yang lalu"
 * (docs/application_flow.md §7.2). Bedanya dengan {@link formatRelativeTime}
 * hanya imbuhan — untuk tanggal yang sudah jauh, keduanya sama-sama menyebut
 * tanggalnya tanpa imbuhan apa pun ("Tersimpan 12 Agu 2027").
 */
export function formatRelativeTimeLong(iso: string): string {
	const elapsed = describeElapsed(iso);
	if (elapsed.kind === 'baru-saja') return 'baru saja';
	if (elapsed.kind === 'tanggal') return elapsed.teks;
	return `${elapsed.teks} yang lalu`;
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
