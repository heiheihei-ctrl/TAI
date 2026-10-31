/** Compatibility for persisted nodes and clients using the retired ToAPIs names. */
export function normalizeGptImage25Model(model: string): string {
  return model.trim().replace(/^(gpt-image-2\.5-(?:sunburst|flare))-vip$/, '$1-official');
}

export function isGptImage25Model(model: unknown): boolean {
  return typeof model === 'string' &&
    /^gpt-image-2\.5-(sunburst|flare)-official$/.test(normalizeGptImage25Model(model));
}
