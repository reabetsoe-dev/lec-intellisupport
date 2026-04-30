import { DashboardBackButton } from "@/components/layout/DashboardBackButton"

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
    />
  )
}
