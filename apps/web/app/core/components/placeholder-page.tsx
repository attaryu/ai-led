import { Link } from 'react-router';

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import { buttonVariants } from '~/core/components/ui/button';

type PlaceholderLink = {
	label: string;
	to: string;
};

/**
 * Halaman yang rutenya sudah final tapi isinya belum dikerjakan.
 *
 * Dipakai supaya bentuk navigasi tiap lapis (docs/application_flow.md §3) bisa
 * ditelusuri utuh lebih dulu; fitur yang mengisinya nanti tinggal mengganti
 * komponen ini tanpa menyentuh `app/routes.ts`.
 */
export function PlaceholderPage({
	title,
	description,
	links = [],
}: {
	title: string;
	description: string;
	links?: PlaceholderLink[];
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			{links.length > 0 && (
				<CardContent className="flex flex-wrap gap-3">
					{/*
					 * Pakai `buttonVariants` pada <Link>, bukan <Button render={...}>:
					 * primitif Button dari Base UI mengharapkan <button> asli dan
					 * memperingatkan bila elemennya diganti anchor.
					 */}
					{links.map((link) => (
						<Link
							key={link.to}
							to={link.to}
							className={buttonVariants({ variant: 'outline' })}
						>
							{link.label}
						</Link>
					))}
				</CardContent>
			)}
		</Card>
	);
}

/** A load failed (network / 5xx) — shown instead of leaving the page on "Memuat…" forever. */
export function LoadFailedPage() {
	return (
		<PlaceholderPage
			title="Gagal memuat data"
			description="Server tidak merespons. Muat ulang halaman untuk mencoba lagi."
		/>
	);
}
