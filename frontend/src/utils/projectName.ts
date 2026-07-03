import i18n from '@/i18n';
import { useTeamStore } from '@/stores/teamStore';

export function getDefaultProjectName(): string {
  const translated = String(
    i18n.t('workspacePage.prompt.defaultName', {
      defaultValue: '未命名项目',
    }) || '',
  ).trim();
  return translated || '未命名项目';
}

/** 将数据库中的默认/占位项目名转为当前语言展示名 */
export function localizeProjectName(name?: string | null): string {
  const untitledProjectLabel = String(
    i18n.t('workspacePage.prompt.defaultName', {
      defaultValue: i18n.t('common.untitled', { defaultValue: '未命名' }),
    }) || '未命名项目',
  ).trim();

  const raw = typeof name === 'string' ? name.trim() : '';
  if (!raw) return untitledProjectLabel;

  const normalized = raw.toLowerCase();
  if (
    raw === '未命名' ||
    raw === '未命名项目' ||
    normalized === 'untitled' ||
    normalized === 'untitled project'
  ) {
    return untitledProjectLabel;
  }
  return raw;
}

export function getWorkspaceProjectStorageKey(teamId: string, isPersonal: boolean): string {
  if (!isPersonal) {
    return `current_project_id_team_${teamId}`;
  }
  return 'current_project_id';
}

export function getActiveWorkspaceProjectStorageKey(): string {
  const { activeTeamId, teams } = useTeamStore.getState();
  const team = teams.find((t) => t.id === activeTeamId);
  if (team && !team.isPersonal) {
    return getWorkspaceProjectStorageKey(team.id, false);
  }
  return 'current_project_id';
}

export function readWorkspaceProjectId(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

export function saveWorkspaceProjectId(storageKey: string, projectId: string): void {
  try {
    localStorage.setItem(storageKey, projectId);
  } catch {
    // ignore
  }
}

export function clearWorkspaceProjectId(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}

/** 解析目标工作区进入时将打开的项目 */
export function resolveWorkspaceProject(
  projects: Array<{ id: string; name: string }>,
  storageKey: string,
): { id: string; name: string } | null {
  if (projects.length === 0) return null;
  const savedId = readWorkspaceProjectId(storageKey);
  if (savedId) {
    const saved = projects.find((p) => p.id === savedId);
    if (saved) return saved;
  }
  return projects[0] ?? null;
}
