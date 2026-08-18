import { Role } from '@ai-led/db';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: Role;
  programStudiId: string | null;
  /** ID unik per token — dipakai mencabut refresh token individual saat rotasi/logout. */
  jti: string;
  /** Ditambahkan `jsonwebtoken` saat verify; hadir di token yang sudah ditandatangani. */
  exp?: number;
}
