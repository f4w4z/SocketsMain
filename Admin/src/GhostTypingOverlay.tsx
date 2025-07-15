import React from 'react';

interface GhostTypingOverlayProps {
  ghostText: string;
}

/**
 * Renders a ghost-typing line visually matching the main app's overlay.
 * Always visible (no auto-hide) for admin dashboard.
 */
const GhostTypingOverlay: React.FC<GhostTypingOverlayProps> = ({ ghostText }) => {
  if (!ghostText) return null;
  return (
    <div
      style={{
        width: '100%',
        pointerEvents: 'none',
        zIndex: 2000,
        color: '#a084e8',
        fontStyle: 'italic',
        opacity: 0.97,
        fontSize: '1.08rem',
        fontFamily: 'inherit',
        padding: '2px 0',
        textShadow: '0 1px 2px #181926, 0 0 4px #232336',
        userSelect: 'none',
        overflow: 'hidden',
        whiteSpace: 'pre-line',
        wordBreak: 'break-word',

        margin: '10px 0 0 0',
        borderRadius: 2,
      }}
      className="ghost-typing-overlay-admin"
    >
      <span role="presentation" style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'pre-line',wordBreak:'break-word'}}>{ghostText.replace(/<\/?p>/gi, '')}</span>
    </div>
  );
};

export default GhostTypingOverlay;
