export interface VideoTaskResponse {
  id: string;
  task_id: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  metadata?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  upstream_status?: string | null;
  error?: string | null;
}
