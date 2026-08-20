import * as React from 'react';
import {
	PaperPlaneRightIcon,
	SpinnerGapIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { ScrollArea } from '~/core/components/ui/scroll-area';
import { Textarea } from '~/core/components/ui/textarea';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { frasaBlokir, type ChapterPermission } from '../hooks/use-chapter-permission';
import { useChapterChat } from '../hooks/use-chapter-chat';

/**
 * Isi tab "Chat" (tracker row 33-34): merevisi bab lewat obrolan dengan AI,
 * kata demi kata. Berbeda dari tab Generasi — itu menimpa seluruh
 * `kontenKerja`, ini murni percakapan; AI tidak pernah menulis balik ke bab
 * dari sini (backend cuma menyimpan `chat_messages`, tidak menyentuh
 * `BabDokumen` sama sekali — lihat `api/routes/chat.py`).
 */
export function ChapterChatPanel({
	chapter,
	izin,
}: {
	chapter: ChapterEntity;
	izin: ChapterPermission;
}) {
	const { pesan, memuat, input, setInput, kirim, mengirim, pesanGagal } =
		useChapterChat({ babId: chapter.id, enabled: izin.canEdit });

	const scrollRef = React.useRef<HTMLDivElement>(null);
	React.useEffect(() => {
		scrollRef.current?.scrollIntoView({ block: 'end' });
	}, [pesan]);

	function kirimDariForm(event: React.FormEvent) {
		event.preventDefault();
		void kirim();
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-3 px-5 py-4">
					{memuat ? (
						<p className="py-8 text-center text-xs text-muted-foreground">
							Memuat riwayat…
						</p>
					) : pesan.length === 0 ? (
						<p className="py-8 text-center text-xs leading-relaxed text-muted-foreground">
							Belum ada percakapan. Tanyakan apa saja soal isi bab ini, atau
							minta AI merevisi sebagian tulisan.
						</p>
					) : (
						pesan.map((baris) => (
							<BubbleChat key={baris.id} baris={baris} />
						))
					)}
					<div ref={scrollRef} />
				</div>
			</ScrollArea>

			<div className="shrink-0 space-y-2 border-t border-border px-5 py-3">
				{pesanGagal && (
					<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
						<WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
						<p className="text-xs leading-relaxed text-destructive">
							{pesanGagal}
						</p>
					</div>
				)}

				{izin.canEdit ? (
					<form onSubmit={kirimDariForm} className="flex items-end gap-2">
						<Textarea
							value={input}
							onChange={(event) => setInput(event.target.value)}
							onKeyDown={(event) => {
								// Enter mengirim, Shift+Enter baris baru — konvensi chat pada umumnya.
								if (event.key === 'Enter' && !event.shiftKey) {
									event.preventDefault();
									void kirim();
								}
							}}
							disabled={mengirim}
							placeholder="Tanyakan atau minta revisi ke AI…"
							aria-label="Pesan chat"
							rows={2}
							className="max-h-28 min-h-14 resize-none py-1.5 text-xs"
						/>
						<Button
							type="submit"
							size="sm"
							disabled={mengirim || !input.trim()}
							className="shrink-0"
						>
							{mengirim ? (
								<SpinnerGapIcon className="animate-spin" />
							) : (
								<PaperPlaneRightIcon />
							)}
						</Button>
					</form>
				) : (
					<p className="text-xs leading-relaxed text-muted-foreground">
						{izin.blockedReason === 'terkunci' || izin.blockedReason === 'diajukan'
							? `${frasaBlokir[izin.blockedReason]}, jadi chat tidak bisa dijalankan.`
							: 'Anda hanya bisa membaca bab ini.'}
					</p>
				)}
			</div>
		</div>
	);
}

function BubbleChat({
	baris,
}: {
	baris: { role: 'USER' | 'ASSISTANT'; message: string; streaming?: boolean };
}) {
	const dariUser = baris.role === 'USER';

	return (
		<div className={dariUser ? 'flex justify-end' : 'flex justify-start'}>
			<div
				className={
					dariUser
						? 'max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
						: 'max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm'
				}
			>
				<p className="leading-relaxed whitespace-pre-wrap">
					{baris.message}
					{baris.streaming && (
						<span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
					)}
				</p>
			</div>
		</div>
	);
}
