const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// @supabase/supabase-js's "exports" field pointed Metro's web bundle
// at a resolution path Metro couldn't follow, so package "exports" are off
// and Metro resolves by the main field. The web build is gone, but this
// stays: turning exports on would change how the iOS bundle resolves packages.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
