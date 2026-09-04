import { formatDate, formatDateTime } from '~/core/lib/format-time';
import { type LedProjectEntity } from '~/features/led-project/domain/entities/led-project.entity';
import {
	type AssessmentSessionEntity,
	type PenilaianFinalRow,
	type RingkasanPenilaian,
} from '../../domain/entities/assessment-session.entity';
import { formatConfidence, formatSkor } from './assessment-format';

/**
 * Berkas PDF berisi hasil Penilaian AMI satu dokumen.
 *
 * **Dibangkitkan di peramban, tanpa backend.** Seluruh bahannya sudah ada di
 * memori saat halaman dirender — `useAssessmentResults` membacanya dari
 * penyimpanan lokal secara sinkron — jadi tidak ada yang perlu diminta ke
 * server. Saat backend ada, satu-satunya yang berubah kemungkinan besar bukan
 * berkas ini melainkan dari mana barisnya datang.
 *
 * **`jspdf` diimpor dinamis**, bukan di kepala berkas. Ia beserta
 * `jspdf-autotable` berukuran ratusan kilobita dan hanya dibutuhkan orang yang
 * benar-benar menekan tombol unduh — memuatnya di awal berarti setiap pembuka
 * halaman mana pun ikut membayarnya.
 *
 * **Fontnya Helvetica bawaan PDF**, bukan DM Sans milik aplikasi. Menanam font
 * variabel berarti mengubahnya ke TTF lalu menyisipkannya sebagai base64 di
 * dalam bundel — biaya yang tidak sepadan untuk kemiripan yang tidak diminta
 * siapa pun. Yang dijaga di sini bukan rupa hurufnya melainkan angkanya.
 */

/** Lebar kolom dalam milimeter; totalnya harus 190 (A4 tegak dikurangi margin). */
const LEBAR_KOLOM = {
	no: 8,
	kriteria: 44,
	skor: 13,
	justifikasi: 56,
	rekomendasi: 48,
	// 21mm, bukan 15: pada 15mm kata "Confidence" terpenggal jadi "Confiden ce"
	// di kepala tabel — judul kolom yang terbelah membuat tabelnya terbaca
	// seperti punya tujuh kolom.
	confidence: 21,
} as const;

const MARGIN = 10;

export type InputPdfPenilaian = {
	/** Seluruh indikator, bukan yang sedang tersaring di layar. */
	baris: PenilaianFinalRow[];
	ringkasan: RingkasanPenilaian;
	sesi: AssessmentSessionEntity;
	ledProject: LedProjectEntity;
	namaUniversitas: string;
	/**
	 * Salah bila yang dibuka sesi lama. PDF-nya harus menyatakan itu — berkas
	 * yang beredar tanpa penanda akan dibaca sebagai penilaian terkini.
	 */
	melihatSesiTerbaru: boolean;
};

/**
 * Teks yang aman ditulis dengan font standar PDF.
 *
 * Font bawaan jsPDF memakai WinAnsi, dan tanda yang dipakai di seluruh aplikasi
 * ini — em dash, middle dot, kutip melengkung — ada di dalamnya tapi tidak
 * seluruhnya dipetakan dengan benar oleh setiap pembaca PDF. Menggantinya lebih
 * dulu lebih murah daripada menanam font, dan hasilnya tetap terbaca.
 */
function amanUntukPdf(teks: string): string {
	return teks
		.replace(/[—–]/g, '-')
		.replace(/·/g, '-')
		.replace(/[""]/g, '"')
		.replace(/['']/g, "'")
		.replace(/…/g, '...');
}

/** Sel yang kosong ditulis sebagai tanda hubung, bukan dibiarkan melompong. */
function atauStrip(nilai: string | null | undefined): string {
	const isi = nilai?.trim();
	return isi ? amanUntukPdf(isi) : '-';
}

/**
 * Kolom Justifikasi untuk indikator yang gagal dinilai.
 *
 * Barisnya tetap dicetak — `gabungPenilaian` sengaja tidak membuang indikator
 * tanpa hasil, dan baris yang hilang diam-diam dari dokumen akreditasi jauh
 * lebih berbahaya daripada baris yang menyatakan dirinya gagal.
 */
function justifikasiSel(row: PenilaianFinalRow): string {
	if (row.hasil === undefined) {
		return 'Indikator ini tidak ikut dinilai pada sesi tersebut.';
	}
	if (row.hasil.error) {
		return `Gagal dinilai: ${amanUntukPdf(row.hasil.error)}`;
	}
	return atauStrip(row.hasil.justifikasi);
}

/** `3 / 4`, dengan bintang bila Penjamin Mutu mengubah angkanya. */
function skorSel(row: PenilaianFinalRow): string {
	const angka = `${formatSkor(row.skorFinal)} / ${row.skorMaksimal}`;
	return row.mengubahSkor ? `${angka} *` : angka;
}

