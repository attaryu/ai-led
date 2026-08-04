import { Select } from '~/core/components/ui/select';
import {
	userRoleEnum,
	type UserRole,
} from '~/features/users/domain/entities/user.entity';
import { sessionRepository } from '../../data/repositories/session.repository';
import { useSession } from '../hooks/use-session';

/**
 * Pengalih role untuk menguji hak akses.
 *
 * Alat pengembangan sementara — hapus komponen ini beserta pemanggilannya di
 * dashboard-layout begitu autentikasi sungguhan jalan, karena role akan datang
 * dari session hasil login, bukan dipilih sendiri oleh user.
 */
export function RoleSwitcher() {
	const session = useSession();

	if (!session) {
		return <div className="h-9 w-52 animate-pulse rounded-md bg-muted" />;
	}

	return (
		<label className="flex items-center gap-2 text-xs text-muted-foreground">
			<span className="whitespace-nowrap">Lihat sebagai</span>
			<Select
				aria-label="Lihat aplikasi sebagai role"
				value={session.role}
				onChange={(e) =>
					sessionRepository.setRole(e.currentTarget.value as UserRole)
				}
				className="h-9 w-40"
			>
				{userRoleEnum.options.map((role) => (
					<option key={role} value={role}>
						{role}
					</option>
				))}
			</Select>
		</label>
	);
}
