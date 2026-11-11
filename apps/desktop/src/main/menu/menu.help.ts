import { MenuItemConstructorOptions, app } from "electron";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { UrlType } from "@bitwarden/common/platform/misc/safe-urls";

import { SafeShell } from "../../platform/main/safe-shell.main";
import { DesktopSettingsService } from "../../platform/services/desktop-settings.service";
import { isMacAppStore } from "../platform-utils.main";

import { AboutMenu } from "./menu.about";
import { IMenubarMenu } from "./menubar";

export class HelpMenu implements IMenubarMenu {
  readonly id: string = "help";

  get label(): string {
    return this.localize("help");
  }

  get items(): MenuItemConstructorOptions[] {
    const items = [
      this.helpAndFeedback,
      this.fileBugReport,
      this.legal,
      this.separator,
      this.goToWebVault,
      this.separator,
      this.troubleshooting,
    ];

    if (this.aboutMenu != null) {
      items.push(...this.aboutMenu.items);
    }
    return items;
  }

  constructor(
    private i18nService: I18nService,
    private messagingService: MessagingService,
    private desktopSettingsService: DesktopSettingsService,
    private webVaultUrl: string,
    private hardwareAccelerationEnabled: boolean,
    private aboutMenu: AboutMenu,
    private shell: SafeShell,
  ) {}

  private get helpAndFeedback(): MenuItemConstructorOptions {
    return {
      id: "helpAndFeedback",
      label: this.localize("helpAndFeedback"),
      click: () =>
        this.shell.openExternal(
          "https://github.com/Ghildert/vault-node-view/blob/node-view/NODEVAULT.md",
          UrlType.WebUrl,
        ),
    };
  }

  private get fileBugReport(): MenuItemConstructorOptions {
    return {
      id: "fileBugReport",
      label: this.localize("fileBugReport"),
      click: () =>
        this.shell.openExternal(
          "https://github.com/Ghildert/vault-node-view/issues",
          UrlType.WebUrl,
        ),
    };
  }

  private get legal(): MenuItemConstructorOptions {
    return {
      id: "legal",
      label: this.localize("legal"),
      visible: isMacAppStore(),
      submenu: this.legalSubmenu,
    };
  }

  private get legalSubmenu(): MenuItemConstructorOptions[] {
    return [
      {
        id: "termsOfService",
        label: this.localize("termsOfService"),
        click: () =>
          this.shell.openExternal(
            "https://github.com/Ghildert/vault-node-view/blob/node-view/LICENSE.txt",
            UrlType.WebUrl,
          ),
      },
      {
        id: "privacyPolicy",
        label: this.localize("privacyPolicy"),
        click: () =>
          this.shell.openExternal(
            "https://github.com/Ghildert/vault-node-view/blob/node-view/README.md",
            UrlType.WebUrl,
          ),
      },
    ];
  }

  private get separator(): MenuItemConstructorOptions {
    return { type: "separator" };
  }

  private get goToWebVault(): MenuItemConstructorOptions {
    return {
      id: "goToWebVault",
      label: this.localize("goToWebVault"),
      click: () => this.shell.openExternal(this.webVaultUrl, UrlType.WebUrl),
    };
  }

  private get troubleshooting(): MenuItemConstructorOptions {
    return {
      id: "troubleshooting",
      label: this.localize("troubleshooting"),
      submenu: this.troubleshootingSubmenu,
    };
  }

  private get troubleshootingSubmenu(): MenuItemConstructorOptions[] {
    return [
      {
        id: "hardwareAcceleration",
        label: this.localize(
          this.hardwareAccelerationEnabled
            ? "disableHardwareAccelerationRestart"
            : "enableHardwareAccelerationRestart",
        ),
        click: async () => {
          await this.desktopSettingsService.setHardwareAcceleration(
            !this.hardwareAccelerationEnabled,
          );
          // `app.relaunch` crashes the app on Mac Store builds. Disabling it for now.
          // https://github.com/electron/electron/issues/41690
          if (!isMacAppStore()) {
            app.relaunch();
          }
          app.exit();
        },
      },
      {
        id: "downloadDiagnosticReport",
        label: this.localize("downloadDiagnosticReport"),
        click: () => this.messagingService.send("openTroubleshootingDialog"),
      },
    ];
  }

  private localize(s: string) {
    return this.i18nService.t(s);
  }
}