/** Nama berkas yang tidak ditolak Windows. */
export function namaBerkasPdf(judulDokumen: string, sekarang: Date): string {
	const judul = judulDokumen
		.replace(/[\\/:*?"<>|]/g, '')
		.replace(/\s+/g, '-')
		.slice(0, 60);
	const tanggal = sekarang.toISOString().slice(0, 10);
	return `Penilaian-AMI_${judul}_${tanggal}.pdf`;
}

export async function buatPdfPenilaian(
	input: InputPdfPenilaian,
): Promise<Blob> {
	const [{ jsPDF }, { default: autoTable }] = await Promise.all([
		import('jspdf'),
		import('jspdf-autotable'),
	]);

	const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
	const lebarHalaman = doc.internal.pageSize.getWidth();
	const adaKoreksi = input.baris.some((row) => row.mengubahSkor);

	let y = MARGIN + 2;

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(14);
	doc.text('Hasil Penilaian AMI', MARGIN, y);

	y += 6;
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(9);
	for (const garis of [
		amanUntukPdf(input.namaUniversitas),
		amanUntukPdf(
			`${input.ledProject.studyProgramName} - ${input.ledProject.judul}`,
		),
		amanUntukPdf(
			`Tahun akademik ${input.ledProject.tahunAkademik} | Dinilai ${formatDateTime(input.sesi.createdAt)} oleh ${input.sesi.dijalankanOlehNama}`,
		),
		// Sama seperti tab Riwayat: unggahan disebut lewat nama berkasnya, karena
		// itu yang membedakan satu unggahan dari unggahan lain.
		amanUntukPdf(
			`Sumber LED: ${
				input.sesi.sumber.sumberLed === 'EDITOR'
					? 'Editor'
					: (input.sesi.sumber.ledFileName ?? 'Unggahan')
			}`,
		),
	]) {
		doc.text(garis, MARGIN, y);
		y += 4.5;
	}

	// Ringkasan dipisah dari blok identitas: yang di atas menjawab "dokumen
	// siapa", yang ini menjawab "hasilnya bagaimana".
	y += 1.5;
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(9);
	doc.text(
		amanUntukPdf(
			`Skor rata-rata ${formatSkor(input.ringkasan.rataRata)} (${input.ringkasan.persen}% dari maksimal) - ${input.ringkasan.jumlahDinilai}/${input.ringkasan.total} indikator dinilai`,
		),
		MARGIN,
		y,
	);

	y += 4.5;
	doc.setFont('helvetica', 'normal');
	doc.text(
		amanUntukPdf(
			`${input.ringkasan.jumlahDitinjau} sudah ditinjau | ${input.ringkasan.jumlahDikoreksi} dikoreksi Penjamin Mutu | ${input.ringkasan.jumlahPerluDiperiksa} perlu diperiksa`,
		),
		MARGIN,
		y,
	);
	y += 5;

	if (!input.melihatSesiTerbaru) {
		doc.setFont('helvetica', 'bold');
		doc.text(
			'Catatan: ini bukan penilaian terbaru dokumen ini.',
			MARGIN,
			y,
		);
		doc.setFont('helvetica', 'normal');
		y += 5;
	}

	autoTable(doc, {
		startY: y,
		margin: { left: MARGIN, right: MARGIN, bottom: 14 },
		theme: 'grid',
		head: [
			['No', 'Kriteria', 'Skor', 'Justifikasi', 'Rekomendasi', 'Confidence'],
		],
		body: input.baris.map((row) => [
			String(row.kriteria.no),
			amanUntukPdf(
				row.kriteria.kodeKriteria
					? `${row.kriteria.kodeKriteria}\n${row.kriteria.deskripsi}`
					: row.kriteria.deskripsi,
			),
			skorSel(row),
			justifikasiSel(row),
			atauStrip(row.hasil?.rekomendasi),
			formatConfidence(row.hasil?.confidence ?? null),
		]),
		styles: {
			font: 'helvetica',
			fontSize: 7,
			cellPadding: 1.5,
			overflow: 'linebreak',
			valign: 'top',
			lineColor: 200,
			lineWidth: 0.1,
		},
		headStyles: {
			fontSize: 8,
			fontStyle: 'bold',
			fillColor: [241, 245, 249],
			textColor: 20,
		},
		columnStyles: {
			0: { cellWidth: LEBAR_KOLOM.no, halign: 'center' },
			1: { cellWidth: LEBAR_KOLOM.kriteria },
			2: { cellWidth: LEBAR_KOLOM.skor, halign: 'center' },
			3: { cellWidth: LEBAR_KOLOM.justifikasi },
			4: { cellWidth: LEBAR_KOLOM.rekomendasi },
			5: { cellWidth: LEBAR_KOLOM.confidence, halign: 'center' },
		},
		// Kaki halaman digambar per halaman, bukan sekali di akhir: nomor halaman
		// baru diketahui setelah tabelnya selesai dipenggal.
		didDrawPage: (data) => {
			const tinggiHalaman = doc.internal.pageSize.getHeight();
			doc.setFont('helvetica', 'normal');
			doc.setFontSize(7);
			doc.setTextColor(120);
			doc.text(
				amanUntukPdf(`Diunduh ${formatDate(new Date().toISOString())}`),
				MARGIN,
				tinggiHalaman - 7,
			);
			doc.text(
				`Halaman ${data.pageNumber}`,
				lebarHalaman - MARGIN,
				tinggiHalaman - 7,
				{ align: 'right' },
			);
			doc.setTextColor(0);
		},
	});

	// Catatan bintang hanya dicetak bila ada yang bertanda. Keterangan untuk
	// tanda yang tidak muncul di mana pun cuma menambah yang harus dibaca.
	if (adaKoreksi) {
		const akhirTabel = (doc as unknown as { lastAutoTable?: { finalY: number } })
			.lastAutoTable;
		const yCatatan = (akhirTabel?.finalY ?? y) + 5;
		doc.setFontSize(7);
		doc.setTextColor(90);
		doc.text(
			'* Skor dikoreksi Penjamin Mutu; justifikasi, rekomendasi, dan confidence tetap milik AI.',
			MARGIN,
			yCatatan,
		);
		doc.setTextColor(0);
	}

	return doc.output('blob');
}
