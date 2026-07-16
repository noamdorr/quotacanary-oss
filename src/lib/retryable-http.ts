// HTTP statuses worth retrying: timeouts, too-early, rate limits, server
// errors. Shared by the email and webhook alert senders.
export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}
