// Rebrand self-references in shipped desktop locales. Backend/product references stay factual.
const selfReferences = new Set([
  "appLogoLabel",
  "bitwarden",
  "bitwardenBeta",
  "aboutBitwarden",
  "hideBitwarden",
  "quitBitwarden",
  "loginPageEmailEntryScreenTitle",
  "closeThisBitwardenWindow",
  "runInBackground",
  "runInBackgroundDesc",
  "runInBackgroundDescMac",
  "openAtLoginDesc",
  "passkeyProviderDesc",
  "setYourPinCode",
  "windowsHelloConsentMessage",
  "requireMasterPasswordOnAppRestartDesc",
  "requireMasterPasswordOnAppRestartWarning",
  "totpHelper",
  "totpHelperWithCapture",
  "verifyNativeMessagingConnectionTitle",
  "forwarderGeneratedBy",
  "forwarderGeneratedByWithWebsite",
  "windowsBiometricUpdateWarning",
  "importGnomeInstructionsFileHere",
  "uriMatchDefaultStrategyHint",
  "allowScreenshotsDesc",
  "enableSshAgentDesc",
  "enableSshAgentHelp",
  "acquireCookieSpeedbumpContent",
  "biometricsStatusHelptextNotEnabledLocally",
]);

module.exports = function brandDesktopLocale(buffer) {
  const data = JSON.parse(buffer.toString("utf8").replace(/^\uFEFF/, ""));
  for (const [key, entry] of Object.entries(data)) {
    if (selfReferences.has(key) && typeof entry.message === "string") {
      entry.message = entry.message.replace(/Bitwarden/g, "NodeVault");
    }
  }
  for (const key of ["couldNotDecryptVaultItem", "couldNotDecryptVaultItems"]) {
    if (data[key]) {
      data[key].message =
        "NodeVault could not decrypt one or more vault items. Check your server connection and contact the fork maintainer if the issue persists.";
    }
  }
  if (data.bitwardenSupport) {
    data.bitwardenSupport.message = "NodeVault project support";
  }
  return Buffer.from(JSON.stringify(data, null, 2) + "\n");
};
