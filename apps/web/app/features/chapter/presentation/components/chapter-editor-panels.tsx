import * as React from 'react';

import { TabsContent } from '~/core/components/ui/tabs';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { type HasilPulih } from '../hooks/use-chapter-draft';
import { type HasilGenerate } from '../hooks/use-chapter-generation';
import { type ChapterPermission } from '../hooks/use-chapter-permission';
import { ChapterChatPanel } from './chapter-chat-panel';
import { ChapterDraftPanel } from './chapter-draft-panel';
import { ChapterGenerationPanel } from './chapter-generation-panel';
import { ChapterQualityPanel } from './chapter-quality-panel';
import { ChapterReferencePanel } from './chapter-reference-panel';
import { ChapterReviewPanel } from './chapter-review-panel';
import { ChapterRubricPanel } from './chapter-rubric-panel';

/**
 * Tab sidebar kanan Editor Bab.
 *
 * §7 menuliskan urutannya "Generate | Rujukan | Rubrik | Skor | Draft"; yang
 * dipakai di sini hasil keputusan desain berikutnya — "Generate" jadi "Generasi"
 * supaya seluruh label berbahasa Indonesia, dan "Draft" naik ke urutan kedua
 * karena ia pasangan langsung dari hasil generate.
 *
 * **"Skor" tampil sebagai "Kualitas AI".** Nama lamanya tertukar rasanya dengan
 * "Rubrik" — justru tab itu yang menampilkan skor 1–4 beserta totalnya, sedangkan
 * tab ini mengukur mutu kerja AI-nya (§10.1). `value`-nya tetap `'skor'` karena ia
 * dipakai sebagai kunci di beberapa tempat dan tidak pernah dilihat pengguna.
 *
 * Satu-satunya sumber urutan dan label, dipakai bersama oleh daftar tab di baris
 * toolbar dan panel-panel di sidebar kanan.
 */
export const PANEL_TABS = [
	{ value: 'draft', label: 'Draft' },
	{ value: 'generasi', label: 'Generasi' },
	{ value: 'rujukan', label: 'Rujukan' },
	{ value: 'rubrik', label: 'Rubrik' },
	{ value: 'skor', label: 'Kualitas AI' },
	{ value: 'chat', label: 'Chat' },
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
	onLihatSkor,
	lingkupSkor,
	setLingkupSkor,
	savedAt,
	lebar,
	handleProps,
}: {
	chapter: ChapterEntity;
	studyProgramId: string;
	izin: ChapterPermission;
	onGenerated: (hasil: HasilGenerate) => void;
	ambilSnapshot: () => Promise<ChapterEntity | undefined>;
	onRestored: (hasil: HasilPulih) => void;
	/** Bab sesudah kunci/catatan review ditulis; isinya tidak ikut berubah. */
	onReviewed: (diperbarui: ChapterEntity) => void;
	onLihatSkor: (draftId: string) => void;
	/**
	 * Lingkup tab Rubrik, dipegang halaman editor supaya menu "Lihat skor" di tab
	 * Draft bisa mengarahkannya sekaligus berpindah tab (§8.1).
	 */
	lingkupSkor: string;
	setLingkupSkor: (lingkup: string) => void;
	/** Stempel simpan terakhir dari autosave; dipakai tab Kualitas AI. */
	savedAt: string | null;
	/** Lebar hasil seretan; menggantikan `w-80` yang dulu tetap. */
	lebar: number;
	handleProps: React.ComponentProps<'div'>;
}) {
	return (
		// `overflow-hidden`, bukan `overflow-y-auto`: tiap panel mengatur gulungannya
		// sendiri supaya kepala dan kakinya tetap terlihat berapa pun panjang isinya.
		<aside
			style={{ width: lebar }}
			className="relative flex shrink-0 flex-col overflow-hidden border-l border-border bg-background"
		>
			<div
				{...handleProps}
				className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize touch-none bg-transparent transition-colors outline-none hover:bg-primary/20 focus-visible:bg-primary/40"
			/>

			<TabsContent
				value="draft"
				className="flex min-h-0 flex-1 flex-col overflow-hidden"
			>
				<ChapterDraftPanel
					chapter={chapter}
					izin={izin}
					ambilSnapshot={ambilSnapshot}
					onRestored={onRestored}
					onLihatSkor={onLihatSkor}
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
				value="rubrik"
				className="flex min-h-0 flex-1 flex-col overflow-hidden"
			>
				<ChapterRubricPanel
					chapter={chapter}
					izin={izin}
					lingkup={lingkupSkor}
					setLingkup={setLingkupSkor}
				/>
			</TabsContent>

			<TabsContent
				value="skor"
				className="flex min-h-0 flex-1 flex-col overflow-hidden"
			>
				<ChapterQualityPanel chapter={chapter} savedAt={savedAt} />
			</TabsContent>

			<TabsContent
				value="chat"
				className="flex min-h-0 flex-1 flex-col overflow-hidden"
			>
				<ChapterChatPanel chapter={chapter} izin={izin} />
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
