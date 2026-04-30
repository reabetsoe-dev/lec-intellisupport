declare module "qrcode" {
  type QrCodeColorOptions = {
    dark?: string
    light?: string
  }

  type QrCodeToStringOptions = {
    type?: string
    width?: number
    margin?: number
    errorCorrectionLevel?: "L" | "M" | "Q" | "H"
    color?: QrCodeColorOptions
  }

  type QrCodeToDataUrlOptions = QrCodeToStringOptions

  const QRCode: {
    toString(value: string, options?: QrCodeToStringOptions): Promise<string>
    toDataURL(value: string, options?: QrCodeToDataUrlOptions): Promise<string>
  }

  export default QRCode
}
