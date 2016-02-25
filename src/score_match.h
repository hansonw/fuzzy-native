#pragma once

#include <vector>

struct MatchOptions {
  bool case_sensitive;
};

/**
 * Returns a matching score between 0-1.
 * 0 represents no match at all, while 1 is a perfect match.
 * See implementation for scoring details.
 *
 * If options.case_sensitive is true:
 * - haystack_lower must be provided
 * - needle must be lowercased.
 *
 * If match_indexes is non-null, the optimal match index in haystack
 * will be computed for each value in needle.
 */
double score_match(const char *haystack, const char *haystack_lower,
                   const char *needle, const MatchOptions &options,
                   std::vector<int> *match_indexes = nullptr);
