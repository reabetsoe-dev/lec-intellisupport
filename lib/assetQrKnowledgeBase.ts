export type AssetTroubleshootingDomain =
  | "printer"
  | "computer"
  | "network"
  | "ups"
  | "switch"
  | "server"
  | "general"

export type TroubleshootingStep = {
  id: string
  step_number: number
  instruction: string
}

export type AssetCommonProblem = {
  id: string
  title: string
  description: string
  category: string
  steps: TroubleshootingStep[]
}

const CATEGORY_OPTIONS_BY_DOMAIN: Record<AssetTroubleshootingDomain, string[]> = {
  printer: ["Paper Jam", "Toner", "Connectivity", "Print Quality", "Hardware Failure"],
  computer: ["Hardware", "Software", "Performance", "Power", "Connectivity"],
  network: ["Connectivity", "Wi-Fi", "LAN", "Power", "Configuration"],
  ups: ["Power", "Battery", "Overload", "Hardware Failure"],
  switch: ["Connectivity", "LAN", "Power", "Configuration"],
  server: ["Infrastructure", "Storage", "Network", "Power", "Service Outage"],
  general: ["Hardware", "Software", "Connectivity", "Performance", "Other"],
}

function steps(problemId: string, items: string[]): TroubleshootingStep[] {
  return items.map((instruction, index) => ({
    id: `${problemId}-step-${index + 1}`,
    step_number: index + 1,
    instruction,
  }))
}

