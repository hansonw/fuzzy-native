'use strict';

var fuzzyNative = require('../lib/main');

function values(results) {
  return results.map(function(x) {
    return x.value;
  });
}

describe('fuzzy-native', function() {
  var matcher;
  beforeEach(function() {
    matcher = new fuzzyNative.Matcher([
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
    ]);
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
    result = matcher.match('ABC');
    expect(values(result)).toEqual([
      'abC',
      'abcd',
      'AlphaBetaCappa',
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
    var result = matcher.match('ThisIsATestDir');
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
    matcher.setCandidates([
      'testa',
      'testA',
      'tes/A',
    ]);
    var result = matcher.match('a');
    expect(values(result)).toEqual([
      'tes/A',
      'testA',
      'testa',
    ]);
  });

  it('breaks ties by length', function() {
    matcher.setCandidates(['123/a', '12/a', '1/a']);
    var result = matcher.match('a');
    expect(values(result)).toEqual(['1/a', '12/a', '123/a']);
  });

  it('can limit to maxResults', function() {
    var result = matcher.match('abc', {maxResults: 1});
    expect(values(result)).toEqual([
      'abC',
    ]);

    result = matcher.match('ABC', {maxResults: 2});
    expect(values(result)).toEqual([
      'abC',
      'abcd',
    ]);
  });

  it('can return matchIndexes', function() {
    var result = matcher.match('abc', {recordMatchIndexes: true});
    expect(result[0].matchIndexes).toEqual([0, 1, 2]);
    expect(result[1].matchIndexes).toEqual([0, 1, 2]);
    // alphabetacappa
    // _    _   _
    expect(result[2].matchIndexes).toEqual([0, 5, 9]);
    expect(result[3].matchIndexes).toEqual([0, 5, 9]);

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

    matcher.setCandidates([]);
    result = matcher.match('abc');
    expect(values(result)).toEqual([]);

    matcher.addCandidates(['abc', 'def']);
    result = matcher.match('abc');
    expect(values(result)).toEqual(['abc']);

    matcher.removeCandidates(['abc']);
    result = matcher.match('');
    expect(values(result)).toEqual(['def']);
  });

  it('supports large strings', function() {
    var longString = '';
    var indexes = [];
    for (var i = 0; i < 1000; i++) {
      longString += 'a';
      indexes.push(i);
    }
    matcher.addCandidates([longString]);
    expect(matcher.match(longString, {recordMatchIndexes: true})).toEqual([{
      score: 1,
      value: longString,
      matchIndexes: indexes,
    }]);
  });
});
