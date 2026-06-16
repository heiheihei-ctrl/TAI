import { isZhLanguage } from '@/utils/localeText';

const BRUSH_PREFIX = /^Kyle's Dry Media - /i;

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
  'Blender': '晕染笔',
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

export const stripBrushNamePrefix = (name: string): string =>
  name.replace(BRUSH_PREFIX, '').trim();

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
): string => {
  const shortName = stripBrushNamePrefix(name);
  if (isZhLanguage(language)) {
    return localizeBrushNameToZh(shortName);
  }
  return shortName;
};
