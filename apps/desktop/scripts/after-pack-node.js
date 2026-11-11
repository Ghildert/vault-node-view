/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const hardenElectron = require("./after-pack.js").default;

// Webpack bundles the app dependencies. The packaging config supplies the one native module.
exports.beforeBuild = () => false;

exports.default = async function brandWindowsBuild(context) {
  const { productName, productFilename, version } = context.packager.appInfo;
  const filename = productFilename + ".exe";
  const rcedit = path.join(
    path.dirname(require.resolve("electron-winstaller/package.json")),
    "vendor",
    "rcedit.exe",
  );
  execFileSync(
    rcedit,
    [
      path.join(context.appOutDir, filename),
      "--set-version-string",
      "ProductName",
      productName,
      "--set-version-string",
      "FileDescription",
      productName,
      "--set-version-string",
      "OriginalFilename",
      filename,
      "--set-file-version",
      version,
      "--set-product-version",
      version,
      "--set-icon",
      path.resolve(__dirname, "../src/images/icon_node.ico"),
    ],
    { windowsHide: true },
  );
  await hardenElectron(context);
};
