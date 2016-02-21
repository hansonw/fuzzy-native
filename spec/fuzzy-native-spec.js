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

    // Defaults to case-insensitive matching.
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

  it('can limit to maxResults', function() {
    var result = matcher.match('abc', {maxResults: 1});
    expect(values(result)).toEqual([
      'abC',
    ]);

    // Test with multiple threads too.
    result = matcher.match('ABC', {maxResults: 2, numThreads: 4});
    expect(values(result)).toEqual([
      'abC',
      'abcd',
    ]);
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
});
