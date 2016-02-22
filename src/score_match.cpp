#include "score_match.h"

/**
 * This is mostly based on Greg Hurrell's implementation in
 * https://github.com/wincent/command-t/blob/master/ruby/command-t/match.c
 * with a few modifications and extra optimizations.
 */

#include <iostream>
#include <string>
#include <cstring>

using namespace std;

// Maximum allowed distance between two consecutive match characters.
constexpr size_t MAX_DISTANCE = 10;

// Bail if the state space exceeds this limit.
constexpr size_t MAX_MEMO_SIZE = 10000;

// Convenience structure for passing around during recursion.
struct MatchInfo {
  const char *haystack;
  const char *haystack_case;
  size_t haystack_len;
  const char *needle;
  size_t needle_len;
  int* last_match;
  double max_score_per_char;
  double *memo;
};

/**
 * This algorithm essentially looks for an optimal matching
 * from needle characters to matching haystack characters. We assign a score
 * to each character in the needle, and add up the scores in the end.
 *
 * The key insight is that we wish to reduce the distance between adjacent
 * matched characters in the haystack. Exact substring matches will receive
 * the highest score of any possible matching.
 *
 * The distance penalty is waived when the haystack character appears to be
 * the start of the word. This includes cases like:
 * - paths (a in /x/abc)
 * - hyphens/underscores (a in x-a or x_a)
 * - upper camelcase names (A in XyzAbc)
 *
 * See below for the exact cases and weights used.
 *
 * Computing the optimal matching is a relatively straight-forward
 * dynamic-programming problem, similar to the classic Levenshtein distance.
 * We use a memoized-recursive implementation, since the state space tends to
 * be relatively sparse in most practical use cases.
 */
double recursive_match(const MatchInfo &m, size_t haystack_idx,
                       size_t needle_idx) {
  if (needle_idx == m.needle_len) {
    return 0;
  }

  double &memoized = m.memo[needle_idx * m.needle_len + haystack_idx];
  if (memoized != -1) {
    return memoized;
  }

  double score = -1e9;
  char c = m.needle[needle_idx];

  size_t lim = m.last_match[needle_idx];
  if (needle_idx > 0 && haystack_idx + MAX_DISTANCE < lim) {
    lim = haystack_idx + MAX_DISTANCE;
  }

  for (size_t j = haystack_idx; j <= lim; j++) {
    char d = m.haystack_case[j];
    if (c == d) {
      // calculate score
      double score_for_char = m.max_score_per_char;
      double factor = 1.0;
      size_t distance = needle_idx ? j - haystack_idx + 1 : 0;

      if (distance > 1) {
        char last = m.haystack[j - 1];
        char curr = m.haystack[j]; // case matters, so get again
        if (last == '/') {
          factor = 0.9;
        } else if (last == '-' || last == '_' || last == ' ' ||
                   (last >= '0' && last <= '9')) {
          factor = 0.8;
        } else if (last >= 'a' && last <= 'z' && curr >= 'A' && curr <= 'Z') {
          factor = 0.8;
        } else if (last == '.') {
          factor = 0.7;
        } else {
          // if no "special" chars behind char, factor diminishes
          // as distance from last matched char increases
          factor = 0.75 / distance;
        }
      }

      double new_score =
          score_for_char * factor + recursive_match(m, j + 1, needle_idx + 1);
      if (new_score > score) {
        score = new_score;
      }
    }
  }

  return memoized = score;
}

double score_match(const char *haystack, const char *haystack_lower,
                   const char *needle, const MatchOptions &options) {
  if (!*needle) {
    // Not much we can do here - we'll end up with a random selection.
    return 1;
  }

  MatchInfo m;
  m.haystack_len = strlen(haystack);
  m.needle_len = strlen(needle);
  m.haystack_case = options.case_sensitive ? haystack : haystack_lower;

  int last_match[m.needle_len];
  m.last_match = last_match;

  // Check if the needle exists in the haystack at all.
  // Simultaneously, we can figure out the last possible match for each needle
  // character (which prunes the search space by a ton)
  int hindex = m.haystack_len - 1;
  for (int i = m.needle_len - 1; i >= 0; i--) {
    while (hindex >= 0 && m.haystack_case[hindex] != needle[i]) {
      hindex--;
    }
    if (hindex < 0) {
      return 0;
    }
    last_match[i] = hindex;
  }

  m.haystack = haystack;
  m.needle = needle;
  m.max_score_per_char = (1.0 / m.haystack_len + 1.0 / m.needle_len) / 2;

  size_t memo_size = m.haystack_len * m.needle_len;
  if (memo_size >= MAX_MEMO_SIZE) {
    // Use a reasonable estimate.
    return m.max_score_per_char * m.needle_len * 0.75 / 2;
  }

  double memo[memo_size];
  fill(memo, memo + memo_size, -1);
  m.memo = memo;
  return recursive_match(m, 0, 0);
}
