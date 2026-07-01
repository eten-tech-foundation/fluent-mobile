const { withMainActivity, CodeGenerator } = require('@expo/config-plugins');

const PLUGIN = 'withRNScreensFragmentFactory';
const FRAGMENT_FACTORY_IMPORT =
  'import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory';
const IMPORT_ANCHOR = /^import .+/m;
const ON_CREATE_ANCHOR =
  /override fun onCreate\(savedInstanceState: Bundle\?\)/;

function mergeOrAppend({
  tag,
  src,
  newSrc,
  anchor,
  offset,
  fallback,
  requireAnchor = false,
}) {
  if (!anchor.test(src)) {
    if (requireAnchor) {
      throw new Error(
        `${PLUGIN}: anchor ${anchor} not found; cannot insert ${tag}`,
      );
    }
    console.warn(
      `${PLUGIN}: anchor ${anchor} not found; appending fallback for ${tag}`,
    );
    return `${src.trimEnd()}\n${fallback}\n`;
  }

  try {
    return CodeGenerator.mergeContents({
      tag,
      src,
      newSrc,
      anchor,
      offset,
      comment: '//',
    }).contents;
  } catch (error) {
    throw new Error(
      `${PLUGIN}: failed to merge ${tag} (${error.message ?? error})`,
    );
  }
}

const withRNScreensFragmentFactory = config =>
  withMainActivity(config, config => {
    let contents = config.modResults.contents;

    if (!contents.includes(FRAGMENT_FACTORY_IMPORT)) {
      contents = mergeOrAppend({
        tag: 'rn-screens-fragment-factory-import',
        src: contents,
        newSrc: FRAGMENT_FACTORY_IMPORT,
        anchor: IMPORT_ANCHOR,
        offset: 1,
        fallback: FRAGMENT_FACTORY_IMPORT,
      });
    }

    if (!contents.includes('RNScreensFragmentFactory()')) {
      contents = mergeOrAppend({
        tag: 'rn-screens-fragment-factory-init',
        src: contents,
        newSrc:
          '    supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()',
        anchor: ON_CREATE_ANCHOR,
        offset: 1,
        requireAnchor: true,
      });
    }

    config.modResults.contents = contents;
    return config;
  });

module.exports = withRNScreensFragmentFactory;
