import * as React from 'react';
import { Link } from 'react-router';
import { LockSimpleIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
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

/** Satu baris keterangan bertitik dua, sejajar dengan baris di sebelahnya. */
function Baris({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-3 text-sm">
			<span className="shrink-0 text-muted-foreground">{label}</span>
			<span className="min-w-0 text-right">{children}</span>
		</div>
	);
}

/**
 * Rincian acuan penilaian dokumen, beserta tempat memilih dan menggantinya.
 *
 * Ditaruh di kolom kanan bersama Perlu Perhatian dan Status Dokumen, bukan di
 * kepala halaman: rinciannya jarang dibaca dan aksinya nyaris tidak pernah
 * dipakai, jadi ia tidak pantas berebut perhatian dengan judul. Yang perlu
 * terbaca sekilas sudah diwakili lencana di sebelah judul.
 */
export function ProjectAccreditationSetCard({
	project,
}: {
	project: LedProjectEntity;
}) {
	const { set, sudahDinilai, bolehMengganti, pilih } =
		useProjectAccreditationSet(project);
	const [dialogTerbuka, setDialogTerbuka] = React.useState(false);

	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Acuan Penilaian</CardTitle>
				<CardDescription>
					{set
						? 'Rubrik dan panduan yang dipakai menilai dokumen ini.'
						: 'Penyusunan bab tetap bisa berjalan; acuan diperlukan saat dokumen ini dinilai.'}
				</CardDescription>
			</CardHeader>

			<CardContent className="flex flex-col items-start gap-3">
				{set ? (
					<>
						<div className="w-full">
							<Link
								to={`/dashboard/accreditation-sets/${set.id}`}
								className="font-medium text-primary underline-offset-4 hover:underline"
							>
								{set.nama}
							</Link>
						</div>

						<div className="flex w-full flex-col gap-1">
							<Baris label="Lembaga">{set.lembaga}</Baris>
							<Baris label="Siklus">
								<span className="tabular-nums">{set.tahunSiklus}</span>
							</Baris>
							<Baris label="Kriteria">
								<span className="tabular-nums">
									{set.kriteria.length} kriteria
								</span>
							</Baris>
						</div>

						{bolehMengganti && (
							<Button
								variant="outline"
								size="sm"
								className="cursor-pointer"
								onClick={() => setDialogTerbuka(true)}
							>
								Ganti Acuan
							</Button>
						)}

						{sudahDinilai && (
							<p className="flex items-start gap-1.5 text-xs text-muted-foreground">
								<LockSimpleIcon className="mt-0.5 size-3.5 shrink-0" />
								Sudah dipakai menilai dokumen ini, jadi acuannya tidak bisa
								diganti lagi.
							</p>
						)}
					</>
				) : bolehMengganti ? (
					<Button
						size="sm"
						className="cursor-pointer"
						onClick={() => setDialogTerbuka(true)}
					>
						Pilih Acuan
					</Button>
				) : (
					<p className="text-xs text-muted-foreground">
						Penjamin Mutu yang menentukan acuan penilaian dokumen ini.
					</p>
				)}
			</CardContent>

			<DaftarPilihan
				terbuka={dialogTerbuka}
				onTutup={() => setDialogTerbuka(false)}
				terpilihId={set?.id ?? null}
				onPilih={(dipilih) => {
					pilih(dipilih);
					setDialogTerbuka(false);
				}}
			/>
		</Card>
	);
}
