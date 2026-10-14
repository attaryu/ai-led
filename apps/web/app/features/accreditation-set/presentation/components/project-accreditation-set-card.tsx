import * as React from 'react';
import { Link } from 'react-router';
import { InfoIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '~/core/components/ui/dialog';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/core/components/ui/tooltip';
import { cn } from '~/core/lib/utils';
import { type LedProjectEntity } from '~/features/led-project/domain/entities/led-project.entity';
import { accreditationSetRepository } from '../../data/repositories/accreditation-set.repository';
import { type AccreditationSetEntity } from '../../domain/entities/accreditation-set.entity';
import { useProjectAccreditationSet } from '../hooks/use-project-accreditation-set';

function DaftarPilihan({
	terbuka,
	onTutup,
	terpilihId,
	onPilih,
}: {
	terbuka: boolean;
	onTutup: () => void;
	terpilihId: string | null;
	onPilih: (set: AccreditationSetEntity) => void;
}) {
	const [pilihan, setPilihan] = React.useState<AccreditationSetEntity[]>([]);

	React.useEffect(() => {
		if (terbuka) accreditationSetRepository.findSelectable().then(setPilihan);
	}, [terbuka]);

	return (
		<Dialog open={terbuka} onOpenChange={(nilai) => !nilai && onTutup()}>
			<DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{terpilihId ? 'Ganti Acuan Penilaian' : 'Pilih Acuan Penilaian'}
					</DialogTitle>
					<DialogDescription>
						Set yang dipilih akan terkunci dari perubahan selama dokumen ini
						memakainya.
					</DialogDescription>
				</DialogHeader>

				{pilihan.length === 0 ? (
					<div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
						Belum ada set akreditasi yang berstatus siap. Set perlu dilengkapi
						berkas dan isi rubriknya lebih dulu di menu Set Akreditasi.
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{pilihan.map((set) => {
							const sedangDipakai = set.id === terpilihId;

							return (
								<button
									key={set.id}
									type="button"
									disabled={sedangDipakai}
									onClick={() => onPilih(set)}
									className={cn(
										'rounded-lg border p-3 text-left transition-colors',
										sedangDipakai
											? 'cursor-default border-primary bg-primary/5'
											: 'cursor-pointer border-border hover:bg-muted',
									)}
								>
									<div className="flex items-center justify-between gap-2">
										<p className="font-medium">{set.nama}</p>
										{sedangDipakai && (
											<span className="shrink-0 text-xs text-primary">
												Sedang dipakai
											</span>
										)}
									</div>
									<p className="text-sm text-muted-foreground">
										{set.lembaga} · siklus {set.tahunSiklus} ·{' '}
										{set.kriteria.length} kriteria
									</p>
								</button>
							);
						})}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

/**
 * Acuan penilaian dokumen, beserta tempat memilih dan menggantinya.
 *
 * Sengaja hanya memuat nama set dan aksinya: rincian lembaga, siklus, dan
 * kriteria sudah ada di halaman set itu sendiri. Alasan acuan tak bisa diganti
 * disimpan di tooltip judul, bukan di badan kartu, karena ia hanya jawaban atas
 * pertanyaan "kenapa tidak ada tombolnya" dan tidak perlu terbaca setiap saat.
 */
export function ProjectAccreditationSetCard({
	project,
}: {
	project: LedProjectEntity;
}) {
	const { set, sudahDinilai, bolehMengganti, pilih } =
		useProjectAccreditationSet(project);
	const [dialogTerbuka, setDialogTerbuka] = React.useState(false);
	const [errorPilih, setErrorPilih] = React.useState<string | null>(null);

	return (
		<Card size="sm" className="h-full">
			<CardHeader>
				<CardTitle className="flex items-center gap-1.5">
					Acuan Penilaian
					{set && sudahDinilai && (
						<Tooltip>
							<TooltipTrigger
								render={
									<button
										type="button"
										aria-label="Kenapa acuan tidak bisa diganti"
										className="cursor-pointer rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
									/>
								}
							>
								<InfoIcon className="size-4" />
							</TooltipTrigger>
							<TooltipContent>
								Acuan tidak bisa diganti lagi. Ia sudah dipakai menilai dokumen
								ini.
							</TooltipContent>
						</Tooltip>
					)}
				</CardTitle>
			</CardHeader>

			<CardContent className="flex flex-col items-start gap-3">
				{set ? (
					<Link
						to={`/dashboard/accreditation-sets/${set.id}`}
						className="font-medium text-primary underline-offset-4 hover:underline"
					>
						{set.nama}
					</Link>
				) : (
					<p className="text-sm text-muted-foreground">Belum dipilih</p>
				)}

				{bolehMengganti && (
					<Button
						variant={set ? 'outline' : 'default'}
						size="sm"
						className="cursor-pointer"
						onClick={() => setDialogTerbuka(true)}
					>
						{set ? 'Ganti Acuan' : 'Pilih Acuan'}
					</Button>
				)}
			</CardContent>

			{errorPilih && (
				<p className="px-6 pb-4 text-xs text-destructive">{errorPilih}</p>
			)}

			<DaftarPilihan
				terbuka={dialogTerbuka}
				onTutup={() => setDialogTerbuka(false)}
				terpilihId={set?.id ?? null}
				onPilih={(dipilih) => {
					setDialogTerbuka(false);
					setErrorPilih(null);
					pilih(dipilih).catch((e) =>
						setErrorPilih(e instanceof Error ? e.message : 'Gagal mengganti acuan.'),
					);
				}}
			/>
		</Card>
	);
}
