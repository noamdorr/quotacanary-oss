type ActionResult = { ok: true } | { ok: false; error: string }
type ActionFailure = Extract<ActionResult, { ok: false }>

const STALE_ACTION_ERROR =
  "This dashboard is out of date. Refresh the page, then try again."

function isStaleServerActionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === "UnrecognizedActionError" ||
    (error.message.includes("Server Action") &&
      error.message.includes("was not found on the server")) ||
    error.message.includes("failed-to-find-server-action")
  )
}

export async function runClientAction<T extends ActionResult>(
  action: () => Promise<T>
): Promise<T | ActionFailure> {
  try {
    return await action()
  } catch (error) {
    return {
      ok: false,
      error: isStaleServerActionError(error)
        ? STALE_ACTION_ERROR
        : "Something went wrong. Try again.",
    }
  }
}
