import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FieldDataType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { FIELD_NAME_PATTERN } from '../registry.constants';

/** Request body for adding a field to an existing entity. */
export class AddFieldDto {
  @ApiProperty({
    description:
      'Field name relative to the entity. Dot-separated segments allowed; trailing "[]" denotes a collection.',
    example: 'client.nyStatus',
  })
  @IsString()
  @MaxLength(128)
  @Matches(FIELD_NAME_PATTERN, {
    message:
      'name must be dot-separated identifier segments with an optional trailing "[]".',
  })
  name!: string;

  @ApiProperty({ enum: FieldDataType, description: 'The field data type.' })
  @IsEnum(FieldDataType, {
    message: `dataType must be one of: ${Object.values(FieldDataType).join(', ')}.`,
  })
  dataType!: FieldDataType;

  @ApiPropertyOptional({
    description: 'Whether the field is required.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    description: 'Closed set of permitted values (enum). Empty means any.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(256)
  @IsString({ each: true })
  allowedValues?: string[];

  @ApiPropertyOptional({ description: 'Optional description.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}
