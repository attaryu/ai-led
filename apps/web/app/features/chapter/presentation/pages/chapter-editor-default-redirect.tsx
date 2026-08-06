import { Navigate, useParams } from 'react-router';

import { chapterRepository } from '../../data/repositories/chapter.repository';
import { pickDefaultChapter } from '../../domain/entities/chapter.entity';

/**
 * `/editor/:projectId` tanpa menyebut bab — jalan masuk resmi dari sidebar
 * Dashboard Project LED.
 *
 * Menu di sidebar sengaja tidak menyusun id bab sendiri: aturan "bab mana yang
 * dibuka" hidup di `pickDefaultChapter`, dan tautan yang tidak menyimpan id bab
 * tidak bisa jadi basi saat bab dimaterialisasi ulang di localStorage.
 *
 * Guard tidak diulang di sini. Halaman editorlah satu-satunya tempat aturan
 * masuk dinilai; akibatnya role yang tidak berhak dialihkan dua kali (ke bab
 * default, lalu keluar), yang benar walau sedikit berisik — jauh lebih murah
 * daripada punya dua salinan aturan yang bisa berbeda.
 */
export function ChapterEditorDefaultRedirect() {
	const { projectId } = useParams<{ projectId: string }>();

	// `findByProjectId` memmaterialisasi bab bila dokumennya belum punya, jadi
	// jalan masuk ini tidak pernah menemui daftar kosong untuk dokumen yang ada.
	const chapters = projectId ? chapterRepository.findByProjectId(projectId) : [];
	const target = pickDefaultChapter(chapters);

	// Tidak ada babnya berarti dokumennya sendiri yang tidak ada; lapis 3 sudah
	// punya cerita "tidak ditemukan" yang lengkap, jadi urusannya diserahkan ke
	// sana daripada diulang di sini.
	if (!projectId || !target) {
		return <Navigate to={`/led-projects/${projectId ?? ''}`} replace />;
	}

	return <Navigate to={`/editor/${projectId}/${target.id}`} replace />;
}
