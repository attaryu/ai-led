import * as React from 'react';

import { streamSse } from '~/core/lib/sse-client';
import { chapterRepository } from '../../data/repositories/chapter.repository';
import { chapterChatRemoteSource } from '../../data/sources/remote/chapter-chat.remote-source';
import { type HasilPulihSection } from './use-section-draft';

export type ChatRole = 'USER' | 'ASSISTANT';

export type ChatMessage = {
	id: string;
	role: ChatRole;
	message: string;
	/** `true` selagi token-nya masih di-stream — dipakai indikator "sedang mengetik". */
	streaming?: boolean;
};

/** Bentuk frame `POST bab/:id/sections/:sectionId/chat` — lihat `api/routes/chat.py`. */
type ChatFrame = { token?: string; error?: string; done?: boolean };

/**
 * Isi tab Chat: riwayat revisi section lewat obrolan dengan AI, kata demi
 * kata (tracker row 33-34, per-section — dimas parity). Dimuat dari
 * `GET bab/:id/sections/:sectionId/chat/history`, dikirim lewat
 * `POST bab/:id/sections/:sectionId/chat` — keduanya proxy NestJS, tidak
 * pernah langsung ke apps/ai.
 *
 * Pesan USER ditambahkan optimis begitu dikirim (backend juga menyimpannya
 * sebelum stream mulai, lihat `chat.py`), pesan ASSISTANT dirakit token demi
 * token ke satu baris yang sama sampai `done`. Tidak aktif sebelum ada
 * section terbuka (`sectionId` null).
 */
export function useChapterChat({
	babId,
	sectionId,
	enabled,
	onRevised,
}: {
	babId: string;
	sectionId: string | null;
	/** dimas ChatPane: setelah `done`, isi section yang sudah direvisi apps/ai dimuat ulang ke editor. */
	onRevised?: (hasil: HasilPulihSection) => void;
	/** `izin.canEdit` — sama seperti tab Generasi, chat menulis isi section. */
	enabled: boolean;
}) {
	const [pesan, setPesan] = React.useState<ChatMessage[]>([]);
	const [memuat, setMemuat] = React.useState(true);
	const [input, setInput] = React.useState('');
	const [mengirim, setMengirim] = React.useState(false);
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);
	// Section yang terbuka SEKARANG -- revisi yang selesai setelah pindah section tidak boleh masuk editor section lain.
	const sectionAktif = React.useRef(sectionId);
	sectionAktif.current = sectionId;

	React.useEffect(() => {
		if (!sectionId) {
			setPesan([]);
			setMemuat(false);
			return;
		}
		let dibatalkan = false;
		setMemuat(true);
		chapterChatRemoteSource
			.findHistory(babId, sectionId)
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
	}, [babId, sectionId]);

	const kirim = React.useCallback(async () => {
		const teks = input.trim();
		if (!enabled || !teks || mengirim || !sectionId) return;

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

		let balasan = '';
		try {
			for await (const frame of streamSse<ChatFrame>(`/bab/${babId}/sections/${sectionId}/chat`, {
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
		// Kalau tidak dimuat ulang, editor masih memegang teks lama dan autosave berikutnya menimpa revisinya.
		if (balasan.trim()) {
			const section = (await chapterRepository.findSections(babId).catch(() => [])).find(
				(s) => s.id === sectionId,
			);
			if (section && sectionAktif.current === section.id) onRevised?.({ html: section.konten ?? '', section });
		}
	}, [babId, sectionId, input, enabled, mengirim, onRevised]);

	return { pesan, memuat, input, setInput, kirim, mengirim, pesanGagal };
}
