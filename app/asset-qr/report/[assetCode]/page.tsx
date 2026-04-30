import { AssetFaultReportWorkspace } from "@/components/inventory/AssetFaultReportWorkspace"

export default async function AssetQrReportPage({
  params,
}: {
  params: Promise<{ assetCode: string }>
}) {
  const { assetCode } = await params
  return <AssetFaultReportWorkspace assetCode={assetCode} />
}