const COMMON_PROBLEMS_BY_DOMAIN: Record<AssetTroubleshootingDomain, AssetCommonProblem[]> = {
  printer: [
    {
      id: "printer-paper-jam",
      title: "Paper jam",
      description: "The printer reports a jam or paper is visibly stuck.",
      category: "Paper Jam",
      steps: steps("printer-paper-jam", [
        "Power off the printer before opening trays or panels.",
        "Open the indicated tray or rear access panel.",
        "Remove stuck paper slowly in the paper path direction.",
        "Reload paper neatly and close all panels.",
        "Power on the printer and print a test page.",
      ]),
    },
    {
      id: "printer-offline",
      title: "Printer offline",
      description: "The printer is powered on but shows offline or unavailable.",
      category: "Connectivity",
      steps: steps("printer-offline", [
        "Confirm the printer is powered on and ready.",
        "Check the USB, LAN, or Wi-Fi connection.",
        "Confirm the correct printer is selected on the workstation.",
        "Restart the printer and wait for it to reconnect.",
        "Try printing a test page.",
      ]),
    },
    {
      id: "printer-low-toner",
      title: "Low toner",
      description: "The printer warns about toner or print output is faded.",
      category: "Toner",
      steps: steps("printer-low-toner", [
        "Check the toner level on the printer display.",
        "Remove and gently reseat the toner cartridge.",
        "Check whether a replacement cartridge is available.",
        "Print a test page after reseating or replacing toner.",
      ]),
    },
    {
      id: "printer-poor-quality",
      title: "Poor print quality",
      description: "Printed pages are faded, streaked, smudged, or misaligned.",
      category: "Print Quality",
      steps: steps("printer-poor-quality", [
        "Check paper type and confirm it is dry and undamaged.",
        "Run the printer cleaning or calibration option if available.",
        "Check toner or ink levels.",
        "Print a test page to confirm whether quality improves.",
      ]),
    },
    {
      id: "printer-cannot-connect",
      title: "Cannot connect to printer",
      description: "A workstation cannot find or connect to the printer.",
      category: "Connectivity",
      steps: steps("printer-cannot-connect", [
        "Confirm the printer is connected to the same network.",
        "Check the printer IP address or shared printer name.",
        "Restart the printer and workstation if safe to do so.",
        "Try adding the printer again from the workstation.",
      ]),
    },
  ],
  network: [
    {
      id: "network-no-internet",
      title: "No internet connection",
      description: "Users connected through this network device cannot reach the internet.",
      category: "Connectivity",
      steps: steps("network-no-internet", [
        "Check power and internet or link indicator lights.",
        "Confirm upstream cable is firmly connected.",
        "Test internet access from another device.",
        "Restart the network device if business impact allows it.",
        "Wait for link lights to stabilize and retest.",
      ]),
    },
    {
      id: "network-slow",
      title: "Slow connection",
      description: "Network access works but is unusually slow.",
      category: "Connectivity",
      steps: steps("network-slow", [
        "Check if multiple users are affected.",
        "Test a wired connection if available.",
        "Check device temperature and indicator lights.",
        "Restart the device if approved for the location.",
        "Retest a known business application.",
      ]),
    },
    {
      id: "network-power",
      title: "Power issue",
      description: "The network device does not power on or loses power.",
      category: "Power",
      steps: steps("network-power", [
        "Check the wall socket or UPS output.",
        "Confirm the power adapter is firmly connected.",
        "Look for damaged adapter or cable marks.",
        "Try a known working outlet if safe.",
      ]),
    },
    {
      id: "network-loose-cable",
      title: "Loose cable",
      description: "A loose network or power cable may be interrupting service.",
      category: "LAN",
      steps: steps("network-loose-cable", [
        "Inspect WAN, LAN, and power cables.",
        "Push each connector in until it clicks or seats firmly.",
        "Check link lights after reseating cables.",
        "Replace the cable if the connector is damaged.",
      ]),
    },
    {
      id: "network-overheating",
      title: "Device overheating",
      description: "The network device feels hot or is in a poorly ventilated area.",
      category: "Hardware Failure",
      steps: steps("network-overheating", [
        "Check whether air vents are blocked.",
        "Move papers or equipment away from the device.",
        "Confirm the device is not in direct sunlight.",
        "Allow it to cool and retest network access.",
      ]),
    },
  ],
  computer: [
    {
      id: "computer-no-power",
      title: "Laptop or computer will not power on",
      description: "The device does not start or shows no power indicators.",
      category: "Power",
      steps: steps("computer-no-power", [
        "Check the charger or power cable connection.",
        "Confirm the wall socket or docking station has power.",
        "Hold the power button for ten seconds, then try again.",
        "Remove non-essential USB devices and retry startup.",
      ]),
    },
    {
      id: "computer-slow",
      title: "Very slow performance",
      description: "The computer responds slowly or applications take too long to open.",
      category: "Performance",
      steps: steps("computer-slow", [
        "Close unused applications and browser tabs.",
        "Restart the computer if it is safe to do so.",
        "Check whether storage is nearly full.",
        "Confirm antivirus or updates are not actively running.",
      ]),
    },
    {
      id: "computer-no-network",
      title: "Cannot connect to network",
      description: "The computer cannot access Wi-Fi, LAN, or internal systems.",
      category: "Connectivity",
      steps: steps("computer-no-network", [
        "Check Wi-Fi or LAN cable connection.",
        "Confirm airplane mode is off.",
        "Reconnect to the approved LEC network.",
        "Restart the device and test a known internal system.",
      ]),
    },
    {
      id: "computer-app-not-opening",
      title: "Application not opening",
      description: "A required application fails to launch or closes immediately.",
      category: "Software",
      steps: steps("computer-app-not-opening", [
        "Close and reopen the application.",
        "Restart the computer if the application remains stuck.",
        "Check whether another user can open the same application.",
        "Note any error message shown on screen.",
      ]),
    },
    {
      id: "computer-overheating",
      title: "Device overheating",
      description: "The computer becomes unusually hot or the fan runs constantly.",
      category: "Hardware",
      steps: steps("computer-overheating", [
        "Check that air vents are not blocked.",
        "Move the device to a flat ventilated surface.",
        "Close heavy applications and wait a few minutes.",
        "Restart the device if performance remains poor.",
      ]),
    },
  ],
  ups: [
    {
      id: "ups-no-backup",
      title: "UPS not providing backup power",
      description: "The UPS does not keep connected equipment running during power loss.",
      category: "Battery",
      steps: steps("ups-no-backup", [
        "Confirm the UPS is switched on.",
        "Check battery or fault indicator lights.",
        "Confirm critical devices are plugged into battery-backed outlets.",
        "Run a brief self-test if the UPS supports it.",
      ]),
    },
    {
      id: "ups-alarm",
      title: "UPS alarm beeping",
      description: "The UPS is making an audible alarm.",
      category: "Power",
      steps: steps("ups-alarm", [
        "Check the display or indicator light meaning.",
        "Confirm the UPS is not overloaded.",
        "Check whether mains power is available.",
        "Remove non-critical loads and observe whether the alarm clears.",
      ]),
    },
  ],
  switch: [
    {
      id: "switch-port-not-working",
      title: "Switch port not working",
      description: "A network switch port has no link or cannot pass traffic.",
      category: "LAN",
      steps: steps("switch-port-not-working", [
        "Check the port link light.",
        "Reseat the Ethernet cable on both ends.",
        "Try a known working cable.",
        "Move the device to another approved port and retest.",
      ]),
    },
    {
      id: "switch-multiple-users",
      title: "Multiple users disconnected",
      description: "Several users connected to the switch lost network access.",
      category: "Connectivity",
      steps: steps("switch-multiple-users", [
        "Check switch power and uplink lights.",
        "Confirm the uplink cable is firmly connected.",
        "Check if only one area or all users are affected.",
        "Restart only if approved for the affected area.",
      ]),
    },
  ],
  server: [
    {
      id: "server-service-unavailable",
      title: "Server service unavailable",
      description: "A service hosted by the server cannot be reached.",
      category: "Service Outage",
      steps: steps("server-service-unavailable", [
        "Confirm the server has power and normal indicator lights.",
        "Check whether other services on the same server are reachable.",
        "Confirm network cable or link lights are active.",
        "Record the service name and exact error message.",
      ]),
    },
    {
      id: "server-storage-warning",
      title: "Server storage warning",
      description: "The server reports low disk space or a storage alert.",
      category: "Storage",
      steps: steps("server-storage-warning", [
        "Capture the exact storage warning.",
        "Check if any scheduled backup or export is running.",
        "Do not delete files without authorization.",
        "Record affected service and urgency for escalation.",
      ]),
    },
  ],
  general: [
    {
      id: "general-power",
      title: "Power issue",
      description: "The asset has no power or does not start normally.",
      category: "Hardware",
      steps: steps("general-power", [
        "Verify the device has power and no hardware alert lights.",
        "Check cables, adapters, and wall socket.",
        "Restart the device and retry the task.",
        "Record any visible warning lights or error messages.",
      ]),
    },
    {
      id: "general-connectivity",
      title: "Connectivity issue",
      description: "The asset cannot connect to a required device, network, or service.",
      category: "Connectivity",
      steps: steps("general-connectivity", [
        "Check all relevant cables or wireless connection status.",
        "Restart the device if safe to do so.",
        "Test from another device or location if available.",
        "Capture any exact error message before reporting.",
      ]),
    },
  ],
}

export function getFaultCategoryOptions(domain: AssetTroubleshootingDomain): string[] {
  return CATEGORY_OPTIONS_BY_DOMAIN[domain] ?? CATEGORY_OPTIONS_BY_DOMAIN.general
}

export function getCommonProblems(domain: AssetTroubleshootingDomain): AssetCommonProblem[] {
  return COMMON_PROBLEMS_BY_DOMAIN[domain] ?? COMMON_PROBLEMS_BY_DOMAIN.general
}
