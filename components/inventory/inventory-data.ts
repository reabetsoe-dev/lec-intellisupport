export type InventoryItem = {
  id: number
  itemName: string
  quantity: number
  department: string
  assignedEmployee: string
}

export const inventoryItems: InventoryItem[] = [
  { id: 1, itemName: "Laptops", quantity: 28, department: "Finance", assignedEmployee: "Lerato Mokoena" },
  { id: 2, itemName: "Cartridges", quantity: 64, department: "Operations", assignedEmployee: "Shared Resource" },
  { id: 3, itemName: "Paper", quantity: 420, department: "Admin", assignedEmployee: "Shared Resource" },
  { id: 4, itemName: "Mouse", quantity: 84, department: "Contact Center", assignedEmployee: "Sibusiso Mthethwa" },
  { id: 5, itemName: "Keyboards", quantity: 71, department: "Engineering", assignedEmployee: "Anele Nkosi" },
]
