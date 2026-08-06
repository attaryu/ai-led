import * as React from 'react';
import { GaugeIcon, type Icon } from '@phosphor-icons/react';

import { TabsContent } from '~/core/components/ui/tabs';
import {
	hasKonten,
	type ChapterEntity,
} from '../../domain/entities/chapter.entity';
import { type HasilPulih } from '../hooks/use-chapter-draft';
import { type HasilGenerate } from '../hooks/use-chapter-generation';
import { type ChapterPermission } from '../hooks/use-chapter-permission';
import { ChapterDraftPanel } from './chapter-draft-panel';
import { ChapterGenerationPanel } from './chapter-generation-panel';
import { ChapterReferencePanel } from './chapter-reference-panel';
import { ChapterRubricPanel } from './chapter-rubric-panel';

/**
 * Tab sidebar kanan Editor Bab.
 *
 * §7 menuliskan urutannya "Generate | Rujukan | Rubrik | Skor | Draft"; yang
 * dipakai di sini hasil keputusan desain berikutnya — "Generate" jadi "Generasi"
 * supaya seluruh label berbahasa Indonesia, dan "Draft" naik ke urutan kedua
 * karena ia pasangan langsung dari hasil generate.
 *
 * Satu-satunya sumber urutan dan label, dipakai bersama oleh daftar tab di baris
 * toolbar dan panel-panel di sidebar kanan.
 */
export const PANEL_TABS = [
	{ value: 'draft', label: 'Draft' },
	{ value: 'generasi', label: 'Generasi' },
	{ value: 'rujukan', label: 'Rujukan' },
	{ value: 'rubrik', label: 'Rubrik' },
	{ value: 'skor', label: 'Skor' },
] as const;

export type PanelTabValue = (typeof PANEL_TABS)[number]['value'];

/** Tab yang punya panel sungguhan; sisanya masih keadaan kosong. */
const TAB_TERBANGUN = ['draft', 'generasi', 'rujukan', 'rubrik'] as const;

/**
 * Tab yang isinya belum dibangun.
 *
 * Teksnya bercabang pada apakah babnya sudah punya isi, mengikuti §7.3 yang
 * menyatakan tab kanan tampil kosong sampai ada generate atau tulisan pertama.
 * Yang **tidak** dilakukan: menonaktifkan tombol tabnya. Base UI melewati tab
 * disabled saat navigasi panah, sehingga pengguna di bab baru — kondisi paling
 * umum saat dokumen baru dibuat — akan menemukan seluruh sidebar kanan tidak
 * terjangkau dan tidak bisa tahu isinya apa. §12.2 juga menuntut semua tab tetap
 * bisa dibuka saat bab dikunci.
 */
const PANEL_COPY: Record<
	Exclude<PanelTabValue, (typeof TAB_TERBANGUN)[number]>,
	{ icon: Icon; title: string; kosong: string; terisi: string }
> = {
	skor: {
		icon: GaugeIcon,
		title: 'Skor',
		kosong: 'Skor bisa dihitung setelah bab ini punya isi.',
		terisi: 'Belum ada hasil penilaian untuk bab ini.',
	},
};

export function ChapterEditorPanels({
	chapter,
	studyProgramId,
	izin,
	onGenerated,
	ambilSnapshot,
	onRestored,
	onLihatSkor,
	lingkupSkor,
	setLingkupSkor,
	lebar,
	handleProps,
}: {
	chapter: ChapterEntity;
	studyProgramId: string;
	izin: ChapterPermission;
	onGenerated: (hasil: HasilGenerate) => void;
	ambilSnapshot: () => ChapterEntity | undefined;
	onRestored: (hasil: HasilPulih) => void;
	onLihatSkor: (draftId: string) => void;
	/**
	 * Lingkup tab Rubrik, dipegang halaman editor supaya menu "Lihat skor" di tab
	 * Draft bisa mengarahkannya sekaligus berpindah tab (§8.1).
	 */
	lingkupSkor: string;
	setLingkupSkor: (lingkup: string) => void;
	/** Lebar hasil seretan; menggantikan `w-80` yang dulu tetap. */
	lebar: number;
	handleProps: React.ComponentProps<'div'>;
}) {
	const terisi = hasKonten(chapter);

	return (
		// `overflow-hidden`, bukan `overflow-y-auto`: tab Generasi mengatur
		// gulungannya sendiri supaya pencarian dan tombol generate tetap terlihat.
		// Tab lain isinya sependek satu keadaan kosong, jadi tidak ada yang hilang.
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

			{PANEL_TABS.filter(
				(tab) => !TAB_TERBANGUN.includes(tab.value as never),
			).map((tab) => {
				const copy = PANEL_COPY[tab.value as keyof typeof PANEL_COPY];
				return (
					<TabsContent
						key={tab.value}
						value={tab.value}
						className="overflow-y-auto p-5"
					>
						<ChapterPanelEmpty
							icon={copy.icon}
							title={copy.title}
							description={terisi ? copy.terisi : copy.kosong}
						/>
					</TabsContent>
				);
			})}
		</aside>
	);
}

/**
 * Keadaan kosong panel sidebar kanan.
 *
 * Sengaja lokal, bukan `PlaceholderPage` dari core: yang itu kartu selebar badan
 * halaman lengkap dengan tautan rute, sedangkan ini harus muat di kolom 320 px.
 * Kalau nanti panel serupa muncul di fitur lain, barulah ia naik ke `core/`
 * seperti yang sudah terjadi pada `StatCard` dan `format-time`.
 */
function ChapterPanelEmpty({
	icon: IconGlyph,
	title,
	description,
}: {
	icon: Icon;
	title: string;
	description: string;
}) {
	return (
		<div className="flex flex-col items-center gap-2 px-2 py-10 text-center">
			<IconGlyph className="size-7 text-muted-foreground/50" />
			<p className="text-sm font-medium">{title}</p>
			<p className="text-xs leading-relaxed text-muted-foreground">
				{description}
			</p>
		</div>
	);
}
