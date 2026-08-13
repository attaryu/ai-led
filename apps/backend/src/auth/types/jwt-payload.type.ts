import { Role } from '@ai-led/db';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: Role;
  programStudiId: string | null;
}
