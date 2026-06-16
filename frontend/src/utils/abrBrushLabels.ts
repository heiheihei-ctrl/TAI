import { isZhLanguage } from '@/utils/localeText';
import type { AbrBrushPackId } from '@/types/abrBrush';

const BRUSH_PREFIX = /^Kyle's Dry Media - /i;
const COMIC_WATERMARK = /-{3,}[\s\S]*$/;
const COMIC_NOISE_PREFIX = /^I\d+/;
const PENCIL_BRUSH_PREFIX = /^AD[_\s-]*/i;

const formatPencilBrushListName = (name: string): string => {
  let result = name.replace(PENCIL_BRUSH_PREFIX, '').replace(/#/g, '');

  const dotIndex = result.indexOf('.');
  if (dotIndex !== -1) {
    result = result.slice(dotIndex + 1);
  }

  result = result.replace(/px.*$/i, '');

  return result.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
};

const COMIC_EXACT_ZH_NAMES: Record<string, string> = {
  'Miconi - 1 Point Perspective Grid': '一点透视网格',
  'Miconi - 2pt Perspective Grid': '两点透视网格',
  'Miconi - 3pt Perspective Grid': '三点透视网格',
  'Miconi - Isometric Grid': '等距网格',
  grid2: '网点网格 2',
  grid4: '网点网格 4',
  grid5: '网点网格 5',
  grid7: '网点网格 7',
  grid9: '网点网格 9',
  grid10: '网点网格 10',
  grid11: '网点网格 11',
  grid12: '网点网格 12',
  grid17: '网点网格 17',
  grid19: '网点网格 19',
  grid23: '网点网格 23',
  grid35: '网点网格 35',
  grid38: '网点网格 38',
  grid39: '网点网格 39',
  grid41: '网点网格 41',
};

const COMIC_PHRASE_ZH: Array<[RegExp, string]> = [
  [/perspective grid/i, '透视网格'],
  [/isometric grid/i, '等距网格'],
  [/^grid(\d+)$/i, '网点网格 $1'],
  [/g.?pen/i, 'G 笔'],
  [/round pen/i, '圆笔'],
  [/mapping pen/i, '制图笔'],
  [/maru pen/i, '丸笔'],
  [/school pen/i, '学校笔'],
  [/tone/i, '网点'],
  [/screentone/i, '网点'],
  [/halftone/i, '半色调'],
  [/ink/i, '墨水'],
  [/line/i, '线条'],
  [/comic/i, '漫画'],
];

const EXACT_ZH_NAMES: Record<string, string> = {
  '2B Pencil': '2B 铅笔',
  '4B Pencil': '4B 铅笔',
  '6B Pencil': '6B 铅笔',
  '8B Pencil': '8B 铅笔',
  'HB Pencil': 'HB 铅笔',
  'Big Soft Charcoal': '大号软炭笔',
  'Charcoal Champ': '炭笔质感',
  'Charcoal Stump': '炭笔擦笔',
  'Soft Charcoal': '软炭笔',
  'Hard Charcoal': '硬炭笔',
  'Compressed Charcoal': '压缩炭条',
  'Soft Vine Charcoal': '软藤条炭笔',
  'Oil Pastel': '油画棒',
  'Soft Pastel': '软色粉笔',
  'Hard Pastel': '硬色粉笔',
  'Conte Crayon': '孔代蜡笔',
  'Bone Dry Brush': '骨感干笔刷',
  'Deliciously Dry Brush': '细腻干笔刷',
  'Rough Eraser': '粗糙橡皮擦',
  'Blunt Pencil': '钝头铅笔',
  'Fine Point Pencil': '细尖铅笔',
  Blender: '晕染笔',
  'Smudge Stick': '涂抹棒',
  'Dry Brush': '干笔刷',
};

const PHRASE_ZH: Array<[string, string]> = [
  ['Big Soft Charcoal', '大号软炭笔'],
  ['Soft Vine Charcoal', '软藤条炭笔'],
  ['Compressed Charcoal', '压缩炭条'],
  ['Fine Point Pencil', '细尖铅笔'],
  ['Blunt Pencil', '钝头铅笔'],
  ['Charcoal Stump', '炭笔擦笔'],
  ['Charcoal Champ', '炭笔质感'],
  ['Soft Charcoal', '软炭笔'],
  ['Hard Charcoal', '硬炭笔'],
  ['Oil Pastel', '油画棒'],
  ['Soft Pastel', '软色粉笔'],
  ['Hard Pastel', '硬色粉笔'],
  ['Conte Crayon', '孔代蜡笔'],
  ['Bone Dry Brush', '骨感干笔刷'],
  ['Deliciously Dry Brush', '细腻干笔刷'],
  ['Rough Eraser', '粗糙橡皮擦'],
  ['Smudge Stick', '涂抹棒'],
  ['Dry Brush', '干笔刷'],
  ['HB Pencil', 'HB 铅笔'],
  ['2B Pencil', '2B 铅笔'],
  ['4B Pencil', '4B 铅笔'],
  ['6B Pencil', '6B 铅笔'],
  ['8B Pencil', '8B 铅笔'],
];

const WORD_ZH: Record<string, string> = {
  Big: '大号',
  Soft: '软',
  Hard: '硬',
  Rough: '粗糙',
  Smooth: '顺滑',
  Fine: '细',
  Blunt: '钝头',
  Light: '轻',
  Heavy: '重',
  Dry: '干',
  Wet: '湿',
  Vine: '藤条',
  Compressed: '压缩',
  Charcoal: '炭笔',
  Pencil: '铅笔',
  Pastel: '色粉笔',
  Crayon: '蜡笔',
  Eraser: '橡皮擦',
  Blender: '晕染笔',
  Smudge: '涂抹',
  Stump: '擦笔',
  Brush: '笔刷',
  Point: '尖',
  Stick: '棒',
  Oil: '油性',
  Conte: '孔代',
  Champ: '质感',
  Deliciously: '细腻',
  Bone: '骨感',
};

const PENCIL_EXACT_ZH_NAMES: Record<string, string> = {
  'Pencil-Tip-01': '铅笔尖 01',
  'Pencil-2016-01': '铅笔 2016-01',
  'Pencils Drop - 161px': '铅笔颗粒',
  'Pencils Drop': '铅笔颗粒',
  'Pastel-2016 Romboid-321px': '菱形色粉笔',
  'Pastel-2016 Romboid': '菱形色粉笔',
};

const PENCIL_PHRASE_ZH: Array<[RegExp, string]> = [
  [/pencil.?tip/i, '铅笔尖'],
  [/pencils drop/i, '铅笔颗粒'],
  [/pastel.*romboid/i, '菱形色粉笔'],
  [/pastel/i, '色粉笔'],
  [/charcoal/i, '炭笔'],
  [/eraser/i, '橡皮擦'],
  [/sketch/i, '素描'],
  [/graphite/i, '石墨'],
  [/pencil/i, '铅笔'],
];

export const stripComicBrushName = (name: string): string =>
  name.replace(COMIC_WATERMARK, '').replace(COMIC_NOISE_PREFIX, '').trim();

export const stripPencilBrushName = (name: string): string =>
  formatPencilBrushListName(name);

export const stripBrushNamePrefix = (name: string): string =>
  stripComicBrushName(name.replace(BRUSH_PREFIX, '').trim());

const localizeComicBrushNameToZh = (shortName: string): string => {
  if (COMIC_EXACT_ZH_NAMES[shortName]) {
    return COMIC_EXACT_ZH_NAMES[shortName];
  }

  for (const [pattern, zh] of COMIC_PHRASE_ZH) {
    if (pattern.test(shortName)) {
      if (zh.includes('$1')) {
        const match = shortName.match(/^grid(\d+)$/i);
        if (match) return `网点网格 ${match[1]}`;
      }
      return zh;
    }
  }

  return shortName;
};

const localizePencilBrushNameToZh = (shortName: string): string => {
  if (PENCIL_EXACT_ZH_NAMES[shortName]) {
    return PENCIL_EXACT_ZH_NAMES[shortName];
  }

  for (const [pattern, zh] of PENCIL_PHRASE_ZH) {
    if (pattern.test(shortName)) {
      return zh;
    }
  }

  return shortName;
};

const localizeBrushNameToZh = (shortName: string): string => {
  if (EXACT_ZH_NAMES[shortName]) {
    return EXACT_ZH_NAMES[shortName];
  }

  for (const [phrase, zh] of PHRASE_ZH) {
    if (shortName === phrase) {
      return zh;
    }
  }

  const tokens = shortName.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return shortName;
  }

  const translated = tokens.map((token) => {
    if (/^\d+B$/i.test(token)) {
      return token.toUpperCase();
    }
    if (WORD_ZH[token]) {
      return WORD_ZH[token];
    }
    if (WORD_ZH[token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()]) {
      return WORD_ZH[token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()];
    }
    return token;
  });

  const joined = translated.join('');
  if (/铅笔|炭笔|蜡笔|色粉笔|笔刷|橡皮擦|晕染|涂抹/.test(joined)) {
    return joined;
  }

  return `${joined}笔刷`;
};

export const getBrushDisplayName = (
  name: string,
  language?: string | null,
  packId?: AbrBrushPackId | null,
): string => {
  const shortName =
    packId === 'pencil-brush'
      ? stripPencilBrushName(name)
      : stripBrushNamePrefix(name);
  if (isZhLanguage(language)) {
    if (packId === 'comic') {
      return localizeComicBrushNameToZh(shortName);
    }
    if (packId === 'pencil-brush') {
      return localizePencilBrushNameToZh(shortName);
    }
    return localizeBrushNameToZh(shortName);
  }
  return shortName;
};
