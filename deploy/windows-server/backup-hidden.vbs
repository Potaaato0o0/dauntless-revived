' Dauntless Revived - runs Backup-DauntlessServer.ps1 with no visible window.
' A console flashing up every hour would steal focus from anyone using the desktop (and, on a
' server that logs on automatically, from the game-server consoles). Used by the hourly
' "Dauntless Revived backup" scheduled task.
'
'   wscript.exe backup-hidden.vbs [install root]
'
' Without an argument the install root is the folder above this one (<root>\bin\..).
Option Explicit
Dim fso, sh, here, root, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(here)
If WScript.Arguments.Count > 0 Then root = WScript.Arguments(0)
cmd = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & here & "\Backup-DauntlessServer.ps1"" -Root """ & root & """"
WScript.Quit sh.Run(cmd, 0, True)
