import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerAppImage } from "@reforged/maker-appimage";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

// Windows uses Squirrel plus a portable ZIP. Linux builds AppImage, deb, rpm and a portable ZIP.
// CI builds both platforms on every push and launcher-release.yml publishes them together.
const skipRpm = process.env.DAUNTLESS_REVIVED_SKIP_RPM === "1";

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: "Dauntless Revived Launcher",
    executableName: "DauntlessRevivedLauncher",
    appBundleId: "io.github.mixutin.dauntlessrevived",
    appCopyright: "Dauntless Revived contributors. Free software under the GNU AGPL-3.0.",
    // assets/icon.ico (the exe, and below the installer) and assets/icon.png (the window) are copies of
    // the brand icons in ../brand/launcher/, made by npm run icon.
    icon: "assets/icon",
    // The two pinned DLLs the game needs, the window icon, and the license texts of the third-party
    // software the launcher and the DLLs include. Nothing else ships outside the asar.
    extraResource: ["assets/dxgi.dll", "assets/UndauntedInternalServer.dll", "assets/icon.png", "THIRD-PARTY-NOTICES.txt"],
    win32metadata: {
      CompanyName: "Dauntless Revived",
      FileDescription: "Dauntless Revived Launcher",
      ProductName: "Dauntless Revived Launcher",
      InternalName: "DauntlessRevivedLauncher",
      OriginalFilename: "DauntlessRevivedLauncher.exe",
    },
  },
  rebuildConfig: {
    onlyModules: [],
  },
  makers: [
    new MakerSquirrel({
      name: "DauntlessRevivedLauncher",
      authors: "mixutin",
      description: "Dauntless Revived Launcher",
      setupExe: "DauntlessRevivedLauncher-Setup.exe",
      setupIcon: "assets/icon.ico",
      iconUrl: "https://raw.githubusercontent.com/mixutin/dauntless-revived/dauntless-revived/UndauntedLauncher/assets/icon.ico",
      noMsi: true,
    }, ["win32"]),
    new MakerZIP({}, ["win32", "linux"]),
    new MakerDeb(
      {
        options: {
          name: "dauntless-revived-launcher",
          productName: "Dauntless Revived Launcher",
          genericName: "Game Launcher",
          bin: "DauntlessRevivedLauncher",
          description: "Launcher for the Dauntless Revived community servers",
          section: "games",
          priority: "optional",
          maintainer: "mixutin",
          homepage: "https://github.com/mixutin/dauntless-revived",
          icon: "assets/icon.png",
          categories: ["Game"],
          mimeType: ["x-scheme-handler/dauntless-revived"],
          recommends: ["gnome-keyring", "libsecret-1-0", "pkexec"],
          suggests: ["wine64", "steam"],
        },
      },
      ["linux"],
    ),
    ...(skipRpm
      ? []
      : [
          new MakerRpm(
            {
              options: {
                name: "dauntless-revived-launcher",
                productName: "Dauntless Revived Launcher",
                genericName: "Game Launcher",
                bin: "DauntlessRevivedLauncher",
                description: "Launcher for the Dauntless Revived community servers",
                license: "AGPL-3.0-only",
                homepage: "https://github.com/mixutin/dauntless-revived",
                icon: "assets/icon.png",
                categories: ["Game"],
                mimeType: ["x-scheme-handler/dauntless-revived"],
              },
            },
            ["linux"],
          ),
        ]),
    new MakerAppImage({
      options: {
        name: "dauntless-revived-launcher",
        productName: "Dauntless Revived Launcher",
        genericName: "Game Launcher",
        bin: "DauntlessRevivedLauncher",
        icon: "assets/icon.png",
        categories: ["Game"],
        mimeType: ["x-scheme-handler/dauntless-revived"],
        keywords: ["Dauntless", "launcher", "gaming", "Proton", "Wine"],
        compressor: "zstd",
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: "src/main.ts", config: "vite.main.config.ts", target: "main" },
        { entry: "src/preload.ts", config: "vite.preload.config.ts", target: "preload" },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }],
    }),
    // Switched off at package time: running the exe as plain Node, NODE_OPTIONS, the inspector
    // flags, and loading app code from anywhere but the (integrity-checked) asar.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
