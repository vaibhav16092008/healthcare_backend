import { Controller, Post, Body, UseGuards, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { SupabaseAuthGuard } from './supabase.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import { OnboardingDto } from './dto/onboarding.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('onboarding')
  @UseGuards(SupabaseAuthGuard)
  async onboard(
    @CurrentUser() user: any,
    @Body() onboardingDto: OnboardingDto,
  ) {
    if (!user || !user.authId) {
      throw new UnauthorizedException('Missing authentication identity');
    }

    return this.authService.onboardUser(user.authId, user.email, user.phone, onboardingDto);
  }
}
