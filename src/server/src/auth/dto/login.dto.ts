import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Credentials submitted to POST /api/auth/login.
 *
 * Bounded lengths guard against oversized payloads. The actual password value
 * is never logged (the global logger redacts request bodies on auth routes).
 */
export class LoginDto {
  @ApiProperty({ example: 'author', description: 'Account username.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  username!: string;

  @ApiProperty({ example: 'author-pw', description: 'Account password.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  password!: string;
}
