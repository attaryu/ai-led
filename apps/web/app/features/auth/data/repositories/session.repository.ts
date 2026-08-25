import { type UserRole } from '~/features/users/domain/entities/user.entity';
import {
	sessionSchema,
	type SessionEntity,
} from '../../domain/entities/session.entity';
import { sessionLocalSource } from '../sources/local/session-local.source';

export const SESSION_UPDATE_EVENT = 'session-update';

/**
 * Identitas contoh per role, diselaraskan dengan mock di
 * `users/data/repositories/user.repository.ts` supaya `userId` yang dipakai
 * pengalih role benar-benar ada di daftar user.
 */
const sessionPerRole: Record<UserRole, SessionEntity> = {
	Admin: {
		userId: '4',
		namaLengkap: 'Dewi Lestari',
		role: 'Admin',
		studyProgramId: null,
	},
	Pimpinan: {
		userId: '3',
		namaLengkap: 'Prof. Dr. Ir. H. Bambang',
		role: 'Pimpinan',
		studyProgramId: null,
	},
	'Penjamin Mutu': {
		userId: '1',
		namaLengkap: 'Ahmad Fauzi',
		role: 'Penjamin Mutu',
		studyProgramId: null,
	},
	Penyusun: {
		userId: '6',
		namaLengkap: 'Nurul Hidayah',
		role: 'Penyusun',
		// Penyusun selalu terikat ke tepat satu prodi (docs/database.md → USER).
		//
		// Prodi `2` (Sistem Informasi), bukan `1`: dokumen LED prodi inilah yang
		// paling lengkap di seed — 12 dari 14 bab terisi, empat di antaranya
		// terkunci, dan satu-satunya yang punya sesi Penilaian AMI
		// (`SEED_DOKUMEN_ID` di `assessment-session.repository.ts`). Menaruh
		// Penyusun contoh di prodi lain membuat pengalih role berpindah ke
		// dokumen yang justru paling sedikit isinya, dan menutup akses ke satu-
		// satunya sesi penilaian yang ada.
		studyProgramId: '2',
	},
};

/**
 * Default Pimpinan: role dengan menu paling lengkap, sehingga kondisi awal
 * aplikasi tidak terlihat seperti ada menu yang hilang.
 */
const defaultSession = sessionPerRole.Pimpinan;

export const sessionRepository = {
	get(): SessionEntity {
		const stored = sessionLocalSource.get();
		if (!stored) return defaultSession;
		try {
			const parsed = sessionSchema.safeParse(JSON.parse(stored));
			return parsed.success ? parsed.data : defaultSession;
		} catch {
			return defaultSession;
		}
	},

	/**
	 * Apakah pengguna benar-benar sudah masuk — bukan sekadar kejatuhan
	 * `defaultSession`.
	 *
	 * `get()` sengaja selalu mengembalikan sesi supaya halaman di dalam aplikasi
	 * tidak perlu menangani `null` selama autentikasi masih mock. Akibatnya ia
	 * tidak bisa dipakai membedakan tamu dari pengguna yang sudah masuk — dan
	 * landing page publik justru butuh perbedaan itu. Yang menentukan hanya ada
	 * atau tidaknya sesi tersimpan.
	 */
	isAuthenticated(): boolean {
		return sessionLocalSource.get() !== null;
	},

	setRole(role: UserRole): void {
		sessionLocalSource.set(JSON.stringify(sessionPerRole[role]));
		window.dispatchEvent(new Event(SESSION_UPDATE_EVENT));
	},

	/**
	 * Menandai sesi sebagai aktif setelah form login/registrasi lolos validasi.
	 *
	 * Backend belum ada, jadi belum ada cara memetakan email ke user — yang
	 * ditulis adalah `defaultSession` yang sama dengan yang dipakai aplikasi
	 * selama ini. Yang penting di sini efeknya: sejak titik ini
	 * `isAuthenticated()` bernilai benar, sehingga landing page berhenti
	 * menawarkan "Masuk". Begitu autentikasi sungguhan jalan, fungsi ini yang
	 * menerima user dari respons API.
	 */
	signIn(): void {
		sessionLocalSource.set(JSON.stringify(defaultSession));
		window.dispatchEvent(new Event(SESSION_UPDATE_EVENT));
	},

	clear(): void {
		sessionLocalSource.remove();
		window.dispatchEvent(new Event(SESSION_UPDATE_EVENT));
	},
};
