import React, { useEffect, useRef, useState } from 'react';
import {
  ref,
  onValue,
  onChildAdded,
  set,
  update,
  push,
  get
} from 'firebase/database';
import { useApp } from '../context/AppContext';
import { db, isFirebaseConfigured } from '../lib/firebase';
import {
  FINISHED_STATUSES,
  ICE_SERVERS,
  RING_TIMEOUT_MS,
  callKeyOf,
  canVideoCall,
  formatCallDuration,
  getCallMedia,
  mediaErrorMessage,
  newCallId,
  onVideoCallRequest
} from '../lib/videoCall';
import { Avatar } from './Avatar';

const ENDED_LABEL = {
  ended: 'Call ended',
  declined: 'Call declined',
  missed: 'No answer',
  cancelled: 'Call cancelled',
  failed: "Couldn't connect. Please check your internet and try again."
};

// If the connection drops this long, the call is over
const DROP_GRACE_MS = 12 * 1000;

const callNode = (key, ...path) => ref(db, ['calls', key, ...path].join('/'));

const timeLabel = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// A soft two-tone ring while a call is ringing. Best effort: a phone
// that blocks sound until the screen is touched just stays quiet (it
// still vibrates).
const startRingTone = () => {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;

  if (!AudioCtx) return () => {};

  let ctx;

  try {
    ctx = new AudioCtx();
    ctx.resume?.().catch(() => {});
  } catch {
    return () => {};
  }

  const ring = () => {
    [0, 0.45].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = offset ? 480 : 440;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + offset + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.42);
    });
  };

  ring();
  const timer = setInterval(ring, 2500);

  return () => {
    clearInterval(timer);
    ctx.close?.().catch(() => {});
  };
};

const RoundButton = ({ icon, label, onClick, tone = 'glass', active = false, size = 'md' }) => {
  const tones = {
    glass: active ? 'bg-white text-[#101F55]' : 'bg-white/15 text-white hover:bg-white/25',
    red: 'bg-red-500 text-white hover:bg-red-600',
    gold: 'bg-[#FFC928] text-[#101F55] hover:bg-[#FFC928]'
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex flex-col items-center gap-1.5"
    >
      <span
        className={`${size === 'lg' ? 'w-16 h-16' : 'w-12 h-12'} rounded-full flex items-center justify-center shadow-lg backdrop-blur-md active:scale-95 transition-all ${tones[tone]}`}
      >
        <span
          className={`material-symbols-outlined ${size === 'lg' ? 'text-[30px]' : 'text-[22px]'}`}
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
      </span>
      <span className="text-[11px] font-semibold text-white/85">{label}</span>
    </button>
  );
};

