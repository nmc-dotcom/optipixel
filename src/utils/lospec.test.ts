import { describe, expect, it } from 'vitest';
import { LOSPEC_PALETTE_URL, parseLospecSlug, toPaletteFromLospec } from './lospec';

describe('parseLospecSlug', () => {
  it('슬러그를 그대로 받아들인다', () => {
    expect(parseLospecSlug('pico-8')).toBe('pico-8');
  });

  it('대소문자와 앞뒤 공백을 정리한다', () => {
    expect(parseLospecSlug('  PICO-8  ')).toBe('pico-8');
  });

  it.each([
    ['https://lospec.com/palette-list/pico-8', 'pico-8'],
    ['https://www.lospec.com/palette-list/nyx8', 'nyx8'],
    ['https://lospec.com/palette-list/pico-8.json', 'pico-8'],
    ['https://lospec.com/palette-list/endesga-32/', 'endesga-32'],
    ['https://lospec.com/palette-list/pico-8?ref=x', 'pico-8'],
  ])('주소를 붙여넣어도 슬러그를 뽑아낸다: %s', (input, expected) => {
    expect(parseLospecSlug(input)).toBe(expected);
  });

  it.each([
    ['', '빈 문자열'],
    ['pico 8', '공백 포함'],
    ['https://evil.com/x', '다른 도메인'],
    ['../../etc/passwd', '경로 탈출 시도'],
  ])('올바르지 않은 입력은 거부한다 (%s)', (input) => {
    expect(parseLospecSlug(input)).toBeNull();
  });

  it.each([
    'pico-8/../../admin',
    'pico-8/anything/else',
    'pico-8#fragment',
  ])('뒤에 붙은 경로는 잘라내어 안전한 슬러그만 남긴다: %s', (input) => {
    // 첫 경로 구분자에서 잘리므로 슬러그에 구분자가 남을 수 없고,
    // 결과 URL은 항상 lospec 팔레트 경로 안에 머무른다.
    const slug = parseLospecSlug(input);
    expect(slug).toBe('pico-8');
    expect(LOSPEC_PALETTE_URL(slug!)).toBe('https://lospec.com/palette-list/pico-8.json');
  });

  it('통과한 슬러그에는 경로 구분자가 절대 남지 않는다', () => {
    const inputs = ['pico-8', 'a/b', '../x', 'x?y', 'x#y', 'https://lospec.com/palette-list/z/w'];
    for (const input of inputs) {
      const slug = parseLospecSlug(input);
      if (slug !== null) {
        expect(slug).toMatch(/^[a-z0-9-]+$/);
      }
    }
  });
});

describe('toPaletteFromLospec', () => {
  it('# 없는 색상에 #를 붙여 팔레트로 만든다', () => {
    // Lospec 실제 응답 형태
    const palette = toPaletteFromLospec(
      { name: 'PICO-8', author: '', colors: ['000000', '1D2B53', 'FFF1E8'] },
      'pico-8'
    );
    expect(palette).toMatchObject({
      name: 'PICO-8',
      category: 'custom',
      colors: ['#000000', '#1D2B53', '#FFF1E8'],
    });
  });

  it('이미 #가 붙은 색상은 그대로 둔다', () => {
    expect(toPaletteFromLospec({ name: 'x', colors: ['#ff0000'] }, 'x')!.colors).toEqual(['#ff0000']);
  });

  it('유효하지 않은 색상은 걸러낸다', () => {
    const palette = toPaletteFromLospec({ name: 'x', colors: ['000000', 'not-a-color', 12345] }, 'x');
    expect(palette!.colors).toEqual(['#000000']);
  });

  it('유효한 색상이 하나도 없으면 null을 반환한다', () => {
    expect(toPaletteFromLospec({ name: 'x', colors: ['zzz'] }, 'x')).toBeNull();
    expect(toPaletteFromLospec({ name: 'x', colors: [] }, 'x')).toBeNull();
    expect(toPaletteFromLospec({}, 'x')).toBeNull();
  });

  it('이름이 비어 있으면 슬러그를 이름으로 쓴다', () => {
    expect(toPaletteFromLospec({ name: '   ', colors: ['000000'] }, 'my-slug')!.name).toBe('my-slug');
    expect(toPaletteFromLospec({ colors: ['000000'] }, 'my-slug')!.name).toBe('my-slug');
  });
});
