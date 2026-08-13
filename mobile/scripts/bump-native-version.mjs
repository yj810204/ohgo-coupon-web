#!/usr/bin/env node
/**
 * Android versionCode / iOS buildNumber 를 1 올리고 app.json·네이티브 파일에 반영한다.
 * 사용: node scripts/bump-native-version.mjs [android|ios|all]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platform = (process.argv[2] || 'all').toLowerCase();
if (!['android', 'ios', 'all'].includes(platform)) {
  console.error('usage: node scripts/bump-native-version.mjs [android|ios|all]');
  process.exit(1);
}

const appJsonPath = path.join(root, 'app.json');
const app = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const expo = app.expo;
if (!expo.android) expo.android = {};
if (!expo.ios) expo.ios = {};

const result = {
  version: expo.version,
  android: expo.android.versionCode ?? null,
  ios: expo.ios.buildNumber ?? null,
};

if (platform === 'android' || platform === 'all') {
  const current = Number(expo.android.versionCode || 0);
  expo.android.versionCode = current + 1;
  result.android = expo.android.versionCode;
}

if (platform === 'ios' || platform === 'all') {
  const current = parseInt(String(expo.ios.buildNumber || '0'), 10) || 0;
  const next = String(current + 1);
  expo.ios.buildNumber = next;
  result.ios = next;
  syncIosNative(root, next);
}

fs.writeFileSync(appJsonPath, `${JSON.stringify(app, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      version: result.version,
      androidVersionCode: result.android,
      iosBuildNumber: result.ios,
    },
    null,
    2,
  ),
);

function syncIosNative(projectRoot, buildNumber) {
  const plistPath = path.join(projectRoot, 'ios/app/Info.plist');
  if (fs.existsSync(plistPath)) {
    const plist = fs.readFileSync(plistPath, 'utf8');
    const updated = plist.replace(
      /(<key>CFBundleVersion<\/key>\s*<string>)[^<]+(<\/string>)/,
      `$1${buildNumber}$2`,
    );
    fs.writeFileSync(plistPath, updated);
  }

  const pbxPath = path.join(projectRoot, 'ios/app.xcodeproj/project.pbxproj');
  if (fs.existsSync(pbxPath)) {
    const pbx = fs.readFileSync(pbxPath, 'utf8');
    fs.writeFileSync(
      pbxPath,
      pbx.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`),
    );
  }
}
