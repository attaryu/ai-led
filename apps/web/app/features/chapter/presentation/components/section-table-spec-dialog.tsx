import * as React from 'react';
import { PlusIcon, TrashIcon, XIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/core/components/ui/dialog';
import { Input } from '~/core/components/ui/input';
import { type TableSpecEntry } from '../../domain/entities/chapter-section.entity';

/**
 * Dialog instruksi tabel per section — daftar kolom apa yg harus diisi LLM
 * saat generate (BUKAN hasil isian, itu muncul sbg tabel Markdown di narasi
 * setelah generate). Disimpan lewat SATU tombol "Simpan" (bukan autosave per
 * keystroke) supaya batal tidak menyisakan PATCH parsial — beda dari
 * `FormSection` di atas cuma soal kompleksitas form, pola tombolnya sama.
 */
export function SectionTableSpecDialog({
	open,
	onOpenChange,
	judulSection,
	tableSpecAwal,
	sudahDigenerate,
	onSimpan,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	judulSection: string;
	tableSpecAwal: TableSpecEntry[];
	/** Sub-bab yang narasinya sudah ada — lihat pemberitahuan di badan dialog. */
	sudahDigenerate: boolean;
	onSimpan: (tableSpec: TableSpecEntry[]) => void;
}) {
	const [tabel, setTabel] = React.useState<TableSpecEntry[]>(tableSpecAwal);

	// Reset ke isi tersimpan tiap dialog dibuka -- bukan tiap `tableSpecAwal`
	// berubah, supaya perubahan yg belum disimpan tidak hilang kalau prop
	// re-render karena alasan lain selagi dialog terbuka.
	React.useEffect(() => {
		if (open) setTabel(tableSpecAwal);
	}, [open]); // eslint-disable-line react-hooks/exhaustive-deps

	function tambahTabel() {
		setTabel((t) => [...t, { id: `tbl_${Date.now()}`, caption: `Tabel ${t.length + 1}`, columns: ['Kolom 1'] }]);
	}

	function hapusTabel(id: string) {
		setTabel((t) => t.filter((x) => x.id !== id));
	}

	function ubahCaption(id: string, caption: string) {
		setTabel((t) => t.map((x) => (x.id === id ? { ...x, caption } : x)));
	}

	function tambahKolom(id: string) {
		setTabel((t) => t.map((x) => (x.id === id ? { ...x, columns: [...x.columns, ''] } : x)));
	}

	function ubahKolom(id: string, index: number, label: string) {
		setTabel((t) =>
			t.map((x) => (x.id === id ? { ...x, columns: x.columns.map((c, i) => (i === index ? label : c)) } : x)),
		);
	}

	function hapusKolom(id: string, index: number) {
		setTabel((t) =>
			t.map((x) => (x.id === id && x.columns.length > 1 ? { ...x, columns: x.columns.filter((_, i) => i !== index) } : x)),
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Instruksi tabel — {judulSection}</DialogTitle>
				</DialogHeader>

				<div className="space-y-3">
					{/*
					 * Menyimpan instruksi tabel tidak menyentuh narasi yang sudah ada —
					 * backend sengaja tidak mereset status maupun isinya. Tanpa kalimat
					 * ini, menambah kolom lalu tidak melihat apa pun berubah di kanvas
					 * terbaca seperti simpanannya gagal.
					 */}
					{sudahDigenerate && (
						<p className="rounded-md border border-border bg-muted px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
							Sub-bab ini sudah memiliki narasi. Perubahan instruksi tabel tidak
							mengubah narasi yang sudah tersimpan; perubahan baru diterapkan
							ketika sub-bab ini digenerate ulang.
						</p>
					)}

					{tabel.length === 0 && (
						<p className="text-xs leading-relaxed text-muted-foreground">
							Belum ada tabel untuk sub-bab ini. Kalau ditambah, AI akan menyisipkan
							tabel dengan kolom di bawah saat generate narasi.
						</p>
					)}

					{tabel.map((t) => (
						<div key={t.id} className="space-y-1.5 rounded-md border border-border p-2">
							<div className="flex items-center gap-1.5">
								<Input
									value={t.caption}
									onChange={(e) => ubahCaption(t.id, e.target.value)}
									placeholder="Nama tabel"
									className="h-7 flex-1 text-xs"
								/>
								<Button type="button" size="xs" variant="ghost" title="Hapus tabel" onClick={() => hapusTabel(t.id)}>
									<TrashIcon />
								</Button>
							</div>
							<div className="space-y-1">
								{t.columns.map((col, i) => (
									<div key={i} className="flex items-center gap-1.5">
										<Input
											value={col}
											onChange={(e) => ubahKolom(t.id, i, e.target.value)}
											placeholder="Nama kolom"
											className="h-7 flex-1 text-xs"
										/>
										<Button
											type="button"
											size="xs"
											variant="ghost"
											title="Hapus kolom"
											disabled={t.columns.length <= 1}
											onClick={() => hapusKolom(t.id, i)}
										>
											<XIcon />
										</Button>
									</div>
								))}
							</div>
							<Button type="button" size="xs" variant="ghost" onClick={() => tambahKolom(t.id)}>
								<PlusIcon />
								Tambah kolom
							</Button>
						</div>
					))}

					<Button type="button" size="xs" variant="outline" onClick={tambahTabel}>
						<PlusIcon />
						Tambah tabel
					</Button>
				</div>

				<DialogFooter>
					<Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
						Batal
					</Button>
					<Button
						type="button"
						size="sm"
						onClick={() => {
							// Kolom kosong dibuang saat simpan -- input boleh sementara kosong
							// selagi diketik, tapi TABLE_SCHEMA di prompt tidak boleh kirim
							// nama kolom "".
							const bersih = tabel
								.map((t) => ({ ...t, columns: t.columns.map((c) => c.trim()).filter(Boolean) }))
								.filter((t) => t.columns.length > 0);
							onSimpan(bersih);
							onOpenChange(false);
						}}
					>
						Simpan
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