// Live video call between the member and the partner on the current
// booking, on top of every screen. Started from the chat's video button
// (lib/videoCall requestVideoCall); rings on the other phone here too.
export const VideoCall = () => {
  const {
    activeOrder,
    role,
    authUser,
    userProfile,
    partnerProfile,
    showToast
  } = useApp();

  const myRole = role === 'partner' ? 'partner' : 'member';
  const otherRole = myRole === 'partner' ? 'member' : 'partner';

  const orderKey =
    isFirebaseConfigured && db && authUser?.uid && activeOrder?.orderId
      ? callKeyOf(activeOrder.orderId)
      : null;

  const otherName =
    (myRole === 'member' ? activeOrder?.helperName : activeOrder?.customerName) ||
    (myRole === 'member' ? 'Your partner' : 'Your customer');
  const otherAvatar =
    (myRole === 'member' ? activeOrder?.helperAvatar : activeOrder?.customerAvatar) || '';
  const myName =
    (myRole === 'partner' ? partnerProfile?.name : userProfile?.name) ||
    (myRole === 'partner' ? 'Your partner' : 'Your customer');

  // idle | outgoing | incoming | connecting | active | ended
  const [phase, setPhase] = useState('idle');
  const [peer, setPeer] = useState({ name: '', avatar: '' });
  const [endedText, setEndedText] = useState('');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [facing, setFacing] = useState('user');
  const [canFlip, setCanFlip] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const phaseRef = useRef('idle');
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const callKeyRef = useRef(null);
  const callIdRef = useRef(null);
  const incomingRef = useRef(null);
  const isCallerRef = useRef(false);
  const connectedAtRef = useRef(null);
  const pendingRef = useRef([]);
  const unsubsRef = useRef([]);
  const timersRef = useRef([]);
  const dropTimerRef = useRef(null);
  const stopRingRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const goTo = (next) => {
    phaseRef.current = next;
    setPhase(next);
  };

  // ---------- media on screen ----------
  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream, phase]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream, phase]);

  useEffect(() => {
    if (phase !== 'active') return undefined;

    const timer = setInterval(() => {
      if (connectedAtRef.current) {
        setSeconds((Date.now() - connectedAtRef.current) / 1000);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  // Ring while ringing, either way
  useEffect(() => {
    if (phase === 'incoming' || phase === 'outgoing') {
      stopRingRef.current = startRingTone();

      if (phase === 'incoming') {
        navigator.vibrate?.([500, 300, 500, 300, 500]);
      }
    }

    return () => {
      stopRingRef.current?.();
      stopRingRef.current = null;
    };
  }, [phase]);

  // ---------- plumbing ----------
  const release = () => {
    unsubsRef.current.forEach((unsubscribe) => unsubscribe());
    unsubsRef.current = [];
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    clearTimeout(dropTimerRef.current);

    const pc = pcRef.current;

    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
      pcRef.current = null;
    }

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    pendingRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
  };

  const finish = (status, tellOtherSide = false) => {
    const current = phaseRef.current;

    if (current === 'idle' || current === 'ended') return;

    // Block a second finish from the record listener while this one runs
    phaseRef.current = 'ended';

    const key = callKeyRef.current;
    const wasCaller = isCallerRef.current;
    const duration = connectedAtRef.current
      ? (Date.now() - connectedAtRef.current) / 1000
      : 0;

    release();

    if (tellOtherSide && key) {
      update(callNode(key), {
        status: status === 'failed' ? 'ended' : status,
        endedAt: Date.now(),
        endedBy: myRole
      }).catch((error) => console.warn('Could not end the call record:', error));
    }

    // The caller notes the call in the chat, so both see it there
    if (wasCaller && key) {
      push(ref(db, `chats/${key}/messages`), {
        type: 'call',
        sender: myRole,
        text: '',
        callResult:
          duration > 0 ? 'completed' : status === 'declined' ? 'declined' : 'missed',
        durationSec: Math.round(duration),
        time: timeLabel(),
        ts: Date.now()
      }).catch((error) => console.warn('Could not log the call in the chat:', error));
    }

    setEndedText(
      duration > 0
        ? `Call ended · ${formatCallDuration(duration)}`
        : !wasCaller && (status === 'cancelled' || status === 'missed')
          ? 'Missed video call'
          : ENDED_LABEL[status] || 'Call ended'
    );

    connectedAtRef.current = null;
    setSeconds(0);
    setMuted(false);
    setCameraOff(false);
    goTo('ended');

    setTimeout(() => {
      if (phaseRef.current === 'ended') goTo('idle');
    }, 2200);
  };

  const flushPending = () => {
    const pc = pcRef.current;

    if (!pc?.remoteDescription) return;

    pendingRef.current.forEach((candidate) =>
      pc.addIceCandidate(candidate).catch((error) =>
        console.warn('Skipped a network route:', error)
      )
    );
    pendingRef.current = [];
  };

  const listenForRoutes = (key) => {
    unsubsRef.current.push(
      onChildAdded(callNode(key, 'candidates', otherRole), (snapshot) => {
        const candidate = snapshot.val();
        const pc = pcRef.current;

        if (!pc || !candidate) return;

        if (pc.remoteDescription) {
          pc.addIceCandidate(candidate).catch((error) =>
            console.warn('Skipped a network route:', error)
          );
        } else {
          pendingRef.current.push(candidate);
        }
      })
    );
  };

  const createPeer = (key, stream) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0] || new MediaStream([event.track]));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        push(callNode(key, 'candidates', myRole), event.candidate.toJSON()).catch(
          (error) => console.warn('Could not share a network route:', error)
        );
      }
    };

    const onState = (state) => {
      if (state === 'connected' || state === 'completed') {
        clearTimeout(dropTimerRef.current);

        if (!connectedAtRef.current) connectedAtRef.current = Date.now();
        if (phaseRef.current === 'connecting' || phaseRef.current === 'outgoing') {
          goTo('active');
        }
      } else if (state === 'failed') {
        finishRef.current('failed', true);
      } else if (state === 'disconnected') {
        clearTimeout(dropTimerRef.current);
        dropTimerRef.current = setTimeout(() => {
          if (pcRef.current === pc) finishRef.current('failed', true);
        }, DROP_GRACE_MS);
      }
    };

    pc.onconnectionstatechange = () => onState(pc.connectionState);
    // Older WebViews only report the ICE state
    pc.oniceconnectionstatechange = () => {
      if (!('connectionState' in pc)) onState(pc.iceConnectionState);
    };

    pcRef.current = pc;
    return pc;
  };

  const checkFlip = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCanFlip(devices.filter((device) => device.kind === 'videoinput').length > 1);
    } catch {
      setCanFlip(false);
    }
  };

  // ---------- calling out ----------
  const startCall = async () => {
    if (phaseRef.current !== 'idle') return;

    if (!orderKey) {
      showToast('Video calls work once a booking is accepted.');
      return;
    }

    if (!canVideoCall()) {
      showToast("This phone can't make video calls.");
      return;
    }

    const key = orderKey;

    // Don't ring over a call the other person has just started; its
    // incoming screen is already up
    try {
      const existing = (await get(callNode(key))).val();

      if (
        existing?.status === 'ringing' &&
        existing.from === otherRole &&
        Date.now() - (existing.createdAt || 0) < RING_TIMEOUT_MS
      ) {
        return;
      }
    } catch (error) {
      console.warn('Could not check for a call already ringing:', error);
    }

    let stream;

    try {
      stream = await getCallMedia('user');
    } catch (error) {
      showToast(mediaErrorMessage(error));
      return;
    }

    // A call came in while the camera was starting
    if (phaseRef.current !== 'idle') {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    callKeyRef.current = key;
    callIdRef.current = newCallId();
    isCallerRef.current = true;
    connectedAtRef.current = null;
    localStreamRef.current = stream;
    setLocalStream(stream);
    setFacing('user');
    setPeer({ name: otherName, avatar: otherAvatar });
    checkFlip();
    goTo('outgoing');

    try {
      const pc = createPeer(key, stream);
      const offer = await pc.createOffer();

      // The record first: setting it replaces the last call's routes,
      // and routes start arriving once the offer is applied below
      await set(callNode(key), {
        id: callIdRef.current,
        from: myRole,
        fromName: myName,
        status: 'ringing',
        offer: { type: offer.type, sdp: offer.sdp },
        createdAt: Date.now()
      });

      await pc.setLocalDescription(offer);
      listenForRoutes(key);

      timersRef.current.push(
        setTimeout(() => {
          if (phaseRef.current === 'outgoing') finishRef.current('missed', true);
        }, RING_TIMEOUT_MS)
      );
    } catch (error) {
      console.error('Could not start the video call:', error);
      showToast("Couldn't start the call. Please try again.");
      finish('failed', true);
    }
  };

  // ---------- answering ----------
  const acceptCall = async () => {
    const key = callKeyRef.current;
    const call = incomingRef.current;

    if (!key || !call || phaseRef.current !== 'incoming') return;

    goTo('connecting');

    let stream;

    try {
      stream = await getCallMedia('user');
    } catch (error) {
      showToast(mediaErrorMessage(error));
      finish('declined', true);
      return;
    }

    if (phaseRef.current !== 'connecting') {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    localStreamRef.current = stream;
    setLocalStream(stream);
    setFacing('user');
    checkFlip();

    try {
      const pc = createPeer(key, stream);
      listenForRoutes(key);

      await pc.setRemoteDescription(call.offer);
      flushPending();

      const answer = await pc.createAnswer();

      await update(callNode(key), {
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'active',
        answeredAt: Date.now()
      });

      await pc.setLocalDescription(answer);
    } catch (error) {
      console.error('Could not answer the video call:', error);
      showToast("Couldn't connect the call. Please try again.");
      finish('failed', true);
    }
  };

  const hangUp = () =>
    finish(phaseRef.current === 'outgoing' ? 'cancelled' : 'ended', true);

  // ---------- the call record, as the other phone changes it ----------
  const onRecord = (call) => {
    const current = phaseRef.current;

    if (!call) {
      if (current !== 'idle' && current !== 'ended') finish('ended');
      return;
    }

    if (call.id !== callIdRef.current) {
      const ringingForMe =
        call.status === 'ringing' &&
        call.from === otherRole &&
        Date.now() - (call.createdAt || 0) < RING_TIMEOUT_MS;

      if (!ringingForMe) return;

      if (current === 'outgoing') {
        // Both called at once and theirs won; answer theirs instead
        release();
      } else if (current !== 'idle' && current !== 'ended') {
        return;
      }

      callKeyRef.current = orderKey;
      callIdRef.current = call.id;
      incomingRef.current = call;
      isCallerRef.current = false;
      connectedAtRef.current = null;
      setPeer({ name: call.fromName || otherName, avatar: otherAvatar });
      goTo('incoming');

      // Stop ringing when the caller gives up
      timersRef.current.push(
        setTimeout(() => {
          if (phaseRef.current === 'incoming') finishRef.current('missed');
        }, Math.max(0, RING_TIMEOUT_MS - (Date.now() - (call.createdAt || Date.now()))))
      );
      return;
    }

    if (FINISHED_STATUSES.includes(call.status)) {
      finish(call.status);
      return;
    }

    const pc = pcRef.current;

    if (isCallerRef.current && call.answer && pc && !pc.remoteDescription) {
      pc.setRemoteDescription(call.answer)
        .then(() => {
          flushPending();
          if (phaseRef.current === 'outgoing') goTo('connecting');
        })
        .catch((error) => {
          console.error('Could not apply the answer:', error);
          finish('failed', true);
        });
    }
  };

  // Listeners below are set up once; these always point at the latest
  // functions, so they never act on an old render's values
  const onRecordRef = useRef(onRecord);
  const startRef = useRef(startCall);
  const finishRef = useRef(finish);
  onRecordRef.current = onRecord;
  startRef.current = startCall;
  finishRef.current = finish;

  useEffect(() => onVideoCallRequest(() => startRef.current()), []);

  useEffect(() => {
    if (!orderKey) return undefined;

    const unsubscribe = onValue(
      callNode(orderKey),
      (snapshot) => onRecordRef.current(snapshot.val()),
      (error) => console.warn('Video call listener stopped:', error.message)
    );

    return () => {
      unsubscribe();

      // The booking closed or the person signed out mid-call
      if (phaseRef.current !== 'idle' && phaseRef.current !== 'ended') {
        finishRef.current('ended', true);
      }
    };
  }, [orderKey]);

  // ---------- controls ----------
  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  };

  const toggleCamera = () => {
    const next = !cameraOff;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !next;
    });
    setCameraOff(next);
  };

  const flipCamera = async () => {
    const next = facing === 'user' ? 'environment' : 'user';

    try {
      const fresh = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: next }, width: { ideal: 640 }, height: { ideal: 480 } }
      });
      const track = fresh.getVideoTracks()[0];
      const sender = pcRef.current
        ?.getSenders()
        .find((item) => item.track?.kind === 'video');

      await sender?.replaceTrack(track);

      const stream = localStreamRef.current;

      if (!stream) {
        track.stop();
        return;
      }

      stream.getVideoTracks().forEach((old) => {
        old.stop();
        stream.removeTrack(old);
      });
      stream.addTrack(track);
      track.enabled = !cameraOff;

      setLocalStream(new MediaStream(stream.getTracks()));
      setFacing(next);
    } catch (error) {
      console.warn('Could not switch camera:', error);
      showToast("Couldn't switch the camera.");
    }
  };

  if (phase === 'idle') return null;

  const mirror = facing === 'user' ? { transform: 'scaleX(-1)' } : undefined;
  const live = phase === 'connecting' || phase === 'active';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Video call with ${peer.name}`}
      className="absolute inset-0 z-[10001] isolate bg-[#101F55] text-white flex flex-col overflow-hidden"
    >
      {/* ---------- Pictures ---------- */}
      {live && remoteStream && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover bg-black"
        />
      )}

      {phase === 'outgoing' && localStream && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={mirror}
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        />
      )}

      {/* Darken the edges so the writing and buttons stay readable */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/70 pointer-events-none" />

      {/* ---------- Who and how long ---------- */}
      <div className="relative z-10 pt-6 px-5 flex flex-col items-center text-center gap-1">
        {live && remoteStream ? (
          <>
            <p className="text-base font-bold drop-shadow">{peer.name}</p>
            <p className="text-xs text-white/80 font-semibold tabular-nums">
              {phase === 'active' ? formatCallDuration(seconds) : 'Connecting…'}
            </p>
          </>
        ) : (
          <div className="mt-16 flex flex-col items-center gap-4">
            <div className="relative">
              {(phase === 'incoming' || phase === 'outgoing') && (
                <span className="absolute inset-0 rounded-full bg-[#FFC928]/50 animate-ping" />
              )}
              <Avatar
                src={peer.avatar}
                name={peer.name}
                className="relative w-24 h-24 rounded-full ring-4 ring-white/20"
                textClassName="text-3xl"
              />
            </div>

            <div>
              <p className="text-xl font-bold">{peer.name}</p>
              <p className="text-sm text-white/75 mt-1">
                {phase === 'incoming'
                  ? 'Incoming video call'
                  : phase === 'outgoing'
                    ? 'Calling… ringing on their phone'
                    : phase === 'ended'
                      ? endedText
                      : 'Connecting…'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ---------- My own picture, small ---------- */}
      {live && localStream && (
        <div className="absolute top-20 right-4 z-10 w-24 aspect-[3/4] rounded-2xl overflow-hidden border-2 border-white/40 shadow-xl bg-black">
          {cameraOff ? (
            <div className="w-full h-full flex items-center justify-center text-white/70">
              <span className="material-symbols-outlined text-[26px]">videocam_off</span>
            </div>
          ) : (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={mirror}
              className="w-full h-full object-cover"
            />
          )}
        </div>
      )}

      <div className="flex-1" />

      {/* ---------- Buttons ---------- */}
      <div className="relative z-10 pb-10 px-6">
        {phase === 'incoming' && (
          <div className="flex items-start justify-center gap-20">
            <RoundButton icon="call_end" label="Decline" tone="red" size="lg" onClick={() => finish('declined', true)} />
            <RoundButton icon="videocam" label="Accept" tone="gold" size="lg" onClick={acceptCall} />
          </div>
        )}

        {phase === 'outgoing' && (
          <div className="flex justify-center">
            <RoundButton icon="call_end" label="Cancel" tone="red" size="lg" onClick={hangUp} />
          </div>
        )}

        {live && (
          <div className="flex items-start justify-center gap-5">
            <RoundButton
              icon={muted ? 'mic_off' : 'mic'}
              label={muted ? 'Unmute' : 'Mute'}
              active={muted}
              onClick={toggleMute}
            />
            <RoundButton
              icon={cameraOff ? 'videocam_off' : 'videocam'}
              label={cameraOff ? 'Camera on' : 'Camera off'}
              active={cameraOff}
              onClick={toggleCamera}
            />
            {canFlip && (
              <RoundButton icon="cameraswitch" label="Flip" onClick={flipCamera} />
            )}
            <RoundButton icon="call_end" label="End" tone="red" onClick={hangUp} />
          </div>
        )}
      </div>
    </div>
  );
};
