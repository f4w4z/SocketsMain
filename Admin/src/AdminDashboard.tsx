import { useEffect, useState, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { db } from './firebase';
import { listSessionIds, fetchAndStitchAudio, groupSessionIdsByDate } from './audioUtils';
import { ref, onValue, set } from 'firebase/database';
import { deleteRoomCompletely } from './deleteRoomCompletely';
import { subscribePresence } from './presence';
import { updateAlert, clearAlert, subscribeAlert } from './alert';
import { WebRTCListener } from './webrtc-listener';
import SocketView from './SocketView';

interface RoomInfo {
  id: string;
  title: string;
  content: string;
}

function LiveRoomAlert({ roomId }: { roomId: string }) {
  const [alert, setAlert] = useState<string>('');

  useEffect(() => {
    // Subscribe to live alert
    const unsub = subscribeAlert(roomId, (a) => {
      setAlert(a?.message || '');
    });
    return () => unsub();
  }, [roomId]);

  // Live update as admin types
  useEffect(() => {
    updateAlert(roomId, alert);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert]);

  return (
    <div style={{background:'#232336',padding:'18px',borderRadius:0,marginBottom:18,marginTop:8}}>
      <div style={{fontWeight:600,marginBottom:8,color:'#a084e8',fontSize:'1.08rem',marginLeft:2}}>Live Alert</div>
      <textarea
        value={alert}
        onChange={e => {
          setAlert(e.target.value);
          const ta = e.target as HTMLTextAreaElement;
          ta.style.height = 'auto';
          ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';
        }}
        placeholder="Type a live alert..."
        style={{width:'100%',marginLeft:0,marginRight:0,minHeight:50,maxHeight:220,background:'#181926',color:'#e1e6fc',border:'1px solid #39395a',borderRadius:0,padding:'10px',fontSize:'1.08rem',marginBottom:8,resize:'none',fontFamily:"'Fira Mono', Consolas, monospace",boxSizing:'border-box',overflow:'hidden'}}
        rows={1}
      />
      <div style={{display:'flex',gap:12,marginLeft:0,marginRight:0}}>
        <button
          onClick={()=>{clearAlert(roomId);setAlert('')}}
          style={{padding:'7px 0',background:'#ff4f4f',color:'#fff',fontWeight:700,fontSize:'1.01rem',border:'none',borderRadius:0,cursor:'pointer',flex:1,opacity:alert?'1':'0.7'}}
          disabled={!alert}
        >Clear Alert</button>
      </div>
    </div>
  );
}

// --- SessionSelector component ---
import { getSessionMetadata } from './audioUtils';

import { deleteSession } from './audioUtils';

function SessionSelector({ roomId, sessions, selectedSession, setSelectedSession, selectedDate, refreshSessions }: {
  roomId: string;
  sessions: {sessionId: string, time: string}[];
  selectedSession: string | null;
  setSelectedSession: (sid: string) => void;
  selectedDate: string;
  refreshSessions: () => void;
}) {
  type SessionMeta = {
  durationStr: string;
  chunkCount: number;
  presentChunks: number[];
  missingChunks: number[];
  endTime?: number;
};
const [meta, setMeta] = useState<Record<string, SessionMeta>>({});
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let isMounted = true;
    setLoadingMeta(true);
    Promise.all(
      sessions.map(({sessionId}) => getSessionMetadata(roomId, sessionId)
        .then(md => ({sessionId, ...md}))
        .catch(() => ({sessionId, durationStr: '--:--', chunkCount: 0, presentChunks: [], missingChunks: [], endTime: undefined}))
      )
    ).then(arr => {
      if (!isMounted) return;
      const m: Record<string, SessionMeta> = {};
      arr.forEach(({sessionId, durationStr, chunkCount, presentChunks, missingChunks, endTime}) => {
        m[sessionId] = {
          durationStr,
          chunkCount,
          presentChunks: presentChunks || [],
          missingChunks: missingChunks || [],
          endTime
        };
      });
      setMeta(m);
      setLoadingMeta(false);
    });
    return () => { isMounted = false; };
  }, [roomId, sessions]);

  return (
    <div style={{marginBottom:10}}>
      <div style={{fontWeight:600, marginBottom:8, fontSize:'1.13rem'}}>Recordings for {selectedDate}:</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
          width: '100%',
        }}
      >
        {sessions.map(({sessionId, time}) => {
          const metaObj = meta[sessionId];
          return (
            <div
              key={sessionId}
              title={`SessionId: ${sessionId}`}
              style={{
                background: selectedSession === sessionId ? '#a084e8' : '#232336',
                color: selectedSession === sessionId ? '#232336' : '#e1e6fc',
                border: '2px solid',
                borderColor: selectedSession === sessionId ? '#a084e8' : '#39395a',
                borderRadius: 0,
                boxShadow: selectedSession === sessionId ? '0 2px 12px #a084e888' : '0 1px 4px #18192688',
                padding: '16px 14px 14px 14px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                fontWeight: selectedSession === sessionId ? 700 : 500,
                position: 'relative',
                outline: selectedSession === sessionId ? '2px solid #fff' : 'none',
                opacity: (loadingMeta && !metaObj) || deleting[sessionId] ? 0.6 : 1,
                minHeight: 160,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxSizing: 'border-box',
              }}
              onClick={() => setSelectedSession(sessionId)}
            >
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
                  <span style={{fontWeight:700,fontSize:'1.12rem',letterSpacing:0.4}}>
                    <span role="img" aria-label="clock">🕒</span> {time}
                  </span>
                  <span style={{fontSize:'0.98rem',fontWeight:500,color:selectedSession===sessionId?'#232336':'#b8b8d1'}}>
                    <span role="img" aria-label="duration">⏱️</span> {metaObj?.durationStr || <span style={{opacity:0.5}}>loading...</span>}
                  </span>
                </div>
                <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:8,marginTop:2}}>
                  <span style={{fontSize:'1.02rem'}} role="img" aria-label="chunks">🔊</span>
                  <span style={{fontSize:'0.99rem'}}>{metaObj?.chunkCount ?? <span style={{opacity:0.5}}>...</span>} chunks</span>
                  <span style={{fontSize:'1.02rem',marginLeft:8}} role="img" aria-label="id">#️⃣</span>
                  <span style={{fontSize:'0.98rem',userSelect:'all',wordBreak:'break-all'}}>{sessionId.slice(0,16)}...</span>
                </div>
                {metaObj?.missingChunks && (
                  <div style={{marginTop:8, fontSize:'0.97rem', color: metaObj.missingChunks.length > 0 ? '#ff4f4f' : '#b8b8d1', fontWeight:500}}>
                    <span role="img" aria-label="alert">{metaObj.missingChunks.length > 0 ? '⚠️' : 'ℹ️'}</span> Missing: {metaObj.missingChunks.length}
                    <span style={{marginLeft:8,fontSize:'0.92rem',color:metaObj.missingChunks.length>0?'#ffb8b8':'#b8b8d1'}}>
                      {metaObj.missingChunks.length > 0 ? `Bad seconds: ${metaObj.missingChunks.join(', ')}` : 'Bad seconds: none'}
                    </span>
                  </div>
                )}
                {metaObj?.presentChunks && metaObj.presentChunks.length > 0 && metaObj.missingChunks && metaObj.missingChunks.length === 0 && (
                  <div style={{marginTop:8, fontSize:'0.97rem', color:'#3be37b', fontWeight:500}}>
                    <span role="img" aria-label="ok">✅</span> All chunks present
                  </div>
                )}
                {metaObj?.endTime && (
                  <div style={{
                    fontSize: '0.97rem',
                    color: selectedSession === sessionId ? '#442b7e' : '#a084e8',
                    marginTop: 8,
                    fontWeight: 600
                  }}>
                    <span role="img" aria-label="end">🛑</span> Ended: {new Date(metaObj.endTime).toLocaleString()}
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label="Delete session"
                disabled={deleting[sessionId]}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (deleting[sessionId]) return;
                  if (!window.confirm('Delete this recording session? This cannot be undone.')) return;
                  setDeleting(d => ({...d, [sessionId]: true}));
                  try {
                    await deleteSession(roomId, sessionId);
                    refreshSessions();
                  } finally {
                    setDeleting(d => ({...d, [sessionId]: false}));
                  }
                }}
                style={{
                  marginTop:14,
                  background:'#ff4f4f',
                  color:'#fff',
                  border:'none',
                  borderRadius:0,
                  padding:'7px 0',
                  fontSize:'1.06rem',
                  fontWeight:600,
                  cursor:deleting[sessionId]?'not-allowed':'pointer',
                  opacity:deleting[sessionId]?0.7:1,
                  width:'100%',
                  boxShadow:'0 1px 3px #18192633',
                  transition:'background 0.18s',
                  zIndex:2
                }}
              >{deleting[sessionId] ? <span className="spinner" style={{display:'inline-block',width:15,height:15,border:'2px solid #fff',borderTop:'2px solid #ffb8b8',borderRadius:'50%',animation:'spin 1s linear infinite'}} /> : 'Delete'}</button>
              {loadingMeta && !metaObj && (
                <div style={{position:'absolute',top:6,right:10}}>
                  <span className="spinner" style={{display:'inline-block',width:16,height:16,border:'2px solid #e1e6fc',borderTop:'2px solid #a084e8',borderRadius:'50%',animation:'spin 1s linear infinite'}} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg);} 100% {transform: rotate(360deg);} }
        @media (max-width: 600px) {
          .session-card {
            min-width: 98vw !important;
            max-width: 100vw;
            padding: 12px 6px !important;
            font-size: 0.98rem !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function AdminDashboard() {
  // State for webhook button animation
  const [sendingToWebhook, setSendingToWebhook] = useState(false);
  // Persist admin authentication
  const [authed, setAuthed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('adminAuthed') === 'true';
    }
    return false;
  });
  const [webhookTick, setWebhookTick] = useState(false);
  // State for Change PIN tick animation
  const [changingPin, setChangingPin] = useState(false);
  const [pinTick, setPinTick] = useState(false);
// PIN state
const [roomPin, setRoomPin] = useState<string|null>(null);
const [pinLoading, setPinLoading] = useState(false);
const [pinError, setPinError] = useState<string|null>(null);
  // State for 'Clear' button tick animation
  const [clearingOnly, setClearingOnly] = useState(false);
  const [clearOnlyTick, setClearOnlyTick] = useState(false);
  // --- Live Audio Listening State ---
  // Removed unused liveAudioRoomId state (was not being read)
  const [listening, setListening] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const webrtcListenerRef = useRef<WebRTCListener | null>(null);

  // Cleanup listener on unmount
  useEffect(() => {
    return () => {
      if (webrtcListenerRef.current) {
        webrtcListenerRef.current.close();
        webrtcListenerRef.current = null;
        console.log('[WebRTC-Admin] Cleaned up on unmount');
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Stop listening handler
  const stopListening = () => {
    setListening(false);
    // Removed setLiveAudioRoomId(null) (liveAudioRoomId state removed)
    if (webrtcListenerRef.current) {
      webrtcListenerRef.current.close();
      webrtcListenerRef.current = null;
      console.log('[WebRTC-Admin] Stopped listening');
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
  };

  const [editing, setEditing] = useState(false);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<RoomInfo|null>(null);
  const [socketOpen, setSocketOpen] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [authError, setAuthError] = useState('');
  const [viewers, setViewers] = useState<Record<string, number>>({});

  // --- Audio session state ---
  const [audioSessions, setAudioSessions] = useState<string[]>([]);
  const [audioSessionsByDate, setAudioSessionsByDate] = useState<Record<string, {sessionId: string, time: string}[]>>({});
  const [selectedDate, setSelectedDate] = useState<string>("");
  // Helper: sorted date keys
  const sortedDateKeys = Object.keys(audioSessionsByDate).sort().reverse(); // Most recent date first

  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
const [audioProgress, setAudioProgress] = useState<{ loaded: number; total: number } | null>(null);
const [audioBatchSize, setAudioBatchSize] = useState<number>(10);

  // TipTap editor for admin room content
  const editor = useEditor({
    extensions: [StarterKit, Image],
    content: '',
    autofocus: true,
    editorProps: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      handlePaste(_view, event, _slice) {
        const items = event.clipboardData?.items;
        if (!items || !selectedRoom) return false;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.indexOf('image') !== -1) {
            const file = item.getAsFile();
            if (file) {
              const upload = async () => {
                try {
                  const { uploadImageToR2 } = await import('./utils/r2Upload');
                  const url = await uploadImageToR2(file, selectedRoom.id);
                  editor?.chain().focus().setImage({ src: url }).run();
                } catch (err) {
                  alert('Failed to upload image.');
                }
              };
              upload();
              event.preventDefault();
              return true;
            }
          }
        }
        return false;
      }
    }
  });

  // Simple hardcoded admin password for demo (replace with env/config in prod)
  const ADMIN_PASSWORD = 'admin1234';

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    const notepadRef = ref(db, 'notepad');
    const unsubscribe = onValue(notepadRef, (snapshot: import('firebase/database').DataSnapshot) => {
      const val = snapshot.val();
      if (!val) { setRooms([]); setLoading(false); return; }
      const roomArr: RoomInfo[] = Object.entries(val).map(([id, data]: any) => ({
        id,
        title: data.title || '(untitled)',
        content: data.content || '',
      }));
      setRooms(roomArr);
      setLoading(false);
      // Subscribe to presence for each room
      roomArr.forEach(room => {
        if (!viewers[room.id]) {
          subscribePresence(room.id, (count: number) => setViewers(v => ({...v, [room.id]: count})));
        }
      });
    });
    return () => unsubscribe();
  }, [authed]);

  // Real-time sync for selected room's content (disable sync while editing)
  useEffect(() => {
    if (selectedRoom) {
      editor?.commands.setContent(selectedRoom.content);
      // Fetch audio sessions for this room
      setAudioSessions([]);
      setSelectedSession(null);
      setAudioUrl(null);
      (async () => {
        try {
          const sessions = await listSessionIds(selectedRoom.id);
          setAudioSessions(sessions);
          const grouped = groupSessionIdsByDate(sessions);
          setAudioSessionsByDate(grouped);
          // Pick today's date if available, else latest date, else blank
          const todayYMD = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0,10);
          let initialDate = "";
          if (grouped[todayYMD]) initialDate = todayYMD;
          else if (Object.keys(grouped).length) initialDate = Object.keys(grouped).sort().reverse()[0];
          setSelectedDate(initialDate);
          setSelectedSession(null);
          setAudioUrl(null);
        } catch (err) {
          setAudioSessions([]);
          setAudioSessionsByDate({});
          setSelectedDate("");
          setSelectedSession(null);
          setAudioUrl(null);
        }
      })();
    }
  }, [selectedRoom, editor]);

  // Real-time PIN subscription
  useEffect(() => {
    if (!selectedRoom) {
      setRoomPin(null);
      setPinError(null);
      setPinLoading(false);
      return;
    }
    setPinLoading(true);
    setPinError(null);
    const pinRef = ref(db, `notepad/${selectedRoom.id}/pin`);
    const unsub = onValue(pinRef, (snap) => {
      setPinLoading(false);
      if (!snap.exists()) {
        setRoomPin(null);
        setPinError(null);
      } else {
        setRoomPin(snap.val());
        setPinError(null);
      }
    }, () => {
      setPinLoading(false);
      setRoomPin(null);
      setPinError('Failed to load PIN');
    });
    return () => unsub();
  }, [selectedRoom]);

  // Fetch and stitch audio when session is selected
  useEffect(() => {
    if (selectedRoom && selectedSession) {
      setAudioLoading(true);
      setAudioUrl(null);
      setAudioProgress(null);
      fetchAndStitchAudio(selectedRoom.id, selectedSession, (loaded, total) => {
        setAudioProgress({ loaded, total });
      }, audioBatchSize)
        .then(url => setAudioUrl(url))
        .catch(() => setAudioUrl(null))
        .finally(() => {
          setAudioLoading(false);
          setAudioProgress(null);
        });
    }
  }, [selectedRoom, selectedSession, audioBatchSize]);

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    const notepadRef = ref(db, 'notepad');
    const unsubscribe = onValue(notepadRef, (snapshot: import('firebase/database').DataSnapshot) => {
      const val = snapshot.val();
      if (!val) { setRooms([]); setLoading(false); return; }
      const roomArr: RoomInfo[] = Object.entries(val).map(([id, data]: any) => ({
        id,
        title: data.title || '(untitled)',
        content: data.content || '',
      }));
      setRooms(roomArr);
      setLoading(false);
      // Subscribe to presence for each room
      roomArr.forEach(room => {
        if (!viewers[room.id]) {
          subscribePresence(room.id, (count: number) => setViewers(v => ({...v, [room.id]: count})));
        }
      });
    });
    return () => unsubscribe();
  }, [authed]);

  // Real-time sync for selected room's content (disable sync while editing)
  useEffect(() => {
    if (!selectedRoom || !editor) return;
    const contentRef = ref(db, `notepad/${selectedRoom.id}/content`);
    const unsub = onValue(contentRef, (snap) => {
      const val = snap.val();
      // Only update the editor if not in editing mode
      if (!editing && typeof val === 'string' && val !== editor.getHTML()) {
        editor.commands.setContent(val, false);
      }
    });
    return () => unsub();
  }, [selectedRoom, editor, editing]);

    async function handleDeleteRoom(roomId: string) {
    if (!window.confirm('Delete this room and ALL its data (notes, recordings, pins, presence, alerts, signaling)? This cannot be undone.')) return;
    try {
      await deleteRoomCompletely(roomId);
      setRooms(r => r.filter(room => room.id !== roomId));
      if (selectedRoom?.id === roomId) setSelectedRoom(null);
      alert('Room and all associated data deleted successfully.');
    } catch (err) {
      console.error('Failed to delete room completely:', err);
      alert('Failed to delete room. See console for details.');
    }
  }

  function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (adminPass === ADMIN_PASSWORD) {
      setAuthed(true);
      setAuthError('');
    localStorage.setItem('adminAuthed', 'true');
    } else {
      setAuthError('Incorrect password');
    }
  }

  if (!authed) {
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:'#181926',color:'#e1e6fc'}}>
        <form onSubmit={handleAuth} style={{display:'flex',flexDirection:'column',gap:16,minWidth:280,alignItems:'center',textAlign:'center'}}>
          <div style={{fontWeight:600,fontSize:'1.2rem',marginBottom:8}}>Admin Login</div>
          <input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} placeholder="Admin password" style={{fontSize:'1.1rem',padding:'10px',background:'#232336',color:'#e1e6fc',border:'none',outline:'none',borderRadius:0,textAlign:'center',width:'100%'}} autoFocus />
          {authError && <div style={{color:'#ff4f4f',fontSize:'0.97rem'}}>{authError}</div>}
          <button type="submit" style={{padding:'14px 0',background:'#a084e8',color:'#232336',fontWeight:800,fontSize:'1.18rem',border:'none',borderRadius:0,cursor:'pointer',width:'100%',minWidth:180,marginTop:4,boxShadow:'0 2px 12px #0002'}}>Login</button>
        </form>
      </div>
    );
  }

  // --- MOBILE ROOM SELECTOR OVERLAY ---
