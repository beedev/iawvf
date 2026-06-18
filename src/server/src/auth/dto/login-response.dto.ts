import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../roles.enum';

/**
 * Successful login response. Contains the signed access token and the
 * (non-sensitive) principal metadata so clients can render role-aware UI.
 */
export class LoginResponseDto {
  @ApiProperty({ description: 'Signed JWT bearer token.' })
  accessToken!: string;

  @ApiProperty({
    example: 'Bearer',
    description: 'Token type for the Authorization header.',
  })
  tokenType!: string;

  @ApiProperty({ example: 3600, description: 'Token lifetime in seconds.' })
  expiresIn!: number;

  @ApiProperty({ example: 'author', description: 'Authenticated username.' })
  username!: string;

  @ApiProperty({
    enum: Role,
    isArray: true,
    example: [Role.Author],
    description: 'Roles granted to the principal.',
  })
  roles!: Role[];
}
