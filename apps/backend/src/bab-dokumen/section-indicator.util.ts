/**
 * Penghubung section LED <-> indikator matriks penilaian, sisi baca.
 *
 * Tautan jangkar (tabel set_section_criterion_links) ditulis worker AI saat
 * ekstraksi (apps/ai/ingestion/section_criterion_linker.py) dan hanya memegang
 * section jangkar -- mis. "Akuntabilitas" di bawah "Kriteria Akreditasi".
 * Sub-bab di bawahnya TIDAK punya baris: mereka mewarisi dari leluhur
 * terdekatnya yang jangkar, jadi tak ada pencocokan judul untuk anak.
 *
 * `normalizeTitle` harus identik dengan `normalize_title` di sisi Python --
 * keduanya mencocokkan judul section dokumen dengan judul template Panduan.
 */

const TAIL_NUMBERING = /\s+\d+[.)]\s.*$/;
const HEAD_NUMBERING = /^\s*([IVX]+|[A-Z]\.[0-9]+|[0-9]+(\.[0-9]+)*|[A-Z])[.)]?\s+/;

export function normalizeTitle(text: string | null | undefined): string {
  return (text ?? '')
    .replace(TAIL_NUMBERING, '')
    .replace(HEAD_NUMBERING, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .trim();
}

export interface SectionNode {
  id: string;
  parentId: string | null;
  title: string;
}

export interface AnchorLink {
  templateTitle: string;
  criterionGroupId: string;
}

/**
 * Jangkar terdekat untuk `sectionId`: periksa section itu sendiri, lalu naik
 * lewat parentId. `undefined` = tak ada jangkar sampai akar (mis. section A).
 * Judul template kembar tak jadi masalah di sini: yang dicari hanya kecocokan
 * judul jangkar, dan jangkar unik per set.
 */
export function resolveAnchorGroupId(
  sectionId: string,
  sections: SectionNode[],
  links: AnchorLink[],
): string | undefined {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const byTitle = new Map(links.map((l) => [normalizeTitle(l.templateTitle), l.criterionGroupId]));
  const seen = new Set<string>();
  let cur = byId.get(sectionId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const hit = byTitle.get(normalizeTitle(cur.title));
    if (hit) return hit;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return undefined;
}

/** Grup `rootId` beserta seluruh turunannya (indikator bisa ada di level IKU). */
export function collectGroupSubtree(rootId: string, groups: { id: string; parentId: string | null }[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const g of groups) {
    if (g.parentId) children.set(g.parentId, [...(children.get(g.parentId) ?? []), g.id]);
  }
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    for (const c of children.get(stack.pop() as string) ?? []) {
      if (!out.has(c)) {
        out.add(c);
        stack.push(c);
      }
    }
  }
  return out;
}
