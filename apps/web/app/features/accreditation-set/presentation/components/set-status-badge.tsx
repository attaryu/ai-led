import { cn } from '~/core/lib/utils';
import {
	SET_STATUS_LABEL,
	type SetStatus,
} from '../../domain/entities/accreditation-set.entity';

const styleByStatus: Record<SetStatus, string> = {
	DRAF: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
	SIAP: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

export function SetStatusBadge({
	status,
	className,
}: {
	status: SetStatus;
	className?: string;
}) {
	return (
		<span
			className={cn(
				'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
				styleByStatus[status],
				className,
			)}
		>
			{SET_STATUS_LABEL[status]}
		</span>
	);
}
