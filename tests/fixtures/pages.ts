const para = (i: number, len = 700) => `Para-${i} ` + 'demurrage rule text '.repeat(Math.ceil(len / 20)).slice(0, len);
export const threePages = [
  [para(1), para(2), para(3)].join('\n\n'),
  [para(4), para(5), para(6)].join('\n\n'),
  [para(7), para(8)].join('\n\n'),
];
