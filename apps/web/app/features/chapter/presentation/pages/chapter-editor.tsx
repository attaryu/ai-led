import { useEditor } from '@tiptap/react';
import * as React from 'react';
import { Navigate, useParams } from 'react-router';

import { PlaceholderPage } from '~/core/components/placeholder-page';
import { Tabs, TabsList, TabsTrigger } from '~/core/components/ui/tabs';
import {
	canAccessTenant,
	useRoleGuard,
} from '~/features/auth/presentation/hooks/use-role-guard';
import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { ledProjectRepository } from '~/features/led-project/data/repositories/led-project.repository';
import { chapterRepository } from '../../data/repositories/chapter.repository';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { findTocPathForChapter } from '../../domain/entities/chapter-toc.entity';
import { ChapterEditorCanvas } from '../components/chapter-editor-canvas';
import { ChapterEditorHeader } from '../components/chapter-editor-header';
import {
	ChapterEditorPanels,
	PANEL_TABS,
	type PanelTabValue,
} from '../components/chapter-editor-panels';
import { ChapterEditorToc } from '../components/chapter-editor-toc';
import { ChapterEditorToolbar } from '../components/chapter-editor-toolbar';
import { useChapterAutosave } from '../hooks/use-chapter-autosave';
import { useChapterPermission } from '../hooks/use-chapter-permission';
import { editorExtensions } from '../utils/editor-extensions';

/**
 * Lapis 4 — Editor Bab (docs/application_flow.md §7).
 *
 * Berdiri sebagai root URL sendiri, bukan anak lapis 3, karena tampilannya nol
 * chrome: tiga kolom penuh layar tanpa satu pun bagian `AppShell`. Prodi pemilik
 * dokumen dibaca dari datanya — bukan dari URL — dengan alasan yang sama seperti
 * lapis 3: supaya tidak ada pasangan id yang bisa dibuat tidak cocok lewat
 * address bar.
 */
