import { describe, it, expect } from '@jest/globals';
import { normalizeSkillName } from '../../utils/skill-utils.js';

describe('normalizeSkillName', () => {
  it('should lowercase and trim the name', () => {
    expect(normalizeSkillName('  React  ')).toBe('react');
    expect(normalizeSkillName('Node.JS')).toBe('node.js');
  });

  it('should collapse internal whitespace runs', () => {
    expect(normalizeSkillName('Node   JS')).toBe('node js');
    expect(normalizeSkillName('  C++   with   Qt  ')).toBe('c++ with qt');
  });

  it('should fold full-width unicode characters to ASCII', () => {
    expect(normalizeSkillName('Ｒｅａｃｔ')).toBe('react');
    expect(normalizeSkillName('ＴｙｐｅＳｃｒｉｐｔ')).toBe('typescript');
  });

  it('should treat visually-equivalent skill names as equal', () => {
    expect(normalizeSkillName('React')).toBe(normalizeSkillName(' react '));
    expect(normalizeSkillName('REACT')).toBe(normalizeSkillName('React'));
    expect(normalizeSkillName('Node  JS')).toBe(normalizeSkillName('Node JS'));
  });

  it('should strip zero-width and format characters', () => {
    expect(normalizeSkillName('R\u200beact')).toBe('react');
    expect(normalizeSkillName('R\u200cE\u200dACT')).toBe('react');
    expect(normalizeSkillName('\ufeffReact')).toBe('react');
    expect(normalizeSkillName('Type\u2060Script')).toBe('typescript');
  });

  it('should treat zero-width-padded names as equal to the clean name', () => {
    expect(normalizeSkillName('R\u200beact')).toBe(normalizeSkillName('React'));
    expect(normalizeSkillName('No\u200bde\u200c.js')).toBe(normalizeSkillName('Node.js'));
  });

  it('should handle empty and whitespace-only input', () => {
    expect(normalizeSkillName('')).toBe('');
    expect(normalizeSkillName('   ')).toBe('');
  });
});
