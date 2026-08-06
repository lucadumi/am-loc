const { withAppDelegate } = require("expo/config-plugins");

/**
 * Force the app (and therefore Apple Maps / MapKit) to always run in a fixed
 * language, regardless of the phone's system language.
 *
 * MapKit has no per-map language API; it renders labels in the app's active
 * localization. We pin that by writing `AppleLanguages` into UserDefaults at
 * launch, before any map view is created. Combine with the `CFBundleLocalizations`
 * / `CFBundleDevelopmentRegion` Info.plist keys (set in app.json) so the bundle
 * actually advertises the locale.
 *
 * @param {import('expo/config').ExportedConfig} config
 * @param {{ locale?: string }} [props]
 */
function withForcedLocale(config, { locale = "ro" } = {}) {
  return withAppDelegate(config, (cfg) => {
    const { language, contents } = cfg.modResults;
    if (contents.includes('forKey: "AppleLanguages"') || contents.includes('@"AppleLanguages"')) {
      return cfg; // already patched
    }

    const marker = "didFinishLaunchingWithOptions";
    const markerIdx = contents.indexOf(marker);
    if (markerIdx === -1) return cfg;

    if (language === "swift") {
      const braceIdx = contents.indexOf("{", contents.indexOf("-> Bool", markerIdx));
      if (braceIdx === -1) return cfg;
      const inject =
        `\n    UserDefaults.standard.set(["${locale}"], forKey: "AppleLanguages")` +
        `\n    UserDefaults.standard.synchronize()`;
      cfg.modResults.contents =
        contents.slice(0, braceIdx + 1) + inject + contents.slice(braceIdx + 1);
      return cfg;
    }

    // Objective-C fallback (older templates).
    const braceIdx = contents.indexOf("{", markerIdx);
    if (braceIdx === -1) return cfg;
    const inject =
      `\n  [[NSUserDefaults standardUserDefaults] setObject:@[@"${locale}"] forKey:@"AppleLanguages"];` +
      `\n  [[NSUserDefaults standardUserDefaults] synchronize];`;
    cfg.modResults.contents =
      contents.slice(0, braceIdx + 1) + inject + contents.slice(braceIdx + 1);
    return cfg;
  });
}

module.exports = withForcedLocale;
