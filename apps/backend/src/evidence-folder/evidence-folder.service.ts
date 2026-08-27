import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OwnerTipe, Role } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateEvidenceFolderDto } from './dto/create-evidence-folder.dto';
import { RenameEvidenceFolderDto } from './dto/rename-evidence-folder.dto';
import { MoveEvidenceFolderDto } from './dto/move-evidence-folder.dto';
import { RemoveEvidenceFolderDto } from './dto/remove-evidence-folder.dto';
import { AssignEvidenceFolderDto } from './dto/assign-evidence-folder.dto';
import { EnsureFolderPathsDto } from './dto/ensure-folder-paths.dto';

/** docs/database.md §7 — sama seperti bukti-dukung: PENYUSUN terbatas ke prodinya sendiri; ADMIN tidak punya akses sama sekali. */
const SCOPED_TO_OWN_PRODI: Role[] = [Role.PENYUSUN];

type FolderRow = { id: string; parentId: string | null };

/** Port of evidence-folder.entity.ts::keturunanIds — id beserta seluruh keturunannya. */
function collectDescendantIds(folders: FolderRow[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const folder of folders) {
    if (folder.parentId === null) continue;
    const list = children.get(folder.parentId);
    if (list) list.push(folder.id);
    else children.set(folder.parentId, [folder.id]);
  }

  const result = new Set<string>([id]);
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const childId of children.get(current) ?? []) {
      if (result.has(childId)) continue;
      result.add(childId);
      queue.push(childId);
    }
  }
  return result;
}

