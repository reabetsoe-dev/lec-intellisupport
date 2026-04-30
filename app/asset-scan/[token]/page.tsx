import { AssetScanWorkspace } from "@/components/inventory/AssetScanWorkspace"

export default async function AssetScanPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <AssetScanWorkspace token={token} />
}
