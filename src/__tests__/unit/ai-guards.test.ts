import { describe, it, expect } from '@jest/globals';
import {
  canonicalizeSkills,
  capText,
  containsNonEnglishScript,
  escapeRegExp,
  findNonEnglishFields,
  normalizeSkillKey,
  sharesSkillWord,
  stripReasoning,
} from '../../services/ai-guards.js';

describe('ai-guards', () => {
  describe('containsNonEnglishScript', () => {
    it.each([
      ['Chinese', '我们需要一个开发人员'],
      ['Japanese kana', 'エンジニア'],
      ['Korean', '개발자'],
      ['Cyrillic', 'разработчик'],
      ['Thai', 'นักพัฒนา'],
      ['Arabic', 'مطور'],
      ['a single CJK character in English', 'Great React skills 好'],
    ])('flags %s', (_label, text) => {
      expect(containsNonEnglishScript(text)).toBe(true);
    });

    it.each([
      ['English', 'Senior React developer with 5 years of experience.'],
      ['Filipino / Taglish', 'Kailangan namin ng Python developer na marunong sa Django.'],
      ['accented Latin', 'Café résumé naïve'],
      ['symbols, digits and emoji', 'C++ / C# — $2,500 USDC 🚀 100%'],
      ['empty', ''],
    ])('allows %s', (_label, text) => {
      expect(containsNonEnglishScript(text)).toBe(false);
    });
  });

  describe('findNonEnglishFields', () => {
    it('returns the path of every offending string, including nested ones', () => {
      expect(findNonEnglishFields({
        reasoning: '这是理由',
        recommendedSkills: ['React', '区块链'],
        marketDemand: [{ skillName: 'Go', demandLevel: 'high' }],
        score: 10,
        nothing: null,
      })).toEqual(['reasoning', 'recommendedSkills[1]']);
    });

    it('handles top-level strings and clean values', () => {
      expect(findNonEnglishFields('Привет')).toEqual(['(root)']);
      expect(findNonEnglishFields({ ok: true, list: ['a'] })).toEqual([]);
    });
  });

  describe('stripReasoning', () => {
    it('removes closed and unclosed think blocks', () => {
      expect(stripReasoning('<think>plan it</think>\n{"a":1}')).toBe('{"a":1}');
      expect(stripReasoning('<THINK>one</THINK>{"a":1}<think>two</think>')).toBe('{"a":1}');
      expect(stripReasoning('{"a":1}\n<think>cut off mid-thought')).toBe('{"a":1}');
      expect(stripReasoning('  {"a":1}  ')).toBe('{"a":1}');
    });
  });

  describe('normalizeSkillKey', () => {
    it('collapses spelling variants of the same skill', () => {
      expect(normalizeSkillKey('React.js')).toBe(normalizeSkillKey('React'));
      expect(normalizeSkillKey('ReactJS')).toBe(normalizeSkillKey('react'));
      expect(normalizeSkillKey('nodejs')).toBe(normalizeSkillKey('Node.js'));
      expect(normalizeSkillKey('UI / UX  Design')).toBe(normalizeSkillKey('UI/UX Design'));
      expect(normalizeSkillKey('Tailwind-CSS')).toBe(normalizeSkillKey('Tailwind CSS'));
    });

    it('keeps distinct technologies distinct', () => {
      expect(normalizeSkillKey('Java')).not.toBe(normalizeSkillKey('JavaScript'));
      expect(normalizeSkillKey('C')).not.toBe(normalizeSkillKey('C++'));
      expect(normalizeSkillKey('C++')).not.toBe(normalizeSkillKey('C#'));
      expect(normalizeSkillKey('Go')).not.toBe(normalizeSkillKey('Google Cloud'));
    });
  });

  describe('sharesSkillWord', () => {
    it.each([
      ['Tailwind', 'Tailwind CSS'],
      ['UI/UX Design', 'UI Design'],
      ['Smart Contract Auditing', 'Smart Contract Security'],
      ['React Native', 'React'],
    ])('links %s and %s', (a, b) => {
      expect(sharesSkillWord(a, b)).toBe(true);
    });

    it.each([
      ['Java', 'JavaScript'],
      ['C', 'C++'],
      ['C++', 'C#'],
      ['Node.js', 'React.js'],
      ['CSS', 'Tailwind CSS'],
      ['UI Design', 'Graphic Design'],
      ['Next.js', 'React'],
    ])('does not link %s and %s', (a, b) => {
      expect(sharesSkillWord(a, b)).toBe(false);
    });
  });

  describe('canonicalizeSkills', () => {
    const taxonomy = [
      { skillId: 's1', skillName: 'React' },
      { skillId: 's2', skillName: 'Node.js' },
      { skillId: 's3', skillName: 'JavaScript' },
      { skillId: 's4', skillName: 'C++' },
    ];

    it('maps known names to the taxonomy entry and reports unknown ones', () => {
      const result = canonicalizeSkills(
        ['react.js', 'NodeJS', 'Java', 'Kubernetes', 'c++', 'React'],
        taxonomy,
      );
      expect(result.known).toEqual([taxonomy[0], taxonomy[1], taxonomy[3]]);
      expect(result.unknown).toEqual(['Java', 'Kubernetes']);
    });

    it('ignores non-string and blank entries', () => {
      expect(canonicalizeSkills([null, 42, '  ', undefined], taxonomy)).toEqual({ known: [], unknown: [] });
    });

    it('keeps the first taxonomy entry when two normalize to the same key', () => {
      const result = canonicalizeSkills(['react'], [
        { skillId: 'a', skillName: 'React' },
        { skillId: 'b', skillName: 'ReactJS' },
        { skillId: 'c', skillName: '!!!' },
      ]);
      expect(result.known).toEqual([{ skillId: 'a', skillName: 'React' }]);
    });
  });

  describe('escapeRegExp / capText', () => {
    it('escapes regex metacharacters so skill names match literally', () => {
      expect(new RegExp(escapeRegExp('C++')).test('I write C++ daily')).toBe(true);
      expect(new RegExp(escapeRegExp('Node.js')).test('Nodexjs')).toBe(false);
    });

    it('trims only text over the limit', () => {
      expect(capText('abcdef', 3)).toBe('abc');
      expect(capText('abc', 3)).toBe('abc');
    });
  });
});
