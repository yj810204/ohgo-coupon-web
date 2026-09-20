const { withMainActivity } = require('@expo/config-plugins');

/** 시스템 글자 크기(접근성)를 앱에 적용하지 않음 */
function withDisableFontScaling(config) {
  return withMainActivity(config, (mod) => {
    let src = mod.modResults.contents;
    if (src.includes('ohgoDisableFontScaling') || src.includes('config.fontScale = 1')) {
      return mod;
    }

    if (mod.modResults.language === 'kt') {
      if (!src.includes('import android.content.Context')) {
        src = src.replace(
          /package [^\n]+\n/,
          (line) => `${line}import android.content.Context\n`,
        );
      }
      if (!src.includes('import android.content.res.Configuration')) {
        src = src.replace(
          /package [^\n]+\n/,
          (line) => `${line}import android.content.res.Configuration\n`,
        );
      }
      if (!src.includes('override fun attachBaseContext')) {
        src = src.replace(
          /class MainActivity[^{]*\{/,
          (block) => `${block}
  override fun attachBaseContext(newBase: Context) {
    val config = Configuration(newBase.resources.configuration)
    config.fontScale = 1f
    super.attachBaseContext(newBase.createConfigurationContext(config))
  }
`,
        );
      }
    }

    mod.modResults.contents = src;
    return mod;
  });
}

module.exports = withDisableFontScaling;
