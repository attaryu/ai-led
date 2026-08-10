import { ClockCountdownIcon, WarningCircleIcon } from '@phosphor-icons/react';

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import {
	ACCREDITATION_EXPIRY_SOON_DAYS,
	peringkatAkreditasiEnum,
} from '~/features/study-program/domain/entities/study-program.entity';
import { AccreditationRankBadge } from '~/features/study-program/presentation/components/accreditation-rank-badge';
import { type InstitutionAccreditation } from '../../domain/entities/institution-readiness.entity';

/**
 * Blok A Dashboard Utama (docs/application_flow.md §4.0a) — **capaian yang
 * sudah disahkan**, kerangka waktunya masa lalu.
 *
 * Berdiri sebagai bloknya sendiri, bukan kartu kelima di baris ringkasan
 * penyusunan. Menyandingkannya dengan angka kelengkapan bab membuat peringkat
 * hasil penyusunan sebelumnya terbaca sebagai ukuran pekerjaan sekarang —
 * kesalahan yang sudah pernah dibuat dan diperbaiki di Dashboard Prodi
 * (§5.1, PRD §3.8).
 *
 * Disajikan sebagai distribusi, bukan rata-rata: peringkat itu ordinal, dan
 * "rata-rata Unggul dan Baik" bukan besaran yang punya arti.
 */
export function InstitutionAccreditationCard({
	akreditasi,
}: {
	akreditasi: InstitutionAccreditation;
}) {
	const { totalProdi, komposisi, kedaluwarsa, mendekati } = akreditasi;

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
						<ul className="flex flex-wrap gap-x-6 gap-y-3">
							{peringkatAkreditasiEnum.options.map((peringkat) => (
								<li key={peringkat} className="flex items-center gap-2">
									<AccreditationRankBadge peringkat={peringkat} />
									<span className="font-heading text-lg font-bold tabular-nums">
										{komposisi[peringkat]}
									</span>
									<span className="text-xs text-muted-foreground">prodi</span>
								</li>
							))}
						</ul>

						{/*
						 * Hanya dirender bila memang ada yang mendesak. Baris "0 prodi
						 * kedaluwarsa" yang selalu ada justru melatih pembaca untuk
						 * mengabaikan tempat ini.
						 */}
						{(kedaluwarsa > 0 || mendekati > 0) && (
							<div className="flex flex-col gap-2 border-t border-border pt-3">
								{kedaluwarsa > 0 && (
									<p className="flex items-start gap-2 text-sm text-destructive">
										<WarningCircleIcon
											className="mt-0.5 size-4 shrink-0"
											weight="fill"
										/>
										{kedaluwarsa} prodi masa berlaku akreditasinya sudah habis.
									</p>
								)}
								{mendekati > 0 && (
									<p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
										<ClockCountdownIcon
											className="mt-0.5 size-4 shrink-0"
											weight="fill"
										/>
										{mendekati} prodi masa berlakunya tersisa{' '}
										{ACCREDITATION_EXPIRY_SOON_DAYS} hari atau kurang.
									</p>
								)}
							</div>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
