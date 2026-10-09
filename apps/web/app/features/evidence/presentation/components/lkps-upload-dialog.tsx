import * as React from 'react';
import { UploadSimpleIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/core/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '~/core/components/ui/field';
import { Input } from '~/core/components/ui/input';
import { evidenceRepository } from '../../data/repositories/evidence.repository';
import {
	LKPS_NAMA_MAX,
	LKPS_PERIODE_MAX,
	sarankanNamaLkps,
	validateLkpsMeta,
} from '../../domain/lkps-meta';

/**
 * Unggah LKPS **dengan nama dan tahun/periode**, bukan sekadar memilih berkas.
 *
 * Satu prodi boleh punya beberapa LKPS dan tiap Dokumen LED memilih salah satunya
 * (form "Tambah Dokumen LED"), jadi LKPS harus bisa dibedakan: nama berkas saja
 * ("lkps_final_v2.xlsx") tidak menjawab "LKPS tahun berapa?". Nama diisi otomatis dari
 * nama berkas begitu berkas dipilih -- sekadar saran, tetap bisa diubah.
 */
export function LkpsUploadDialog({
	open,
	onOpenChange,
	studyProgramId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	studyProgramId: string;
}) {
	const inputRef = React.useRef<HTMLInputElement>(null);
	const [berkas, setBerkas] = React.useState<File | null>(null);
	const [nama, setNama] = React.useState('');
	const [periode, setPeriode] = React.useState('');
	const [galat, setGalat] = React.useState<{ berkas?: string; nama?: string; periode?: string; umum?: string }>({});
	const [mengunggah, setMengunggah] = React.useState(false);

	React.useEffect(() => {
		if (!open) return;
		setBerkas(null);
		setNama('');
		setPeriode('');
		setGalat({});
	}, [open]);

	const pilihBerkas = (file: File | undefined) => {
		if (!file) return;
		setBerkas(file);
		// Nama hanya disarankan selama pengguna belum mengetiknya sendiri.
		setNama((sekarang) => (sekarang.trim() ? sekarang : sarankanNamaLkps(file.name)));
		setGalat((g) => ({ ...g, berkas: undefined, umum: undefined }));
	};

	const unggah = async () => {
		const meta = validateLkpsMeta({ nama, periode });
		const baru = { ...meta, berkas: berkas ? undefined : 'Pilih berkas Excel LKPS (.xlsx/.xls)' };
		if (baru.berkas || baru.nama || baru.periode) {
			setGalat(baru);
			return;
		}

		setGalat({});
		setMengunggah(true);
		try {
			await evidenceRepository.uploadLkps(berkas!, studyProgramId, { nama, periode });
			onOpenChange(false);
		} catch (e) {
			setGalat({ umum: e instanceof Error ? e.message : 'Unggah LKPS gagal.' });
		} finally {
			setMengunggah(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={(nilai) => !mengunggah && onOpenChange(nilai)}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Unggah LKPS</DialogTitle>
					<DialogDescription>
						Beri nama dan tahun/periode supaya LKPS ini mudah dibedakan saat dipilih untuk
						sebuah Dokumen LED.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{galat.umum && <p className="text-sm text-destructive">{galat.umum}</p>}

					<Field data-invalid={!!galat.berkas}>
						<FieldLabel htmlFor="lkps-berkas">Berkas Excel</FieldLabel>
						<input
							ref={inputRef}
							id="lkps-berkas"
							type="file"
							accept=".xlsx,.xls"
							className="hidden"
							onChange={(e) => {
								pilihBerkas(e.target.files?.[0]);
								e.target.value = '';
							}}
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={mengunggah}
							onClick={() => inputRef.current?.click()}
							className="w-full cursor-pointer justify-start"
						>
							<UploadSimpleIcon className="size-4" />
							<span className="truncate">{berkas ? berkas.name : 'Pilih berkas .xlsx / .xls'}</span>
						</Button>
						{galat.berkas && <FieldError>{galat.berkas}</FieldError>}
					</Field>

					<Field data-invalid={!!galat.nama}>
						<FieldLabel htmlFor="lkps-nama">Nama LKPS</FieldLabel>
						<Input
							id="lkps-nama"
							value={nama}
							maxLength={LKPS_NAMA_MAX}
							disabled={mengunggah}
							placeholder="Misalnya: LKPS Teknik Informatika"
							onChange={(e) => {
								setNama(e.target.value);
								setGalat((g) => ({ ...g, nama: undefined }));
							}}
						/>
						{galat.nama && <FieldError>{galat.nama}</FieldError>}
					</Field>

					<Field data-invalid={!!galat.periode}>
						<FieldLabel htmlFor="lkps-periode">Tahun / Periode</FieldLabel>
						<Input
							id="lkps-periode"
							value={periode}
							maxLength={LKPS_PERIODE_MAX}
							disabled={mengunggah}
							placeholder="Misalnya: 2024/2025 atau TS 2024"
							onChange={(e) => {
								setPeriode(e.target.value);
								setGalat((g) => ({ ...g, periode: undefined }));
							}}
						/>
						<FieldDescription>Teks bebas; ditampilkan di pilihan LKPS pada form Dokumen LED.</FieldDescription>
						{galat.periode && <FieldError>{galat.periode}</FieldError>}
					</Field>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						disabled={mengunggah}
						onClick={() => onOpenChange(false)}
						className="cursor-pointer"
					>
						Batal
					</Button>
					<Button disabled={mengunggah} onClick={() => void unggah()} className="cursor-pointer">
						{mengunggah ? 'Mengunggah…' : 'Unggah'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
