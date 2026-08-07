import { LockSimpleIcon, LockSimpleOpenIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { type ChapterPermission } from '../hooks/use-chapter-permission';
import { useChapterReview } from '../hooks/use-chapter-review';

/**
 * Tombol Kunci/Buka Kunci Bab di header Editor Bab (§12.2).
 *
 * Sekali klik, tanpa dialog maupun konfirmasi: mengunci sepenuhnya reversibel
 * dan akibatnya langsung terlihat di layar yang sama — toolbar editor hilang,
 * spanduk muncul di kanvas, badge bab berganti. Konfirmasi hanya akan jadi klik
 * tambahan yang tidak melindungi apa pun.
 *
 * Catatan review **tidak** ikut di sini; rumahnya tab "Review" di sidebar kanan.
 * Keduanya punya ritme berbeda — bab dikunci sekali, catatannya bisa direvisi
 * berkali-kali termasuk sebelum kuncinya dipasang.
 *
 * Merender `null` untuk role selain Penjamin Mutu, mengikuti §1: yang tidak
 * boleh diakses disembunyikan, bukan sekadar dinonaktifkan.
 */
export function ChapterLockButton({
	chapter,
	izin,
	onReviewed,
}: {
	chapter: ChapterEntity;
	izin: ChapterPermission;
	onReviewed: (diperbarui: ChapterEntity) => void;
}) {
	const review = useChapterReview(chapter, izin, onReviewed);

	if (!review.boleh) return null;

	const Ikon = chapter.terkunci ? LockSimpleOpenIcon : LockSimpleIcon;

	return (
		<Button
			variant="outline"
			size="sm"
			className="cursor-pointer"
			onClick={review.toggleKunci}
		>
			<Ikon className="size-4" />
			{chapter.terkunci ? 'Buka Kunci' : 'Kunci Bab'}
		</Button>
	);
}
