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

function read(): OrganizationSummary {
	const programs = studyProgramRepository.findAll();
	const users = userRepository.findAll();

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
export function useOrganizationSummary(): OrganizationSummary {
	const [summary, setSummary] = React.useState<OrganizationSummary>(read);

	React.useEffect(() => {
		const load = () => setSummary(read());
		load();
		window.addEventListener('storage-update', load);
		return () => window.removeEventListener('storage-update', load);
	}, []);

	return summary;
}
