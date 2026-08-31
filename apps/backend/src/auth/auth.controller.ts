import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtPayload } from './types/jwt-payload.type';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/auth';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, expiresIn, user } =
      await this.authService.register(dto);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, expiresIn, user };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, expiresIn, user } =
      await this.authService.login(dto);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, expiresIn, user };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof token !== 'string') {
      throw new UnauthorizedException('Refresh token tidak ditemukan');
    }
    const { accessToken, refreshToken, expiresIn, user } =
      await this.authService.refresh(token);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, expiresIn, user };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof token === 'string') {
      await this.authService.revokeRefreshToken(token);
    }
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user.sub);
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: REFRESH_COOKIE_PATH,
    });
  }
}
