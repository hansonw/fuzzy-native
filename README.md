# fuzzy-native

[![Build Status](https://travis-ci.org/hansonw/fuzzy-native.svg?branch=master)](https://travis-ci.org/hansonw/fuzzy-native)

Fuzzy string matching library package for Node. Implemented natively in C++ for speed with support for multithreading.

The scoring algorithm is heavily tuned for file paths, but should work for general strings.

## API

(from [main.js.flow](lib/main.js.flow))

```
export type MatcherOptions = {
  // Default: false
  caseSensitive?: boolean,

  // Default: infinite
  maxResults?: number,

  // Maximum gap to allow between consecutive letters in a match.
  // Provide a smaller maxGap to speed up query results.
  // Default: unlimited
  maxGap?: number;

  // Default: 1
  numThreads?: number,

  // Default: false
  recordMatchIndexes?: boolean,
}

export type MatchResult = {
  value: string,

  // A number in the range (0-1]. Higher scores are more relevant.
  // 0 denotes "no match" and will never be returned.
  score: number,

  // Matching character index in `value` for each character in `query`.
  // This can be costly, so this is only returned if `recordMatchIndexes` was set in `options`.
  matchIndexes?: Array<number>,
}

export class Matcher {
  constructor(candidates: Array<string>) {}

  // Returns all matching candidates (subject to `options`).
  // Will be ordered by score, descending.
  match: (query: string, options?: MatcherOptions) => Array<MatchResult>;

  addCandidates: (candidates: Array<string>) => void;
  removeCandidates: (candidates: Array<string>) => void;
  setCandidates: (candidates: Array<string>) => void;
}
```

See also the [spec](spec/fuzzy-native-spec.js) for basic usage.

## Scoring algorithm

The scoring algorithm is mostly borrowed from @wincent's excellent [command-t](https://github.com/wincent/command-t) vim plugin; most of the code is from [his implementation in  match.c](https://github.com/wincent/command-t/blob/master/ruby/command-t/match.c).

Read [the source code](src/score_match.cpp) for a quick overview of how it works (the function `recursive_match`).

NB: [score_match.cpp](src/score_match.cpp) and [score_match.h](src/score_match.h) have no dependencies besides the C/C++ stdlib and can easily be reused for other purposes.

There are a few notable additional optimizations:

- Before running the recursive matcher, we first do a backwards scan through the haystack to see if the needle exists at all. At the same time, we compute the right-most match for each character in the needle to prune the search space.
- For each candidate string, we pre-compute and store a bitmask of its letters in `MatcherBase`. We then compare this the "letter bitmask" of the query to quickly prune out non-matches.

## How to keep this fork updated

This project is a fork of https://github.com/facebook-atom/nuclide-prebuilt-libs/tree/master/fuzzy-native. Since the upstream project is located in a subfolder of another git repository, some extra steps need to be done in order to rebase new commits to this fork.

This section describes the steps to follow each time we want to do that.

First, add a git remote that points to the upstream repository on your local copy of the fork:

```sh
$ git remote add nuclide-prebuilt-libs git@github.com:facebook-atom/nuclide-prebuilt-libs.git
# Fetch the commits but ignore the tags.
$ git fetch --no-tags nuclide-prebuilt-libs
```

Then, checkout the master branch of the upstream repository and execute a subtreee split, which is going to create a new branch called `upstream` with the contents and history of the `fuzzy-finder/` folder on the upstream repo:

```sh
$ git checkout nuclide-prebuilt-libs/master
# This is where the magic happens.
$ git subtree split --prefix=fuzzy-native -b upstream
# Delete the remote since we don't need it anymore.
git remote remove nuclide-prebuilt-libs
```

Next, we are going to create a `sync-upstream` branch which is going to contain the new commits from the upstream repo that we want to merge on our fork:

```sh
# Create the branch pointing to the upstream branch.
$ git checkout -b sync-upstream upstream
# Rebase all the new commits (descendants of the commit stored in .last-synced-commit) onto the master branch (this may lead to some conflicts).
$ git rebase --onto master $(cat .last-synced-commit) sync-upstream
```

Now we have on the `sync-upstream` branch all the new commits from the upstream repo since the last time we synced. We may want to discard some of these commits (for example the ones that modify files that handle building multiple projects, since they only make sense on the upstream repo):

```sh
# Delete the commits that make no sense using an interactive rebase.
git rebase -i master
```

Then we store on the `.last-synced-commit` file the last commit id that was synced. This is going to be used the next time we sync commits from the upstream repo:

```sh
$ git rev-parse upstream > .last-synced-commit
$ git add .last-synced-commit
$ git commit -m "Update reference to the last synced commit"
```

Finanlly, push the `sync-upstream` branch to our fork and send a PR!

```sh
git push origin sync-upstream
```

Clean up the local branches, since they are not needed anymore (they'll be recreated next time you want to sync):

```sh
$ git branch -D upstream sync-upstream
```
