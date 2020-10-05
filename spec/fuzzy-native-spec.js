'use strict';

var fuzzyNative = require('../lib/main');

function values(results) {
  return results.map(function(x) {
    return x.value;
  });
}

function genIds(values) {
  return [Array.from({length: values.length}, (_, i) => i), values];
}

describe('fuzzy-native', function() {
  var matcher;
  beforeEach(function() {
    const paths = [
      '',
      'a',
      'ab',
      'abC',
      'abcd',
      'alphabetacappa',
      'AlphaBetaCappa',
      'thisisatestdir',
      '/////ThisIsATestDir',
      '/this/is/a/test/dir',
      '/test/tiatd',
      '/zzz/path2/path3/path4',
      '/path1/zzz/path3/path4',
      '/path1/path2/zzz/path4',
      '/path1/path2/path3/zzz',
    ];

    matcher = new fuzzyNative.Matcher(...genIds(paths));
  });

  it('can match strings', function() {
    var result = matcher.match('abc');
    expect(values(result)).toEqual([
      'abC',
      'abcd',
      'AlphaBetaCappa',
      'alphabetacappa',
    ]);

    result = matcher.match('t/i/a/t/d');
    expect(values(result)).toEqual([
      '/this/is/a/test/dir',
    ]);

    // Make sure we prefer exact matches > abbreviations > others.
    result = matcher.match('tiatd');
    expect(values(result)).toEqual([
      '/test/tiatd',
      '/this/is/a/test/dir',
      '/////ThisIsATestDir',
      'thisisatestdir',
    ]);

    // Defaults to case-insensitive matching (favouring the right case).
    result = matcher.match('ABC', {smartCase: true});
    expect(values(result)).toEqual([
      'AlphaBetaCappa',
      'abC',
      'abcd',
      'alphabetacappa',
    ]);

    // Spaces should be ignored.
    result = matcher.match('a b\tcappa');
    expect(values(result)).toEqual([
      'AlphaBetaCappa',
      'alphabetacappa',
    ]);

    // There was a bug where this would result in a match.
    result = matcher.match('abcc');
    expect(result).toEqual([]);
  });

  it('can do a case-sensitive search', function() {
    var result = matcher.match('abc', {caseSensitive: true});
    expect(values(result)).toEqual([
      'abcd',
      'alphabetacappa',
    ]);

    result = matcher.match('C', {caseSensitive: true});
    expect(values(result)).toEqual([
      'abC',
      'AlphaBetaCappa',
    ]);
  });

  it('uses smart case', function() {
    var result = matcher.match('ThisIsATestDir', {smartCase: true});
    expect(values(result)).toEqual([
      '/////ThisIsATestDir',
      'thisisatestdir',
      '/this/is/a/test/dir',
    ]);
  });

  it('respects maxGap', function() {
    var result = matcher.match('abc', {maxGap: 1});
    expect(values(result)).toEqual([
      'abC',
      'abcd',
    ]);
  });

  it('favours shallow matches', function() {
    var result = matcher.match('zzz', {caseSensitive: true});
    expect(values(result)).toEqual([
      '/path1/path2/path3/zzz',
      '/path1/path2/zzz/path4',
      '/path1/zzz/path3/path4',
      '/zzz/path2/path3/path4',
    ]);
  });

  it('prefers whole words', function() {
    matcher.setCandidates(...genIds([
      'testa',
      'testA',
      'tes/A',
    ]));
    var result = matcher.match('a');
    expect(values(result)).toEqual([
      'tes/A',
      'testA',
      'testa',
    ]);
  });

  it('breaks ties by length if root folder is not passed', function() {
    matcher.setCandidates(...genIds(['123/a', '12/a', '1/a']));
    var result = matcher.match('a');
    expect(values(result)).toEqual(['1/a', '12/a', '123/a']);
  });

  it('breaks ties by distance to root folder', function() {
    matcher.setCandidates(...genIds([
      '/A/B/C/file.js',
      '/A/B/file.js',
      '/A/C/D/file.js',
      '/A/REALLY_BIG_NAME/file.js',
      '/A/file.js',
    ]));
    var result = matcher.match('file', {rootPath: '/A/B/C/'});
    expect(values(result)).toEqual([
      '/A/B/C/file.js',
      '/A/B/file.js',
      '/A/file.js',
      '/A/REALLY_BIG_NAME/file.js',
      '/A/C/D/file.js',
    ]);
  });

  it('can limit to maxResults', function() {
    var result = matcher.match('abc', {maxResults: 1});
    expect(values(result)).toEqual([
      'abC',
    ]);

    result = matcher.match('ABC', {maxResults: 2, smartCase: true});
    expect(values(result)).toEqual([
      'AlphaBetaCappa',
      'abC',
    ]);
  });

  it('can return matchIndexes', function() {
    var result = matcher.match('abc', {recordMatchIndexes: true});
    expect(result[0].matchIndexes).toEqual([0, 1, 2]);
    expect(result[1].matchIndexes).toEqual([0, 1, 2]);
    // alphabetacappa
    // _    _   _
    expect(result[2].matchIndexes).toEqual([0, 5, 9]);
    expect(result[3].matchIndexes).toEqual([4, 5, 9]);

    result = matcher.match('t/i/a/t/d', {recordMatchIndexes: true});
    // /this/is/a/test/dir',
    //  _   __ ____   __
    expect(result[0].matchIndexes).toEqual([1, 5, 6, 8, 9, 10, 11, 15, 16]);
  });

  it('supports modification', function() {
    var result = matcher.match('abc', {maxResults: 1});
    expect(values(result)).toEqual([
      'abC',
    ]);

    matcher.setCandidates([], []);
    result = matcher.match('abc');
    expect(values(result)).toEqual([]);

    matcher.addCandidates([0, 1], ['abc', 'def']);
    result = matcher.match('abc');
    expect(values(result)).toEqual(['abc']);

    matcher.removeCandidates([0]);
    result = matcher.match('');
    expect(values(result)).toEqual(['def']);
  });

  it('applies a variable gap penalty', function() {
    const CANDIDATE = 'abcdefghijk/test'
    matcher.setCandidates([0], [CANDIDATE]);
    // Gap penalty caps out at 0.2.
    let query = 'a/test';
    expect(matcher.match(query)[0].score)
      .toBeCloseTo(0.20 * query.length / CANDIDATE.length);
    query = 'ab/test';
    expect(matcher.match(query)[0].score)
      .toBeCloseTo(0.20 * query.length / CANDIDATE.length);
    // And then decreases by 0.05.
    query = 'abc/test';
    expect(matcher.match(query)[0].score)
      .toBeCloseTo(0.25 * query.length / CANDIDATE.length);
    query = 'abcdefghij/test';
    expect(matcher.match(query)[0].score)
      .toBeCloseTo(0.6 * query.length / CANDIDATE.length);
    query = 'abcdefghijk/test';
    expect(matcher.match(query)[0].score)
      .toBe(1);
  });

  it('supports large strings', function() {
    var longString = '';
    var indexes = [];
    for (var i = 0; i < 500; i++) {
      longString += 'ab';
      indexes.push(i * 2, i * 2 + 1);
    }
    matcher.setCandidates([0], [longString]);
    expect(matcher.match(longString, {recordMatchIndexes: true})).toEqual([{
      score: 1,
      id: 0,
      value: longString,
      matchIndexes: indexes,
    }]);

    // Despite exceeding the scoring threshold, make sure penalties are applied.
    const matches = matcher.match('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(matches.length).toBe(1);
    expect(matches[0].score).toBeLessThan(1e-6);
  });

  it('works with non-alpha characters', function() {
    matcher.setCandidates([0, 1], ['-_01234', '01234-']);
    expect(values(matcher.match('-034'))).toEqual(['-_01234']);
  });

  it('ensures that the ids array and the values array are the same length when adding candidates', () => {
    const expectedMessage = 'Expected ids array and values array to have the same length';
    expect(() => matcher.addCandidates([1, 2, 3], ["a", "b"])).toThrow(expectedMessage)
    expect(() => matcher.addCandidates([1, 2], ["a", "b", "c"])).toThrow(expectedMessage)
  });

  it('returns match results for duplicate values with different ids', () => {
    matcher.setCandidates([0, 1], ['abc', 'abc']);
    expect(matcher.match('ac').length).toBe(2);
    matcher.setCandidates([0, 0], ['abc', 'abc']);
    expect(matcher.match('ac').length).toBe(1);
  });

  it('returns matches when using different path separators', () => {
    expect(
      values(matcher.match('path1_path2_path3_zzz', {caseSensitive: true}))
    ).toEqual([
      '/path1/path2/path3/zzz',
    ]);
    expect(
      values(matcher.match('path1_path2_path3_zzz', {caseSensitive: false}))
    ).toEqual([
      '/path1/path2/path3/zzz',
    ]);

    expect(
      values(matcher.match('\\path1\\path2\\path3\\zzz', {caseSensitive: true}))
    ).toEqual([
      '/path1/path2/path3/zzz',
    ]);
    expect(
      values(matcher.match('\\path1\\path2\\path3\\zzz', {caseSensitive: false}))
    ).toEqual([
      '/path1/path2/path3/zzz',
    ]);
  });

  it('returns exact matches than normalized path separator matches', () => {
    matcher.setCandidates(
      [0, 1, 2],
      ['/path1/path2/path3/zzz', '/path1/path2/path3/zzz_ooo', '/path1/path2/path3/zzz/ooo']
    );

    expect(
      values(matcher.match('path1/path2/path3/zzz', {caseSensitive: true}))
    ).toEqual([
      '/path1/path2/path3/zzz',
      '/path1/path2/path3/zzz/ooo',
      '/path1/path2/path3/zzz_ooo'
    ]);
    expect(
      values(matcher.match('zzz_ooo', {caseSensitive: true}))
    ).toEqual([
      '/path1/path2/path3/zzz_ooo',
      '/path1/path2/path3/zzz/ooo'
    ]);
    expect(
      values(matcher.match('path1/path2/path3/zzz_ooo', {caseSensitive: true}))
    ).toEqual([
      '/path1/path2/path3/zzz_ooo',
      '/path1/path2/path3/zzz/ooo'
    ]);
    expect(
      values(matcher.match('path1/path2/path3/zzz_ooo', {caseSensitive: true}))
    ).toEqual([
      '/path1/path2/path3/zzz_ooo',
      '/path1/path2/path3/zzz/ooo'
    ]);
    expect(
      values(matcher.match('path1_path2_path3_zzz_ooo', {caseSensitive: true}))
    ).toEqual([
      '/path1/path2/path3/zzz_ooo',
      '/path1/path2/path3/zzz/ooo'
    ]);
    expect(
      values(matcher.match('path1/path2_path3/zzz_ooo', {caseSensitive: false}))
    ).toEqual([
      '/path1/path2/path3/zzz_ooo',
      '/path1/path2/path3/zzz/ooo'
    ]);
    expect(
      values(matcher.match('zzz/ooo', {caseSensitive: false}))
    ).toEqual([
      '/path1/path2/path3/zzz/ooo'
    ]);
  });
});
