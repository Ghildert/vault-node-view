const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const brand = require("../apps/desktop/scripts/nodevault-branding");
const locales = path.join(root, "apps/desktop/src/locales");
for (const locale of fs.readdirSync(locales)) {
  const file = path.join(locales, locale, "messages.json");
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file);
  const output = JSON.parse(brand(source));
  for (const key of [
    "bitwarden",
    "bitwardenBeta",
    "aboutBitwarden",
    "appLogoLabel",
    "quitBitwarden",
  ]) {
    if (output[key]) assert.ok(!output[key].message.includes("Bitwarden"), `${locale}: ${key}`);
  }
}
const input = {
  bitwarden: { message: "Bitwarden" },
  serviceUrl: { message: "https://vault.bitwarden.com" },
};
const output = JSON.parse(brand(Buffer.from(JSON.stringify(input))));
assert.equal(output.bitwarden.message, "NodeVault");
assert.equal(output.serviceUrl.message, input.serviceUrl.message);
const config = JSON.parse(read("apps/desktop/electron-builder.node.json"));
assert.equal(config.productName, "NodeVault");
assert.equal(config.portable.artifactName, "NodeVault.exe");
assert.equal(JSON.parse(read("apps/desktop/src/package.json")).productName, "NodeVault");
assert.ok(config.win.extraFiles.some((entry) => entry.to === "LICENSE_GPL.txt"));
assert.ok(read("LICENSE.txt").includes("No grant of any rights in the trademarks"));
for (const file of [
  "bitwarden-icon.ts",
  "bitwarden-logo.icon.ts",
  "bitwarden-logo-beta.icon.ts",
  "password-manager.ts",
  "side-nav-logo.ts",
  "side-nav-logo-beta.ts",
  "shield.ts",
  "import-bitwarden.icon.ts",
]) {
  const svg = read("libs/assets/src/svg/svgs/" + file);
  assert.ok(svg.includes("Original NodeVault artwork"));
  assert.ok(!svg.includes("<title>Bitwarden"));
}
const ico = fs.readFileSync(path.join(root, "apps/desktop/src/images/icon_node.ico"));
assert.equal(ico.readUInt16LE(2), 1);
assert.deepEqual(
  Array.from({ length: ico.readUInt16LE(4) }, (_, index) => ico[6 + index * 16] || 256),
  [16, 24, 32, 48, 64, 128, 256],
);
console.log(
  "NodeVault branding, locale compatibility, icon sizes, and license preservation passed.",
);
