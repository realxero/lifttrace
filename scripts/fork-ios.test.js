/**
 * Fork: the iOS app must never reach Android-only native plugins, and the
 * server must accept requests from it. These are wiring checks: a refactor
 * that switches one of these back to `isNative` breaks the iPhone app with a
 * "not implemented" error that no Android or browser test would catch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('platform.js tells Android and iOS apart', () => {
  const js = read('../src/lib/platform.js');
  assert.match(js, /export const isAndroid = isNative && Capacitor\.getPlatform\(\) === 'android';/);
  assert.match(js, /export const isIOS = isNative && Capacitor\.getPlatform\(\) === 'ios';/);
});

test('Android-only plugins are gated on isAndroid', () => {
  for (const f of ['native-player.js', 'stream-proxy.js', 'wear-pairing.js', 'fold.js']) {
    const js = read(`../src/lib/${f}`);
    assert.match(js, /import \{ isAndroid as isNative[ ,]/, `${f} must check isAndroid`);
  }
  assert.match(read('../src/stores/player.js'), /const isNative = isAndroid;/, 'radio uses web audio on iOS');
  assert.match(read('../src/components/UpdateBanner.svelte'), /isAndroid as isNative/, 'no APK banner on iOS');
  assert.match(read('../src/components/settings/SettingsUpdates.svelte'), /showApkPanel\s*=\s*isAndroid/);
  const updates = read('../src/lib/updates.js');
  assert.match(updates, /if \(!isAndroid\) throw new Error\('APK install only available in the Android app'\)/);
});

test('the server accepts the iOS app origin', () => {
  const js = read('../server/index.js');
  assert.match(js, /origin === 'capacitor:\/\/app\.lifttrace\.local'/);
  assert.match(js, /origin === 'capacitor:\/\/localhost'/);
});

test('the iOS app keeps radio playing and asks before using the camera and mic', () => {
  const plist = read('../ios/App/App/Info.plist');
  assert.match(plist, /<key>UIBackgroundModes<\/key>\s*<array>\s*<string>audio<\/string>/);
  for (const key of ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSFaceIDUsageDescription', 'NSPhotoLibraryUsageDescription']) {
    assert.match(plist, new RegExp(`<key>${key}</key>`), key);
  }
  assert.doesNotMatch(plist, /NutriTrace/);
  assert.match(read('../ios/App/App.xcodeproj/project.pbxproj'), /PRODUCT_BUNDLE_IDENTIFIER = io\.github\.lifttracefork\.app;/);
});

test('the fork version keeps upstream comparisons working', () => {
  const v = read('../src/lib/version.js');
  assert.match(v, /export const APP_VERSION = `\$\{UPSTREAM_VERSION\}\+\$\{FORK_VERSION\}`;/);
  assert.match(v, /export const FORK_VERSION = 'fork\.\d+';/);
});
