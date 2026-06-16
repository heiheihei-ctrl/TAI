/**
 * Global keyboard shortcuts for undo/redo, save, and clipboard JSON helpers.
 */
import { useCallback, useEffect } from 'react';
import { projectApi } from '@/services/projectApi';
import { paperSaveService } from '@/services/paperSaveService';
import { flowSaveService } from '@/services/flowSaveService';
import { useProjectContentStore } from '@/stores/projectContentStore';
import { saveMonitor } from '@/utils/saveMonitor';
import { historyService } from '@/services/historyService';
import { sanitizeProjectContentForCloudSave } from '@/utils/projectContentValidation';
import { clipboardJsonService } from '@/services/clipboardJsonService';
import { clipboardService } from '@/services/clipboardService';
import { useTranslation } from 'react-i18next';

export default function KeyboardShortcuts() {
  const { i18n } = useTranslation();
  const isZh = (i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('zh');
  const lt = useCallback((zhText: string, enText: string) => (isZh ? zhText : enText), [isZh]);
  const projectId = useProjectContentStore((state) => state.projectId);
  const hydrated = useProjectContentStore((state) => state.hydrated);
  const hasContent = useProjectContentStore((state) => Boolean(state.content));

  useEffect(() => {
    if (!projectId || !hydrated || !hasContent) return;
    historyService.captureInitialIfEmpty().catch(() => {});
  }, [projectId, hydrated, hasContent]);

  useEffect(() => {
    const showToast = (message: string, type: "success" | "error" = "success") => {
      try {
        window.dispatchEvent(
          new CustomEvent("toast", { detail: { message, type } })
        );
      } catch {
        if (type === "error") {
          console.error(message);
        } else {
          console.log(message);
        }
      }
    };

    const isEditableTarget = (element: Element | null): boolean => {
      if (!element) return false;
      const tagName = element.tagName?.toLowerCase();
      return tagName === 'input' || tagName === 'textarea' || (element as HTMLElement).isContentEditable;
    };

    const getHistoryShortcut = (event: KeyboardEvent): 'undo' | 'redo' | null => {
      if (!(event.ctrlKey || event.metaKey)) return null;
      const key = event.key?.toLowerCase?.() || '';
      if (key === 'z' && event.shiftKey) return 'redo';
      if (key === 'y') return 'redo';
      if (key === 'z') return 'undo';
      return null;
    };

    const onHistoryKeyDownCapture = (event: KeyboardEvent) => {
      const shortcut = getHistoryShortcut(event);
      if (!shortcut) return;

      const active = document.activeElement as Element | null;
      const target = event.target as Element | null;
      if (isEditableTarget(active) || isEditableTarget(target)) return;

      event.preventDefault();
      event.stopPropagation();
      if (shortcut === 'undo') {
        historyService.undo().catch(() => {});
      } else {
        historyService.redo().catch(() => {});
      }
    };

    const onKeyDown = async (e: KeyboardEvent) => {
      const active = document.activeElement as Element | null;
      const isEditable = isEditableTarget(active);
      const target = e.target as HTMLElement | null;
      const inChat = !!target?.closest?.("[data-chat-content]");
      const path = typeof e.composedPath === "function" ? e.composedPath() : [];
      const inFlow = path.some(
        (el) =>
          el instanceof Element &&
          el.classList?.contains("tanva-flow-overlay")
      );

      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        const hasFlowPayload = !!clipboardService.getFlowData()?.nodes?.length;
        const shouldDelegateFlowShiftPaste =
          (e.key === "v" || e.key === "V") &&
          (inFlow ||
            (clipboardService.getZone() === "flow" && hasFlowPayload));
        if (shouldDelegateFlowShiftPaste) return;

        if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          try {
            if (inChat) {
              await clipboardJsonService.copyChatSessionsToClipboard();
              showToast(lt('已复制对话 JSON', 'Chat JSON copied'));
            } else {
              await clipboardJsonService.copyProjectContentToClipboard();
              showToast(lt('已复制画布 JSON', 'Canvas JSON copied'));
            }
          } catch (error) {
            console.error("快捷键复制 JSON 失败:", error);
            showToast(lt('复制失败，请重试', 'Copy failed, please try again'), "error");
          }
          return;
        }
        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          try {
            if (inChat) {
              await clipboardJsonService.importChatSessionsFromClipboard();
              showToast(lt('已导入对话 JSON', 'Chat JSON imported'));
            } else {
              await clipboardJsonService.importProjectContentFromClipboard();
              showToast(lt('已导入画布 JSON', 'Canvas JSON imported'));
            }
          } catch (error) {
            console.error("快捷键导入 JSON 失败:", error);
            showToast(lt('导入失败，请检查剪贴板内容', 'Import failed. Please check clipboard content'), "error");
          }
          return;
        }
      }

      // Undo / Redo
      if (!isEditable && (e.ctrlKey || e.metaKey)) {
        const shortcut = getHistoryShortcut(e);
        if (shortcut === 'redo') {
          e.preventDefault();
          await historyService.redo();
          return;
        }
        if (shortcut === 'undo') {
          e.preventDefault();
          await historyService.undo();
          return;
        }
      }
      // Ctrl/Cmd + S 保存
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        const storeBefore = useProjectContentStore.getState();
        if (!storeBefore.projectId || storeBefore.saving || storeBefore.manualSaving) return;
        try {
          await paperSaveService.saveImmediately();
          await flowSaveService.flushFlowNodeImageRefs();
          const store = useProjectContentStore.getState();
          const { projectId, content, version } = store;
          if (!projectId || !content) return;
          const sanitizeResult = sanitizeProjectContentForCloudSave(content);
          const invalidCanvasImageIds = sanitizeResult?.dropped.canvasImageIds ?? [];
          const invalidFlowNodeIds = sanitizeResult?.dropped.flowNodeIds ?? [];
          const contentForCloudSave = sanitizeResult?.sanitized ?? content;
          if (invalidCanvasImageIds.length > 0 || invalidFlowNodeIds.length > 0) {
            try {
              useProjectContentStore.getState().setWarning(
                lt(
                  `存在未上传到 OSS 的图片（画布 ${invalidCanvasImageIds.length} 张，Flow ${invalidFlowNodeIds.length} 处），已阻止云端保存，请重试上传后再保存`,
                  `Found images not uploaded to OSS (Canvas ${invalidCanvasImageIds.length}, Flow ${invalidFlowNodeIds.length}); cloud save is blocked. Please upload and retry.`
                )
              );
            } catch {}
            return;
          } else {
            try {
              useProjectContentStore.getState().setWarning(null);
            } catch {}
          }
          store.setManualSaving(true);
          const result = await projectApi.saveContent(projectId, { content: contentForCloudSave, version, createWorkflowHistory: true });
          store.markSaved(result.version, result.updatedAt ?? new Date().toISOString());
          try {
            saveMonitor.push(projectId, 'kb_save_success', {
              version: result.version,
              updatedAt: result.updatedAt,
              paperJsonLen: content.meta?.paperJsonLen || content.paperJson?.length || 0,
              layerCount: content.layers.length || 0,
            });
          } catch {}
        } catch (err) {
          const raw = err instanceof Error ? err.message : String(err ?? '');
          const msg = raw.includes('413') || raw.toLowerCase().includes('too large')
            ? lt('保存失败：内容过大，请尝试清理或拆分项目', 'Save failed: content is too large. Try cleaning or splitting the project')
            : (raw || lt('保存失败', 'Save failed'));
          try { useProjectContentStore.getState().setError(msg); } catch {}
        } finally {
          const store = useProjectContentStore.getState();
          if (store.projectId === storeBefore.projectId) {
            store.setManualSaving(false);
          }
        }
      }
    };
    window.addEventListener('keydown', onHistoryKeyDownCapture, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onHistoryKeyDownCapture, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [lt]);

  return null;
}
