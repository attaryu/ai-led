import {
	BookOpenIcon,
	ClockCounterClockwiseIcon,
	GaugeIcon,
	ListChecksIcon,
	SparkleIcon,
	type Icon,
} from '@phosphor-icons/react';

import { TabsContent } from '~/core/components/ui/tabs';
import {
	hasKonten,
	type ChapterEntity,
} from '../../domain/entities/chapter.entity';

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
	{ value: 'generasi', label: 'Generasi' },
	{ value: 'draft', label: 'Draft' },
	{ value: 'rujukan', label: 'Rujukan' },
	{ value: 'rubrik', label: 'Rubrik' },
	{ value: 'skor', label: 'Skor' },
] as const;

export type PanelTabValue = (typeof PANEL_TABS)[number]['value'];

/**
 * Isi tiap tab masih kosong di iterasi ini — yang dibangun baru kerangkanya.
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
	PanelTabValue,
	{ icon: Icon; title: string; kosong: string; terisi: string }
> = {
	generasi: {
		icon: SparkleIcon,
		title: 'Generasi',
		kosong:
			'Bab ini belum punya tulisan. Mulai mengetik, atau jalankan generate untuk menyusun draf awal dari bukti dukung.',
		terisi: 'Belum ada riwayat generate untuk bab ini.',
	},
	draft: {
		icon: ClockCounterClockwiseIcon,
		title: 'Draft',
		kosong: 'Checkpoint pertama bisa dibuat setelah bab ini punya isi.',
		terisi: 'Belum ada checkpoint tersimpan untuk bab ini.',
	},
	rujukan: {
		icon: BookOpenIcon,
		title: 'Rujukan',
		kosong:
			'Panduan dan bukti dukung yang dipakai akan muncul di sini setelah bab ini digenerate atau ditulis.',
		terisi: 'Belum ada panduan atau bukti dukung yang dirujuk bab ini.',
	},
	rubrik: {
		icon: ListChecksIcon,
		title: 'Rubrik',
		kosong: 'Kriteria rubrik LAM Teknik akan tampil setelah bab ini punya isi.',
		terisi: 'Kriteria rubrik untuk bab ini belum dimuat.',
	},
	skor: {
		icon: GaugeIcon,
		title: 'Skor',
		kosong: 'Skor bisa dihitung setelah bab ini punya isi.',
		terisi: 'Belum ada hasil penilaian untuk bab ini.',
	},
};

export function ChapterEditorPanels({ chapter }: { chapter: ChapterEntity }) {
	const terisi = hasKonten(chapter);

	return (
		<aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-background">
			{PANEL_TABS.map((tab) => {
				const copy = PANEL_COPY[tab.value];
				return (
					<TabsContent key={tab.value} value={tab.value} className="p-5">
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
