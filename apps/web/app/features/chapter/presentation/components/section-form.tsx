import * as React from 'react';

import { Button } from '~/core/components/ui/button';
import { Input } from '~/core/components/ui/input';
import { Textarea } from '~/core/components/ui/textarea';

/**
 * Form inline judul + panduan, dipakai baik untuk tambah maupun edit section
 * manual — dipakai `chapter-editor-toc.tsx` (tombol `[+]` per baris
 * pohon Daftar Isi), makanya diekspor.
 */
export function FormSection({
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
		<div className="space-y-1.5 rounded px-1.5 py-1.5">
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
		</div>
	);
}

