import { supportChatService } from "./support-chat.service";
import { upgradeRequestService } from "./upgrade-request.service";

export { SupportError } from "./support-chat.service";

export class SupportService {
  requestUpgrade = upgradeRequestService.requestUpgrade.bind(upgradeRequestService);
  listPendingUpgrades = upgradeRequestService.listPending.bind(upgradeRequestService);
  approveUpgrade = upgradeRequestService.approve.bind(upgradeRequestService);
  rejectUpgrade = upgradeRequestService.reject.bind(upgradeRequestService);

  getConversation = supportChatService.getOrCreateConversation.bind(supportChatService);
  sendUserMessage = supportChatService.sendUserMessage.bind(supportChatService);
  sendAdminMessage = supportChatService.sendAdminMessage.bind(supportChatService);
  listAdminConversations = supportChatService.listConversationsForAdmin.bind(
    supportChatService
  );
  getAdminConversation = supportChatService.getConversationForAdmin.bind(
    supportChatService
  );
  markReadByUser = supportChatService.markReadByUser.bind(supportChatService);

  async getUserNotifications(userId: string) {
    const [unreadMessages, pendingUpgrade] = await Promise.all([
      supportChatService.getUserUnreadCount(userId),
      upgradeRequestService.getPendingForUser(userId),
    ]);

    return {
      unreadMessages,
      pendingUpgrade: Boolean(pendingUpgrade),
    };
  }

  async getAdminNotifications() {
    const [unreadMessages, pendingUpgrades] = await Promise.all([
      supportChatService.getAdminUnreadCount(),
      upgradeRequestService.getPendingCount(),
    ]);

    return {
      unreadMessages,
      pendingUpgrades,
    };
  }
}

export const supportService = new SupportService();
