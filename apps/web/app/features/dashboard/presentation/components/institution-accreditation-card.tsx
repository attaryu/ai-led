import { Link } from 'react-router';

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import { formatDate, formatDayCount } from '~/core/lib/format-time';
import { cn } from '~/core/lib/utils';
import {
	PERINGKAT_AKREDITASI_LABEL,
	peringkatAkreditasiEnum,
	type AccreditationUrgency,
} from '~/features/study-program/domain/entities/study-program.entity';
import { accreditationRankFills } from '~/features/study-program/presentation/components/accreditation-rank-badge';
import { type InstitutionAccreditation } from '../../domain/entities/institution-readiness.entity';

const validityTones: Record<AccreditationUrgency, string> = {
	AMAN: 'text-muted-foreground',
	MENDEKATI: 'text-amber-700 dark:text-amber-400',
	KEDALUWARSA: 'text-destructive',
};

/**
 * Dashboard Utama §4.0a (docs/application_flow.md) — **capaian yang
 * sudah disahkan**, kerangka waktunya masa lalu.
 *
 * Berdiri sebagai bloknya sendiri, bukan kartu kelima di baris ringkasan
 * penyusunan. Menyandingkannya dengan angka kelengkapan bab membuat peringkat
 * hasil penyusunan sebelumnya terbaca sebagai ukuran pekerjaan sekarang —
 * kesalahan yang sudah pernah dibuat dan diperbaiki di Dashboard Program Studi
 * (§5.1, PRD §3.8).
 *
 * Disajikan sebagai distribusi, bukan rata-rata: peringkat itu ordinal, dan
 * "rata-rata Unggul dan Baik" bukan besaran yang punya arti.
 *
 * Kartunya menjawab dua pertanyaan berurutan: **bagaimana komposisinya** (bar +
 * legenda) dan **siapa yang paling dekat kehabisan masa berlaku** (daftar di
 * bawahnya). Versi sebelumnya berhenti di pertanyaan pertama dan menutupnya
 * dengan dua baris agregat "N prodi kedaluwarsa" — angka yang benar tapi tidak
 * bisa ditindaklanjuti tanpa membuka halaman lain untuk mencari nama prodinya.
 */
export function InstitutionAccreditationCard({
	akreditasi,
}: {
	akreditasi: InstitutionAccreditation;
}) {
	const { totalProdi, komposisi, persenKomposisi, terdekatBerakhir } =
		akreditasi;

	// Peringkat tanpa prodi tidak merender segmen: sliver selebar nol tidak
	// menyampaikan apa pun dan hanya mengacaukan celah antar segmen.
	const terpakai = peringkatAkreditasiEnum.options.filter(
		(peringkat) => komposisi[peringkat] > 0,
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Posisi Akreditasi</CardTitle>
				<CardDescription>
					Capaian yang sudah disahkan dari penyusunan sebelumnya, bukan ukuran
					pekerjaan yang sedang berjalan.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{totalProdi === 0 ? (
					<p className="text-sm text-muted-foreground">
						Belum ada program studi di universitas ini.
					</p>
				) : (
					<>
						<div className="flex flex-col gap-2">
							<p className="font-heading text-lg font-bold tracking-tight tabular-nums">
								{totalProdi} program studi
							</p>

							{/*
							 * Pemisah antar segmen adalah celah 2px berwarna kartu, bukan
							 * garis tepi: garis menambah tinta yang bukan data, sedangkan
							 * ruang kosong memisahkan tanpa ikut terbaca sebagai isi.
							 */}
							<div
								className="flex h-4 gap-[2px] overflow-hidden rounded-full"
								role="img"
								aria-label={peringkatAkreditasiEnum.options
									.map(
										(peringkat) =>
											`${PERINGKAT_AKREDITASI_LABEL[peringkat]} ${komposisi[peringkat]} program studi`,
									)
									.join(', ')}
							>
								{terpakai.map((peringkat) => (
									<div
										key={peringkat}
										className={accreditationRankFills[peringkat]}
										style={{
											width: `${(komposisi[peringkat] / totalProdi) * 100}%`,
										}}
										title={`${PERINGKAT_AKREDITASI_LABEL[peringkat]} — ${komposisi[peringkat]} program studi (${persenKomposisi[peringkat]}%)`}
									/>
								))}
							</div>
						</div>

						{/*
						 * Legenda memuat seluruh peringkat, termasuk yang nol: di sini
						 * "tidak ada satu pun prodi Unggul" adalah kabar, bukan ketiadaan
						 * data — berbeda dari bar di atas yang memang tidak punya bidang
						 * untuk digambar.
						 *
						 * Persen berdiri sebagai keterangan di belakang jumlah prodi, bukan
						 * menggantikannya: angkanya dibulatkan sehingga keempatnya bisa
						 * tidak berjumlah tepat 100, dan "25%" sendirian tidak memberi tahu
						 * apakah itu 1 dari 4 atau 50 dari 200.
						 */}
						<ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
							{peringkatAkreditasiEnum.options.map((peringkat) => (
								<li key={peringkat} className="flex items-center gap-2 text-sm">
									<span
										aria-hidden
										className={cn(
											'size-2.5 shrink-0 rounded-full',
											accreditationRankFills[peringkat],
										)}
									/>
									<span className="min-w-0 truncate">
										{PERINGKAT_AKREDITASI_LABEL[peringkat]}
									</span>
									<span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
										<span className="font-medium text-foreground">
											{komposisi[peringkat]}
										</span>{' '}
										program studi · {persenKomposisi[peringkat]}%
									</span>
								</li>
							))}
						</ul>

						{terdekatBerakhir.length > 0 && (
							<div className="flex flex-col gap-2 border-t border-border pt-3">
								<p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
									Masa berlaku terdekat berakhir
								</p>
								{/*
								 * Daftar ini tidak menyebut apakah prodinya sudah menyusun, dan
								 * tidak memberi tombol. Pertanyaan "siapa yang harus mulai
								 * sekarang" dijawab tabel Perlu Segera Disusun (§4.0c) lengkap
								 * dengan aksinya; menjawabnya di dua tempat membuat pembaca
								 * menebak mana yang mengikat. Yang dijawab di sini hanya "kapan
								 * masa berlaku kami berakhir" — untuk seluruh prodi, yang sedang
								 * menyusun maupun tidak.
								 */}
								<ul className="flex flex-col gap-1.5">
									{terdekatBerakhir.map(({ program, validity }) => (
										<li
											key={program.id}
											className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
										>
											<Link
												to={`/study-programs/${program.id}`}
												className="min-w-0 truncate underline-offset-4 hover:underline"
											>
												{program.studyProgramName}
											</Link>
											<span className="shrink-0 text-muted-foreground">
												{formatDate(program.berlakuSampaiAkreditasi!)}
											</span>
											<span
												className={cn(
													'shrink-0 tabular-nums',
													validityTones[validity.urgensi],
												)}
											>
												· {formatDayCount(validity.sisaHari)}
											</span>
										</li>
									))}
								</ul>
							</div>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