export function ChapterEditor() {
	const { projectId, chapterId } = useParams<{
		projectId: string;
		chapterId: string;
	}>();
	const session = useSession();

	const ledProject = projectId
		? ledProjectRepository.findById(projectId)
		: undefined;
	const chapters = projectId
		? chapterRepository.findByProjectId(projectId)
		: [];
	const chapter =
		projectId && chapterId
			? chapters.find((item) => item.id === chapterId)
			: undefined;

	const guard = useRoleGuard('project', ledProject?.studyProgramId);

	/**
	 * Simpul Daftar Isi yang sedang terbentang.
	 *
	 * Tinggal di sini, bukan di dalam komponen Daftar Isi, karena ruang kerja di
	 * bawah dipasang ulang tiap ganti bab (`key`) — cabang yang dibuka pengguna
	 * akan menutup sendiri setiap kali ia berpindah kalau statusnya ikut terbawa
	 * ke sana.
	 */
	const [tocTerbentang, setTocTerbentang] = React.useState<ReadonlySet<string>>(
		() => new Set(),
	);

	// Cabang menuju bab yang sedang dibuka selalu dibentangkan — termasuk saat
	// bab berganti — supaya posisi pengguna tidak pernah tersembunyi di balik
	// simpul tertutup. Sesudah itu ia bebas ditutup lagi seperti simpul lain.
	const babTerbentangRef = React.useRef<number | null>(null);
	if (chapter && babTerbentangRef.current !== chapter.urutanBab) {
		babTerbentangRef.current = chapter.urutanBab;
		const jalur = findTocPathForChapter(chapter.urutanBab).map((node) => node.id);
		setTocTerbentang((sebelumnya) =>
			// Kembalikan yang sama saat tidak ada yang perlu ditambah, supaya
			// penyetelan saat render ini tidak memicu render berikutnya.
			jalur.every((id) => sebelumnya.has(id))
				? sebelumnya
				: new Set([...sebelumnya, ...jalur]),
		);
	}

	const toggleTocNode = React.useCallback((id: string) => {
		setTocTerbentang((sebelumnya) => {
			const berikutnya = new Set(sebelumnya);
			if (!berikutnya.delete(id)) berikutnya.add(id);
			return berikutnya;
		});
	}, []);

	// Ditolak menang atas segalanya: Penyusun yang mengetik projectId prodi lain
	// harus dipulangkan, bukan diberi tahu dokumennya ada atau tidak.
	if (guard.status === 'denied') {
		return <Navigate to={guard.redirectTo} replace />;
	}

	if (!ledProject || !projectId) {
		// Guard mengembalikan `pending` untuk Penyusun di sini (prodi pemilik tidak
		// bisa dipastikan), jadi jalan keluarnya dibaca dari session — pola yang
		// sama dengan led-project-workspace-layout.
		const showTenantLink = session ? canAccessTenant(session) : false;
		const escapeTo = showTenantLink
			? '/dashboard/led-projects'
			: session?.studyProgramId
				? `/study-programs/${session.studyProgramId}`
				: null;

		return (
			<div className="flex min-h-screen items-center justify-center bg-muted/40 p-8">
				<div className="w-full max-w-lg">
					<PlaceholderPage
						title="Dokumen LED tidak ditemukan"
						description={`Tidak ada Dokumen LED dengan ID "${projectId}". Mungkin sudah dihapus, atau ikut terhapus bersama prodinya.`}
						links={
							escapeTo
								? [
										{
											label: showTenantLink
												? 'Lihat Dokumen LED lintas prodi'
												: 'Kembali ke Dashboard Prodi',
											to: escapeTo,
										},
									]
								: []
						}
					/>
				</div>
			</div>
		);
	}

	// Bab tidak ada, atau ada tapi milik dokumen lain (URL diutak-atik) — keduanya
	// berarti hal yang sama. Dokumennya sendiri sudah tervalidasi dan terjaga,
	// jadi pemulihan paling kecil kerusakannya adalah mempertahankan dokumennya
	// dan membetulkan babnya lewat rute bab default. Tidak mungkin berputar:
	// rute itu memilih babnya dari daftar bab dokumen ini juga.
	if (!chapter) {
		return <Navigate to={`/editor/${projectId}`} replace />;
	}

	// Sisa `pending` hanya mungkin bila session belum terbaca.
	if (guard.status !== 'allowed') return null;

	return (
		<ChapterEditorWorkspace
			key={chapter.id}
			projectId={projectId}
			judulDokumen={ledProject.judul}
			studyProgramId={ledProject.studyProgramId}
			chapter={chapter}
			chapters={chapters}
			tocTerbentang={tocTerbentang}
			onToggleTocNode={toggleTocNode}
		/>
	);
}

/**
 * Ruang kerja satu bab. Dipisah dari komponen di atas supaya `key={chapter.id}`
 * bisa memasangnya ulang saat bab berganti: `content` di Tiptap hanya dibaca
 * sekali saat editor dibuat, jadi tanpa pemasangan ulang bab berikutnya akan
 * menampilkan tulisan bab sebelumnya — lalu menyimpannya menimpa bab yang salah.
 */
