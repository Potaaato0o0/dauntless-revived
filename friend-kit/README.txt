DAUNTLESS REVIVED - FRIEND KIT
==============================

A private, non-commercial revival of Dauntless for a few friends. Not affiliated with
Phoenix Labs or Epic Games. You need an invite from the host.

WHAT YOU NEED
  - Windows 10 or 11, 64-bit.
  - Tailscale (https://tailscale.com/download), signed in, with the host's share accepted.
  - The Dauntless 1.4.4 game files from the host (a zip, about 11 GB).
  - Your invite code and the host's Tailscale address (100.x.y.z), from the host.

ONE-TIME SETUP
  1. Check the zip before extracting it (optional, recommended):
       powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Zip "C:\path\to\the.zip"
  2. Extract the zip so that C:\D144\Dauntless\Archon exists.
     (Another folder works too: pass -Game "D:\Games\Dauntless" to both scripts.)
  3. Double-click Setup.cmd. It asks for the host's address, a username and your invite code.
     It checks the game files, installs two DLLs into the game folder, registers you and
     saves your personal key in %APPDATA%\DauntlessRevived\account.key.
     THE KEY IS YOUR PASSWORD. Keep a copy somewhere safe. Nobody can recover it.

PLAYING
  Double-click "Play Dauntless.cmd".
  A console window opens next to the game. Leave it open: closing it closes the game.
  Options (add after the file name in a terminal):
    -Graphics 4   force Cinematic quality on every launch (0-4; default: the in-game menu)
    -Windowed     1280x720 window

WHAT THE SCRIPTS CHANGE ON YOUR PC
  - Copies dxgi.dll and UndauntedInternalServer.dll into ...\Archon\Binaries\Win64\
    (delete them to uninstall). Their SHA-256 hashes are checked before and after copying.
  - Writes two sections of %LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\Engine.ini:
    graphics/memory settings, and the game's chat connection, which is pointed at the host
    so the game never contacts Epic's old chat server with your login.
  - Stores your key and settings in %APPDATA%\DauntlessRevived\.
  The game is started directly (Dauntless-Win64-Shipping.exe); EasyAntiCheat never runs.

THE DLLs
  They are Undaunted's prebuilt files (https://github.com/SyST3MDeV/Undaunted). Antivirus
  software may flag them, because DLL proxies are also a malware technique. Check the hashes
  in setup.ps1 and decide for yourself.

SOURCE CODE (AGPL-3.0)
  The server you connect to runs modified Undaunted code. You have the right to its source:
  see SOURCE.txt in this kit for the repository and the exact version. THIRD-PARTY-NOTICES.txt
  holds the licence notices for code inside the DLLs; SHA256SUMS.txt lists every file's hash.
