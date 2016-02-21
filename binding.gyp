{
  'targets': [
    {
      'target_name': 'fuzzy-native',
      'include_dirs': [ '<!(node -e "require(\'nan\')")' ],
      'cflags': [
        '-std=c++14',
        '-O3',
      ],
      'xcode_settings': {
        'OTHER_CPLUSPLUSFLAGS': [
          '-std=c++14',
          '-O3',
          '-stdlib=libc++',
        ],
        'MACOSX_DEPLOYMENT_TARGET': '10.7',
      },
      'sources': [
        'src/binding.cpp',
        'src/score_match.cpp',
        'src/MatcherBase.cpp',
      ],
    },
    {
      'target_name': 'action_after_build',
      'type': 'none',
      'dependencies': [ '<(module_name)' ],
      'copies': [
        {
          'files': [ '<(PRODUCT_DIR)/<(module_name).node' ],
          'destination': '<(module_path)'
        }
      ]
    }
  ]
}
