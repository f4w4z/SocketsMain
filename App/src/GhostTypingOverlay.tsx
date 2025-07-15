import React, { useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/react';

interface GhostTypingOverlayProps {
  editor: Editor | null;
  ghostText: string;
}

/**
 * Renders a ghost-typing line below the user's cursor in the TipTap editor.
 * This is a visual overlay only; it does not affect the actual editor content.
 */
const GhostTypingOverlay: React.FC<GhostTypingOverlayProps> = ({ editor, ghostText }) => {
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [visible, setVisible] = useState(!!ghostText);
  const hideTimeout = useRef<NodeJS.Timeout|null>(null);

  // Auto-hide after 5 seconds when ghostText changes
  useEffect(() => {
    if (!ghostText) {
      setVisible(false);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      return;
    }
    setVisible(true);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => setVisible(false), 5000);
    return () => { if (hideTimeout.current) clearTimeout(hideTimeout.current); };
  }, [ghostText]);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor || !ghostText) {
      setCoords(null);
      return;
    }
    const { view } = editor;
    const selection = view.state.selection;
    // Find the DOM node for the current selection anchor
    const domAtPos = view.domAtPos(selection.from);
    let node: HTMLElement | null = null;
    if (domAtPos.node.nodeType === 1) {
      node = domAtPos.node as HTMLElement;
    } else if (domAtPos.node.nodeType === 3) {
      node = (domAtPos.node.parentElement as HTMLElement) || null;
    }
    if (node) {
      const rect = node.getBoundingClientRect();
      // Place overlay just BELOW the line (offset by line height)
      // Clamp left and width so overlay never goes out of screen
      const minLeft = 8;
      const maxWidth = window.innerWidth - minLeft * 2;
      let left = rect.left + window.scrollX;
      let width = rect.width;
      if (left < minLeft) {
        width -= (minLeft - left);
        left = minLeft;
      }
      if (width > maxWidth) width = maxWidth;
      setCoords({
        top: rect.bottom + window.scrollY + 2, // 2px below
        left,
        width,
      });
    } else {
      setCoords(null);
    }
  }, [editor, ghostText, editor?.state?.selection?.from, editor?.isFocused]);

  if (!coords || !ghostText || !visible) return null;

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'absolute',
        top: coords.top,
        left: coords.left,
        width: coords.width || 'auto',
        maxWidth: 'calc(100vw - 16px)',
        minWidth: 40,
        pointerEvents: 'none',
        zIndex: 2000,
        color: '#a084e8',
        fontStyle: 'italic',
        opacity: 0.97,
        fontSize: '1.08rem',
        fontFamily: 'inherit',
        padding: '2px 0',
        textShadow: '0 1px 2px #181926, 0 0 4px #232336',
        transition: 'top 0.14s cubic-bezier(.4,2,.6,1)',
        userSelect: 'none',
        overflow: 'hidden',
        whiteSpace: 'pre-line',
        wordBreak: 'break-word',
      }}
      className="ghost-typing-overlay"
    >
      <span role="presentation" style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'pre-line',wordBreak:'break-word'}}>{ghostText}</span>
    </div>
  );
};

export default GhostTypingOverlay;