function ChapterEditorWorkspace({
	projectId,
	judulDokumen,
	studyProgramId,
	chapter,
	chapters,
	tocTerbentang,
	onToggleTocNode,
}: {
	projectId: string;
	judulDokumen: string;
	studyProgramId: string;
	chapter: ChapterEntity;
	chapters: ChapterEntity[];
	tocTerbentang: ReadonlySet<string>;
	onToggleTocNode: (id: string) => void;
}) {
	const [tabAktif, setTabAktif] = React.useState<PanelTabValue>(
		PANEL_TABS[0].value,
	);

	const izin = useChapterPermission(chapter, studyProgramId);
	const autosave = useChapterAutosave({
		chapterId: chapter.id,
		savedAtAwal: chapter.terakhirDisimpan,
		enabled: izin.canEdit,
	});

	const { markDirty, flush } = autosave;

	const editor = useEditor({
		extensions: editorExtensions,
		// Halaman ini dihidrasi React Router (SPA mode), dan membangun editor di
		// tengah render hidrasi membuat React membatalkan render konkurennya lalu
		// mengulang seluruh root secara sinkron. Menunda pembangunan ke efek
		// pertama menghilangkan itu, dengan ongkos satu render tambahan.
		immediatelyRender: false,
		// Dibaca sekali di sini dan tidak pernah lagi: editor sengaja tidak
		// berlangganan `storage-update`, supaya siaran autosave tidak memantul
		// balik dan menimpa dokumen yang sedang diketik.
		content: chapter.kontenKerja ?? '',
		editable: izin.canEdit,
		editorProps: {
			attributes: { class: 'tiptap', 'data-slot': 'chapter-editor-content' },
		},
		onUpdate: ({ editor, transaction }) => {
			// Tidak semua pemberitahuan berarti tulisannya berubah: perubahan
			// seleksi, dekorasi placeholder, dan pergantian mode sunting juga
			// lewat sini. Tanpa penyaringan ini, sekadar membuka bab sudah cukup
			// untuk mencap `terakhirDisimpan` dan menulis ulang isinya.
			if (!transaction.docChanged) return;

			// String kosong, bukan `<p></p>`: bungkus paragraf kosong lolos dari
			// pemeriksaan `hasKonten` dan akan membuat bab yang sudah dikosongkan
			// tetap terhitung terisi di seluruh KPI dashboard.
			markDirty(editor.isEmpty ? '' : editor.getHTML());
		},
		onBlur: () => flush(),
	});

	// `editable` hanya dibaca saat editor dibuat; perubahan sesudahnya — misal
	// Penjamin Mutu mengunci bab ini dari tab lain, atau role ditukar lewat
	// pengalih di header — harus didorong lewat sini.
	//
	// `emitUpdate: false` bukan pemanis: bawaannya `true`, sehingga tiap
	// pergantian mode akan menyalakan `onUpdate` seolah dokumennya berubah.
	React.useEffect(() => {
		if (!editor || editor.isEditable === izin.canEdit) return;
		editor.setEditable(izin.canEdit, false);
	}, [editor, izin.canEdit]);

	return (
		<div className="flex h-screen flex-col overflow-hidden bg-background">
			<ChapterEditorHeader
				projectId={projectId}
				judulDokumen={judulDokumen}
				status={autosave.status}
				savedAt={autosave.savedAt}
			/>

			{/*
			 * `Tabs` membungkus seluruh area kerja karena kedua bagiannya terpisah
			 * jauh: daftar tabnya ikut baris toolbar di atas, panelnya di sidebar
			 * kanan. Base UI mensyaratkan panel jadi keturunan root, dan kelas
			 * bawaannya (`flex gap-2 data-horizontal:flex-col`) ditimpa karena
			 * keduanya memang sengaja tidak bertumpuk.
			 */}
			<Tabs
				value={tabAktif}
				onValueChange={(value) => setTabAktif(value as PanelTabValue)}
				className="flex min-h-0 flex-1 flex-col gap-0"
			>
				<div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4">
					{/* §1: yang tidak boleh dipakai disembunyikan, bukan ditampilkan mati. */}
					{editor && izin.canEdit ? (
						<ChapterEditorToolbar editor={editor} />
					) : (
						<div />
					)}

					<TabsList className="shrink-0">
						{PANEL_TABS.map((tab) => (
							<TabsTrigger
								key={tab.value}
								value={tab.value}
								className="px-3 data-active:bg-primary data-active:text-primary-foreground"
							>
								{tab.label}
							</TabsTrigger>
						))}
					</TabsList>
				</div>

				<div className="flex min-h-0 flex-1">
					<ChapterEditorToc
						projectId={projectId}
						chapters={chapters}
						chapterAktif={chapter}
						terbentang={tocTerbentang}
						onToggle={onToggleTocNode}
					/>

					{editor ? (
						<ChapterEditorCanvas
							editor={editor}
							judulBab={chapter.judulBab}
							blockedReason={izin.blockedReason}
						/>
					) : (
						<main className="min-w-0 flex-1 bg-muted/40 p-8" />
					)}

					<ChapterEditorPanels chapter={chapter} />
				</div>
			</Tabs>
		</div>
	);
}
