import * as React from 'react';

import { streamSse } from '~/core/lib/sse-client';
import { chapterChatRemoteSource } from '../../data/sources/remote/chapter-chat.remote-source';

export type ChatRole = 'USER' | 'ASSISTANT';

export type ChatMessage = {
	id: string;
	role: ChatRole;
	message: string;
	/** `true` selagi token-nya masih di-stream — dipakai indikator "sedang mengetik". */
	streaming?: boolean;
};

/** Bentuk frame `POST bab/:id/chat` — lihat `api/routes/chat.py`. */
type ChatFrame = { token?: string; error?: string; done?: boolean };

/**
 * Isi tab Chat: riwayat revisi bab lewat obrolan dengan AI, kata demi kata
 * (tracker row 33-34). Dimuat dari `GET bab/:id/chat/history`, dikirim lewat
 * `POST bab/:id/chat` — keduanya proxy NestJS, tidak pernah langsung ke apps/ai.
 *
 * Pesan USER ditambahkan optimis begitu dikirim (backend juga menyimpannya
 * sebelum stream mulai, lihat `chat.py`), pesan ASSISTANT dirakit token demi
 * token ke satu baris yang sama sampai `done`.
 */
export function useChapterChat({
	babId,
	enabled,
}: {
	babId: string;
	/** `izin.canEdit` — sama seperti tab Generasi, chat menulis isi bab. */
	enabled: boolean;
}) {
	const [pesan, setPesan] = React.useState<ChatMessage[]>([]);
	const [memuat, setMemuat] = React.useState(true);
	const [input, setInput] = React.useState('');
	const [mengirim, setMengirim] = React.useState(false);
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);

	React.useEffect(() => {
		let dibatalkan = false;
		setMemuat(true);
		chapterChatRemoteSource
			.findHistory(babId)
			.then((riwayat) => {
				if (dibatalkan) return;
				setPesan(
					riwayat.map((baris) => ({
						id: baris.id,
						role: baris.role,
						message: baris.message,
					})),
				);
			})
			.catch(() => {
				if (!dibatalkan) setPesanGagal('Gagal memuat riwayat chat.');
			})
			.finally(() => {
				if (!dibatalkan) setMemuat(false);
			});
		return () => {
			dibatalkan = true;
		};
	}, [babId]);

	const kirim = React.useCallback(async () => {
		const teks = input.trim();
		if (!enabled || !teks || mengirim) return;

		setMengirim(true);
		setPesanGagal(null);
		setInput('');

		// Optimis: id sementara, ditimpa bukan masalah — riwayat ini tidak pernah
		// dibaca ulang dari server dalam sesi yang sama sesudah baris ini ada.
		const idUser = `local-${Date.now()}`;
		const idAsisten = `local-${Date.now()}-a`;
		setPesan((sebelumnya) => [
			...sebelumnya,
			{ id: idUser, role: 'USER', message: teks },
			{ id: idAsisten, role: 'ASSISTANT', message: '', streaming: true },
		]);

		try {
			let balasan = '';
			for await (const frame of streamSse<ChatFrame>(`/bab/${babId}/chat`, {
				method: 'POST',
				body: { message: teks },
			})) {
				if (frame.error) {
					setPesanGagal(frame.error);
					break;
				}
				if (frame.token) {
					balasan += frame.token;
					setPesan((sebelumnya) =>
						sebelumnya.map((item) =>
							item.id === idAsisten ? { ...item, message: balasan } : item,
						),
					);
				}
				if (frame.done) break;
			}
		} catch {
			setPesanGagal('Koneksi terputus sebelum balasan selesai.');
		} finally {
			setPesan((sebelumnya) =>
				sebelumnya.map((item) =>
					item.id === idAsisten ? { ...item, streaming: false } : item,
				),
			);
			setMengirim(false);
		}
	}, [babId, input, enabled, mengirim]);

	return { pesan, memuat, input, setInput, kirim, mengirim, pesanGagal };
}
