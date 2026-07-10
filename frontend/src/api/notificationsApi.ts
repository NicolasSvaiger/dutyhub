import axiosInstance from './axiosInstance';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
}

export interface UnreadCountResponse {
  count: number;
}

export const notificationsApi = {
  /** Unread notification count for the logged-in user (used by the bell badge). */
  getUnreadCount: async (): Promise<number> => {
    const { data } = await axiosInstance.get<UnreadCountResponse>('/notifications/unread-count');
    return data.count;
  },

  /** All notifications for the logged-in user (shown when the bell popover opens). */
  getAll: async (): Promise<NotificationItem[]> => {
    const { data } = await axiosInstance.get<NotificationItem[]>('/notifications');
    return data;
  },
};

export default notificationsApi;
