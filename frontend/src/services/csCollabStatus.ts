import type { CsMessage } from "./csDeskApi";

export function mergeConversationMessages(previous: CsMessage[], fetched: CsMessage[], conversationId: string): CsMessage[] {
  const byId = new Map<string, CsMessage>();
  for (const message of [...fetched, ...previous]) {
    if (message.conversationId === conversationId) byId.set(message.id, message);
  }
  return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function collabStatusText(status: unknown): string {
  switch (status) {
    case "pending": return "待处理";
    case "accepted": return "已同意";
    case "rejected": return "已拒绝";
    case "ended": return "已结束";
    default: return "未知状态";
  }
}

// Responses are separate system messages; reconcile both fetched and live history.
export function resolveCollabMessages(messages: CsMessage[]): CsMessage[] {
  const responses = new Map<string, CsMessage["content"]>();
  const key = (message: CsMessage) =>
    JSON.stringify([message.conversationId, message.content.collabId]);
  for (const message of messages) {
    if (message.type === "system" && message.content.collabId &&
        ["accepted", "rejected", "ended"].includes(message.content.status)) {
      responses.set(key(message), message.content);
    }
  }
  return messages.map((message) => {
    if (message.type !== "collab_request" || !message.content.collabId) return message;
    const response = responses.get(key(message));
    return response ? {
      ...message,
      content: { ...message.content, status: response.status, projectId: response.projectId },
    } : message;
  });
}
