import { BadRequestException } from '@nestjs/common';

export const isRetiredSeedanceModel = (value: unknown): boolean =>
  /^(?:seedance-)?1\.5(?:-pro)?$|^doubao-seedance-1-5-/i.test(String(value || '').trim());

export function assertActiveSeedanceRequest(options: { provider?: string; seedanceModel?: string; managedModelKey?: string }) {
  if (options.provider === 'doubao' && [options.seedanceModel, options.managedModelKey].some(isRetiredSeedanceModel)) {
    throw new BadRequestException('Seedance 1.5 已下线，请选择 Seedance 2.0、2.0 Fast 或 2.5');
  }
}
