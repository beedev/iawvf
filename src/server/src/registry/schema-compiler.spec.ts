import { FieldDataType, RegistryStatus } from '@prisma/client';
import { CompilableField, compileEntitySchema } from './schema-compiler';

/** Alias so the test reads naturally; the compiler already returns a typed node. */
const compile = compileEntitySchema;

const field = (
  name: string,
  dataType: FieldDataType,
  extra: Partial<CompilableField> = {},
): CompilableField => ({
  name,
  dataType,
  required: false,
  allowedValues: [],
  status: RegistryStatus.Active,
  ...extra,
});

describe('compileEntitySchema', () => {
  it('expands dotted field names into nested properties', () => {
    const schema = compile({
      key: 'order',
      fields: [field('client.nyStatus', FieldDataType.String)],
    });

    const client = schema.properties?.client;
    expect(client?.type).toBe('object');
    expect(client?.properties?.nyStatus.type).toBe('string');
  });

  it('maps data types to JSON Schema types', () => {
    const props = compile({
      key: 'specimen',
      fields: [
        field('age', FieldDataType.Number),
        field('archiveRetrievalDate', FieldDataType.Date),
        field('tests[]', FieldDataType.Collection),
        field('capGoverned', FieldDataType.Boolean),
      ],
    }).properties;

    expect(props?.age.type).toBe('number');
    expect(props?.archiveRetrievalDate).toMatchObject({
      type: 'string',
      format: 'date-time',
    });
    expect(props?.tests.type).toBe('array');
    expect(props?.capGoverned.type).toBe('boolean');
  });

  it('emits allowedValues as an enum', () => {
    const props = compile({
      key: 'patient',
      fields: [
        field('gender', FieldDataType.String, {
          allowedValues: ['Male', 'Female', 'Other'],
        }),
      ],
    }).properties;

    expect(props?.gender.enum).toEqual(['Male', 'Female', 'Other']);
  });

  it('collects required field names', () => {
    const schema = compile({
      key: 'specimen',
      fields: [field('type', FieldDataType.String, { required: true })],
    });

    expect(schema.required).toContain('type');
  });

  it('is lenient by default and strict on request', () => {
    const lenient = compile({
      key: 'specimen',
      fields: [field('age', FieldDataType.Number)],
    });
    expect(lenient.additionalProperties).toBe(true);

    const strict = compile(
      { key: 'specimen', fields: [field('age', FieldDataType.Number)] },
      { strict: true },
    );
    expect(strict.additionalProperties).toBe(false);
  });

  it('excludes deprecated fields', () => {
    const props = compile({
      key: 'specimen',
      fields: [
        field('age', FieldDataType.Number),
        field('legacy', FieldDataType.String, {
          status: RegistryStatus.Deprecated,
        }),
      ],
    }).properties;

    expect(props?.age).toBeDefined();
    expect(props?.legacy).toBeUndefined();
  });
});
