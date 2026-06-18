import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

/** Request body for runtime fact validation. */
export class ValidateFactsDto {
  @ApiProperty({
    description:
      'A fact document keyed by entity. Each matching sub-document is validated against the entity schema.',
    example: {
      specimen: { type: 'FFPE', fixationTime: 12 },
      patient: { gender: 'Male', age: 40 },
    },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  facts!: Record<string, unknown>;
}
