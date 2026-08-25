import * as React from 'react';
import { XIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { TabsContent } from '~/core/components/ui/tabs';
import { cn } from '~/core/lib/utils';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { type HasilPulih } from '../hooks/use-chapter-draft';
import { type HasilGenerate } from '../hooks/use-chapter-generation';
import { type ChapterPermission } from '../hooks/use-chapter-permission';
import { ChapterDraftPanel } from './chapter-draft-panel';
import { ChapterGenerationPanel } from './chapter-generation-panel';
import { ChapterQualityPanel } from './chapter-quality-panel';
import { ChapterGuidancePanel } from './chapter-guidance-panel';
import { ChapterReferencePanel } from './chapter-reference-panel';
import { ChapterReviewPanel } from './chapter-review-panel';

/**
 * Tab sidebar kanan Editor Bab.
 *
 * §7 menuliskan urutannya "Generate | Rujukan | Rubrik | Skor | Draft"; yang
 * dipakai di sini hasil keputusan desain berikutnya — "Generate" jadi "Generasi"
 * supaya seluruh label berbahasa Indonesia, dan "Draft" naik ke urutan kedua
 * karena ia pasangan langsung dari hasil generate.
 *
 * **"Skor" tampil sebagai "Kualitas AI".** Nama lamanya menyatakan terlalu
 * banyak: yang diukur tab ini mutu kerja AI-nya, bukan kelayakan isi bab
 * terhadap kriteria akreditasi (§10.1) — dan kelayakan itulah yang orang duga
 * saat membaca "Skor" di dokumen akreditasi. Yang menjawabnya kini Penilaian
 * AMI, di luar editor. `value`-nya tetap `'skor'` karena ia dipakai sebagai
 * kunci di beberapa tempat dan tidak pernah dilihat pengguna.
 *
 * Satu-satunya sumber urutan dan label, dipakai bersama oleh daftar tab di baris
 * toolbar dan panel-panel di sidebar kanan.
 */
export const PANEL_TABS = [
	{ value: 'draft', label: 'Draft' },
	{ value: 'generasi', label: 'Generasi' },
	// Di depan "Bukti", mengikuti urutan pipeline sungguhan: pedoman dan rubrik
	// diambil lebih dulu, bukti dukung menyusul. Urutan bacanya pun sama — "apa
	// yang seharusnya ditulis" mendahului "dari mana tulisannya berasal".
	//
	// Ini **bukan** tab Rubrik yang dihapus di §9 yang kembali: yang itu
	// menjalankan simulasi skor bab dan menulis `HASIL_SKOR_KRITERIA`; yang ini
	// murni baca, memperlihatkan konteks yang diberikan ke generator.
	{ value: 'panduan', label: 'Panduan' },
	// Label "Bukti", `value` tetap `'rujukan'` — sama seperti `skor`/"Kualitas AI":
	// `value` kunci internal yang tidak pernah dilihat pengguna. Labelnya sengaja
	// pendek, bukan "Bukti Dukung" penuh, karena baris ini dibagi dengan bilah alat
	// editor; judul di dalam panelnya tetap berbunyi lengkap.
	{ value: 'rujukan', label: 'Bukti' },
	{ value: 'skor', label: 'Kualitas AI' },
	// Ditaruh paling akhir: ia bukan alat menyusun melainkan keadaan bab, dan
	// ditengok sesudah pekerjaannya — bukan sambil mengerjakan.
	{ value: 'review', label: 'Review' },
] as const;

export type PanelTabValue = (typeof PANEL_TABS)[number]['value'];

export function ChapterEditorPanels({
	chapter,
	studyProgramId,
	izin,
	onGenerated,
	ambilSnapshot,
	onRestored,
	onReviewed,
	savedAt,
	lebar,
	handleProps,
	terbuka,
	onTutup,
	tabAktif,
	onPilihTab,
}: {
	chapter: ChapterEntity;
	studyProgramId: string;
	izin: ChapterPermission;
	onGenerated: (hasil: HasilGenerate) => void;
	ambilSnapshot: () => ChapterEntity | undefined;
	onRestored: (hasil: HasilPulih) => void;
	/** Bab sesudah kunci/catatan review ditulis; isinya tidak ikut berubah. */
	onReviewed: (diperbarui: ChapterEntity) => void;
	/** Stempel simpan terakhir dari autosave; dipakai tab Kualitas AI. */
	savedAt: string | null;
	/** Lebar hasil seretan; menggantikan `w-80` yang dulu tetap. */
	lebar: number;
	handleProps: React.ComponentProps<'div'>;
	/** Hanya berlaku di bawah `lg`; di desktop kolomnya selalu menempel. */
	terbuka: boolean;
	onTutup: () => void;
	tabAktif: PanelTabValue;
	onPilihTab: (value: PanelTabValue) => void;
}) {
	const labelTabAktif = PANEL_TABS.find((tab) => tab.value === tabAktif)?.label;

	return (
		// `overflow-hidden`, bukan `overflow-y-auto`: tiap panel mengatur gulungannya
		// sendiri supaya kepala dan kakinya tetap terlihat berapa pun panjang isinya.
		<aside
			id="chapter-editor-panels"
			aria-label={labelTabAktif ? `Panel ${labelTabAktif}` : undefined}
			// Custom property, bukan `width` langsung: style inline selalu menang atas
			// kelas apa pun, sehingga `max-lg:w-full` tidak akan pernah berlaku kalau
			// lebar seretan ditulis sebagai properti `width` di sini.
			style={{ '--lebar-panel': `${lebar}px` } as React.CSSProperties}
			className={cn(
				'relative flex w-(--lebar-panel) shrink-0 flex-col overflow-hidden border-l border-border bg-background',
				// Alasan `max-lg:` dan bukan `lg:` ada di `chapter-editor-toc.tsx`.
				// Di panel ini taruhannya paling nyata: panel Bukti dan Panduan
				// merender `Sheet` kutipan sebagai keturunannya.
				'max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-30',
				'max-lg:w-full max-lg:max-w-md max-lg:shadow-lg',
				'max-lg:invisible max-lg:translate-x-full',
				'max-lg:transition-[translate,visibility] max-lg:transition-discrete max-lg:duration-200 max-lg:ease-out max-lg:motion-reduce:transition-none',
				terbuka && 'max-lg:visible max-lg:translate-x-0',
			)}
		>
			{/*
			 * `max-lg:hidden`, bukan sekadar disembunyikan secara visual:
			 * `display:none` mencabutnya dari tab order sekaligus dari pohon
			 * aksesibilitas, sehingga `role="separator"` dan `tabIndex` di
			 * `handleProps` tidak perlu dicabang-cabangkan per lebar layar.
			 */}
			<div
				{...handleProps}
				className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize touch-none bg-transparent transition-colors outline-none hover:bg-primary/20 focus-visible:bg-primary/40 max-lg:hidden"
			/>

			{/*
			 * Kepala laci, hanya di bawah `lg`. Peralihnya tombol biasa, bukan
			 * `TabsTrigger`: `Tabs` sudah *controlled* dari `chapter-editor.tsx`,
			 * jadi memanggil `onPilihTab` setara dengan mengklik tab di baris
			 * toolbar. Merender `TabsList` kedua akan membuat dua `Tabs.Tab`
			 * mengklaim `value` yang sama dan menyisakan dua `role="tablist"` di
			 * satu dokumen — mengklaim ARIA yang tidak benar-benar dipenuhi.
			 */}
			<div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 lg:hidden">
				<div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					{PANEL_TABS.map((tab) => (
						<button
							key={tab.value}
							type="button"
							onClick={() => onPilihTab(tab.value)}
							aria-pressed={tab.value === tabAktif}
							className={cn(
								'shrink-0 cursor-pointer rounded-md px-2.5 py-1 text-sm font-medium whitespace-nowrap transition-colors',
								tab.value === tabAktif
									? 'bg-primary text-primary-foreground'
									: 'text-foreground/60 hover:text-foreground',
							)}
						>
							{tab.label}
						</button>
					))}
				</div>

				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Tutup panel"
					onClick={onTutup}
					className="shrink-0 cursor-pointer"
				>
					<XIcon className="size-4" />
				</Button>
			</div>

			<TabsContent
				value="draft"
				className="flex min-h-0 flex-1 flex-col overflow-hidden"
			>
				<ChapterDraftPanel
					chapter={chapter}
					izin={izin}
					ambilSnapshot={ambilSnapshot}
					onRestored={onRestored}
				/>
			</TabsContent>

			<TabsContent
				value="generasi"
				className="flex min-h-0 flex-1 flex-col overflow-hidden"
			>
				<ChapterGenerationPanel
					chapter={chapter}
					studyProgramId={studyProgramId}
					izin={izin}
					onGenerated={onGenerated}
				/>
			</TabsContent>

			<TabsContent
				value="rujukan"
				className="flex min-h-0 flex-1 flex-col overflow-hidden"
			>
				<ChapterReferencePanel
					chapter={chapter}
					studyProgramId={studyProgramId}
				/>
			</TabsContent>

			<TabsContent
				value="panduan"
				className="flex min-h-0 flex-1 flex-col overflow-hidden"
			>
				<ChapterGuidancePanel chapter={chapter} />
			</TabsContent>

			<TabsContent
				value="skor"
				className="flex min-h-0 flex-1 flex-col overflow-hidden"
			>
				<ChapterQualityPanel chapter={chapter} savedAt={savedAt} />
			</TabsContent>

			<TabsContent
				value="review"
				className="flex min-h-0 flex-1 flex-col overflow-hidden"
			>
				<ChapterReviewPanel
					chapter={chapter}
					izin={izin}
					onReviewed={onReviewed}
				/>
			</TabsContent>
		</aside>
	);
}
