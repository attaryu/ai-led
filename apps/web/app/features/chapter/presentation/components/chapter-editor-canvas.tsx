import { LockIcon, EyeIcon } from '@phosphor-icons/react';
import { EditorContent, type Editor } from '@tiptap/react';

import { type ChapterPermission } from '../hooks/use-chapter-permission';

/**
 * Kanvas "kertas" Editor Bab (docs/application_flow.md §7.2).
 *
 * Satu `BAB_DOKUMEN` = satu ruang kerja utuh: secara visual halamannya bisa
 * memanjang jadi banyak bagian, tapi semuanya tetap satu `kontenKerja` milik bab
 * ini dan tidak dipecah jadi entitas terpisah per bagian.
 */
export function ChapterEditorCanvas({
	editor,
	judulBab,
	blockedReason,
}: {
	editor: Editor;
	judulBab: string;
	blockedReason: ChapterPermission['blockedReason'];
}) {
	return (
		<main className="min-w-0 flex-1 overflow-y-auto bg-muted/40 p-8">
			<div className="mx-auto max-w-3xl space-y-3">
				{blockedReason && (
					<div className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
						{blockedReason === 'terkunci' ? (
							<>
								<LockIcon className="size-4 shrink-0" />
								{/* §12.2: kunci memblokir aksi ubah, bukan membaca — semua
								    tab di kanan tetap bisa dibuka. */}
								<span>
									Bab ini dikunci Penjamin Mutu. Isinya masih bisa dibaca, tapi
									tidak bisa diubah.
								</span>
							</>
						) : (
							<>
								<EyeIcon className="size-4 shrink-0" />
								<span>
									Anda membuka bab ini dalam mode baca. Perubahan konten hanya
									bisa dilakukan Penyusun dan Penjamin Mutu.
								</span>
							</>
						)}
					</div>
				)}

				<div className="rounded-md bg-card px-12 py-14 shadow-sm">
					<h2 className="mb-6 font-heading text-xl font-bold tracking-tight">
						{judulBab}
					</h2>
					<EditorContent editor={editor} />
				</div>
			</div>
		</main>
	);
}
