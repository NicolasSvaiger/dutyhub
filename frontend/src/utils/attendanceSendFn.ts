import axiosInstance from '../api/axiosInstance';
import type { QueuedOperation } from './retryQueue';

/**
 * Send function for the RetryQueue.
 * Routes queued operations to the correct attendance API endpoint.
 *
 * - Resolves on success (2xx)
 * - Rejects with { status, message } on HTTP error
 * - Rejects with { status: undefined } on network error
 */
export async function attendanceSendFn(operation: QueuedOperation): Promise<unknown> {
  const { type, payload } = operation;

  const endpoint =
    type === 'check-in' ? '/attendance/check-in' : '/attendance/check-out';

  try {
    const { data } = await axiosInstance.post(endpoint, {
      shiftId: payload.shiftId,
      latitude: payload.latitude,
      longitude: payload.longitude,
      deviceId: payload.deviceId,
      ...(type === 'check-in' && { biometricValidated: payload.biometricValidated ?? false }),
    });
    return data;
  } catch (error: unknown) {
    // Axios errors with a response indicate a server-side error
    const axiosErr = error as { response?: { status: number; data?: { message?: string } }; message?: string };
    if (axiosErr.response) {
      throw {
        status: axiosErr.response.status,
        message: axiosErr.response.data?.message || `Erro HTTP ${axiosErr.response.status}`,
      };
    }
    // No response = network error
    throw { status: undefined, message: axiosErr.message || 'Erro de rede' };
  }
}
