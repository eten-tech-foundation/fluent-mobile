const {
  AndroidConfig,
  withAndroidStyles,
} = require('@expo/config-plugins');

/**
 * After BootSplash hands off to AppTheme, keep the Android window white so
 * Metro remounts / brief empty React roots don't flash brand-blue bootsplash.
 * Cold-start BootTheme still uses bootsplash_background (#0b50d0).
 */
function withAppWindowBackground(config) {
  return withAndroidStyles(config, config => {
    config.modResults = AndroidConfig.Styles.assignStylesValue(
      config.modResults,
      {
        add: true,
        parent: {
          name: 'AppTheme',
          parent: 'Theme.AppCompat.DayNight.NoActionBar',
        },
        name: 'android:windowBackground',
        // Explicit white — do not reuse bootsplash/splashscreen blue (#0b50d0).
        value: '@android:color/white',
      },
    );
    return config;
  });
}

module.exports = withAppWindowBackground;
