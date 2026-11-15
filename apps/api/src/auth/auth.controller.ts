import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { Public } from './auth.guard';
import { parse } from '../common/http';

const LoginDto = z.object({ org: z.string().min(2).max(40), username: z.string().min(1).max(100), password: z.string().min(1).max(200) });
const RefreshDto = z.object({ refreshToken: z.string().min(10).max(200) });

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public() @Post('login') @HttpCode(200)
  login(@Body() b: unknown, @Req() req: any) {
    const d = parse(LoginDto, b);
    return this.auth.login(d.org, d.username, d.password, req.ip, req.headers['user-agent']);
  }
  @Public() @Post('refresh') @HttpCode(200)
  refresh(@Body() b: unknown, @Req() req: any) {
    return this.auth.refresh(parse(RefreshDto, b).refreshToken, req.ip, req.headers['user-agent']);
  }
  @Public() @Post('logout') @HttpCode(204)
  async logout(@Body() b: unknown) { await this.auth.logout(parse(RefreshDto, b).refreshToken); }
  @Get('me')
  me(@Req() req: any) { return req.user; }
}
