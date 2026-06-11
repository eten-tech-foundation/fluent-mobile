const { withMainActivity, CodeGenerator } = require('@expo/config-plugins');

const FRAGMENT_FACTORY_IMPORT =
  'import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory';

const withRNScreensFragmentFactory = config =>
  withMainActivity(config, config => {
    let contents = config.modResults.contents;

    if (!contents.includes(FRAGMENT_FACTORY_IMPORT)) {
      contents = CodeGenerator.mergeContents({
        tag: 'rn-screens-fragment-factory-import',
        src: contents,
        newSrc: FRAGMENT_FACTORY_IMPORT,
        anchor: /^import .+/m,
        offset: 1,
        comment: '//',
      }).contents;
    }

    if (!contents.includes('RNScreensFragmentFactory()')) {
      contents = CodeGenerator.mergeContents({
        tag: 'rn-screens-fragment-factory-init',
        src: contents,
        newSrc: '    supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()',
        anchor: /override fun onCreate\(savedInstanceState: Bundle\?\)/,
        offset: 1,
        comment: '//',
      }).contents;
    }

    config.modResults.contents = contents;
    return config;
  });

module.exports = withRNScreensFragmentFactory;
