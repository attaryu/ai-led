import { create } from 'zustand';

import { evidenceRepository } from '../../data/repositories/evidence.repository';
import { type UploadEvidenceTargetDto } from '../../domain/dtos/upload-evidence.dto';
import { type EvidenceEntity } from '../../domain/entities/evidence.entity';

export type UploadPhase =
	| 'antre'
	| 'presign'
	| 'uploading'
	| 'reporting'
	| 'selesai'
	| 'gagal';

export type EvidenceUploadItem = {
	id: string;
	/** Disimpan supaya "coba lagi" tidak menyuruh user memilih berkasnya ulang. */
	file: File;
	fileName: string;
	sizeBytes: number;
	target: UploadEvidenceTargetDto;
	studyProgramName: string | null;
	progress: number;
	phase: UploadPhase;
	/** Baris `BUKTI_DUKUNG` yang tercipta; baru terisi sesudah `phase = 'selesai'`. */
	evidenceId?: string;
	error?: string;
};

export type UploaderIdentity = {
	userId: string;
	name: string;
};

type EvidenceUploadState = {
	items: EvidenceUploadItem[];
	isCollapsed: boolean;
	startBatch: (input: {
		files: File[];
		target: UploadEvidenceTargetDto;
		studyProgramName: string | null;
		uploader: UploaderIdentity;
		/** Dipanggil per berkas yang barisnya berhasil tercatat; lihat catatan di bawah. */
		onUploaded?: (evidence: EvidenceEntity) => void;
	}) => void;
	retryItem: (id: string) => void;
	dismissItem: (id: string) => void;
	clearFinished: () => void;
	dismissAll: () => void;
	toggleCollapsed: () => void;
};

/**
 * Antrean unggah hidup di store global, bukan di dalam komponen halaman.
 *
 * Alasannya: panel progres harus tetap jalan saat pengguna berpindah halaman
 * (mis. menutup perpustakaan lalu membuka menu lain) — kalau state-nya menempel
 * di halaman, unggahannya ikut hilang saat halaman itu di-unmount.
 *
 * Identitas pengunggah dititipkan dari komponen karena session dibaca lewat
 * hook di lapis presentasi; store ini sendiri tidak menyentuh React.
 */
export const useEvidenceUploadStore = create<EvidenceUploadState>(
	(set, get) => {
		const patch = (id: string, changes: Partial<EvidenceUploadItem>) =>
			set((state) => ({
				items: state.items.map((item) =>
					item.id === id ? { ...item, ...changes } : item,
				),
			}));

		const run = async (item: EvidenceUploadItem, uploader: UploaderIdentity) => {
			patch(item.id, { phase: 'presign', progress: 0, error: undefined });

			try {
				const evidence = await evidenceRepository.upload({
					file: item.file,
					target: item.target,
					uploadedByUserId: uploader.userId,
					uploadedByName: uploader.name,
					studyProgramName: item.studyProgramName,
					onProgress: (percent) =>
						patch(item.id, { phase: 'uploading', progress: percent }),
				});

				patch(item.id, {
					phase: 'selesai',
					progress: 100,
					evidenceId: evidence.id,
				});
				listeners.get(item.id)?.(evidence);
			} catch (error) {
				patch(item.id, {
					phase: 'gagal',
					error:
						error instanceof Error
							? error.message
							: 'Unggahan gagal karena kesalahan tak terduga.',
				});
			}
		};

		// Identitas pengunggah per baris antrean; tidak perlu ikut ke UI, jadi
		// disimpan di luar state supaya tidak memicu render.
		const uploaders = new Map<string, UploaderIdentity>();

		/**
		 * Penerima kabar "berkas ini sudah tercatat", per baris antrean. Sengaja
		 * bukan bagian dari state dengan alasan yang sama seperti `uploaders`, plus
		 * satu lagi: pendengarnya adalah komponen yang bisa hilang di tengah jalan —
		 * tab Generasi ikut mati saat penggunanya berpindah bab. Kalau itu terjadi,
		 * unggahannya tetap tuntas dan berkasnya tetap masuk pustaka; yang hilang
		 * cuma tindak lanjutnya, dan memang begitu yang diinginkan.
		 */
		const listeners = new Map<string, (evidence: EvidenceEntity) => void>();

		return {
			items: [],
			isCollapsed: false,

			startBatch: ({
				files,
				target,
				studyProgramName,
				uploader,
				onUploaded,
			}) => {
				const newItems: EvidenceUploadItem[] = files.map((file, index) => ({
					id: `${Date.now()}-${index}-${file.name}`,
					file,
					fileName: file.name,
					sizeBytes: file.size,
					target,
					studyProgramName,
					progress: 0,
					phase: 'antre',
				}));

				newItems.forEach((item) => {
					uploaders.set(item.id, uploader);
					if (onUploaded) listeners.set(item.id, onUploaded);
				});

				set((state) => ({
					items: [...newItems, ...state.items],
					isCollapsed: false,
				}));

				newItems.forEach((item) => void run(item, uploader));
			},

			retryItem: (id) => {
				const item = get().items.find((candidate) => candidate.id === id);
				const uploader = uploaders.get(id);
				if (!item || !uploader) return;
				void run(item, uploader);
			},

			dismissItem: (id) => {
				uploaders.delete(id);
				listeners.delete(id);
				set((state) => ({
					items: state.items.filter((item) => item.id !== id),
				}));
			},

			clearFinished: () =>
				set((state) => {
					state.items
						.filter((item) => item.phase === 'selesai')
						.forEach((item) => {
							uploaders.delete(item.id);
							listeners.delete(item.id);
						});
					return {
						items: state.items.filter((item) => item.phase !== 'selesai'),
					};
				}),

			dismissAll: () => {
				uploaders.clear();
				listeners.clear();
				set({ items: [] });
			},

			toggleCollapsed: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
		};
	},
);
