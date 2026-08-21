import * as React from 'react';

import { studyProgramRepository } from '~/features/study-program/data/repositories/study-program.repository';
import { userRepository } from '~/features/users/data/repositories/user.repository';
import {
	userRoleEnum,
	type UserRole,
} from '~/features/users/domain/entities/user.entity';

export type OrganizationSummary = {
	totalProdi: number;
	totalUser: number;
	userPerRole: Record<UserRole, number>;
	prodiTanpaPenyusun: number;
};

async function read(): Promise<OrganizationSummary> {
	const programs = await studyProgramRepository.findAll();
	const users = await userRepository.findAll();

	const userPerRole = Object.fromEntries(
		userRoleEnum.options.map((role) => [role, 0]),
	) as Record<UserRole, number>;

	const prodiBerpenyusun = new Set<string>();
	for (const user of users) {
		userPerRole[user.role] += 1;
		if (user.role === 'Penyusun' && user.studyProgramId) {
			prodiBerpenyusun.add(user.studyProgramId);
		}
	}

	return {
		totalProdi: programs.length,
		totalUser: users.length,
		userPerRole,
		prodiTanpaPenyusun: programs.filter(
			(program) => !prodiBerpenyusun.has(program.id),
		).length,
	};
}

/**
 * Ringkasan organisasi untuk `Admin` (docs/application_flow.md §4.0e).
 *
 * Sengaja terpisah dari `useInstitutionReadiness`: Admin murni back office dan
 * tidak berwenang atas progres LED sama sekali (§6.2), jadi datanya pun tidak
 * perlu dibaca — bukan cuma disembunyikan dari tampilan.
 */
const EMPTY_SUMMARY: OrganizationSummary = {
	totalProdi: 0,
	totalUser: 0,
	userPerRole: Object.fromEntries(
		userRoleEnum.options.map((role) => [role, 0]),
	) as Record<UserRole, number>,
	prodiTanpaPenyusun: 0,
};

export function useOrganizationSummary(): OrganizationSummary {
	const [summary, setSummary] = React.useState<OrganizationSummary>(EMPTY_SUMMARY);

	React.useEffect(() => {
		let cancelled = false;
		const load = () => {
			read().then((result) => {
				if (!cancelled) setSummary(result);
			});
		};
		load();
		window.addEventListener('storage-update', load);
		return () => {
			cancelled = true;
			window.removeEventListener('storage-update', load);
		};
	}, []);

	return summary;
}
