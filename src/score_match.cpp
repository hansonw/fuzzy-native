#include "score_match.h"

/**
 * This is mostly based on Greg Hurrell's implementation in
 * https://github.com/wincent/command-t/blob/master/ruby/command-t/match.c
 * with a few modifications and extra optimizations.
 */

#include <string>
#include <cstring>

using namespace std;

// Initial multiplier when a gap is used.
const float BASE_DISTANCE_PENALTY = 0.6;

// penalty = BASE_DISTANCE_PENALTY - (dist - 1) * ADDITIONAL_DISTANCE_PENALTY.
const float ADDITIONAL_DISTANCE_PENALTY = 0.05;

// The lowest the distance penalty can go. Add epsilon for precision errors.
const float MIN_DISTANCE_PENALTY = 0.2 + 1e-9;

// Bail if the state space exceeds this limit.
const size_t MAX_MEMO_SIZE = 10000;

// Convenience structure for passing around during recursion.
struct MatchInfo {
  const char *haystack;
  const char *haystack_case;
  size_t haystack_len;
  const char *needle;
  const char *needle_case;
  size_t needle_len;
  int* last_match;
  float *memo;
  size_t *best_match;
  bool smart_case;
  size_t max_gap;
};

/**
 * This algorithm essentially looks for an optimal matching
 * from needle characters to matching haystack characters. We assign a multiplier
 * to each character in the needle, and multiply the scores together in the end.
 *
 * The key insight is that we wish to reduce the distance between adjacent
 * matched characters in the haystack. Exact substring matches will receive a score
 * of 1, while gaps incur significant multiplicative penalties.
 *
 * We reduce the penalty for word boundaries. This includes:
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
float recursive_match(const MatchInfo &m,
                      const size_t haystack_idx,
                      const size_t needle_idx) {
  if (needle_idx == m.needle_len) {
    return 1;
  }

  float &memoized = m.memo[needle_idx * m.haystack_len + haystack_idx];
  if (memoized != -1) {
    return memoized;
  }

  float score = 0;
  size_t best_match = 0;
  char c = m.needle_case[needle_idx];

  size_t lim = m.last_match[needle_idx];
  if (needle_idx > 0 && m.max_gap && haystack_idx + m.max_gap < lim) {
    lim = haystack_idx + m.max_gap;
  }

  // This is only used when needle_idx == haystack_idx == 0.
  // It won't be accurate for any other run.
  size_t last_slash = 0;
  float dist_penalty = BASE_DISTANCE_PENALTY;
  for (size_t j = haystack_idx; j <= lim; j++) {
    char d = m.haystack_case[j];
    if (needle_idx == 0 && (d == '/' || d == '\\')) {
      last_slash = j;
    }
    if (c == d) {
      // calculate score
      float char_score = 1.0;
      if (j > haystack_idx) {
        char last = m.haystack[j - 1];
        char curr = m.haystack[j]; // case matters, so get again
        if (last == '/') {
          char_score = 0.9;
        } else if (last == '-' || last == '_' || last == ' ' ||
                   (last >= '0' && last <= '9')) {
          char_score = 0.8;
        } else if (last >= 'a' && last <= 'z' && curr >= 'A' && curr <= 'Z') {
          char_score = 0.8;
        } else if (last == '.') {
          char_score = 0.7;
        } else {
          char_score = dist_penalty;
        }
        // For the first character, disregard the actual distance.
        if (needle_idx && dist_penalty > MIN_DISTANCE_PENALTY) {
          dist_penalty -= ADDITIONAL_DISTANCE_PENALTY;
        }
      }

      if (m.smart_case && m.needle[needle_idx] != m.haystack[j]) {
        char_score *= 0.9;
      }

      float new_score = char_score * recursive_match(m, j + 1, needle_idx + 1);
      // Scale the score based on how much of the path was actually used.
      // (We measure this via # of characters since the last slash.)
      if (needle_idx == 0) {
        new_score /= float(m.haystack_len - last_slash);
      }
      if (new_score > score) {
        score = new_score;
        best_match = j;
        // Optimization: can't score better than 1.
        if (new_score == 1) {
          break;
        }
      }
    }
  }

  if (m.best_match != nullptr) {
    m.best_match[needle_idx * m.haystack_len + haystack_idx] = best_match;
  }
  return memoized = score;
}

float score_match(const char *haystack,
                  const char *haystack_lower,
                  const char *needle,
                  const char *needle_lower,
                  const MatchOptions &options,
                  vector<int> *match_indexes) {
  if (!*needle) {
    return 1.0;
  }

  MatchInfo m;
  m.haystack_len = strlen(haystack);
  m.needle_len = strlen(needle);
  m.haystack_case = options.case_sensitive ? haystack : haystack_lower;
  m.needle_case = options.case_sensitive ? needle : needle_lower;
  m.smart_case = options.smart_case;
  m.max_gap = options.max_gap;

#ifdef _WIN32
  int *last_match = (int*)_malloca(m.needle_len * sizeof(int));
#else
  int last_match[m.needle_len];
#endif
  m.last_match = last_match;

  // Check if the needle exists in the haystack at all.
  // Simultaneously, we can figure out the last possible match for each needle
  // character (which prunes the search space by a ton)
  int hindex = m.haystack_len - 1;
  for (int i = m.needle_len - 1; i >= 0; i--) {
    while (hindex >= 0 && m.haystack_case[hindex] != m.needle_case[i]) {
      hindex--;
    }
    if (hindex < 0) {
      return 0;
    }
    last_match[i] = hindex--;
  }

  m.haystack = haystack;
  m.needle = needle;

  size_t memo_size = m.haystack_len * m.needle_len;
  if (memo_size >= MAX_MEMO_SIZE) {
    // Just return the initial match.
    float penalty = 1.0;
    if (match_indexes != nullptr) {
      match_indexes->resize(m.needle_len);
      for (size_t i = 0; i < m.needle_len; i++) {
        match_indexes->at(i) = last_match[i];
        if (i && last_match[i] != last_match[i - 1] + 1) {
          penalty *= BASE_DISTANCE_PENALTY;
        }
      }
    }
    return penalty * m.needle_len / m.haystack_len;
  }

  if (match_indexes != nullptr) {
    m.best_match = new size_t[memo_size];
  } else {
    m.best_match = nullptr;
  }

#ifdef _WIN32
  float *memo = (float*)_malloca(memo_size * sizeof(float));
#else
  float memo[memo_size];
#endif
  fill(memo, memo + memo_size, -1);
  m.memo = memo;

  // Since we scaled by the length of haystack used,
  // scale it back up by the needle length.
  float score = m.needle_len * recursive_match(m, 0, 0);
  if (score <= 0) {
    return 0.0;
  }

  if (match_indexes != nullptr) {
    match_indexes->resize(m.needle_len);
    size_t curr_start = 0;
    for (size_t i = 0; i < m.needle_len; i++) {
      match_indexes->at(i) = m.best_match[i * m.haystack_len + curr_start];
      curr_start = match_indexes->at(i) + 1;
    }
    delete[] m.best_match;
  }

  return score;
}
