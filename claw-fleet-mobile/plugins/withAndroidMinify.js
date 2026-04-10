const { withGradleProperties } = require("expo/config-plugins");

module.exports = function withAndroidMinify(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;

    const entries = [
      { key: "android.enableMinifyInReleaseBuilds", value: "true" },
      { key: "android.enableShrinkResourcesInReleaseBuilds", value: "true" },
    ];

    for (const entry of entries) {
      const existing = props.find(
        (p) => p.type === "property" && p.key === entry.key
      );
      if (existing) {
        existing.value = entry.value;
      } else {
        props.push({ type: "property", ...entry });
      }
    }

    return config;
  });
};
