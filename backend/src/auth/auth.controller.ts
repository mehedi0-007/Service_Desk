import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { appConfig } from '../config/app.config';
import type { AppConfig } from '../config/app.config';
import { UserDto } from '../users/dto/user.response';
import { AuthResult, AuthService } from './auth.service';
import { CookieOriginGuard } from './cookie-origin.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login.response';
import {
  clearRefreshCookie,
  readRefreshCookie,
  REFRESH_COOKIE,
  setRefreshCookie,
} from './refresh-cookie';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(appConfig.KEY) private readonly config: AppConfig,
  ) {}

  @Public()
  @UseGuards(CookieOriginGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in; the refresh token is set as an httpOnly cookie',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    return this.respond(
      res,
      await this.auth.login(dto, req.headers['user-agent']),
    );
  }

  @Public()
  @UseGuards(CookieOriginGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: 'Exchange the refresh cookie for a new access token (rotates it)',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    try {
      return this.respond(res, await this.auth.refresh(readRefreshCookie(req)));
    } catch (error) {
      // A cookie that no longer works is removed, except during a refresh race: the browser
      // already holds the newer cookie, and clearing it would sign the user out.
      if ((error as { getStatus?: () => number }).getStatus?.() === 401) {
        clearRefreshCookie(res, this.config);
      }
      throw error;
    }
  }

  @Public()
  @UseGuards(CookieOriginGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary:
      'End this session (refresh cookie, or the access token without it)',
  })
  @ApiNoContentResponse()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout({
      refreshToken: readRefreshCookie(req),
      accessToken: req.headers.authorization?.replace(/^Bearer\s+/i, ''),
    });
    clearRefreshCookie(res, this.config);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'End all sessions of the current user' })
  @ApiNoContentResponse()
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutAll(user);
    clearRefreshCookie(res, this.config);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change the password; other sessions are signed out',
  })
  @ApiNoContentResponse()
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.auth.changePassword(user, dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user' })
  @ApiOkResponse({ type: UserDto })
  me(@CurrentUser() user: AuthenticatedUser): UserDto {
    const { id, email, name, role } = user;
    return { id, email, name, role };
  }

  private respond(res: Response, result: AuthResult): LoginResponseDto {
    setRefreshCookie(
      res,
      this.config,
      result.refreshToken,
      result.refreshExpiresAt,
    );
    const { accessToken, expiresIn, user } = result;
    return { accessToken, expiresIn, user };
  }
}
