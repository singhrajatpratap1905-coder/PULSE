import { basename } from 'path'

const FRIENDLY_APP_NAMES: Record<string, string> = {
  'code.exe': 'Visual Studio Code',
  'chrome.exe': 'Google Chrome',
  'msedge.exe': 'Microsoft Edge',
  'firefox.exe': 'Firefox',
  'brave.exe': 'Brave',
  'opera.exe': 'Opera',
  'explorer.exe': 'File Explorer',
  'windowsterminal.exe': 'Terminal',
  'powershell.exe': 'PowerShell',
  'pwsh.exe': 'PowerShell',
  'cmd.exe': 'Command Prompt',
  'notepad.exe': 'Notepad',
  'winword.exe': 'Word',
  'excel.exe': 'Excel',
  'powerpnt.exe': 'PowerPoint',
  'outlook.exe': 'Outlook',
  'olk.exe': 'Outlook',
  'ms-teams.exe': 'Teams',
  'slack.exe': 'Slack',
  'discord.exe': 'Discord',
  'whatsapp.root.exe': 'WhatsApp',
  'spotify.exe': 'Spotify',
  'figma.exe': 'Figma',
  'claude.exe': 'Claude',
  'javaw.exe': 'Java app',
  'minecraft.exe': 'Minecraft Launcher',
  'snippingtool.exe': 'Snipping Tool',
  'screenclippinghost.exe': 'Snipping Tool',
  'systemsettings.exe': 'Settings',
  'applicationframehost.exe': 'Windows app'
}

/** A readable name for an executable: "Visual Studio Code" for Code.exe, else the file name. */
export function friendlyAppName(exePath: string): string {
  const exe = basename(exePath)
  return FRIENDLY_APP_NAMES[exe.toLowerCase()] ?? exe.replace(/\.exe$/i, '')
}
