import {
	SET_STATUS_LABEL,
	deriveSetCompleteness,
	type AccreditationSetEntity,
} from '../entities/accreditation-set.entity';

export type AccreditationSetQueryDto = {
	q?: string;
	sort?: string;
	dir?: 'asc' | 'desc';
	page: number;
	pageSize: number;
};

export type AccreditationSetPage = {
	rows: AccreditationSetEntity[];
	rowCount: number;
};

function compare(
	a: AccreditationSetEntity,
	b: AccreditationSetEntity,
	sort: string,
): number {
	switch (sort) {
		case 'lembaga':
			return a.lembaga.localeCompare(b.lembaga, 'id');
		case 'tahunSiklus':
			return a.tahunSiklus - b.tahunSiklus;
		case 'status':
			// Draf lebih dulu: yang belum siap itulah yang menunggu dikerjakan.
			return a.status.localeCompare(b.status);
		default:
			return a.nama.localeCompare(b.nama, 'id');
	}
}

/**
 * Penyaringan, pengurutan, dan pemotongan halaman untuk daftar set.
 *
 * Alasannya sama dengan `applyCriterionQuery`: `DataTable` di proyek ini selalu
 * manual, jadi tabel yang diberi seluruh baris sekaligus akan menampilkan kotak
 * pencarian yang tidak menyaring dan penunjuk halaman yang tidak cocok dengan
 * isinya.
 */
export function applyAccreditationSetQuery(
	sets: AccreditationSetEntity[],
	query: AccreditationSetQueryDto,
): AccreditationSetPage {
	const keyword = query.q?.trim().toLowerCase() ?? '';
	const filtered = keyword
		? sets.filter(
				(set) =>
					set.nama.toLowerCase().includes(keyword) ||
					set.lembaga.toLowerCase().includes(keyword) ||
					String(set.tahunSiklus).includes(keyword) ||
					// Yang dicocokkan label yang terbaca di layar ("Draf"), bukan nilai
					// enum-nya — pengguna mengetik apa yang ia lihat.
					SET_STATUS_LABEL[set.status].toLowerCase().includes(keyword) ||
					(deriveSetCompleteness(set).lengkap &&
						'lengkap'.includes(keyword)),
			)
		: sets;

	const sortKey = query.sort ?? 'nama';
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