const [showRoomSelector, setShowRoomSelector] = useState(() => {
  if (typeof window !== 'undefined') {
    return window.innerWidth <= 700 && !selectedRoom;
  }
  return false;
});

useEffect(() => {
  const handleResize = () => {
    if (window.innerWidth > 700) {
      setShowRoomSelector(false);
    } else if (!selectedRoom) {
      setShowRoomSelector(true);
    }
  };
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, [selectedRoom]);

const isMobile = typeof window !== 'undefined' && window.innerWidth <= 700;

if (isMobile && (showRoomSelector || !selectedRoom)) {
  return (
    <div className="mobile-room-selector-overlay" style={{position:'fixed',zIndex:10000,top:0,left:0,width:'100vw',height:'100vh',background:'#181926',color:'#e1e6fc',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start',overflowY:'auto',padding:'0'}}>
      <div style={{fontWeight:700,fontSize:'1.4rem',margin:'32px 0 24px 0',textAlign:'center'}}>Select a Room</div>
      {loading ? <div style={{textAlign:'center',marginTop:40}}>Loading...</div> :
        rooms.length === 0 ? <div style={{textAlign:'center'}}>No rooms found.</div> :
        <div style={{width:'100%',maxWidth:480,margin:'0 auto',display:'flex',flexDirection:'column',gap:0}}>
          {rooms.map(room => (
            <div
              className="mobile-room-list-item"
              key={room.id}
              style={{padding:'20px 18px',borderBottom:'1px solid #39395a',background:'#232336',margin:'0 0 0 0',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'flex-start',transition:'background 0.15s'}}
              onClick={() => {
                setSelectedRoom(room);
                setShowRoomSelector(false);
              }}
            >
              <div style={{fontWeight:700,fontSize:'1.13rem',marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#a084e8'}}>{room.title}</div>
              <div style={{fontSize:'0.97rem',color:'#bcbcd6',wordBreak:'break-all',marginBottom:6}}>{room.id}</div>
              <div style={{fontSize:'0.97rem',color:'#bcbcd6',marginBottom:6}}>👁️ {viewers[room.id] ?? 0} viewers</div>
              <button
  title="Delete Room"
  onClick={e => { e.stopPropagation(); handleDeleteRoom(room.id); }}
  style={{background:'#ff4f4f',color:'#fff',border:'none',borderRadius:0,marginTop:4,padding:'7px 12px',alignSelf:'flex-end',cursor:'pointer',fontSize:'1.25rem',display:'flex',alignItems:'center',justifyContent:'center'}}
  aria-label={`Delete room ${room.title}`}
>🗑️</button>
            </div>
          ))}
        </div>
      }
    </div>
  );
}

return (
  <div className="admin-dashboard-root" style={{display:'flex',height:'100vh',background:'#181926',color:'#e1e6fc',fontFamily:"'Space Grotesk', Inter, Arial, Helvetica, sans-serif"}}>
    {/* Desktop sidebar */}
    {!isMobile && (
      <div className="admin-sidebar" style={{width:340,background:'#232336',padding:'32px 0',borderRight:'none',display:'flex',flexDirection:'column',gap:0}}>
        <div style={{fontWeight:700,fontSize:'1.3rem',margin:'0 0 22px 0',textAlign:'center'}}>Rooms</div>
        {loading ? <div style={{textAlign:'center',marginTop:40}}>Loading...</div> :
          rooms.length === 0 ? <div style={{textAlign:'center'}}>No rooms found.</div> :
          <div style={{overflowY:'auto',flex:1}}>
            {rooms.map(room => (
              <div className="admin-room-list-item" key={room.id} style={{padding:'16px 18px',borderBottom:'1px solid #39395a',display:'flex',alignItems:'center',justifyContent:'space-between',gap:6,background:selectedRoom?.id===room.id?'#25253c':'none'}}>
                <div style={{flex:1, minWidth:0, cursor:'pointer'}} onClick={()=>setSelectedRoom(room)}>
                  <div className="room-title" style={{fontWeight:600,fontSize:'1.06rem',marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {room.title}
                    <span style={{marginLeft:8,background:'#39395a',color:'#a084e8',fontWeight:700,fontSize:'0.98rem',padding:'2px 9px',borderRadius:10,verticalAlign:'middle'}} title="Viewers">👁️ {viewers[room.id] ?? 0}</span>
                  </div>
                  <div className="room-id" style={{fontSize:'0.96rem',color:'#a084e8',wordBreak:'break-all'}}>{room.id}</div>
                </div>
                <button
                  title="Delete Room"
                  onClick={e => { e.stopPropagation(); handleDeleteRoom(room.id); }}
                  style={{marginLeft:8,background:'none',border:'none',color:'#ff4f4f',fontSize:'1.3rem',cursor:'pointer',padding:'4px 8px',borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center'}}
                  aria-label={`Delete room ${room.title}`}
                >
                  🗑️
                </button>
              </div>
            ))} 
          </div>
        }
      </div>
    )}
    <div className="admin-content" style={{flex:1,padding:isMobile?'10px 2vw':'38px 40px',overflowY:'auto',display:'flex',flexDirection:'column',width:'100vw',maxWidth:'100vw'}}>
      {/* Mobile: back button to room selector */}
      
      {!selectedRoom ? (
        <div style={{color:'#bcbcd6',fontSize:'1.1rem',margin:'auto'}}>Select a room to view details.</div>
      ) : (
        <div style={{maxWidth:700,margin:'0 auto',width:'100%'}}>
          <div style={{fontWeight:700,fontSize:'1.22rem',marginBottom:12}}>{selectedRoom.title}</div>
          <div style={{fontSize:'0.97rem',marginBottom:18,wordBreak:'break-word',color:'#bcbcd6'}}><b>ID:</b> {selectedRoom.id}</div>
            <button
              type="button"
              style={{padding:'10px 0',background:'#a084e8',color:'#232336',fontWeight:700,fontSize:'1.04rem',border:'none',borderRadius:0,cursor:'pointer',width:'100%',marginBottom:18,position:'relative',display:'flex',alignItems:'center',justifyContent:'center'}}
              disabled={sendingToWebhook}
              onClick={async()=>{
                if (!selectedRoom) return;
                const webhookUrl = import.meta.env.VITE_WEBHOOK_BOOKIE;
                if (!webhookUrl) {
                  alert('Bookie webhook URL is not set in .env');
                  return;
                }
                try {
                  setSendingToWebhook(true);
                  const { ref, get } = await import('firebase/database');
                  const snap = await get(ref(db, `notepad/${selectedRoom.id}/content`));
                  const content = snap.exists() ? snap.val() : '';
                  if (!content) {
                    alert('No notepad content found for this room.');
                    setSendingToWebhook(false);
                    return;
                  }
                  const { sendToBookieWebhook } = await import('./sendToWebhook');
                  await sendToBookieWebhook(webhookUrl, content, selectedRoom.id);
                  setWebhookTick(true);
                  setTimeout(()=>{
                    setWebhookTick(false);
                  }, 1200);
                } catch (e) {
                  alert('Failed to send notepad content to webhook.');
                } finally {
                  setSendingToWebhook(false);
                }
              }}
            >
              {webhookTick ? (
                <span className="tick-anim" style={{display:'inline-block',verticalAlign:'middle'}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" style={{display:'block'}}>
                    <circle cx="12" cy="12" r="11" fill="#232336" stroke="#a084e8" strokeWidth="2" />
                    <path d="M7 13.5l3 3.2 6-7.2" fill="none" stroke="#a084e8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              ) : (
                'Send Notepad Content to Bookie Webhook'
              )}
            </button>
            <button
              onClick={() => {
                setSocketOpen(true);
              }}style={{padding:'10px 0', background:'#39395a', color:'#fff', fontWeight:700, fontSize:'1.04rem', border:'none', borderRadius:0, cursor:'pointer', width:'100%', marginBottom:18}}
            >Open Socket</button>
            {socketOpen && (
              <div style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'#181926', display:'flex', flexDirection:'column', zIndex:1000}}>
                <div style={{width:'100%', height:'100%', position:'relative'}}>
                  <SocketView roomId={selectedRoom.id} onClose={()=>setSocketOpen(false)} />
                </div>
              </div>
            )}
            <div style={{position:'relative', width:'100%', marginBottom:12}}>
              <div style={{fontWeight:600,marginBottom:6}}>Content:</div>

              {selectedRoom && (
                editing ? (
                  <div style={{
                    background: '#232336',
                    border: 'none',
                    borderRadius: 0,
                    padding: '12px 8px',
                    color: '#e1e6fc',
                    fontSize: '1.09rem',
                    minHeight: '60px',
                    maxHeight: '60vh',
                    margin: '12px auto',
                    boxSizing: 'border-box',
                    maxWidth: 700,
                    width: '100%',
                    overflowX: 'auto',
                    overflowY: 'auto',
                    wordBreak: 'break-word',
                    transition: 'all 0.18s'
                  }}>
                    <EditorContent editor={editor} style={{minHeight: '60px', maxHeight: '60vh', background: 'transparent', outline: 'none', boxShadow: 'none', width: '100%'}} />
                    <style>{`
                      .ProseMirror {
                        min-height: 60px;
                        max-height: 60vh;
                        overflow-y: auto;
                        transition: all 0.18s;
                      }
                      .ProseMirror:focus {
                        outline: none !important;
                        box-shadow: none !important;
                        border: none !important;
                      }
                    `}</style>
                  </div>
                ) : (
                  <div
                    style={{
                      background: '#232336',
                      border: 'none',
                      borderRadius: 0,
                      padding: '18px 8px',
                      color: '#e1e6fc',
                      fontSize: '1.09rem',
                      minHeight: '60px',
                      margin: '18px auto 18px auto',
                      boxSizing: 'border-box',
                      maxWidth: 820,
                      width: '100%',
                      overflowX: 'auto',
                      wordBreak: 'break-word'
                    }}
                    dangerouslySetInnerHTML={{ __html: editor ? editor.getHTML() : '' }}
                  />
                )
              )}
              <div style={{display:'flex',gap:10,marginTop:10,flexWrap:'wrap'}}>
                <button
                  onClick={async()=>{
                    if (!selectedRoom || !selectedRoom.id) return;
                    if (editing) {
                      // Save
                      if (editor) {
                        await set(ref(db,`notepad/${selectedRoom.id}/content`), editor.getHTML());
                      }
                      setEditing(false);
                    } else {
                      // Enter edit mode
                      setEditing(true);
                    }
                  }}
                  style={{padding:'10px 0',background:'#a084e8',color:'#232336',fontWeight:700,fontSize:'1.04rem',border:'none',borderRadius:0,cursor:'pointer',flex:1}}
                >{editing ? 'Save' : 'Edit'}</button>
                <div className="clear-actions" style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:12}}>
                <button
                  type="button"
                  className="clear-btn"
                  style={{
                    padding: '10px 0',
                    background: '#ff4f4f',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '1.04rem',
                    border: 'none',
                    borderRadius: 0,
                    cursor: 'pointer',
                    flex: '1 1 160px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}
                  disabled={clearingOnly}
                  onClick={async () => {
                    if (!selectedRoom) return;
                    if (window.confirm('Clear all content for this room?')) {
                      try {
                        setClearingOnly(true);
                        await set(ref(db, `notepad/${selectedRoom.id}/content`), '');
                        setRooms((rooms) => rooms.map(r => r.id === selectedRoom.id ? { ...r, content: '' } : r));
                        setClearOnlyTick(true);
                        setTimeout(() => setClearOnlyTick(false), 1200);
                      } catch (e) {
                        alert('Failed to clear notepad content.');
                      } finally {
                        setClearingOnly(false);
                      }
                    }
                  }}
                >
                  {clearOnlyTick ? (
                    <span className="tick-anim" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" style={{ display: 'block' }}>
                        <circle cx="12" cy="12" r="11" fill="#232336" stroke="#ff4f4f" strokeWidth="2" />
                        <path d="M7 13.5l3 3.2 6-7.2" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  ) : (
                    'Clear'
                  )}
                </button>
                <button
                  type="button"
                  style={{
                    padding: '10px 0',
                    background: '#a084e8',
                    color: '#232336',
                    fontWeight: 700,
                    fontSize: '1.04rem',
                    border: 'none',
                    borderRadius: 0,
                    cursor: 'pointer',
                    flex: '1 1 160px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}
                  disabled={sendingToWebhook}
                  onClick={async () => {
                    if (!selectedRoom) return;
                    const webhookUrl = import.meta.env.VITE_WEBHOOK_BOOKIE;
                    if (!webhookUrl) {
                      alert('Bookie webhook URL is not set in .env');
                      return;
                    }
                    if (window.confirm('Send and clear all content for this room?')) {
                      try {
                        setSendingToWebhook(true);
                        // Fetch latest content directly from DB to ensure we don't send empty after local updates
                        const { get, ref: dbRef } = await import('firebase/database');
                        const snap = await get(dbRef(db, `notepad/${selectedRoom.id}/content`));
                        const latestContent = snap.exists() ? String(snap.val()) : '';
                        const { sendToBookieWebhook } = await import('./sendToWebhook');
                        await sendToBookieWebhook(webhookUrl, latestContent, selectedRoom.id);
                        // Now clear
                        await set(dbRef(db, `notepad/${selectedRoom.id}/content`), '');
                        setRooms((rooms) => rooms.map(r => r.id === selectedRoom.id ? { ...r, content: '' } : r));
                        setWebhookTick(true);
                        setTimeout(() => setWebhookTick(false), 1200);
                      } catch (e) {
                        alert('Failed to send or clear notepad content.');
                      } finally {
                        setSendingToWebhook(false);
                      }
                    }
                  }}
                >
                  {webhookTick ? (
                    <span className="tick-anim" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" style={{ display: 'block' }}>
                        <circle cx="12" cy="12" r="11" fill="#232336" stroke="#a084e8" strokeWidth="2" />
                        <path d="M7 13.5l3 3.2 6-7.2" fill="none" stroke="#a084e8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  ) : (
                    'Clear & Send to Webhook'
                  )}
                </button>
                </div>
              </div>
            </div>

            {/* Live Alert UI */}
            <LiveRoomAlert roomId={selectedRoom.id} />

            {/* Audio Session Playback UI */}
            {/* --- LIVE AUDIO LISTENING UI --- */}
            <div style={{position:'sticky', top:0, zIndex:10, background:'#232336', marginTop:24, marginBottom:12, paddingBottom:8, borderBottom:'1px solid #39395a'}}>
              <audio ref={audioRef} controls style={{width:'100%',marginTop:8,marginBottom:8}} />
              <button
                style={{padding:'12px 0', background:'#a084e8', color:'#232336', fontWeight:700, fontSize:'1.08rem', border:'none', borderRadius:0, cursor:'pointer', width:'100%'}}
                disabled={listening}
                onClick={async () => {
                  if (!selectedRoom) return;
                  setListening(true);
                  const roomSignalingPath = `webrtc-signaling/${selectedRoom.id}`;
                  await import('firebase/database').then(async ({ ref, set }) => {
                    await set(ref(db, roomSignalingPath), null);
                    await set(ref(db, `${roomSignalingPath}/pleaseSendOffer`), true);
                    console.log('[WebRTC-Admin] Cleared old signaling and set pleaseSendOffer');
                  });
                  if (webrtcListenerRef.current) {
                    webrtcListenerRef.current.close();
                    webrtcListenerRef.current = null;
                  }
                  const listener = new WebRTCListener({
                    roomId: selectedRoom.id,
                    onStream: (stream: MediaStream) => {
                      console.log('[WebRTC-Admin] ontrack fired. Stream:', stream);
                      if (stream.getAudioTracks().length === 0) {
                        console.warn('[WebRTC-Admin] No audio tracks in remote stream!');
                      } else {
                        console.log('[WebRTC-Admin] Remote audio tracks:', stream.getAudioTracks());
                      }
                      if (audioRef.current) {
                        audioRef.current.srcObject = stream;
                        audioRef.current.muted = false;
                        audioRef.current.volume = 1.0;
                        audioRef.current.play().then(() => {
                          console.log('[WebRTC-Admin] Audio playback started');
                        }).catch(e => {
                          console.warn('[WebRTC-Admin] Audio playback error:', e);
                        });
                      } else {
                        console.error('[WebRTC-Admin] audioRef.current is null');
                      }
                    }
                  });
                  webrtcListenerRef.current = listener;
                  await listener.start();
                  console.log('[WebRTC-Admin] Listening for live audio...');
                }}
              >
                {listening ? 'Listening...' : 'Listen Live'}
              </button>
              {listening && (
                <button
                  style={{padding:'10px 0', background:'#ff4f4f', color:'#fff', fontWeight:700, fontSize:'1.01rem', border:'none', borderRadius:0, cursor:'pointer', width:'100%', marginTop:8}}
                  onClick={stopListening}
                >
                  Stop Listening
                </button>
              )}
            </div>

            <div style={{marginTop: 32, background:'#232336', padding:'18px', borderRadius:0}}>
              <div style={{fontWeight:700, color:'#a084e8', fontSize:'1.09rem', marginBottom:12}}>Session Audio Recordings</div>
              {audioSessions.length === 0 ? (
                <div style={{color:'#b8b8d1', fontSize:'1.01rem'}}>No audio sessions found for this room.</div>
              ) : (
                <>
                  {/* Date Picker */}
                  <div style={{marginBottom:14, display:'flex', alignItems:'center', gap:8}}>
                    <label htmlFor="audio-date-picker" style={{marginRight:8, fontWeight:600}}>Select Date:</label>
                    <button
                      type="button"
                      aria-label="Previous day"
                      disabled={!selectedDate || sortedDateKeys.indexOf(selectedDate) <= 0}
                      onClick={() => {
                        if (!selectedDate) return;
                        const idx = sortedDateKeys.indexOf(selectedDate);
                        if (idx > 0) {
                          setSelectedDate(sortedDateKeys[idx-1]);
                          setSelectedSession(null);
                          setAudioUrl(null);
                        }
                      }}
                      style={{padding:'4px 10px', fontSize:'1.1rem', background:'#39395a', color:'#e1e6fc', border:'none', borderRadius:3, cursor:!selectedDate||sortedDateKeys.indexOf(selectedDate)<=0?'not-allowed':'pointer'}}
                    >&#8592;</button>
                    <input
                      id="audio-date-picker"
                      type="date"
                      value={selectedDate}
                      min={sortedDateKeys.length ? sortedDateKeys[0] : undefined}
                      max={sortedDateKeys.length ? sortedDateKeys[sortedDateKeys.length-1] : undefined}
                      onChange={e => {
                        setSelectedDate(e.target.value);
                        setSelectedSession(null);
                        setAudioUrl(null);
                      }}
                      style={{padding:'6px', fontSize:'1rem', background:'#181926', color:'#e1e6fc', border:'1px solid #39395a', borderRadius:0}}
                    />
                    <button
                      type="button"
                      aria-label="Next day"
                      disabled={!selectedDate || sortedDateKeys.indexOf(selectedDate) === -1 || sortedDateKeys.indexOf(selectedDate) >= sortedDateKeys.length-1}
                      onClick={() => {
                        if (!selectedDate) return;
                        const idx = sortedDateKeys.indexOf(selectedDate);
                        if (idx !== -1 && idx < sortedDateKeys.length-1) {
                          setSelectedDate(sortedDateKeys[idx+1]);
                          setSelectedSession(null);
                          setAudioUrl(null);
                        }
                      }}
                      style={{padding:'4px 10px', fontSize:'1.1rem', background:'#39395a', color:'#e1e6fc', border:'none', borderRadius:3, cursor:!selectedDate||sortedDateKeys.indexOf(selectedDate)===-1||sortedDateKeys.indexOf(selectedDate)>=sortedDateKeys.length-1?'not-allowed':'pointer'}}
                    >&#8594;</button>
                  </div>
                  {/* Sessions for selected date */}
                  {selectedDate && audioSessionsByDate[selectedDate] && audioSessionsByDate[selectedDate].length > 0 ? (
                    <SessionSelector
                      roomId={selectedRoom.id}
                      // Reverse sessions so newest is first
                      sessions={[...audioSessionsByDate[selectedDate]].reverse()}
                      selectedSession={selectedSession}
                      setSelectedSession={setSelectedSession}
                      selectedDate={selectedDate}
                      refreshSessions={async () => {
                        // refetch session list for this room
                        const sessions = await listSessionIds(selectedRoom.id);
                        setAudioSessions(sessions);
                        const grouped = groupSessionIdsByDate(sessions);
                        setAudioSessionsByDate(grouped);
                        // If current date has no sessions, pick another date
                        if (!grouped[selectedDate]) {
                          const dates = Object.keys(grouped).sort();
                          setSelectedDate(dates[dates.length-1] || '');
                        }
                        setSelectedSession(null);
                        setAudioUrl(null);
                      }}
                    />
                  ) : selectedDate ? (
                    <div style={{color:'#b8b8d1'}}>No recordings found for this date.</div>
                  ) : (
                    <div style={{color:'#b8b8d1'}}>Please select a date to view recordings.</div>
                  )}

                  <div style={{display:'flex',alignItems:'center',gap:10,margin:'12px 0 8px 0'}}>
  <label htmlFor="audio-batch-size" style={{fontSize:'0.98rem',color:'#b8b8d1'}}>Chunk fetch batch size:</label>
  <input
    id="audio-batch-size"
    type="number"
    min={1}
    max={32}
    value={audioBatchSize}
    onChange={e => setAudioBatchSize(Math.max(1, Math.min(32, Number(e.target.value))))}
    style={{width:48,padding:'3px 6px',fontSize:'1rem',background:'#181926',color:'#e1e6fc',border:'1px solid #39395a',borderRadius:0}}
  />
</div>
{audioLoading && (
  <div style={{margin:'12px 0'}}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:6}}>
      <div style={{width:'100%',background:'#39395a',height:12,overflow:'hidden'}}>
        <div style={{
          width: audioProgress && audioProgress.total > 0 ? `${(audioProgress.loaded / audioProgress.total) * 100}%` : '0%',
          background:'#a084e8',
          height:'100%',
          transition:'width 0.2s'
        }} />
      </div>
      {audioProgress && audioProgress.total > 0 && (
        <div style={{fontSize:'0.98rem',color:'#b8b8d1',fontFamily:"'Fira Mono',monospace"}}>
          Loading audio chunks: {audioProgress.loaded} / {audioProgress.total}
        </div>
      )}
    </div>
  </div>
)}
                  {audioUrl && (
                    <audio controls src={audioUrl} style={{width:'100%', marginTop:8}} />
                  )}
                  {!audioLoading && selectedSession && !audioUrl && (
                    <div style={{color:'#ff4f4f'}}>Unable to load audio for this session.</div>
                  )}
                </>
              )}
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:24}}>
  <div style={{fontWeight:600,marginBottom:2}}>Current PIN:</div>
  {pinLoading ? (
    <span style={{color:'#b8b8d1'}}>Loading PIN...</span>
  ) : pinError ? (
    <span style={{color:'#ff4f4f'}}>{pinError}</span>
  ) : (
    <span style={{color:'#a084e8',fontWeight:700,fontSize:'1.12rem'}}>{roomPin ? roomPin : <span style={{color:'#b8b8d1'}}>No PIN set</span>}</span>
  )}
  <button
    type="button"
    style={{padding:'10px 0',background:'#a084e8',color:'#232336',fontWeight:700,fontSize:'1.04rem',border:'none',borderRadius:0,cursor:'pointer',flex:1,position:'relative',display:'flex',alignItems:'center',justifyContent:'center'}}
    disabled={changingPin}
    onClick={async()=>{
      const newPin = window.prompt('Enter new PIN for this room (4-8 digits):');
      if (!newPin) return;
      if (!/^\d{4,8}$/.test(newPin)) {
        alert('PIN must be 4-8 digits.');
        return;
      }
      try {
        setChangingPin(true);
        await import('firebase/database').then(({ref, set}) => set(ref(db,`notepad/${selectedRoom.id}/pin`), newPin));
        setPinTick(true);
        setTimeout(()=>{
          setPinTick(false);
        }, 1200);
      } catch (e) {
        alert('Failed to change PIN.');
      } finally {
        setChangingPin(false);
      }
    }}
  >
    {pinTick ? (
      <span className="tick-anim" style={{display:'inline-block',verticalAlign:'middle'}}>
        <svg width="24" height="24" viewBox="0 0 24 24" style={{display:'block'}}>
          <circle cx="12" cy="12" r="11" fill="#232336" stroke="#a084e8" strokeWidth="2" />
          <path d="M7 13.5l3 3.2 6-7.2" fill="none" stroke="#a084e8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    ) : (
      'Change PIN'
    )}
  </button>
  <button
    type="button"
    style={{padding:'10px 0',background:'#ff4f4f',color:'#fff',fontWeight:700,fontSize:'1.04rem',border:'none',borderRadius:0,cursor:'pointer',flex:1,position:'relative',display:'flex',alignItems:'center',justifyContent:'center',marginTop:8,opacity:changingPin?0.7:1}}
    disabled={changingPin}
    onClick={async()=>{
      if (!selectedRoom) return;
      if (!window.confirm('Are you sure you want to remove the PIN for this room?')) return;
      try {
        setChangingPin(true);
        await import('firebase/database').then(({ref, set}) => set(ref(db,`notepad/${selectedRoom.id}/pin`), ""));
        setPinTick(true);
        setTimeout(()=>{
          setPinTick(false);
        }, 1200);
      } catch (e) {
        alert('Failed to remove PIN.');
      } finally {
        setChangingPin(false);
      }
    }}
  >
    {pinTick ? (
      <span className="tick-anim" style={{display:'inline-block',verticalAlign:'middle'}}>
        <svg width="24" height="24" viewBox="0 0 24 24" style={{display:'block'}}>
          <circle cx="12" cy="12" r="11" fill="#232336" stroke="#ff4f4f" strokeWidth="2" />
          <path d="M7 13.5l3 3.2 6-7.2" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    ) : (
      'Remove PIN'
    )}
  </button>
</div>
          </div>
        )}
      </div>
    </div>
  );
}
