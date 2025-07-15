import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { updateAlert } from './alert';
import { ref, onValue, set } from 'firebase/database';
import { db } from './firebase';
import GhostTypingOverlay from './GhostTypingOverlay';

interface Props {
  roomId: string;
  onClose: () => void;
}

export default function SocketView({ roomId, onClose }: Props) {
  const [content, setContent] = useState<string>('');
  const [editingAlert, setEditingAlert] = useState<string>('');
  const [sendingToWebhook, setSendingToWebhook] = useState(false);
  const [tickAnim, setTickAnim] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const clearAlert = async () => {
    try {
      await updateAlert(roomId, '');
      setEditingAlert('');
    } catch (error) {
      console.error('Error clearing alert:', error);
    }
  };

  // Auto-scroll when content changes, but don't force it
  useLayoutEffect(() => {
    if (contentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      const isNearBottom = scrollHeight - (scrollTop + clientHeight) < 150; // Increased threshold to 150px
      if (isNearBottom) {
        scrollToBottom();
      }
    }
  }, [content]);
  
  // Initial scroll to bottom
  useLayoutEffect(() => {
    if (contentRef.current) {
      scrollToBottom();
    }
  }, []);

  const scrollToBottom = () => {
    if (contentRef.current) {
      const { scrollHeight, clientHeight } = contentRef.current;
      const maxScrollTop = scrollHeight - clientHeight;
      contentRef.current.scrollTop = maxScrollTop > 0 ? maxScrollTop : 0;
    }
  };

  useEffect(() => {
    // Subscribe to content
    const contentRefDb = ref(db, `notepad/${roomId}/content`);
    const unsubContent = onValue(contentRefDb, snap => {
      const val = snap.val();
      if (typeof val === 'string') {
        setContent(val);
      }
    });

    // Subscribe to alert
    const alertRef = ref(db, `notepad/${roomId}/alert`);
    const unsubAlert = onValue(alertRef, snap => {
      const val = snap.val();
      if (val && typeof val.message === 'string') {
        setEditingAlert(val.message);
      } else {
        setEditingAlert('');
      }
    });

    return () => {
      unsubContent();
      unsubAlert();
    };
  }, [roomId]);

  return (
    <div style={{display:'flex', height:'100%', width:'100%', background:'#181926', color:'#e1e6fc', fontFamily:"'Space Grotesk', Inter, Arial"}}>
      <button onClick={onClose} aria-label="Close" style={{position:'absolute', top:16, right:16, background:'transparent', border:'none', color:'#e1e6fc', fontSize:'1.6rem', cursor:'pointer', lineHeight:1, padding:4}}>✕</button>
      <div style={{display:'flex', flex:1, overflow:'hidden', padding:24, gap:24, flexDirection:'column'}}>
        {/* Note Content Panel */}
        <div style={{width:'100%', display:'flex', flexDirection:'column', overflow:'hidden', flex:1}}>
          <h3 style={{margin: '0 0 8px', fontSize: '1.05rem'}}>Note Content</h3>
          <div style={{
            position: 'relative',
            flex: 1,
            minHeight: 120,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div 
              ref={contentRef}
              className="socket-content-pane" 
              style={{
                background: '#232336', 
                padding: '18px 24px 50px 18px',
                flex: 1,
                width: '100%', 
                boxSizing: 'border-box',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
                fontFamily: 'inherit',
                fontSize: '1rem',
                lineHeight: 1.4,
                overflowY: 'auto',
                scrollBehavior: 'smooth',
                cursor: 'auto',
                position: 'relative',
                maxHeight: '50vh'
              }}
              dangerouslySetInnerHTML={{ __html: content + '<div style="height: 1px;"></div>' }} 
            />
            <button 
              type="button"
              style={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                background: 'transparent',
                color: '#e1e6fc',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '1rem',
                padding: 0,
                lineHeight: 1
              }}
              title="Clear & Send to Webhook"
              disabled={sendingToWebhook}
              onClick={async()=>{
                const webhookUrl = import.meta.env.VITE_WEBHOOK_BOOKIE;
                if (!webhookUrl) {
                  alert('Bookie webhook URL is not set in .env');
                  return;
                }
                if(window.confirm('Send and clear all content for this room?')){
                  try {
                    setSendingToWebhook(true);
                    // Send current content if not empty
                    if (content) {
                      const { sendToBookieWebhook } = await import('./sendToWebhook');
                      await sendToBookieWebhook(webhookUrl, content, roomId);
                    }
                    // Clear content
                    await set(ref(db, `notepad/${roomId}/content`), '');
                    setContent('');
                    setTickAnim(true);
                    setTimeout(()=>{
                      setTickAnim(false);
                    }, 1200);
                  } catch (e) {
                    alert('Failed to send or clear notepad content.');
                  } finally {
                    setSendingToWebhook(false);
                  }
                }
              }}
            >
              {tickAnim ? (
                <span className="tick-anim" style={{display:'inline-block',verticalAlign:'middle'}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" style={{display:'block'}}>
                    <circle cx="12" cy="12" r="11" fill="#232336" stroke="#a084e8" strokeWidth="2" />
                    <path d="M7 13.5l3 3.2 6-7.2" fill="none" stroke="#a084e8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              ) : (
                '🗑️'
              )}
            </button>
          </div>
          <style>{`
            .socket-content-pane::-webkit-scrollbar { display: none; }
            .socket-content-pane { 
              scrollbar-width: none;
              -ms-overflow-style: none;
            }
          `}</style>
          <style>{`
            .socket-content-pane::-webkit-scrollbar { display: none; }
            .socket-content-pane { scrollbar-width: none; }
          `}</style>
        </div>

        {/* Live Alert Panel */}
        <div style={{width:'100%', display:'flex', flexDirection:'column', flex:1, marginTop:24}}>
          <h3 style={{margin: '0 0 8px', fontSize: '1.05rem'}}>Live Alert</h3>
          <div style={{background:'#232336', padding:18, flex:1, display:'flex', flexDirection:'column', position: 'relative'}}>
            {/* Ghost overlay of user content, always visible for admin */}
            <GhostTypingOverlay ghostText={content} />
            <div style={{position: 'absolute', bottom: 8, right: 8, zIndex: 1}}>
              <button 
                onClick={clearAlert}
                style={{
                  background: 'transparent',
                  color: '#e1e6fc',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  padding: 0,
                  lineHeight: 1
                }}
                title="Clear alert"
              >
                🗑️
              </button>
            </div>
            <textarea
            value={editingAlert}
            onChange={e=>{
              const val = e.target.value;
              setEditingAlert(val);
              updateAlert(roomId, val);
            }}
            rows={6}
            style={{width:'100%', background:'transparent', color:'#e1e6fc', border:'none', outline:'none', resize:'vertical', fontFamily:'inherit', fontSize:'1rem', lineHeight:1.4, flex:1, marginTop:12}}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
