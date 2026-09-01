import * as React from 'react';
import {
	CheckCircleIcon,
	PencilSimpleIcon,
	PlusIcon,
	SparkleIcon,
	SpinnerGapIcon,
	TrashIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { Input } from '~/core/components/ui/input';
import { Textarea } from '~/core/components/ui/textarea';
import {
	chapterSectionStatusLabels,
	type ChapterSectionEntity,
} from '../../domain/entities/chapter-section.entity';

const IKON_STATUS = {
	PENDING: null,
	GENERATING: <SpinnerGapIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />,
	GENERATED: <CheckCircleIcon className="size-3.5 shrink-0 text-primary" weight="fill" />,
	ERROR: <WarningCircleIcon className="size-3.5 shrink-0 text-destructive" weight="fill" />,
} as const;

/** Form inline judul + panduan, dipakai baik untuk tambah maupun edit section manual. */
function FormSection({
	judulAwal = '',
	panduanAwal = '',
	onSimpan,
	onBatal,
}: {
	judulAwal?: string;
	panduanAwal?: string;
	onSimpan: (judul: string, panduan: string) => void;
	onBatal: () => void;
}) {
	const [judul, setJudul] = React.useState(judulAwal);
	const [panduan, setPanduan] = React.useState(panduanAwal);
	const bolehSimpan = judul.trim().length > 0 && panduan.trim().length > 0;

	return (
		<li className="space-y-1.5 rounded px-1.5 py-1.5">
			<Input
				value={judul}
				onChange={(e) => setJudul(e.target.value)}
				placeholder="Judul sub-bab"
				aria-label="Judul sub-bab"
				className="h-7 text-xs"
				autoFocus
			/>
			<Textarea
				value={panduan}
				onChange={(e) => setPanduan(e.target.value)}
				placeholder="Arahan topik apa yang harus dibahas sub-bab ini"
				aria-label="Panduan sub-bab"
				rows={2}
				className="min-h-12 resize-none text-xs"
			/>
			<div className="flex justify-end gap-1.5">
				<Button type="button" size="xs" variant="ghost" onClick={onBatal}>
					Batal
				</Button>
				<Button
					type="button"
					size="xs"
					disabled={!bolehSimpan}
					onClick={() => onSimpan(judul.trim(), panduan.trim())}
				>
					Simpan
				</Button>
			</div>
		</li>
	);
}

/** Daftar section (outline) satu bab — generate per baris (LLM) plus tambah/edit/hapus manual. */
export function ChapterSectionList({
	sections,
	/** Mengunci tambah/ubah/hapus manual — cuma perlu bab tidak sedang diproses, tidak butuh bukti dukung terpilih. */
	dimatikanEdit,
	/** Mengunci tombol Generate per baris — bab tidak terkunci, ada bukti dukung terpilih, rekomendasi dokumen sudah dikonfirmasi. */
	dimatikanGenerate,
	onGenerate,
	onCreate,
	onUpdate,
	onDelete,
}: {
	sections: ChapterSectionEntity[];
	dimatikanEdit: boolean;
	dimatikanGenerate: boolean;
	onGenerate: (sectionId: string) => void;
	onCreate: (title: string, guidance: string) => void;
	onUpdate: (sectionId: string, title: string, guidance: string) => void;
	onDelete: (sectionId: string) => void;
}) {
	const [sedangTambah, setSedangTambah] = React.useState(false);
	const [sedangEdit, setSedangEdit] = React.useState<string | null>(null);

	return (
		<ul className="space-y-1 rounded-md border border-border p-1.5">
			{sections.map((section) =>
				sedangEdit === section.id ? (
					<FormSection
						key={section.id}
						judulAwal={section.judul}
						panduanAwal={section.panduan}
						onBatal={() => setSedangEdit(null)}
						onSimpan={(judul, panduan) => {
							onUpdate(section.id, judul, panduan);
							setSedangEdit(null);
						}}
					/>
				) : (
					<li
						key={section.id}
						className="flex items-start justify-between gap-2 rounded px-1.5 py-1"
					>
						<div className="min-w-0 flex-1">
							<p className="truncate text-xs font-medium" title={section.judul}>
								{section.urutan}. {section.judul}
							</p>
							<p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
								{IKON_STATUS[section.status]}
								{chapterSectionStatusLabels[section.status]}
							</p>
							{section.status === 'ERROR' && section.error && (
								<p className="mt-0.5 text-[11px] leading-relaxed text-destructive">
									{section.error}
								</p>
							)}
						</div>

						<div className="flex shrink-0 items-center gap-1">
							<Button
								type="button"
								size="xs"
								variant="ghost"
								title="Ubah sub-bab ini"
								disabled={dimatikanEdit}
								onClick={() => setSedangEdit(section.id)}
							>
								<PencilSimpleIcon />
							</Button>
							<Button
								type="button"
								size="xs"
								variant="ghost"
								title="Hapus sub-bab ini"
								disabled={dimatikanEdit}
								onClick={() => {
									if (window.confirm(`Hapus sub-bab "${section.judul}"?`)) onDelete(section.id);
								}}
							>
								<TrashIcon />
							</Button>
							<Button
								type="button"
								size="xs"
								variant={section.status === 'GENERATED' ? 'outline' : 'default'}
								onClick={() => onGenerate(section.id)}
								disabled={dimatikanGenerate || section.status === 'GENERATING'}
							>
								<SparkleIcon />
								{section.status === 'GENERATED' ? 'Ulang' : 'Generate'}
							</Button>
						</div>
					</li>
				),
			)}

			{sedangTambah ? (
				<FormSection
					onBatal={() => setSedangTambah(false)}
					onSimpan={(judul, panduan) => {
						onCreate(judul, panduan);
						setSedangTambah(false);
					}}
				/>
			) : (
				<li>
					<Button
						type="button"
						size="xs"
						variant="ghost"
						disabled={dimatikanEdit}
						onClick={() => setSedangTambah(true)}
						className="w-full justify-start text-muted-foreground"
					>
						<PlusIcon />
						Tambah Sub-bab
					</Button>
				</li>
			)}
		</ul>
	);
}
