/**
 * One-off demo seed: satu akun per role, supaya Dashboard Prodi/List Bab bisa
 * diverifikasi sebagai Pimpinan/Penjamin Mutu/Penyusun tanpa modul User API
 * (belum ada — lihat Temuan Kendala row 13 tracker: register cuma buat ADMIN).
 *
 * Idempotent lewat upsert, jadi aman dijalankan ulang.
 */
import { PrismaClient, Role, Jenjang, PeringkatAkreditasi } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Password123!';
const TENANT_ID = 'demo-tenant';
const PRODI_ID = 'demo-prodi';

const DEMO_USERS: {
	email: string;
	fullName: string;
	role: Role;
	studyProgramId?: string;
}[] = [
	{ email: 'admin@demo.test', fullName: 'Dewi Lestari (Admin)', role: Role.ADMIN },
	{
		email: 'pimpinan@demo.test',
		fullName: 'Prof. Dr. Ir. H. Bambang (Pimpinan)',
		role: Role.PIMPINAN,
	},
	{
		email: 'pm@demo.test',
		fullName: 'Ahmad Fauzi (Penjamin Mutu)',
		role: Role.PENJAMIN_MUTU,
	},
	{
		email: 'penyusun@demo.test',
		fullName: 'Siti Rahmawati (Penyusun)',
		role: Role.PENYUSUN,
		studyProgramId: PRODI_ID,
	},
];

async function main() {
	const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

	const tenant = await prisma.tenant.upsert({
		where: { id: TENANT_ID },
		update: {},
		create: { id: TENANT_ID, universityName: 'Universitas Contoh' },
	});

	const studyProgram = await prisma.studyProgram.upsert({
		where: { id: PRODI_ID },
		update: {},
		create: {
			id: PRODI_ID,
			tenantId: tenant.id,
			name: 'Teknik Informatika',
			code: '55201',
			level: Jenjang.S1,
			faculty: 'Fakultas Teknik',
			programHead: 'Dr. Andi Nugroho, S.T., M.Kom.',
			accreditationRank: PeringkatAkreditasi.BAIK_SEKALI,
		},
	});

	for (const u of DEMO_USERS) {
		await prisma.user.upsert({
			where: { email: u.email },
			update: {},
			create: {
				tenantId: tenant.id,
				studyProgramId: u.studyProgramId ?? null,
				fullName: u.fullName,
				email: u.email,
				passwordHash,
				role: u.role,
			},
		});
	}

	console.log(`Seed selesai. Prodi: "${studyProgram.name}" (${studyProgram.id})`);
	console.log(`Password untuk semua akun demo: ${DEMO_PASSWORD}`);
	for (const u of DEMO_USERS) {
		console.log(`  ${u.role.padEnd(14)} ${u.email}`);
	}
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
