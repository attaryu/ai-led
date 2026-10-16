import { collectGroupSubtree, normalizeTitle, resolveAnchorGroupId } from './section-indicator.util';

describe('section-indicator.util', () => {
  it('normalizeTitle membuang penomoran awal/akhir dan tanda baca', () => {
    expect(normalizeTitle('IV. Sumber Daya Manusia')).toBe('sumber daya manusia');
    expect(normalizeTitle('Sarana, Prasarana (K3L) 1. Latar belakang')).toBe('sarana prasarana k3l');
  });

  const sections = [
    { id: 'c', parentId: null, title: 'Kriteria Akreditasi' },
    { id: 'c2', parentId: 'c', title: 'Akuntabilitas' },
    { id: 'c2-kebijakan', parentId: 'c2', title: 'Kebijakan' },
    { id: 'c2-kebijakan-a', parentId: 'c2-kebijakan', title: 'a) Kerja sama' },
    { id: 'a', parentId: null, title: 'Struktur Tim Penyusun dan Mekanisme Kerja' },
  ];
  const links = [{ templateTitle: 'Akuntabilitas', criterionGroupId: 'G2' }];

  it('anak (sampai kedalaman 3) mewarisi jangkar leluhurnya tanpa mencocokkan judulnya', () => {
    expect(resolveAnchorGroupId('c2', sections, links)).toBe('G2');
    expect(resolveAnchorGroupId('c2-kebijakan', sections, links)).toBe('G2');
    expect(resolveAnchorGroupId('c2-kebijakan-a', sections, links)).toBe('G2');
  });

  it('section di luar jangkar tak punya indikator', () => {
    expect(resolveAnchorGroupId('a', sections, links)).toBeUndefined();
    expect(resolveAnchorGroupId('c', sections, links)).toBeUndefined();
  });

  it('collectGroupSubtree mengumpulkan turunan', () => {
    const groups = [
      { id: 'K', parentId: null },
      { id: 'IKU', parentId: 'K' },
      { id: 'x', parentId: 'other' },
    ];
    expect([...collectGroupSubtree('K', groups)].sort()).toEqual(['IKU', 'K']);
  });
});
