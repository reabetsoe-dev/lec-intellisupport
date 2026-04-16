import { DashboardBackButton } from "@/components/layout/DashboardBackButton"

<<<<<<< HEAD
export function ManagerBackButton() {
  return (
    <DashboardBackButton
      href="/dashboard"
      ariaLabel="Return to role workspace"
      title="Return to role workspace"
=======
type ManagerBackButtonProps = {
  href?: string
  label?: string
  onClick?: () => void
}

export function ManagerBackButton({
  href = "/manager/dashboard",
  label = "Return to manager dashboard",
  onClick,
}: ManagerBackButtonProps) {
  return (
    <DashboardBackButton
      href={href}
      onClick={onClick}
      ariaLabel={label}
      title={label}
>>>>>>> c0c468bd1de57e5df0757acac48d9c7bdcc4ba3c
    />
  )
}