@Injectable()
export class EvidenceFolderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** Same scope rules as BuktiDukungService.create/findAll — mirrored, not reinvented. */
  private async assertScopeAllowed(ownerType: OwnerTipe, studyProgramId?: string | null) {
    const { tenantId, role, studyProgramId: ownProdiId } = this.tenantContext.getOrThrow();

    if (ownerType === OwnerTipe.PROGRAM_STUDI) {
      if (!studyProgramId) {
        throw new BadRequestException(
          'studyProgramId wajib diisi untuk ownerType PROGRAM_STUDI',
        );
      }
      if (SCOPED_TO_OWN_PRODI.includes(role) && studyProgramId !== ownProdiId) {
        throw new ForbiddenException(
          'Penyusun hanya boleh mengelola folder program studinya sendiri',
        );
      }
      const prodi = await this.prisma.studyProgram.findFirst({
        where: { id: studyProgramId, tenantId },
      });
      if (!prodi) {
        throw new NotFoundException('Program studi tidak ditemukan');
      }
    } else if (studyProgramId) {
      throw new BadRequestException('studyProgramId harus kosong untuk ownerType TENANT');
    } else if (SCOPED_TO_OWN_PRODI.includes(role)) {
      throw new ForbiddenException('Penyusun tidak boleh mengelola folder level tenant');
    }
  }

  /** Satu folder, dijamin milik tenant pemanggil dan (bila PENYUSUN) prodinya sendiri. */
  private async getAccessibleFolder(id: string) {
    const { tenantId, role, studyProgramId: ownProdiId } = this.tenantContext.getOrThrow();

    const folder = await this.prisma.evidenceFolder.findFirst({ where: { id, tenantId } });
    if (!folder) {
      throw new NotFoundException('Folder tidak ditemukan');
    }
    if (
      SCOPED_TO_OWN_PRODI.includes(role) &&
      (folder.ownerType !== OwnerTipe.PROGRAM_STUDI || folder.studyProgramId !== ownProdiId)
    ) {
      throw new ForbiddenException('Penyusun hanya boleh mengakses folder program studinya sendiri');
    }
    return folder;
  }

  async findByScope(ownerTypeParam: string, studyProgramId?: string) {
    if (ownerTypeParam !== OwnerTipe.TENANT && ownerTypeParam !== OwnerTipe.PROGRAM_STUDI) {
      throw new BadRequestException('ownerType wajib TENANT atau PROGRAM_STUDI');
    }
    const ownerType = ownerTypeParam as OwnerTipe;
    const { tenantId, role, studyProgramId: ownProdiId } = this.tenantContext.getOrThrow();

    if (ownerType === OwnerTipe.TENANT) {
      if (SCOPED_TO_OWN_PRODI.includes(role)) {
        throw new ForbiddenException('Penyusun tidak punya akses ke folder level tenant');
      }
      return this.prisma.evidenceFolder.findMany({
        where: { tenantId, ownerType: OwnerTipe.TENANT },
        orderBy: { name: 'asc' },
      });
    }

    if (!studyProgramId) {
      throw new BadRequestException('studyProgramId wajib diisi untuk ownerType PROGRAM_STUDI');
    }
    if (SCOPED_TO_OWN_PRODI.includes(role) && studyProgramId !== ownProdiId) {
      throw new ForbiddenException('Penyusun hanya boleh melihat folder program studinya sendiri');
    }
    return this.prisma.evidenceFolder.findMany({
      where: { tenantId, ownerType: OwnerTipe.PROGRAM_STUDI, studyProgramId },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateEvidenceFolderDto) {
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    await this.assertScopeAllowed(dto.ownerType, dto.studyProgramId);

    if (dto.parentId) {
      const parent = await this.getAccessibleFolder(dto.parentId);
      if (
        parent.ownerType !== dto.ownerType ||
        parent.studyProgramId !== (dto.ownerType === OwnerTipe.PROGRAM_STUDI ? dto.studyProgramId : null)
      ) {
        throw new BadRequestException('Folder induk harus berada di cakupan yang sama');
      }
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    return this.prisma.evidenceFolder.create({
      data: {
        ownerType: dto.ownerType,
        tenantId,
        studyProgramId: dto.ownerType === OwnerTipe.PROGRAM_STUDI ? dto.studyProgramId : null,
        name: dto.name.trim(),
        parentId: dto.parentId ?? null,
        createdByUserId: userId,
        createdByName: user.fullName,
      },
    });
  }

  async rename(id: string, dto: RenameEvidenceFolderDto) {
    await this.getAccessibleFolder(id);
    return this.prisma.evidenceFolder.update({
      where: { id },
      data: { name: dto.name.trim() },
    });
  }

  /**
   * `false` (via BadRequestException) bila tujuannya folder itu sendiri atau
   * salah satu keturunannya — ditegakkan di sini juga, bukan cuma dipercaya
   * dari klien (evidence-folder.repository.ts::moveFolder yang menegakkannya
   * di localStorage sebelumnya).
   */
  async move(id: string, dto: MoveEvidenceFolderDto) {
    const folder = await this.getAccessibleFolder(id);
    const targetId = dto.parentId ?? null;

    if (targetId !== null) {
      const target = await this.getAccessibleFolder(targetId);
      if (
        target.ownerType !== folder.ownerType ||
        target.tenantId !== folder.tenantId ||
        target.studyProgramId !== folder.studyProgramId
      ) {
        throw new BadRequestException('Folder tujuan harus berada di cakupan yang sama');
      }

      const scoped = await this.prisma.evidenceFolder.findMany({
        where: {
          tenantId: folder.tenantId,
          ownerType: folder.ownerType,
          studyProgramId: folder.studyProgramId,
        },
        select: { id: true, parentId: true },
      });
      if (collectDescendantIds(scoped, id).has(targetId)) {
        throw new BadRequestException(
          'Folder tidak bisa dipindahkan ke dalam dirinya sendiri atau keturunannya',
        );
      }
    }

    return this.prisma.evidenceFolder.update({
      where: { id },
      data: { parentId: targetId },
    });
  }

  /** Baris folder saja — tidak menyentuh bukti dukung di dalamnya (pemanggil menanganinya lebih dulu). */
  async removeMany(dto: RemoveEvidenceFolderDto) {
    const { tenantId, role, studyProgramId: ownProdiId } = this.tenantContext.getOrThrow();
    const ids = [...new Set(dto.ids)];

    const folders = await this.prisma.evidenceFolder.findMany({ where: { id: { in: ids }, tenantId } });
    if (folders.length !== ids.length) {
      throw new NotFoundException('Sebagian folder tidak ditemukan');
    }
    if (SCOPED_TO_OWN_PRODI.includes(role)) {
      const forbidden = folders.some(
        (folder) => folder.ownerType !== OwnerTipe.PROGRAM_STUDI || folder.studyProgramId !== ownProdiId,
      );
      if (forbidden) {
        throw new ForbiddenException('Penyusun hanya boleh menghapus folder program studinya sendiri');
      }
    }

    await this.prisma.evidenceFolder.deleteMany({ where: { id: { in: ids } } });
  }

  /**
   * Memindahkan sekumpulan bukti dukung ke satu folder (`null` = akar cakupannya).
   * Cakupan dibaca dari isi `evidenceIds` sendiri, bukan dari header/query
   * terpisah — sama seperti bukti-dukung tidak punya "cakupan aktif" tersendiri.
   */
  async assignMany(dto: AssignEvidenceFolderDto) {
    const { tenantId, role, studyProgramId: ownProdiId } = this.tenantContext.getOrThrow();
    const evidenceIds = [...new Set(dto.evidenceIds)];

    const folder = dto.folderId ? await this.getAccessibleFolder(dto.folderId) : null;

    const evidences = await this.prisma.evidence.findMany({
      where: { id: { in: evidenceIds }, tenantId },
    });
    if (evidences.length !== evidenceIds.length) {
      throw new NotFoundException('Sebagian bukti dukung tidak ditemukan');
    }
    if (SCOPED_TO_OWN_PRODI.includes(role)) {
      const forbidden = evidences.some(
        (evidence) => evidence.ownerType !== OwnerTipe.PROGRAM_STUDI || evidence.studyProgramId !== ownProdiId,
      );
      if (forbidden) {
        throw new ForbiddenException('Penyusun hanya boleh memindahkan bukti dukung program studinya sendiri');
      }
    }
    if (folder) {
      const mismatched = evidences.some(
        (evidence) => evidence.ownerType !== folder.ownerType || evidence.studyProgramId !== folder.studyProgramId,
      );
      if (mismatched) {
        throw new BadRequestException('Bukti dukung dan folder tujuan harus berada di cakupan yang sama');
      }
    }

    await this.prisma.evidence.updateMany({
      where: { id: { in: evidenceIds } },
      data: { folderId: dto.folderId ?? null },
    });
  }

  /**
   * Batch upsert-by-path — port `evidence-folder.repository.ts::ensureFolderPaths`
   * ke server supaya dua unggahan folder yang beririsan tidak berlomba membuat
   * folder yang sama (localStorage lama menang lewat "baca sekali, tulis
   * sekali"; di sini lewat satu transaksi interaktif).
   */
  async ensurePaths(dto: EnsureFolderPathsDto): Promise<Record<string, string | null>> {
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    await this.assertScopeAllowed(dto.ownerType, dto.studyProgramId);

    const scopedStudyProgramId = dto.ownerType === OwnerTipe.PROGRAM_STUDI ? (dto.studyProgramId ?? null) : null;
    const rootParentId = dto.parentId ?? null;
    if (rootParentId) {
      const parent = await this.getAccessibleFolder(rootParentId);
      if (parent.ownerType !== dto.ownerType || parent.studyProgramId !== scopedStudyProgramId) {
        throw new BadRequestException('Folder induk harus berada di cakupan yang sama');
      }
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    return this.prisma.$transaction(async (tx) => {
      const known = await tx.evidenceFolder.findMany({
        where: { tenantId, ownerType: dto.ownerType, studyProgramId: scopedStudyProgramId },
        select: { id: true, name: true, parentId: true },
      });

      const result: Record<string, string | null> = {};

      for (const segments of dto.paths) {
        if (!Array.isArray(segments)) {
          throw new BadRequestException('paths harus berisi larik nama folder');
        }
        let current = rootParentId;

        for (const rawName of segments) {
          if (typeof rawName !== 'string') {
            throw new BadRequestException('paths harus berisi larik nama folder');
          }
          const name = rawName.trim();
          if (name === '') continue;

          const match = known.find(
            (folder) => folder.parentId === current && folder.name.toLowerCase() === name.toLowerCase(),
          );
          if (match) {
            current = match.id;
            continue;
          }

          const created = await tx.evidenceFolder.create({
            data: {
              ownerType: dto.ownerType,
              tenantId,
              studyProgramId: scopedStudyProgramId,
              name,
              parentId: current,
              createdByUserId: userId,
              createdByName: user.fullName,
            },
            select: { id: true, name: true, parentId: true },
          });
          known.push(created);
          current = created.id;
        }

        result[segments.join('/')] = current;
      }

      return result;
    });
  }
}
