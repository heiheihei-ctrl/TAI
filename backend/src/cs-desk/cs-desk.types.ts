export type CsConversationStatus = 'waiting' | 'active' | 'ended';
export type CsSenderRole = 'user' | 'agent' | 'system';
export type CsMessageType =
  | 'text'
  | 'service_package'
  | 'collab_request'
  | 'attachment'
  | 'system';
export type CsCollabStatus = 'pending' | 'accepted' | 'rejected' | 'ended';
export type CsTicketStatus = 'open' | 'in_progress' | 'closed';

export type CsWsClientEvent =
  | { type: 'join'; conversationId: string }
  | { type: 'leave'; conversationId: string }
  | { type: 'typing'; conversationId: string; typing: boolean }
  | { type: 'read'; conversationId: string };

export type CsWsServerEvent =
  | { type: 'ready'; connId: string; userId: string; role: string }
  | { type: 'message'; conversationId: string; message: any }
  | { type: 'status'; conversationId: string; status: CsConversationStatus; agentId?: string | null }
  | { type: 'typing'; conversationId: string; userId: string; typing: boolean }
  | { type: 'read'; conversationId: string; by: 'user' | 'agent' }
  | { type: 'error'; message: string };
