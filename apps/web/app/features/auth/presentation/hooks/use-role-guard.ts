import { useLocation } from 'react-router';

import { type SessionEntity } from '../../domain/entities/session.entity';
import { useSession } from './use-session';

/**
 * Lapis ruang kerja yang sedang dijaga, mengikuti docs/application_flow.md §3.
 *
 * - `tenant`  → /dashboard
 * - `program` → /study-programs/:programId
 * - `project` → /led-projects/:projectId dan /editor/:projectId/:chapterId
 *
 * Editor Bab memakai lapis `project`, bukan lapis sendiri: siapa yang boleh
 * masuk ditentukan sepenuhnya oleh prodi pemilik dokumennya — fakta yang sama
 * persis dengan dashboard dokumen, jadi cabang `chapter` isinya akan identik dan
 * hanya menunggu waktu untuk menyimpang karena kecelakaan. Yang memang berbeda
 * di level bab (Pimpinan hanya baca §15, `terkunci` memblokir semua role §12.2)
 * adalah izin **per-aksi**, bukan izin masuk, dan tinggal di
 * `features/chapter/presentation/hooks/use-chapter-permission.ts`.
 */
export type GuardLayer = 'tenant' | 'program' | 'project';

export type RoleGuardResult =
	| { status: 'allowed'; session: SessionEntity }
	| { status: 'denied'; redirectTo: string }
	/**
	 * Konteks belum bisa dinilai: session belum terbaca (penjaga SSR), atau
	 * `programId` sumber daya belum diketahui — misal dokumen LED masih dicari
	 * dan mungkin memang tidak ada. Pemanggil yang memutuskan mau menampilkan
	 * pemuatan atau keadaan kosong.
	 */
	| { status: 'pending' };

/**
 * Apakah role ini punya lapis tenant di atasnya.
 *
 * Dipakai lapis bawah untuk memutuskan apakah tombol kembali dan entri
 * breadcrumb "Dashboard" dirender — Penyusun mendarat langsung di prodinya dan
 * tidak pernah melihat Dashboard Utama (§2), jadi menyodorkan tautan ke sana
 * hanya akan berujung pengalihan balik.
 */
export function canAccessTenant(session: SessionEntity): boolean {
	return session.role !== 'Penyusun';
}

/**
 * Halaman pendaratan tiap role (§2). Penyusun tidak pernah punya lapis tenant,
 * jadi ia selalu dipulangkan ke prodinya sendiri.
 */
export function landingFor(session: SessionEntity): string {
	if (session.role === 'Penyusun' && session.studyProgramId) {
		return `/study-programs/${session.studyProgramId}`;
	}
	return '/dashboard';
}

/** Halaman tulis di lapis tenant -> role yang boleh membukanya (sama dengan @Protected di backend). */
const TENANT_WRITE_ROUTES: [RegExp, SessionEntity['role'][]][] = [
	[/^\/dashboard\/users\/create$/, ['Admin']],
	[/^\/dashboard\/users\/[^/]+\/edit$/, ['Admin', 'Pimpinan']],
	[/^\/dashboard\/study-programs\/(create|[^/]+\/edit)$/, ['Admin', 'Pimpinan']],
	[/^\/dashboard\/led-projects\/(create|[^/]+\/edit)$/, ['Penjamin Mutu']],
	[/^\/dashboard\/accreditation-sets\/create$/, ['Penjamin Mutu']],
];

/**
 * Satu-satunya tempat aturan akses antar lapis dituliskan, supaya tidak
 * tersebar ke tiap halaman. Menyembunyikan menu di sidebar saja tidak cukup:
 * URL tetap bisa diketik langsung.
 *
 * `resourceProgramId` hanya dipakai lapis `program`/`project` — untuk `project`
 * isinya `studyProgramId` milik dokumen LED tersebut, bukan dari URL.
 */
export function useRoleGuard(
	layer: GuardLayer,
	resourceProgramId?: string | null,
): RoleGuardResult {
	const session = useSession();
	const location = useLocation();

	// `undefined` = pemulihan sesi (`/auth/refresh`) masih berjalan, belum bisa
	// dinilai. `null` = sudah selesai dan dipastikan belum login — beda dari
	// `pending`, ini keputusan final yang layout sudah tahu cara meresponnya
	// (redirect), sama seperti `denied` lain di bawah.
	if (session === undefined) return { status: 'pending' };
	if (session === null) {
		// Tujuan semula dititipkan supaya tautan dalam tidak hangus: tanpa ini,
		// siapa pun yang membuka `/dashboard/users` tanpa sesi akan mendarat di
		// dashboard setelah masuk, dan harus mencari sendiri jalan kembali.
		const next = encodeURIComponent(location.pathname + location.search);
		return { status: 'denied', redirectTo: `/login?next=${next}` };
	}

	if (layer === 'tenant') {
		// Penyusun tidak berwenang melihat prodi lain maupun menu manajemen
		// organisasi, jadi ia tidak pernah masuk lapis tenant sama sekali (§2).
		if (session.role === 'Penyusun') {
			return { status: 'denied', redirectTo: landingFor(session) };
		}
		const rule = TENANT_WRITE_ROUTES.find(([pola]) => pola.test(location.pathname));
		if (rule && !rule[1].includes(session.role)) {
			return { status: 'denied', redirectTo: location.pathname.replace(/\/(create|[^/]+\/edit)$/, '') };
		}
		return { status: 'allowed', session };
	}

	// Admin murni back office — tidak punya akses ke dashboard progres LED,
	// editor bab, maupun bukti dukung (docs/database.md → USER, tabel role).
	if (session.role === 'Admin') {
		return { status: 'denied', redirectTo: '/dashboard' };
	}

	if (session.role === 'Penyusun') {
		if (!resourceProgramId) return { status: 'pending' };
		if (resourceProgramId !== session.studyProgramId) {
			return { status: 'denied', redirectTo: landingFor(session) };
		}
	}

	// Pimpinan & Penjamin Mutu beroperasi di level tenant, jadi boleh membuka
	// prodi mana pun (§5). Perbedaan keduanya baca-vs-tulis, bukan cakupan.
	return { status: 'allowed', session };
}
