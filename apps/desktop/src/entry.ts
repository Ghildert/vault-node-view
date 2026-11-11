// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { spawn } from "child_process";
import * as path from "path";

import { app } from "electron";

import { DEV_ICON_FILE, isDev } from "./utils";

if (
  process.platform === "darwin" &&
  process.argv.some((arg) => arg.indexOf("chrome-extension://") !== -1 || arg.indexOf("{") !== -1)
) {
  // If we're on MacOS, we need to support DuckDuckGo's IPC communication,
  // which for the moment is launching the Bitwarden process.
  // Ideally the browser would instead startup the desktop_proxy process
  // when available, but for now we'll just launch it here.

  app.on("ready", () => {
    app.dock.hide();
  });

  const proc = spawn(
    path.join(process.execPath, "..", "desktop_proxy.inherit"),
    process.argv.slice(1),
    {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: false,
    },
  );

  proc.on("exit", (...args) => {
    // eslint-disable-next-line no-console
    console.error("Proxy process exited", args);
    process.exit(0);
  });
  proc.on("error", (...args) => {
    // eslint-disable-next-line no-console
    console.error("Proxy process errored", args);
    process.exit(1);
  });
} else {
  if (app.name === "NodeVault") {
    process.env.BITWARDEN_NO_UPDATER = "1";
    if (process.platform === "win32") {
      app.setAppUserModelId("local.nodevault.desktop");
      // Reuse the local test profile without opening the official client's vault profile.
      process.env.BITWARDEN_APPDATA_DIR ??= path.join(
        process.env.LOCALAPPDATA ?? app.getPath("appData"),
        "NodeVault-Bitwarden-Test",
      );
      process.env.BITWARDEN_IPC_SOCKET_DIR ??= process.env.BITWARDEN_APPDATA_DIR;
      // The single-file launcher is portable, but this profile stays on this PC.
      // Keep using Windows Credential Manager for the profile's encrypted tokens.
      delete process.env.PORTABLE_EXECUTABLE_DIR;
    }
  }

  // macOS draws no window icon, so the dock is the only place a dev client can be told apart
  // from an installed one. __dirname is the build output directory at runtime.
  if (isDev() && process.platform === "darwin") {
    const devIcon = path.join(__dirname, "images", DEV_ICON_FILE);

    void app.whenReady().then(() => app.dock.setIcon(devIcon));
  }

  // eslint-disable-next-line
  const Main = require("./main").Main;

  const main = new Main();
  main.bootstrap();
}
