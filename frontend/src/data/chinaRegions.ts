import { pcaTextArr } from "element-china-area-data";

export type RegionNode = {
  label: string;
  value: string;
  children?: RegionNode[];
};

export const CHINA_REGION_TREE = pcaTextArr as RegionNode[];

export const REGION_SEPARATOR = " / ";

export function formatRegion(province: string, city: string, district: string): string {
  return [province, city, district].filter(Boolean).join(REGION_SEPARATOR);
}

export function parseRegion(value: string | null | undefined): {
  province: string;
  city: string;
  district: string;
} {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return { province: "", city: "", district: "" };
  }

  if (trimmed.includes(REGION_SEPARATOR)) {
    const parts = trimmed.split(REGION_SEPARATOR).map((part) => part.trim());
    return {
      province: parts[0] || "",
      city: parts[1] || "",
      district: parts[2] || "",
    };
  }

  return { province: "", city: "", district: trimmed };
}

export function getProvinces(): string[] {
  return CHINA_REGION_TREE.map((node) => node.label);
}

export function getCitiesForProvince(province: string): string[] {
  const node = CHINA_REGION_TREE.find((item) => item.label === province);
  return node?.children?.map((item) => item.label) || [];
}

export function getDistrictsForCity(province: string, city: string): string[] {
  const provinceNode = CHINA_REGION_TREE.find((item) => item.label === province);
  const cityNode = provinceNode?.children?.find((item) => item.label === city);
  return cityNode?.children?.map((item) => item.label) || [];
}

export function isCompleteRegion(value: string | null | undefined): boolean {
  const { province, city, district } = parseRegion(value);
  return Boolean(province && city && district);
}

/** @deprecated 兼容旧引用 */
export const CHINA_PROVINCES = getProvinces();

/** @deprecated 兼容旧引用 */
export const CHINA_CITIES_BY_PROVINCE = Object.fromEntries(
  CHINA_REGION_TREE.map((node) => [node.label, node.children?.map((item) => item.label) || []]),
);
