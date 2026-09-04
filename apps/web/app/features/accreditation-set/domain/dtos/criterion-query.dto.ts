import { type RubricCriterion } from '~/features/chapter/domain/entities/rubric-criterion.entity';

export type CriterionQueryDto = {
	q?: string;
	sort?: string;
	dir?: 'asc' | 'desc';
	page: number;
	pageSize: number;
};

export type CriterionPage = {
	rows: RubricCriterion[];
	/** Jumlah baris hasil penyaringan, sebelum dipotong per halaman. */
	rowCount: number;
};

function compare(a: RubricCriterion, b: RubricCriterion, sort: string): number {
	switch (sort) {
		case 'kodeKriteria':
			return a.kodeKriteria.localeCompare(b.kodeKriteria, 'id');
		case 'kriteria':
			return a.kriteria.localeCompare(b.kriteria, 'id');
		case 'tipeSkor':
			return a.tipeSkor.localeCompare(b.tipeSkor);
		default:
			return a.no - b.no;
	}
}

/**
 * Menyaring, mengurutkan, dan memotong daftar kriteria untuk `DataTable`.
 *
 * **Wajib ada.** `DataTable` di proyek ini selalu berjalan dengan
 * `manualPagination`, `manualSorting`, dan `manualFiltering` menyala dan hanya
 * memasang `getCoreRowModel` — artinya ia tidak pernah menyaring apa pun
 * sendiri. Memberinya seluruh baris sekaligus membuat kotak pencarian tampil
 * tapi diam, dan penunjuk halaman menyebut angka yang tidak sesuai isi tabel.
 *
 * Dijalankan di memori, bukan lewat repository seperti `led-project`: seluruh
 * kriteria satu set memang sudah ikut terbawa bersama setnya, dan membaca ulang
 * localStorage tiap ketikan hanya menambah kerja tanpa menambah kebenaran.
 * Bentuk kembaliannya sengaja sama dengan `LedProjectPage`, supaya saat isinya
 * berpindah ke endpoint nanti pemanggilnya tidak perlu berubah.
 */
export function applyCriterionQuery(
	kriteria: RubricCriterion[],
	query: CriterionQueryDto,
): CriterionPage {
	const keyword = query.q?.trim().toLowerCase() ?? '';
	const filtered = keyword
		? kriteria.filter(
				(k) =>
					String(k.no).includes(keyword) ||
					k.kodeKriteria.toLowerCase().includes(keyword) ||
					k.kriteria.toLowerCase().includes(keyword) ||
					k.deskripsi.toLowerCase().includes(keyword),
			)
		: kriteria;

	const sortKey = query.sort ?? 'no';
	const descending = query.dir === 'desc';
	const sorted = [...filtered].sort((a, b) => {
		const hasil = compare(a, b, sortKey);
		return descending ? -hasil : hasil;
	});

	const mulai = query.page * query.pageSize;

	return {
		rows: sorted.slice(mulai, mulai + query.pageSize),
		rowCount: sorted.length,
	};
}
