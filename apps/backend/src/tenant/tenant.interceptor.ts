import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { TenantContextService } from './tenant-context.service';

/** Runs after TenantGuard — wraps the request in AsyncLocalStorage so downstream services can read tenant context without it threading through every signature. */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload;

    return new Observable((subscriber) => {
      this.tenantContext.run(
        {
          tenantId: user.tenantId,
          userId: user.sub,
          role: user.role,
          studyProgramId: user.studyProgramId,
        },
        () => {
          next.handle().subscribe(subscriber);
        },
      );
    });
  }
}
