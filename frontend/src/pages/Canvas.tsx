import React, { useRef, useState, useEffect, useCallback } from 'react';
import ZoomIndicator from '@/components/canvas/ZoomIndicator';
import GridRenderer from '@/components/canvas/GridRenderer';
import InteractionController from '@/components/canvas/InteractionController';
import PaperCanvasManager from '@/components/canvas/PaperCanvasManager';
import ToolBar from '@/components/toolbar/ToolBar';
import FocusModeButton from '@/components/canvas/FocusModeButton';
import DrawingController from '@/components/canvas/DrawingController';
import LayerPanel from '@/components/panels/LayerPanel';
import LibraryPanel from '@/components/panels/LibraryPanel';
import AIChatDialog from '@/components/chat/AIChatDialog';
import FloatingHeader from '@/components/layout/FloatingHeader';
import CodeSandboxPanel from '@/components/sandbox/CodeSandboxPanel';
import SelectionBoxOverlay from '@/components/canvas/SelectionBoxOverlay';
import EraserCursorOverlay from '@/components/canvas/EraserCursorOverlay';
import { useLayerStore } from '@/stores';
import { useCanvasStore } from '@/stores/canvasStore';
import { useToolStore } from '@/stores/toolStore';
import FlowOverlay from '@/components/flow/FlowOverlay';
import CollabRoot from '@/components/collab/CollabRoot';
import CurrentProjectDeletedModal from '@/components/collab/CurrentProjectDeletedModal';
import ProjectContentStaleModal from '@/components/collab/ProjectContentStaleModal';
import { CollabProvider } from '@/collab/CollabContext';
import { CanvasCommentsProvider } from '@/contexts/CanvasCommentsContext';
import CommentDrawer from '@/components/comments/CommentDrawer';
import { migrateImageHistoryToRemote } from '@/services/imageHistoryService';
import { useAIChatStore } from '@/stores/aiChatStore';
import GlobalZoomCapture from '@/components/canvas/GlobalZoomCapture';

const Canvas: React.FC = () => {
  const chatTheme = useAIChatStore((state) => state.chatTheme);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoom = useCanvasStore((state) => state.zoom);
  const isEraser = useToolStore((state) => state.isEraser);
  const eraserSize = useToolStore((state) => state.eraserSize);
  const drawMode = useToolStore((state) => state.drawMode);
  const [isPaperInitialized, setIsPaperInitialized] = useState(false);
  const [isPaperReady, setIsPaperReady] = useState(false);

  const handlePaperInitialized = useCallback(() => {
    setIsPaperInitialized(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsPaperReady(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    migrateImageHistoryToRemote().catch((error) => {
      try {
        console.warn('[Canvas] image history migration failed', error);
      } catch {}
    });
  }, []);

  useEffect(() => {
    if (isPaperInitialized) {
      try {
        useLayerStore.getState().ensureActiveLayer();
      } catch {}
    }
  }, [isPaperInitialized]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const className = 'tanva-premium-black-theme';
    if (chatTheme === 'black') {
      document.body.classList.add(className);
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove(className);
      document.body.classList.remove('dark');
    }
    return () => {
      document.body.classList.remove(className);
    };
  }, [chatTheme]);

  return (
    <CollabProvider>
      <CanvasCommentsProvider>
        <div className="relative w-full h-full overflow-hidden">
          <GlobalZoomCapture />
          <canvas
            ref={canvasRef}
            className="tanva-main-canvas absolute inset-0 w-full h-full"
            style={{ background: 'white' }}
          />

          <EraserCursorOverlay
            canvasRef={canvasRef}
            visible={isEraser && drawMode === 'free'}
            eraserSize={eraserSize}
            zoom={zoom}
          />

          {isPaperReady && (
            <PaperCanvasManager
              canvasRef={canvasRef}
              onInitialized={handlePaperInitialized}
            />
          )}

          {isPaperInitialized && isPaperReady && (
            <>
              <GridRenderer canvasRef={canvasRef} isPaperInitialized={isPaperInitialized} />
              <InteractionController canvasRef={canvasRef} />
              <DrawingController canvasRef={canvasRef} />
            </>
          )}

          <FloatingHeader />
          <FlowOverlay />
          <SelectionBoxOverlay />
          <ToolBar />
          <FocusModeButton />
          <ZoomIndicator />
          <LayerPanel />
          <LibraryPanel />
          <AIChatDialog />
          <CommentDrawer />
          <CodeSandboxPanel />
          <CollabRoot />
          <CurrentProjectDeletedModal />
          <ProjectContentStaleModal />
        </div>
      </CanvasCommentsProvider>
    </CollabProvider>
  );
};

export default Canvas;
