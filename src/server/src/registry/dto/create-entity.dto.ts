import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ENTITY_KEY_PATTERN } from '../registry.constants';

/** Request body for creating a registry entity. */
export class CreateEntityDto {
  @ApiProperty({
    description:
      'Entity key — a single identifier segment. Stored canonical lower-case; uniqueness is case-insensitive.',
    example: 'kit',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(ENTITY_KEY_PATTERN, {
    message: 'key must match /^[a-zA-Z][a-zA-Z0-9]*$/.',
  })
  key!: string;

  @ApiPropertyOptional({
    description: 'Human-readable label. Derived from the key when omitted.',
    example: 'Kit',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  label?: string;

  @ApiPropertyOptional({ description: 'Optional description.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}
