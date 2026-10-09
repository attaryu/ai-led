import * as React from 'react';
import { ArrowClockwiseIcon, WarningCircleIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/core/components/ui/dialog';
import {
	EVIDENCE_PROSES_ULANG_EVENT,
	evidenceRepository,
} from '../../data/repositories/evidence.repository';
import { type UploadEvidenceTargetDto } from '../../domain/dtos/upload-evidence.dto';
import {
	kegagalanUnggahBaru,
	pilahStatus,
	ringkasPesan,
	tambahKegagalan,
	type KegagalanProses,
} from '../../domain/evidence-failure';
import { useEvidenceUploadStore } from '../stores/evidence-upload.store';

const JUDUL_JENIS = { unggah: 'Unggahan gagal', ekstraksi: 'Ekstraksi gagal' } as const;

/**
 * Modal konfirmasi saat proses bukti dukung GAGAL: ulangi atau tidak.
 *
 * Dipasang di akar aplikasi (bersama panel unggah) karena kegagalannya bisa terjadi di
 * halaman mana pun -- unggahan jalan terus saat pengguna berpindah halaman, dan ekstraksi
 * di worker baru gagal beberapa menit kemudian.
 *
 * Dua jenis kegagalan, satu modal:
 *   - unggahan gagal di klien      -> "Ulangi" = unggah ulang berkas yang masih dipegang antrean;
 *   - ekstraksi gagal di worker    -> "Ulangi" = `retryIngestion`, tanpa unggah ulang.
 * Banyak berkas yang gagal sekaligus (unggah massal) dirangkum dalam SATU modal, bukan
 * modal beruntun. Menjawab "Tidak" tidak menghapus apa pun: berkasnya tetap tampil di panel
 * unggah / pustaka dengan tombol ulang masing-masing.
 *
 * Kegagalan ekstraksi dideteksi tanpa timer sendiri: ia menumpang event `storage-update`
 * yang sudah ditembakkan repository tiap 4 detik setelah unggahan atau pengulangan.
 */
export function EvidenceFailureDialog() {
	const items = useEvidenceUploadStore((s) => s.items);
	const retryItem = useEvidenceUploadStore((s) => s.retryItem);

	const [daftar, setDaftar] = React.useState<KegagalanProses[]>([]);
	const [mengulang, setMengulang] = React.useState(false);
	const [galat, setGalat] = React.useState<string | null>(null);

	/** Baris antrean yang sudah ditanyakan (hanya selama masih gagal; lihat kegagalanUnggahBaru). */
	const diumumkan = React.useRef<Set<string>>(new Set());
	/** Evidence yang sedang dipantau menunggu SIAP/GAGAL. */
	const dilacak = React.useRef<Set<string>>(new Set());
	/** Cakupan tiap evidence, untuk mengambil statusnya; tidak pernah dikosongkan agar pengulangan bisa dilacak lagi. */
	const targetEvidence = React.useRef<Map<string, UploadEvidenceTargetDto>>(new Map());
	/** Evidence yang sudah masuk pelacakan lewat antrean unggah; mencegah baris 'selesai' dilacak ulang terus-menerus. */
	const pernahDilacak = React.useRef<Set<string>>(new Set());
	const sedangMemeriksa = React.useRef(false);

	// Unggahan yang gagal di klien + berkas yang baru tercatat (mulai dipantau ekstraksinya).
	React.useEffect(() => {
		const { baru, diumumkan: sisa } = kegagalanUnggahBaru(items, diumumkan.current);
		diumumkan.current = sisa;
		if (baru.length > 0) setDaftar((sebelumnya) => tambahKegagalan(sebelumnya, baru));

		for (const item of items) {
			if (item.phase !== 'selesai' || !item.evidenceId) continue;
			if (pernahDilacak.current.has(item.evidenceId)) continue;
			pernahDilacak.current.add(item.evidenceId);
			targetEvidence.current.set(item.evidenceId, item.target);
			dilacak.current.add(item.evidenceId);
		}
	}, [items]);

	// Berkas yang diulang ekstraksinya (dari modal ini atau tombol "Proses ulang") dipantau lagi.
	React.useEffect(() => {
		const saatDiulang = (event: Event) => {
			const { id, target } = (event as CustomEvent<{ id: string; target: UploadEvidenceTargetDto }>).detail;
			targetEvidence.current.set(id, target);
			dilacak.current.add(id);
		};
		window.addEventListener(EVIDENCE_PROSES_ULANG_EVENT, saatDiulang);
		return () => window.removeEventListener(EVIDENCE_PROSES_ULANG_EVENT, saatDiulang);
	}, []);

	// Ekstraksi yang gagal di worker: periksa status tiap `storage-update`.
	React.useEffect(() => {
		const periksa = async () => {
			if (sedangMemeriksa.current || dilacak.current.size === 0) return;
			sedangMemeriksa.current = true;
			try {
				const ids = [...dilacak.current];
				const terbaru = await evidenceRepository.findStatuses(
					ids.map((id) => ({ id, target: targetEvidence.current.get(id)! })),
				);
				const hasil = pilahStatus(
					ids,
					new Map(
						[...terbaru].map(([id, e]) => [
							id,
							{ status: e.status, namaDokumen: e.namaDokumen, catatanGagal: e.catatanGagal },
						]),
					),
				);
				for (const id of [...hasil.selesai, ...hasil.hilang, ...hasil.gagal.map((g) => g.id)]) {
					dilacak.current.delete(id);
				}
				if (hasil.gagal.length > 0) setDaftar((sebelumnya) => tambahKegagalan(sebelumnya, hasil.gagal));
			} catch {
				// Jaringan/server sesaat: dilewati, putaran berikutnya mencoba lagi.
			} finally {
				sedangMemeriksa.current = false;
			}
		};
		window.addEventListener('storage-update', periksa);
		return () => window.removeEventListener('storage-update', periksa);
	}, []);

	const tidak = () => {
		setGalat(null);
		setDaftar([]);
	};

	const ulangi = async () => {
		setMengulang(true);
		setGalat(null);
		const gagalDiulang: KegagalanProses[] = [];
		for (const kegagalan of daftar) {
			try {
				if (kegagalan.jenis === 'unggah') {
					retryItem(kegagalan.id);
				} else {
					await evidenceRepository.retryIngestion(kegagalan.id, targetEvidence.current.get(kegagalan.id));
				}
			} catch (e) {
				gagalDiulang.push({
					...kegagalan,
					pesan: `Gagal mengulang: ${ringkasPesan(e instanceof Error ? e.message : null)}`,
				});
			}
		}
		setDaftar(gagalDiulang);
		if (gagalDiulang.length > 0) setGalat('Sebagian proses tidak bisa diulang. Coba lagi, atau pilih Tidak.');
		setMengulang(false);
	};

	const banyak = daftar.length > 1;

	return (
		<Dialog open={daftar.length > 0} onOpenChange={(terbuka) => !terbuka && !mengulang && tidak()}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<WarningCircleIcon className="size-5 shrink-0 text-destructive" weight="fill" />
						{banyak ? `${daftar.length} proses bukti dukung gagal` : 'Proses bukti dukung gagal'}
					</DialogTitle>
					<DialogDescription>
						{banyak ? 'Ulangi semua prosesnya sekarang?' : 'Ulangi prosesnya sekarang?'} Berkas tidak
						dihapus bila Anda memilih Tidak; Anda tetap bisa mengulangnya nanti dari panel unggah atau
						pustaka.
					</DialogDescription>
				</DialogHeader>

				<ul className="max-h-64 space-y-2 overflow-y-auto">
					{daftar.map((k) => (
						<li key={k.kunci} className="rounded-md border border-border p-3">
							<p className="truncate text-sm font-medium">{k.nama}</p>
							<p className="text-xs font-medium text-destructive">{JUDUL_JENIS[k.jenis]}</p>
							<p className="mt-1 break-words text-xs text-muted-foreground">{k.pesan}</p>
						</li>
					))}
				</ul>

				{galat && <p className="text-sm text-destructive">{galat}</p>}

				<DialogFooter className="gap-2">
					<Button variant="outline" disabled={mengulang} onClick={tidak} className="cursor-pointer">
						Tidak
					</Button>
					<Button disabled={mengulang} onClick={() => void ulangi()} className="cursor-pointer">
						<ArrowClockwiseIcon className="size-4" />
						{mengulang ? 'Mengulang…' : banyak ? `Ulangi semua (${daftar.length})` : 'Ulangi'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
