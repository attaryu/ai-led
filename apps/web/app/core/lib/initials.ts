/** Maksimal dua huruf: "Sarah Floyd" → "SF", "Sarah" → "S". */
export function initials(nama: string): string {
	return nama
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((kata) => kata[0]?.toUpperCase() ?? '')
		.join('');
}
