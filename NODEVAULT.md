# Bitwarden Node

This is a local source fork of Bitwarden Desktop `desktop-v2026.10.4`. Click the **Vault** heading button to open the node canvas, then click **Node** to return to the list. On scoped pages such as Trash, the button appears next to the page heading. Click a login bubble to open its details. With the keyboard, Tab into the graph, use the arrow keys to move between logins, and press Enter to open one. Bitwarden's original item drawer controls permissions, master-password reprompts, saves, and deletion confirmation. A standard deletion sends the login to Trash. Use the standard vault list for items outside this view, including shared vaults and Trash.

The canvas uses session-only positions and reads names, IDs, folder assignments, and a website hostname for optional grouping. Bitwarden Desktop owns sign-in, unlock, sync, and encrypted storage.

## Search in Node view

Plain search matches display names, item names, all website URLs, and unprotected notes. Add a specifier to search a particular property: `@username:duck.com`, `@note:recovery`, or `@website:example.com`. Custom fields use `@field#text:value`, `@field#hidden:value`, `@field#checkbox:true`, and `@field#linked:value`; these match field names and values of that type. Linked login fields resolve their linked username or password. Field values and notes on items requiring a master-password reprompt are excluded. Searching never prompts for or bypasses that protection.

Type `@` to see specifier suggestions. Use Up/Down to select and Tab or Enter to insert, or click a suggestion. Escape closes the menu. Combine clauses to require all of them, and quote values with spaces, for example `@username:duck.com @note:"recovery instructions"`. The dropdown suggests syntax only and does not display vault values. Search documents stay in memory outside the canvas and are discarded with the view.

Run `node dev/test-login-search.cjs` and `node dev/test-bubble-canvas.cjs` for search and canvas checks. The canvas test uses bundled Electron if Chrome is unavailable.

## Run on Windows

Open the latest local copy at `\\DESKTOP-18DF4QI\Builds\Bitwarden Node.exe`. The single-file Windows x64 package extracts and launches Bitwarden Node with the existing production test profile. It disables automatic updates and leaves the official app's browser integration and `bitwarden://` registration alone.

To package and publish an existing production build, run `npm.cmd --prefix apps/desktop run pack:node`. The packaging step builds `apps/desktop/dist-node/Bitwarden Node.exe` and copies that executable to `\\DESKTOP-18DF4QI\Builds\Bitwarden Node.exe`, verifying its SHA256 hash. Publish every latest production build there.

## Develop the app

Install [Bitwarden's desktop build prerequisites](https://contributing.bitwarden.com/getting-started/clients/desktop/) and use the Node version in `.nvmrc`. Run from this directory.

```powershell
npm.cmd ci --no-audit --no-fund
node .\node_modules\electron\install.js
npm.cmd --prefix apps/desktop run build-native
```

Use the launchers in `dev`.

- **Start-NodeVault-Test.cmd** opens the production build with DevTools disabled.
- **Build-NodeVault-Production.cmd** rebuilds production and publishes the Windows package after source edits.
- **Start-NodeVault-Dev.cmd** opens the development build with DevTools enabled. Run `.\dev\Start-NodeVault-Dev.cmd rebuild` from the source folder to rebuild it after source edits.

Each launcher builds its version if the output is missing. Production uses `apps/desktop/build` and the existing `%LOCALAPPDATA%\NodeVault-Bitwarden-Test` profile. Development uses `apps/desktop/build-dev` and its own `%LOCALAPPDATA%\NodeVault-Bitwarden-Dev` profile, so sign in separately on first launch. Each profile has its own native IPC pipe and is separate from the official client's profile.

Sign in with a disposable account and create fictional logins. Check editing and saving through the drawer, cancel and confirm deletion, verify Trash, then test lock, logout, and account switching.

Run `node .\dev\test-bubble-canvas.cjs` to check the canvas with fictional data in headless Chrome.
