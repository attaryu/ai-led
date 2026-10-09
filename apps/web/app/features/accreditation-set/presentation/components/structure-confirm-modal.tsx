import * as React from 'react';
import { CaretDownIcon, SpinnerGapIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { Checkbox } from '~/core/components/ui/checkbox';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/core/components/ui/dialog';
import { cn } from '~/core/lib/utils';
import { type StructureNodeEntity } from '../../domain/entities/structure-preview.entity';
import { accreditationSetRepository } from '../../data/repositories/accreditation-set.repository';

type Pohon = Map<string | null, StructureNodeEntity[]>;

function bangunPohon(nodes: StructureNodeEntity[]): Pohon {
	const pohon: Pohon = new Map();
	for (const n of nodes) {
		const anak = pohon.get(n.parentId) ?? [];
		anak.push(n);
		pohon.set(n.parentId, anak);
	}
	for (const anak of pohon.values()) anak.sort((a, b) => a.order - b.order);
	return pohon;
}

/** Semua id keturunan (anak, cucu, ...) satu node -- dipakai cascade uncheck. */
function keturunanDari(id: string, pohon: Pohon): string[] {
	const anak = pohon.get(id) ?? [];
	return anak.flatMap((a) => [a.id, ...keturunanDari(a.id, pohon)]);
}

/**
 * Modal struktur Panduan, dua mode tergantung `previewStructure`'s status:
 *
 * - **"Pilih Struktur Pedoman"** (status `MENUNGGU_KONFIRMASI`) -- langkah
 *   konfirmasi wajib sebelum ekstraksi commit ke ChapterTemplate/SubBabTemplate.
 *   Semua node tercentang default; yang di-uncheck (beserta seluruh
 *   keturunannya) TIDAK PERNAH masuk sistem sama sekali -- adaptasi dari
 *   dimas's PanduanStructureModal.jsx (commit 57a55b0).
 * - **"Kelola Struktur"** (status lain -- sudah commit) -- gap #2: toggle
 *   `isActive` per sub-bab yang SUDAH commit, tersimpan LANGSUNG per node
 *   (bukan batch-confirm), tanpa re-extract Panduan. Tidak ada cascade UI di
 *   sini -- matiin parent otomatis ngilangin children dari outline BARU di
 *   backend (lihat get_chapter_template_subbab), tapi child tetap toggle
 *   independen sendiri.
 */
export function StructureConfirmModal({
	setId,
	open,
	onOpenChange,
	onConfirmed,
}: {
	setId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirmed: () => void;
}) {
	const [nodes, setNodes] = React.useState<StructureNodeEntity[] | null>(null);
	const [status, setStatus] = React.useState<string | null>(null);
	const [checked, setChecked] = React.useState<Record<string, boolean>>({});
	const [aktif, setAktif] = React.useState<Record<string, boolean>>({});
	const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
	const [memuat, setMemuat] = React.useState(false);
	const [mengirim, setMengirim] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!open) return;
		setMemuat(true);
		setError(null);
		accreditationSetRepository
			.previewStructure(setId)
			.then((preview) => {
				setNodes(preview.nodes);
				setStatus(preview.status);
				setChecked(Object.fromEntries(preview.nodes.map((n) => [n.id, true])));
				setAktif(Object.fromEntries(preview.nodes.map((n) => [n.id, n.isActive])));
			})
			.catch((e: unknown) => setError(e instanceof Error ? e.message : 'Gagal memuat struktur'))
			.finally(() => setMemuat(false));
	}, [open, setId]);

	const modeKelola = status !== null && status !== 'MENUNGGU_KONFIRMASI';
	const pohon = React.useMemo(() => bangunPohon(nodes ?? []), [nodes]);
	const akar = pohon.get(null) ?? [];
	const totalTercentang = Object.values(checked).filter(Boolean).length;

	function toggleChecked(id: string, nilai: boolean) {
		setChecked((prev) => {
			const next = { ...prev, [id]: nilai };
			for (const anakId of keturunanDari(id, pohon)) next[anakId] = nilai;
			return next;
		});
	}

	async function toggleAktif(id: string, nilai: boolean) {
		setAktif((prev) => ({ ...prev, [id]: nilai }));
		try {
			await accreditationSetRepository.toggleSection(id, nilai);
		} catch (e) {
			// Kegagalan simpan dibalikkan ke tampilan -- state lokal sengaja
			// dikembalikan ke nilai semula supaya tidak berbohong tentang apa
			// yang benar-benar tersimpan di server.
			setAktif((prev) => ({ ...prev, [id]: !nilai }));
			setError(e instanceof Error ? e.message : 'Gagal menyimpan perubahan');
		}
	}

	async function konfirmasi() {
		if (!nodes) return;
		setMengirim(true);
		setError(null);
		try {
			const acceptedIds = nodes.filter((n) => checked[n.id]).map((n) => n.id);
			await accreditationSetRepository.confirmStructure(setId, acceptedIds);
			onConfirmed();
			onOpenChange(false);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Gagal menyimpan konfirmasi');
		} finally {
			setMengirim(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
				<DialogHeader>
					<DialogTitle>{modeKelola ? 'Kelola Struktur Pedoman' : 'Pilih Struktur Pedoman'}</DialogTitle>
					<DialogDescription>
						{modeKelola
							? 'Matikan sub-bab yang tidak diperlukan -- Dokumen LED baru dari set ini tidak akan menyertakannya di outline. Perubahan tersimpan langsung, tidak memengaruhi dokumen yang sudah ada.'
							: 'Un-centang bagian yang tidak diperlukan — bagian itu TIDAK akan dimasukkan ke sistem sama sekali.'}
					</DialogDescription>
				</DialogHeader>

				<div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto py-1">
					{memuat && (
						<p className="py-8 text-center text-sm text-muted-foreground">Memuat struktur…</p>
					)}
					{error && (
						<p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
							{error}
						</p>
					)}
					{!memuat &&
						!error &&
						akar.map((n) => (
							<NodeBaris
								key={n.id}
								node={n}
								pohon={pohon}
								nilai={modeKelola ? aktif : checked}
								collapsed={collapsed}
								onToggle={modeKelola ? toggleAktif : toggleChecked}
								onCollapse={(id) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))}
							/>
						))}
				</div>

				<DialogFooter className="items-center justify-between gap-2 sm:justify-between">
					{modeKelola ? (
						<>
							<span className="text-xs text-muted-foreground">
								Perubahan tersimpan otomatis per bagian
							</span>
							<Button type="button" onClick={() => onOpenChange(false)}>
								Selesai
							</Button>
						</>
					) : (
						<>
							<span className="text-xs text-muted-foreground">
								{totalTercentang}/{nodes?.length ?? 0} bagian dipilih
							</span>
							<div className="flex gap-2">
								<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
									Batal
								</Button>
								<Button
									type="button"
									onClick={konfirmasi}
									disabled={memuat || mengirim || totalTercentang === 0}
								>
									{mengirim ? (
										<>
											<SpinnerGapIcon className="animate-spin" />
											Menyimpan…
										</>
									) : (
										'Konfirmasi'
									)}
								</Button>
							</div>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

const INDENT_PX = 18;

function NodeBaris({
	node,
	pohon,
	nilai,
	collapsed,
	onToggle,
	onCollapse,
	kedalaman = 0,
}: {
	node: StructureNodeEntity;
	pohon: Pohon;
	/** `checked` (mode confirm) atau `aktif` (mode kelola) -- makna beda, mekanisme render sama. */
	nilai: Record<string, boolean>;
	collapsed: Record<string, boolean>;
	onToggle: (id: string, nilai: boolean) => void;
	onCollapse: (id: string) => void;
	kedalaman?: number;
}) {
	const anak = pohon.get(node.id) ?? [];
	const isChecked = !!nilai[node.id];
	const isCollapsed = !!collapsed[node.id];

	const semuaKeturunan = React.useMemo(() => keturunanDari(node.id, pohon), [node.id, pohon]);
	const indeterminate =
		semuaKeturunan.length > 0 &&
		!isChecked &&
		semuaKeturunan.some((id) => nilai[id]) &&
		!semuaKeturunan.every((id) => nilai[id]);

	return (
		<div>
			<div
				className="flex items-center gap-1.5 rounded py-1 hover:bg-muted/50"
				style={{ paddingLeft: kedalaman * INDENT_PX }}
			>
				{anak.length > 0 ? (
					<button
						type="button"
						onClick={() => onCollapse(node.id)}
						className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
					>
						<CaretDownIcon
							className={cn('size-3 transition-transform', isCollapsed && '-rotate-90')}
						/>
					</button>
				) : (
					<span className="w-[17px] shrink-0" />
				)}
				<Checkbox
					checked={isChecked}
					indeterminate={indeterminate}
					onCheckedChange={(nilaiBaru) => onToggle(node.id, nilaiBaru)}
				/>
				{/* dimas PanduanStructureModal: marker kecil sebelum judul. */}
				{node.marker && node.marker !== node.title && (
					<span className="shrink-0 font-mono text-[10px] text-muted-foreground">{node.marker}</span>
				)}
				<span
					className={cn(
						'truncate text-sm',
						!isChecked && 'text-muted-foreground line-through',
					)}
				>
					{node.title || '(tanpa judul)'}
				</span>
				{node.lkpsDibutuhkan && (
					<span
						title={node.tabelLkps.length ? `Tabel ${node.tabelLkps.join(', ')}` : 'Butuh data LKPS'}
						className="shrink-0 rounded border border-border px-1 text-[10px] text-muted-foreground"
					>
						LKPS
					</span>
				)}
			</div>
			{!isCollapsed &&
				anak.map((a) => (
					<NodeBaris
						key={a.id}
						node={a}
						pohon={pohon}
						nilai={nilai}
						collapsed={collapsed}
						onToggle={onToggle}
						onCollapse={onCollapse}
						kedalaman={kedalaman + 1}
					/>
				))}
		</div>
	);
}
