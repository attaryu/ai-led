import { CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react';

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import { cn } from '~/core/lib/utils';
import {
	MAX_PROGRAM_ATTENTION_SHOWN,
	type ProgramAttentionItem,
	type ProgramAttentionSeverity,
} from '../../domain/entities/program-readiness.entity';

const severityStyles: Record<ProgramAttentionSeverity, string> = {
	MENDESAK: 'text-destructive',
	PERLU_DITINDAK: 'text-amber-600 dark:text-amber-400',
};

/**
 * Apa yang menghambat prodi ini (docs/application_flow.md §5.1c).
 *
 * Berbeda dari panel serupa di Dashboard Project LED (§6.1) yang murni per bab:
 * di sini bab hanyalah salah satu sumber, bersama tenggat, masa berlaku
 * akreditasi, ketersediaan Penyusun, dan bukti dukung yang gagal diproses.
 * Daftarnya dipotong supaya tetap terbaca sebagai "yang paling mendesak".
 */
export function ProgramAttentionPanel({
	attention,
}: {
	attention: ProgramAttentionItem[];
}) {
	const shown = attention.slice(0, MAX_PROGRAM_ATTENTION_SHOWN);
	const sisa = attention.length - shown.length;

	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Perlu Perhatian</CardTitle>
				<CardDescription>
					{attention.length === 0
						? 'Tidak ada yang tertinggal.'
						: `${attention.length} hal menunggu ditindaklanjuti.`}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{attention.length === 0 ? (
					<p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
						<CheckCircleIcon className="size-4 shrink-0" weight="fill" />
						Prodi ini sedang berjalan tanpa hambatan.
					</p>
				) : (
					<ul className="flex flex-col gap-3">
						{shown.map((item) => (
							<li key={item.id} className="flex items-start gap-2">
								<WarningCircleIcon
									className={cn(
										'mt-0.5 size-4 shrink-0',
										severityStyles[item.severitas],
									)}
									weight="fill"
								/>
								<div className="min-w-0">
									<p className="truncate text-sm font-medium">{item.judul}</p>
									<p className="text-xs text-muted-foreground">{item.alasan}</p>
								</div>
							</li>
						))}
						{sisa > 0 && (
							<li className="text-xs text-muted-foreground">
								…dan {sisa} hal lain, rinciannya ada di Progres Dokumen.
							</li>
						)}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
