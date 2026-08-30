import * as React from 'react';
import { cn } from '~/core/lib/utils';
import { ScrollArea } from './scroll-area';

/**
 * Tabel beserta kotak gulirnya.
 *
 * Yang bergulir mendatar adalah kotak ini, **bukan halaman** — judul, toolbar,
 * dan paginasi di sekelilingnya tetap diam saat kolom digeser. Tanpa itu tabel
 * lebar akan mendorong `<body>` dan merusak seluruh halaman di layar sempit.
 *
 * `min-w-3xl` pada `<table>` bukan hiasan: `w-full` berarti tabel tidak pernah
 * melampaui wadahnya, sehingga tanpa lantai ini kolom hanya memipih sampai tak
 * terbaca alih-alih memicu gulir. Angkanya kira-kira lebar minimum tabel enam
 * kolom sebelum isinya mulai terpotong.
 *
 * Bingkainya tinggal di sini karena empat dari lima pemakainya merender `Table`
 * telanjang tanpa pembungkus apa pun. `DataTable` yang punya kartunya sendiri
 * justru yang melepas bingkainya, bukan sebaliknya.
 *
 * `ScrollArea`, bukan `overflow-x-auto`: scrollbar mendatar Windows berdiri
 * setinggi 17 px dengan sepasang tombol panah di ujungnya, memakan satu baris
 * penuh di bawah tabel dan tidak menyerupai apa pun di sekelilingnya. Gulungnya
 * sendiri tetap native — `ScrollArea` Base UI hanya menyembunyikan scrollbar
 * bawaan dan menggambar gantinya di atas isi, jadi roda, geser sentuh, dan
 * pengejaran fokus keyboard tidak berubah.
 */
function Table({ className, ...props }: React.ComponentProps<'table'>) {
	return (
		<ScrollArea
			orientation="horizontal"
			className="w-full rounded-md border border-border"
		>
			<table
				data-slot="table"
				className={cn('w-full min-w-3xl caption-bottom text-sm', className)}
				{...props}
			/>
		</ScrollArea>
	);
}

/**
 * Baris judul: garis bawah saja, tanpa pita abu.
 *
 * `bg-muted/50` membuat baris judul terbaca sebagai balok isian kedua di atas
 * data, padahal ia label. Satu garis memisahkannya sama tegasnya dengan
 * seperempat tinta — dan itulah bentuk yang dipakai tabel di dokumen cetak,
 * yang kebetulan persis domain produk ini.
 */
function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
	return (
		<thead
			data-slot="table-header"
			className={cn('[&_tr]:border-b [&_tr]:hover:bg-transparent', className)}
			{...props}
		/>
	);
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
	return (
		<tbody
			data-slot="table-body"
			className={cn('[&_tr:last-child]:border-0', className)}
			{...props}
		/>
	);
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
	return (
		<tr
			data-slot="table-row"
			className={cn(
				'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
				className,
			)}
			{...props}
		/>
	);
}

/**
 * Judul kolom sebagai label, bukan sebagai data.
 *
 * Ukuran turun ke `text-xs` dengan huruf kapital dan `tracking-wide`: begitu
 * pita abu di `TableHeader` hilang, judul harus dibedakan dari isinya lewat
 * bentuk huruf, bukan lewat latar. Kapital kecil juga membuat baris judul lebih
 * pendek dari baris data, sehingga mata langsung tahu mana yang bisa dibaca
 * mengalir ke bawah.
 */
function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
	return (
		<th
			data-slot="table-head"
			className={cn(
				'h-11 px-5 text-left align-middle text-xs font-medium tracking-wide text-muted-foreground uppercase has-[[role=checkbox]]:pr-0',
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
	return (
		<td
			data-slot="table-cell"
			className={cn(
				'px-5 py-4 align-middle has-[[role=checkbox]]:pr-0',
				className,
			)}
			{...props}
		/>
	);
}

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell };
