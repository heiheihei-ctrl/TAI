export interface CollaborationPeer {
  peerId: string;
  userId: string;
  name: string;
  color: string;
  x?: number;
  y?: number;
  visible?: boolean;
}

export interface CollaborationUserPayload {
  sub: string;
  id: string;
  name?: string | null;
  phone?: string | null;
}
