export type AssetTroubleshootingDomain = "printer" | "computer" | "network" | "general"

export type TroubleshootingStep = {
  id: string
  text: string
}

const TROUBLESHOOTING_STEPS_BY_DOMAIN: Record<AssetTroubleshootingDomain, TroubleshootingStep[]> = {
  printer: [
    { id: "printer-power", text: "Check if the printer is powered on." },
    { id: "printer-paper", text: "Check paper tray and confirm paper is loaded correctly." },
    { id: "printer-toner", text: "Check toner level and replace toner if needed." },
    { id: "printer-connection", text: "Check printer USB/LAN/Wi-Fi connection." },
    { id: "printer-restart", text: "Restart the printer and wait for readiness." },
    { id: "printer-jam", text: "Clear any paper jam from tray and rollers." },
    { id: "printer-selected", text: "Confirm the correct printer is selected on the device." },
    { id: "printer-test-page", text: "Try printing a test page." },
  ],
  computer: [
    { id: "computer-restart", text: "Restart the device." },
    { id: "computer-power-adapter", text: "Check power adapter and battery/charging state." },
    { id: "computer-network", text: "Check internet connection and network access." },
    { id: "computer-updates", text: "Check system updates and install pending updates." },
    { id: "computer-antivirus", text: "Run an antivirus scan." },
  ],
  network: [
    { id: "network-power", text: "Check power lights and status indicators." },
    { id: "network-restart", text: "Restart the router/network device." },
    { id: "network-ethernet", text: "Check Ethernet cables and port connectivity." },
    { id: "network-availability", text: "Confirm Wi-Fi/network availability from another device." },
  ],
  general: [
    { id: "general-power", text: "Verify the device has power and no hardware alert lights." },
    { id: "general-restart", text: "Restart the device and retry the task." },
    { id: "general-network", text: "Confirm network connectivity where applicable." },
    { id: "general-check", text: "Check cables/adapters and retry." },
  ],
}

const CATEGORY_OPTIONS_BY_DOMAIN: Record<AssetTroubleshootingDomain, string[]> = {
  printer: ["Paper Jam", "Toner", "Connectivity", "Driver", "Hardware Failure"],
  computer: ["Hardware", "Software", "Performance", "Power", "Connectivity"],
  network: ["Connectivity", "Wi-Fi", "LAN", "Power", "Configuration"],
  general: ["Hardware", "Software", "Connectivity", "Performance", "Other"],
}

export function getTroubleshootingSteps(domain: AssetTroubleshootingDomain): TroubleshootingStep[] {
  return TROUBLESHOOTING_STEPS_BY_DOMAIN[domain] ?? TROUBLESHOOTING_STEPS_BY_DOMAIN.general
}

export function getFaultCategoryOptions(domain: AssetTroubleshootingDomain): string[] {
  return CATEGORY_OPTIONS_BY_DOMAIN[domain] ?? CATEGORY_OPTIONS_BY_DOMAIN.general
}
