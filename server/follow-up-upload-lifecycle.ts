export type FollowUpUploadCleanupErrorHandler = (error: unknown) => void;

/**
 * Runs a follow-up route operation and always attempts to remove its temporary
 * uploads. Cleanup failures are reported without replacing the route result or
 * the original operation error.
 */
export async function withFollowUpUploadCleanup<T>(
  operation: () => Promise<T>,
  cleanup: () => Promise<void>,
  onCleanupError: FollowUpUploadCleanupErrorHandler,
): Promise<T> {
  try {
    return await operation();
  } finally {
    try {
      await cleanup();
    } catch (error) {
      try {
        onCleanupError(error);
      } catch {
        // Cleanup reporting must not replace the route result or its error.
      }
    }
  }
}
