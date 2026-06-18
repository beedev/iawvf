/**
 * The IAW VDF deterministic rule engine — a pure, embeddable TypeScript module.
 *
 * Behavioural parity oracle: the .NET build (src/backend/IAW.Vdf.*). This engine
 * reproduces identical outcomes on the same rule corpus (rules/*.json +
 * rules/reference-data.json) and fixtures (fixtures/*.json). It carries no NestJS
 * dependency and can be embedded in any host.
 *
 * @see CorpusRegressionTests.cs — the parity oracle whose expected outcomes this
 *  engine matches (verified by corpus-parity.spec.ts).
 */

export * from './types';
export * from './facts';
export * from './reference-data';
export * from './operators';
export * from './conditions';
export * from './serializer';
export * from './selector';
export * from './reconciler';
export * from './clock';
export * from './engine';
