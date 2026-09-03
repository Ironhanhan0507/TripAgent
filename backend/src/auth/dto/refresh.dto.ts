import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @MinLength(16, { message: 'refresh token 无效' })
  refreshToken!: string;
}
