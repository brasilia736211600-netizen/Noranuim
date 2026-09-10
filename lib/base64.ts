export function getBase64Payload(value: string) {
  const marker = 'base64,'
  const index = value.indexOf(marker)
  if (index === -1) {
    return value
  }
  return value.slice(index + marker.length)
}
