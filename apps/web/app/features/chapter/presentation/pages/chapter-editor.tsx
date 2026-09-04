import { useEditor } from '@tiptap/react';
import { ListIcon, SidebarSimpleIcon } from '@phosphor-icons/react';
import * as React from 'react';
import { Navigate, useParams } from 'react-router';

import { PlaceholderPage } from '~/core/components/placeholder-page';
import { Button } from '~/core/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '~/core/components/ui/tabs';
import { useEscapeLayer } from '~/core/lib/escape-layer';
import {
	canAccessTenant,
	useRoleGuard,
} from '~/features/auth/presentation/hooks/use-role-guard';
import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { ledProjectRepository } from '~/features/led-project/data/repositories/led-project.repository';
import { type LedProjectEntity } from '~/features/led-project/domain/entities/led-project.entity';
import { chapterRepository } from '../../data/repositories/chapter.repository';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { type ChapterSectionEntity } from '../../domain/entities/chapter-section.entity';
import {
	buildChapterToc,
	findTocPathForChapter,
	type ChapterTocNode,
} from '../../domain/entities/chapter-toc.entity';
import { ChapterCitationHoverCard } from '../components/chapter-citation-hover-card';
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
import { type HasilPulih } from '../hooks/use-chapter-draft';
import { type HasilGenerate } from '../hooks/use-chapter-generation';
import { useChapterPermission } from '../hooks/use-chapter-permission';
import { usePanelResize } from '../hooks/use-panel-resize';
import { useSectionSources } from '../hooks/use-section-sources';
import { CITATION_LINK_HREF, sisipkanTautanSitasi } from '../utils/citation-links';
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
	const { projectId, chapterId, sectionId } = useParams<{
		projectId: string;
		chapterId: string;
		sectionId?: string;
	}>();
	const session = useSession();

	// `findByProjectId` (bab) dan `findById` (dokumen induk) sekarang HTTP —
	// dimuat sekali per `projectId`, bukan dibaca sinkron saat render seperti
	// dulu. `undefined` = masih dimuat, dibedakan dari `[]`/`null` yang berarti
	// sudah selesai dan memang tidak ada.
	const [ledProject, setLedProject] = React.useState<
		LedProjectEntity | null | undefined
	>(undefined);
	const [chapters, setChapters] = React.useState<ChapterEntity[] | undefined>(
		undefined,
	);

	React.useEffect(() => {
		if (!projectId) {
			setLedProject(null);
			setChapters([]);
			return;
		}
		setLedProject(undefined);
		setChapters(undefined);
		let cancelled = false;
		ledProjectRepository.findById(projectId).then((found) => {
			if (!cancelled) setLedProject(found ?? null);
		});
		chapterRepository.findByProjectId(projectId).then((found) => {
			if (!cancelled) setChapters(found);
		});
		return () => {
			cancelled = true;
		};
	}, [projectId]);

	const chapter =
		chapters && chapterId
			? chapters.find((item) => item.id === chapterId)
			: undefined;

	const guard = useRoleGuard('project', ledProject?.studyProgramId);

	/**
	 * Pohon Daftar Isi, dibangun per Set Akreditasi dokumen ini
	 * (`buildChapterToc`) — kosong selama `ledProject` masih dimuat atau
	 * dokumennya belum memilih set. Menunggu `ledProject` (bukan `projectId`)
	 * supaya tidak perlu request kedua begitu Set Akreditasi-nya ganti di
	 * halaman lain lalu pengguna kembali ke sini dengan `ledProject` yang sama.
	 */
	const [chapterToc, setChapterToc] = React.useState<ChapterTocNode[]>([]);
	React.useEffect(() => {
		if (!ledProject || !chapters) {
			setChapterToc([]);
			return;
		}
		let cancelled = false;
		buildChapterToc(ledProject.accreditationSetId, chapters).then((tree) => {
			if (!cancelled) setChapterToc(tree);
		});
		return () => {
			cancelled = true;
		};
	}, [ledProject, chapters]);

	/**
	 * Bangun ulang pohon Daftar Isi tanpa nunggu efek di atas re-jalan --
	 * dipanggil `ChapterEditorToc` sesudah nambah sub-bab/sub-sub-bab lewat
	 * `[+]` di baris pohon, supaya simpul barunya langsung kelihatan tanpa
	 * pindah bab / reload halaman.
	 */
	const refetchChapterToc = React.useCallback(async () => {
		if (!ledProject || !chapters) return;
		setChapterToc(await buildChapterToc(ledProject.accreditationSetId, chapters));
	}, [ledProject, chapters]);

	/**
	 * Section yang sedang dibuka (`sectionId` di URL) — kanvas menampilkan
	 * ISI SECTION ini saja, bukan `kontenKerja` bab utuh (lihat
	 * `ChapterEditorWorkspace`). Cuma di-fetch saat memang ada `sectionId`:
	 * pindah ke tampilan bab utuh (kasus paling umum) tidak perlu request ini
	 * sama sekali.
	 */
	const [sections, setSections] = React.useState<ChapterSectionEntity[] | undefined>(
		undefined,
	);
	React.useEffect(() => {
		if (!chapter || !sectionId) {
			setSections(undefined);
			return;
		}
		let cancelled = false;
		chapterRepository.findSections(chapter.id).then((found) => {
			if (!cancelled) setSections(found);
		});
		return () => {
			cancelled = true;
		};
	}, [chapter, sectionId]);

	const section = sectionId ? sections?.find((item) => item.id === sectionId) : undefined;

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
	// Digerbang juga oleh `chapterToc.length > 0` supaya percobaan pertama
	// (sebelum pohonnya termuat) tidak menandai bab ini "sudah ditangani" --
	// begitu pohonnya termuat, kondisinya masih benar dan jalurnya baru dihitung.
	const babTerbentangRef = React.useRef<string | null>(null);
	const kunciTerbentang = chapter ? `${chapter.urutanBab}:${sectionId ?? ''}` : null;
	if (chapter && chapterToc.length > 0 && babTerbentangRef.current !== kunciTerbentang) {
		babTerbentangRef.current = kunciTerbentang;
		const jalur = findTocPathForChapter(chapter.urutanBab, chapterToc, sectionId ?? null).map(
			(node) => node.id,
		);
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

	// Ditaruh sesudah seluruh hook di atas (Rules of Hooks) — `ledProject`/
	// `chapters` sekarang datang dari HTTP, jadi ada jeda sebelum keduanya siap.
	// `sections` cuma ikut menggerbang saat `sectionId` memang ada di URL.
	if (ledProject === undefined || chapters === undefined || (sectionId && sections === undefined)) {
		return (
			<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
				Memuat…
			</div>
		);
	}

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
						description={`Tidak ada Dokumen LED dengan ID "${projectId}". Mungkin sudah dihapus, atau ikut terhapus bersama program studinya.`}
						links={
							escapeTo
								? [
										{
											label: showTenantLink
												? 'Lihat Dokumen LED lintas program studi'
												: 'Kembali ke Dashboard Program Studi',
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

	// `sectionId` ada di URL tapi tidak (lagi) ada section dengan id itu di bab
	// ini — dihapus dari tempat lain, atau URL diutak-atik. Pulihkan ke
	// tampilan bab utuh, sama semangatnya dengan pemulihan bab di atas.
	if (sectionId && !section) {
		return <Navigate to={`/editor/${projectId}/${chapter.id}`} replace />;
	}

	// Sisa `pending` hanya mungkin bila session belum terbaca.
	if (guard.status !== 'allowed') return null;

	return (
		<ChapterEditorWorkspace
			key={`${chapter.id}:${sectionId ?? 'full'}`}
			projectId={projectId}
			judulDokumen={ledProject.judul}
			studyProgramId={ledProject.studyProgramId}
			chapter={chapter}
			chapters={chapters}
			section={section}
			chapterToc={chapterToc}
			tocTerbentang={tocTerbentang}
			onToggleTocNode={toggleTocNode}
			onSectionAdded={refetchChapterToc}
		/>
	);
}

/**
 * Ruang kerja satu bab (atau satu section di dalamnya). Dipisah dari komponen
 * di atas supaya `key={chapter.id}:{sectionId}` bisa memasangnya ulang saat
 * bab ATAU section berganti: `content` di Tiptap hanya dibaca sekali saat
 * editor dibuat, jadi tanpa pemasangan ulang target berikutnya akan
 * menampilkan tulisan lama — lalu menyimpannya menimpa target yang salah.
 */
function ChapterEditorWorkspace({
	projectId,
	judulDokumen,
	studyProgramId,
	chapter,
	chapters,
	section,
	chapterToc,
	tocTerbentang,
	onToggleTocNode,
	onSectionAdded,
}: {
	projectId: string;
	judulDokumen: string;
	studyProgramId: string;
	chapter: ChapterEntity;
	chapters: ChapterEntity[];
	/** Non-undefined → kanvas menampilkan ISI SECTION ini saja, bukan bab utuh. */
	section: ChapterSectionEntity | undefined;
	chapterToc: ChapterTocNode[];
	tocTerbentang: ReadonlySet<string>;
	onToggleTocNode: (id: string) => void;
	/** Diteruskan ke `ChapterEditorToc` — lihat `refetchChapterToc` di `ChapterEditor`. */
	onSectionAdded: () => void | Promise<void>;
}) {
	const [tabAktif, setTabAktif] = React.useState<PanelTabValue>(
		PANEL_TABS[0].value,
	);

	/**
	 * Baris bab yang dilihat sidebar kanan.
	 *
	 * Perlu terpisah dari prop `chapter` karena halaman induk membaca repository
	 * saat render tanpa berlangganan apa pun, sedangkan ruang kerja ini di-`key`
	 * oleh `chapter.id` sehingga tidak ikut terpasang ulang. Tanpa state ini,
	 * `buktiDukungIds` di tab Generasi akan tetap menunjukkan pilihan lama sesudah
	 * generate. Kanvas dan editor sengaja **tidak** ikut membacanya: `content`
	 * Tiptap memang hanya dibaca sekali saat editor dibuat.
	 */
	const [babTerkini, setBabTerkini] = React.useState(chapter);

	/**
	 * Laci mana yang terbuka di bawah `lg` — Daftar Isi, sidebar kanan, atau tidak
	 * satu pun.
	 *
	 * Satu nilai, bukan dua boolean: dua laci melayang bersamaan dengan satu
	 * backdrop membuat sasaran klik backdrop jadi ambigu. Bentuk ini membuat
	 * saling-eksklusif mustahil dilanggar, bukan sekadar tidak disengaja.
	 *
	 * Tinggal di sini, bukan di `ChapterEditor` seperti `tocTerbentang`: ruang
	 * kerja ini di-`key` oleh `chapter.id`, jadi mengklik bab di dalam laci Daftar
	 * Isi memasangnya ulang dan lacinya menutup sendiri tanpa kode tambahan. Umur
	 * kedua state itu memang berlawanan — cabang yang dibentangkan harus selamat
	 * dari pergantian bab, laci yang terbuka justru tidak boleh.
	 */
	const [laci, setLaci] = React.useState<'toc' | 'panel' | null>(null);
	const pemicuTocRef = React.useRef<HTMLButtonElement>(null);
	const pemicuPanelRef = React.useRef<HTMLButtonElement>(null);

	const tutupLaci = React.useCallback(() => {
		setLaci((sebelumnya) => {
			// Fokus dikembalikan ke tombol yang membukanya; tanpa ini fokus
			// terjatuh ke `<body>` dan Tab berikutnya mulai lagi dari atas halaman.
			const pemicu = sebelumnya === 'toc' ? pemicuTocRef : pemicuPanelRef;
			pemicu.current?.focus();
			return null;
		});
	}, []);

	useEscapeLayer(laci !== null, tutupLaci);

	// `matchMedia` dipanggil di dalam efek dan tidak pernah dibaca saat render,
	// jadi tidak ada nilai tebakan yang harus dikoreksi di pass kedua — tidak ada
	// kedipan. Tata letaknya sendiri sudah benar tanpa ini (semua gaya laci hidup
	// di `max-lg:`), yang dibereskan adalah `aria-expanded="true"` yang tertinggal
	// pada tombol yang sedang `display:none`, dan laci yang muncul kembali saat
	// jendela dikecilkan lagi. `64rem`, bukan `1024px`: itu nilai `lg` Tailwind apa
	// adanya, supaya keduanya tidak bisa berpisah diam-diam.
	React.useEffect(() => {
		if (!laci) return;
		const mq = window.matchMedia('(min-width: 64rem)');
		const cek = () => {
			if (mq.matches) setLaci(null);
		};
		cek();
		mq.addEventListener('change', cek);
		return () => mq.removeEventListener('change', cek);
	}, [laci]);

	const panel = usePanelResize();
	// `babTerkini`, bukan prop `chapter`: halaman induk membaca repository saat
	// render tanpa berlangganan apa pun, dan ruang kerja ini di-`key` oleh
	// `chapter.id` sehingga tidak ikut terpasang ulang. Membaca prop berarti kunci
	// review yang barusan ditulis tidak pernah sampai ke sini — kanvas tetap bisa
	// diketik dan tombolnya tetap berbunyi "Kunci Bab" sampai halaman dimuat ulang.
	//
	// Hanya hak akses yang pindah ke state; `content` Tiptap tetap dibaca sekali
	// dari prop, persis seperti yang dijaga catatan di atas.
	const izin = useChapterPermission(babTerkini, studyProgramId);
	const autosave = useChapterAutosave({
		chapterId: chapter.id,
		sectionId: section?.id ?? null,
		// `ChapterSection` tidak punya stempel waktu sendiri — lihat catatan
		// `use-chapter-autosave.ts`, indikatornya mulai kosong dan terisi
		// begitu autosave pertama section ini selesai.
		savedAtAwal: section ? null : chapter.terakhirDisimpan,
		enabled: izin.canEdit,
	});

	const { markDirty, flush } = autosave;

	const sumberSection = useSectionSources(chapter.id, section?.id);

	const editor = useEditor({
		extensions: editorExtensions,
		// Halaman ini dihidrasi React Router (SPA mode), dan membangun editor di
		// tengah render hidrasi membuat React membatalkan render konkurennya lalu
		// mengulang seluruh root secara sinkron. Menunda pembangunan ke efek
		// pertama menghilangkan itu, dengan ongkos satu render tambahan.
		immediatelyRender: false,
		// Dibaca sekali di sini dan tidak pernah lagi: editor sengaja tidak
		// berlangganan `storage-update`, supaya siaran autosave tidak memantul
		// balik dan menimpa dokumen yang sedang diketik. `section` non-undefined
		// → isi SECTION ini saja, bukan `kontenKerja` bab utuh.
		content: sisipkanTautanSitasi(
			(section ? section.konten : chapter.kontenKerja) ?? '',
			chapter.buktiDukung,
		),
		editable: izin.canEdit,
		editorProps: {
			attributes: { class: 'tiptap', 'data-slot': 'chapter-editor-content' },
			// Klik angka sitasi "(sumber: ...)" -> pindah ke tab Bukti, bukan taruh kursor.
			handleClickOn: (_view, _pos, _node, _nodePos, event) => {
				const target = (event.target as HTMLElement).closest(`a[href="${CITATION_LINK_HREF}"]`);
				if (!target) return false;
				event.preventDefault();
				setTabAktif('rujukan');
				return true;
			},
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

	/**
	 * Membawa isi bab yang ditulis **dari luar editor** ke layar.
	 *
	 * Dipakai dua jalur yang bentuknya sama persis: hasil generate (§12.1) dan
	 * pemulihan checkpoint (§8.1). Keduanya sudah menulis sendiri ke repository —
	 * jadi yang tersisa cuma menyusulkan kanvas dan merapikan autosave. Sengaja
	 * satu fungsi: dua salinan dari urutan di bawah pasti akan menyimpang, dan
	 * menyimpangnya senyap.
	 *
	 * `emitUpdate: false` bukan pilihan gaya. Sejak Tiptap v3, `setContent`
	 * memancarkan update secara bawaan — tanpa mematikannya, `onUpdate` di atas
	 * menyala, `markDirty` menjadwalkan simpanan untuk isi yang barusan disimpan,
	 * dan indikator berkedip menyimpan tanpa ada yang berubah.
	 *
	 * `adopt` menyusul **sinkron**: kalau pengguna sempat mengetik lalu menekan
	 * Generate atau memulihkan checkpoint, ada simpanan tertunda yang memegang
	 * tulisan lama dan akan menimpanya balik beberapa ratus milidetik kemudian.
	 */
	const adopsiIsiBaru = React.useCallback(
		({ html, chapter: diperbarui }: HasilGenerate | HasilPulih) => {
			// Kanvas cuma pegang isi SATU section saat `section` ada — HTML bab
			// utuh dari sini tidak boleh menimpanya. `babTerkini` tetap
			// diperbarui (dibaca panel lain), cuma editor yang dilewati; pindah
			// balik ke tampilan bab utuh sudah cukup untuk melihat hasilnya
			// (backend sudah menulisnya duluan).
			if (!section) editor?.commands.setContent(html, { emitUpdate: false });
			if (diperbarui.terakhirDisimpan) autosave.adopt(diperbarui.terakhirDisimpan);
			setBabTerkini(diperbarui);
		},
		[editor, autosave, section],
	);

	/**
	 * Isi bab yang **benar-benar terkini**, untuk checkpoint di tab Draft.
	 *
	 * `kontenKerja` dibaca langsung dari editor. Backend menulis checkpoint dari
	 * `kontenKerja` bab saat itu di server, jadi `flush()` di-`await` dulu supaya
	 * backend sudah punya ketikan terakhir sebelum checkpoint dibuat — gagal
	 * flush berarti `undefined`, jangan checkpoint isi yang belum tentu sampai.
	 */
	const ambilSnapshot = React.useCallback(async () => {
		const tersimpan = await autosave.flush();
		if (!tersimpan) return undefined;

		// Kanvas cuma pegang isi SATU section — checkpoint butuh `kontenKerja`
		// BAB UTUH, jadi dibaca ulang dari backend (bukan `editor.getHTML()`).
		// `recompileChapterContent` (backend, dipicu autosave section di atas)
		// sudah menimpa `workingContent`-nya begitu `flush()` di atas selesai.
		if (section) return chapterRepository.refreshFromBackend(chapter.id);

		if (!editor) return undefined;
		const kontenKerja = editor.isEmpty ? '' : editor.getHTML();
		return { ...babTerkini, kontenKerja };
	}, [autosave, editor, babTerkini, section, chapter.id]);

	return (
		<div className="flex h-screen flex-col overflow-hidden bg-background">
			<ChapterEditorHeader
				projectId={projectId}
				judulDokumen={judulDokumen}
				chapter={babTerkini}
				izin={izin}
				onReviewed={setBabTerkini}
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
					<div className="flex items-center gap-2 max-lg:min-w-0 max-lg:flex-1">
						{/*
						 * Pemicu laci ditaruh di baris toolbar, bukan di header: baris ini
						 * adalah tepi atas area kerja, dan yang dibukanya adalah kolom
						 * pertama dan terakhir area kerja itu. Kiri membuka yang di kiri,
						 * kanan membuka yang di kanan.
						 */}
						<Button
							ref={pemicuTocRef}
							variant="ghost"
							size="icon-sm"
							aria-label="Buka Daftar Isi"
							aria-expanded={laci === 'toc'}
							aria-controls="chapter-editor-toc"
							onClick={() => setLaci('toc')}
							className="shrink-0 cursor-pointer lg:hidden"
						>
							<ListIcon className="size-4" />
						</Button>

						{/* §1: yang tidak boleh dipakai disembunyikan, bukan ditampilkan mati. */}
						{editor && izin.canEdit ? (
							// Gulir mendatar hanya di bawah `lg`. Di desktop baris ini tidak
							// pernah menggulung hari ini, dan menambahkannya di sana berarti
							// mengubah tampilan yang justru harus tetap sama.
							<div className="flex items-center max-lg:min-w-0 max-lg:flex-1 max-lg:overflow-x-auto max-lg:[scrollbar-width:none] max-lg:[&::-webkit-scrollbar]:hidden">
								<ChapterEditorToolbar editor={editor} />
							</div>
						) : (
							<div />
						)}
					</div>

					<TabsList className="hidden shrink-0 lg:inline-flex">
						{PANEL_TABS.map((tab) => (
							<TabsTrigger
								key={tab.value}
								value={tab.value}
								/*
								 * `text-white`, bukan `text-primary-foreground`.
								 * Token itu bernilai `oklch(0.962 0.018 272.314)` —
								 * putih bersemu lavender yang di atas `bg-primary`
								 * terbaca kusam pada layar proyektor. Tab ini penanda
								 * panel mana yang sedang terbuka, jadi kontrasnya
								 * dijaga penuh. Jangan dikembalikan ke token tanpa
								 * mengubah nilai tokennya lebih dulu.
								 *
								 * `data-active:hover:text-white` **wajib ada**, bukan
								 * pengulangan yang bisa dirapikan. Kelas dasar
								 * `TabsTrigger` memuat `hover:text-foreground`, yang
								 * spesifisitasnya sama persis dengan
								 * `data-active:text-white` — pemenangnya jatuh ke
								 * urutan CSS, dan `hover` yang menang. Tanpa baris
								 * ini, tab yang sedang aktif berubah jadi tulisan
								 * gelap di atas latar ungu begitu kursor lewat.
								 */
								className="px-3 data-active:bg-primary data-active:text-white data-active:hover:text-white"
							>
								{tab.label}
							</TabsTrigger>
						))}
					</TabsList>

					{/* Labelnya nama tab aktif, jadi tombolnya sekaligus penunjuk. */}
					<Button
						ref={pemicuPanelRef}
						variant="outline"
						size="sm"
						aria-expanded={laci === 'panel'}
						aria-controls="chapter-editor-panels"
						onClick={() => setLaci('panel')}
						className="shrink-0 cursor-pointer lg:hidden"
					>
						<SidebarSimpleIcon className="size-4" />
						{PANEL_TABS.find((tab) => tab.value === tabAktif)?.label}
					</Button>
				</div>

				<div className="flex min-h-0 flex-1">
					{/*
					 * `lg:hidden` bukan pelengkap: `laci` bisa tertinggal terisi saat
					 * jendela dilebarkan melewati `lg`, dan tanpa ini backdrop akan
					 * tertinggal menutupi tata letak tiga kolom yang sudah normal lagi.
					 */}
					{laci && (
						<div
							className="fixed inset-0 z-20 bg-black/40 lg:hidden"
							onClick={tutupLaci}
							aria-hidden
						/>
					)}

					<ChapterEditorToc
						projectId={projectId}
						chapters={chapters}
						chapterToc={chapterToc}
						chapterAktif={chapter}
						sectionIdAktif={section?.id ?? null}
						terbentang={tocTerbentang}
						onToggle={onToggleTocNode}
						terbuka={laci === 'toc'}
						onTutup={tutupLaci}
						onSectionAdded={onSectionAdded}
					/>

					{editor ? (
						<>
							<ChapterEditorCanvas
								editor={editor}
								judulBab={section ? `${chapter.judulBab} — ${section.judul}` : chapter.judulBab}
								blockedReason={izin.blockedReason}
							/>
							<ChapterCitationHoverCard editor={editor} sumber={sumberSection} />
						</>
					) : (
						<main className="min-w-0 flex-1 bg-muted/40 p-8" />
					)}

					<ChapterEditorPanels
						chapter={babTerkini}
						studyProgramId={studyProgramId}
						izin={izin}
						onGenerated={adopsiIsiBaru}
						ambilSnapshot={ambilSnapshot}
						onRestored={adopsiIsiBaru}
						// `setBabTerkini`, bukan `adopsiIsiBaru`: review tidak menyentuh
						// `kontenKerja` sama sekali, dan mendorong isi ke kanvas hanya akan
						// memicu autosave untuk tulisan yang tidak berubah.
						onReviewed={setBabTerkini}
						savedAt={autosave.savedAt}
						lebar={panel.lebar}
						handleProps={panel.handleProps}
						terbuka={laci === 'panel'}
						onTutup={tutupLaci}
						tabAktif={tabAktif}
						onPilihTab={setTabAktif}
					/>
				</div>
			</Tabs>
		</div>
	);
}
