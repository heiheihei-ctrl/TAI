import { downloadImage } from '@/utils/downloadHelper';
import { isCurrentUserPrivilegedAdmin } from '@/utils/isPrivilegedAdmin';
import { promptExportWatermarkChoice } from '@/services/exportWatermarkPrompt';
import { applyExportWatermark } from '@/services/exportWatermarkService';

export type ExportWatermarkDecision =
  | { kind: 'skip' }
  | { kind: 'cancelled' }
  | { kind: 'chosen'; withWatermark: boolean };

export async function resolveExportWatermarkDecision(): Promise<ExportWatermarkDecision> {
  if (!isCurrentUserPrivilegedAdmin()) {
    return { kind: 'skip' };
  }

  const choice = await promptExportWatermarkChoice();
  if (choice === null) {
    return { kind: 'cancelled' };
  }

  return { kind: 'chosen', withWatermark: choice };
}

export type ExportImageOptions = {
  decision?: ExportWatermarkDecision;
};

export async function exportImageFile(
  imageData: string,
  fileName: string,
  options?: ExportImageOptions
): Promise<boolean> {
  let decision = options?.decision;

  if (!decision) {
    decision = await resolveExportWatermarkDecision();
  }

  if (decision.kind === 'cancelled') {
    return false;
  }

  try {
    let exportData = imageData;

    if (decision.kind === 'chosen' && decision.withWatermark) {
      exportData = await applyExportWatermark(imageData);
    }

    await downloadImage(exportData, fileName);
    return true;
  } catch (error) {
    console.error('Export image failed:', error);
    throw error;
  }
}
