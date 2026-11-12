
import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { BillingHistory } from './BillingHistory';
import { Avatar } from './Avatar';
import { VerifiedTag } from './VerifiedTag';
import { MAX_CHAT_VIDEO_MB } from '../lib/chatVideo';
import {
  canVideoCall,
  formatCallDuration,
  requestVideoCall
} from '../lib/videoCall';

// The note a video call leaves in the chat
const callNote = (msg, myRole) =>
  msg.callResult === 'completed'
    ? `Video call · ${formatCallDuration(msg.durationSec)}`
    : msg.callResult === 'declined'
      ? 'Video call declined'
      : msg.sender === myRole
        ? 'Video call · no answer'
        : 'Missed video call';

export const ChatModal = () => {
  const {
    isChatOpen,
    setIsChatOpen,
    chatPartner,
    messages,
    sendChatMessage,
    sendChatVideo,
    showToast,
    isFirebaseConfigured,
    role,
    activeOrder
  } = useApp();

  const myRole = role === 'partner' ? 'partner' : 'member';

  const [inputText, setInputText] = useState('');
  const [showBills, setShowBills] = useState(false);
  const messagesListRef = useRef(null);

  // Video clips: the record / choose menu, and the one being sent
  const [videoMenuOpen, setVideoMenuOpen] = useState(false);
  const [videoUpload, setVideoUpload] = useState(null);
  const recordVideoRef = useRef(null);
  const pickVideoRef = useRef(null);

  // The other person on the active booking: the partner for a member,
  // the customer for a partner. Used when the chat was opened without a
  // contact (e.g. from the bottom Chat tab).
  const orderContact = activeOrder?.orderId
    ? myRole === 'member'
      ? {
          name: activeOrder.helperName,
          avatar: activeOrder.helperAvatar,
          phone: activeOrder.helperPhone
        }
      : {
          name: activeOrder.customerName,
          avatar: activeOrder.customerAvatar,
          phone: activeOrder.customerPhone
        }
    : null;

  // Support either a contact name string or a contact object.
  // 'GigEzee Customer' is the app's placeholder, not a real name.
  const explicitName =
    typeof chatPartner === 'string'
      ? chatPartner !== 'GigEzee Customer' && chatPartner
      : chatPartner?.name ||
        chatPartner?.partnerName ||
        chatPartner?.customerName;

  const partnerName =
    explicitName ||
    orderContact?.name ||
    'GigEzee User';

  // Numbers come from the booking, not from the helper list: a
  // partner's phone isn't handed out before there's a job between
  // them. Chatting before booking has no number, and the button
  // below goes quiet rather than dialling something made up.
  const partnerPhone =
    (typeof chatPartner === 'object' && chatPartner
      ? chatPartner.phone || chatPartner.phone_number || ''
      : '') ||
    orderContact?.phone ||
    '';

  const partnerAvatar =
    (typeof chatPartner === 'object' && chatPartner
      ? chatPartner.avatar || chatPartner.profilePhoto || chatPartner.photo
      : '') ||
    (!explicitName || explicitName === orderContact?.name
      ? orderContact?.avatar
      : '') ||
    '';

  const isOrderContact = !explicitName || explicitName === orderContact?.name;

  // The Verified Partner tag: only for a partner whose ID documents
  // GigEzee staff approved, and only on the member's side
  const partnerVerified =
    myRole === 'member' &&
    Boolean(
      (typeof chatPartner === 'object' && chatPartner?.isVerified) ||
        (isOrderContact && activeOrder?.helperVerified)
    );

  // A video call goes to the other person on the booking, so it needs
  // one, and this chat has to be with them
  const canCall =
    Boolean(isFirebaseConfigured && activeOrder?.orderId && isOrderContact) &&
    canVideoCall();

  // The partner's ID, so a customer can see the bills for their work
  const chatPartnerId =
    (typeof chatPartner === 'object' && chatPartner?.partnerId) ||
    (myRole === 'member' && isOrderContact ? activeOrder?.partnerId : null) ||
    null;

  // The customer's ID, so a partner can see what they earned from them
  const chatCustomerId =
    (typeof chatPartner === 'object' && chatPartner?.customerId) ||
    (myRole === 'partner' && isOrderContact ? activeOrder?.customerId : null) ||
    null;

  const canShowBills =
    myRole === 'partner' ? Boolean(chatCustomerId) : Boolean(chatPartnerId);

  const partnerVehicle =
    typeof chatPartner === 'object' && chatPartner
      ? chatPartner.vehicle || chatPartner.vehicleName || ''
      : '';

  const partnerDistance =
    typeof chatPartner === 'object' && chatPartner
      ? chatPartner.distance || ''
      : '';

  const orderNumber =
    typeof chatPartner === 'object' && chatPartner
      ? chatPartner.orderNumber || chatPartner.bookingId || ''
      : '';

  // Scroll only the message list. scrollIntoView would also scroll every
  // scrollable ancestor (the phone frame / page), shifting the whole screen.
  const scrollToBottom = () => {
    const list = messagesListRef.current;
    if (list) {
      list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (isChatOpen) {
      scrollToBottom();
    }
  }, [messages, isChatOpen, Boolean(videoUpload)]);

  // Reset the input when switching conversations.
  useEffect(() => {
    if (isChatOpen) {
      setInputText('');
    }
  }, [isChatOpen, chatPartner]);

  if (!isChatOpen) return null;

  const quickReplies = [
    'Are you nearby?',
    'I am on the 2nd floor',
    'Please call when you reach',
    'Where to park two-wheeler?'
  ];

  const handleSend = (e) => {
    e.preventDefault();

    if (!inputText.trim()) return;

    sendChatMessage(inputText);
    setInputText('');
  };

  const handleQuickReply = (reply) => {
    sendChatMessage(reply);
  };

  const handleClose = () => {
    setShowBills(false);
    setVideoMenuOpen(false);
    setIsChatOpen(false);
  };

  const chooseVideo = async (event) => {
    const file = event.target.files?.[0];
    // Let the same clip be picked again after a failed send
    event.target.value = '';

    if (!file) return;

    setVideoUpload({ progress: 0 });

    try {
      await sendChatVideo(file, (progress) => setVideoUpload({ progress }));
    } catch (error) {
      showToast(error.message || "Couldn't send the video. Please try again.");
    } finally {
      setVideoUpload(null);
    }
  };

  return (
    <div
      className="
        absolute inset-0 z-[9999] isolate
        bg-black/60 backdrop-blur-xs
        flex items-end
        justify-center
        animate-in fade-in duration-200
      "
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Chat with ${partnerName}`}
        className="
          relative z-[10000]
          w-full
          bg-[#f8f9ff]
          h-[88%]
          max-h-full
          rounded-t-[32px]
          shadow-2xl
          flex flex-col
          overflow-hidden
          border border-slate-200
          animate-in slide-in-from-bottom-8 duration-200
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Chat Header */}
        <div
          className="
            relative z-10 shrink-0
            px-4 py-3.5
            bg-white
            border-b border-slate-100
            flex items-center justify-between
            shadow-xs
          "
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <Avatar
                src={partnerAvatar}
                name={partnerName}
                className="w-10 h-10 rounded-full"
                textClassName="text-sm"
              />

              <span
                className="
                  absolute bottom-0 right-0
                  w-3 h-3
                  bg-emerald-500
                  rounded-full
                  ring-2 ring-white
                "
              />
            </div>

            <div className="min-w-0">
              {/* The name gets the whole first line, so it isn't cut
                  short by the header buttons */}
              <h3
                className="
                  font-bold text-sm
                  text-[#0b1c30]
                  truncate
                "
                title={partnerName}
              >
                {partnerName}
              </h3>

              <div className="flex items-center gap-1.5 min-w-0 mt-0.5">
                {/* Who the other person is: partners chat with customers.
                    A partner staff have verified shows the tag instead. */}
                {partnerVerified ? (
                  <VerifiedTag size="sm" />
                ) : (
                <span
                  className={`
                    text-[9px] font-bold uppercase tracking-wide
                    px-1.5 py-0.5 rounded-full shrink-0
                    ${myRole === 'partner'
                      ? 'bg-[#ffdbcc] text-[#a14000]'
                      : 'bg-[#dce1ff] text-[#4e5c92]'}
                  `}
                >
                  {myRole === 'partner' ? 'Customer' : 'Partner'}
                </span>
                )}

              <p
                className="
                  text-[11px]
                  text-[#006c49]
                  font-medium
                  flex items-center gap-1
                  truncate min-w-0
                "
              >
                <span
                  className="
                    w-1.5 h-1.5
                    rounded-full
                    bg-[#00ae78]
                    animate-ping
                    shrink-0
                  "
                />

                {partnerVehicle
                  ? `Active on ${partnerVehicle}`
                  : 'Active on GigEzee'}
                
                {partnerDistance
                  ? ` (${partnerDistance})`
                  : ''}
              </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {canShowBills && (
              <button
                type="button"
                onClick={() => setShowBills((open) => !open)}
                aria-label={
                  myRole === 'partner'
                    ? `Jobs for ${partnerName}`
                    : `Bills from ${partnerName}`
                }
                className={`
                  w-9 h-9
                  rounded-full
                  flex items-center justify-center
                  transition-colors
                  ${showBills
                    ? 'bg-[#ff6a00] text-white'
                    : 'bg-[#eff4ff] text-[#a14000] hover:bg-[#ffdbcc]'}
                `}
              >
                <span className="material-symbols-outlined text-[19px]">
                  receipt_long
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => requestVideoCall()}
              disabled={!canCall}
              title={
                canCall
                  ? `Video call ${partnerName}`
                  : 'Video calls work once a booking is accepted'
              }
              aria-label={`Video call ${partnerName}`}
              className={`
                w-9 h-9
                rounded-full
                bg-[#eff4ff]
                text-[#a14000]
                flex items-center justify-center
                transition-colors
                ${canCall
                  ? 'hover:bg-[#ffdbcc]'
                  : 'opacity-40 cursor-not-allowed'}
              `}
            >
              <span className="material-symbols-outlined text-[20px]">
                videocam
              </span>
            </button>

            <a
              href={partnerPhone ? `tel:${partnerPhone}` : undefined}
              aria-disabled={!partnerPhone}
              title={
                partnerPhone
                  ? `Call ${partnerName}`
                  : 'The number is available once the booking is accepted'
              }
              aria-label={`Call ${partnerName}`}
              className={`
                w-9 h-9
                rounded-full
                bg-[#eff4ff]
                text-[#a14000]
                flex items-center justify-center
                transition-colors
                ${partnerPhone
                  ? 'hover:bg-[#ffdbcc]'
                  : 'opacity-40 cursor-not-allowed'}
              `}
            >
              <span
                className="
                  material-symbols-outlined
                  text-[19px]
                "
              >
                call
              </span>
            </a>

            <button
              type="button"
              onClick={handleClose}
              aria-label="Close chat"
              className="
                w-9 h-9
                rounded-full
                bg-slate-100
                text-slate-500
                flex items-center justify-center
                hover:bg-slate-200
                transition-colors
              "
            >
              <span
                className="
                  material-symbols-outlined
                  text-[19px]
                "
              >
                close
              </span>
            </button>
          </div>
        </div>

        {showBills ? (
          /* Work this partner did for the customer, with each bill */
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3 bg-[#f8f9ff]">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-[#0b1c30] truncate">
                  {myRole === 'partner'
                    ? `Jobs for ${partnerName}`
                    : `Work by ${partnerName}`}
                </h4>
                <p className="text-[11px] text-slate-500">
                  {myRole === 'partner'
                    ? 'What you earned from each job'
                    : 'Bills, extra parts and payments'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowBills(false)}
                className="shrink-0 px-3 py-1.5 rounded-full bg-[#eff4ff] text-[#a14000] text-xs font-bold flex items-center gap-1 hover:bg-[#ffdbcc] transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">chat</span>
                Back to chat
              </button>
            </div>

            {myRole === 'partner' ? (
              <BillingHistory viewer="partner" customerId={chatCustomerId} />
            ) : (
              <BillingHistory partnerId={chatPartnerId} />
            )}
          </div>
        ) : (
        <>
        {/* Messages List */}
        <div
          ref={messagesListRef}
          className="
            relative z-0
            flex-1 min-h-0
            p-4
            overflow-y-auto
            overscroll-contain
            space-y-3
            bg-[#f8f9ff]
          "
        >
          <div className="flex justify-center">
            <span
              className="
                text-[11px]
                bg-slate-200/70
                text-slate-600
                px-3 py-1
                rounded-full
                font-medium
                text-center
              "
            >
              {orderNumber
                ? `Encrypted neighborhood chat for Order #${orderNumber}`
                : 'Encrypted neighborhood chat'}
            </span>
          </div>

          {messages.map((msg) => msg.type === 'call' ? (
            <div key={msg.id} className="flex justify-center">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full bg-white border border-slate-100 text-slate-600 shadow-xs">
                <span
                  className={`material-symbols-outlined text-[16px] ${
                    msg.callResult === 'completed' ? 'text-[#00ae78]' : 'text-red-500'
                  }`}
                >
                  {msg.callResult === 'completed' ? 'videocam' : 'missed_video_call'}
                </span>
                {callNote(msg, myRole)} · {msg.time}
              </span>
            </div>
          ) : (
            <div
              key={msg.id}
              className={`
                flex flex-col
                ${
                  msg.sender === myRole
                    ? 'items-end'
                    : 'items-start'
                }
              `}
            >
              <div
                className={`
                  max-w-[80%]
                  rounded-2xl
                  ${msg.type === 'video' ? 'p-1.5' : 'px-4 py-2.5'}
                  shadow-xs
                  text-sm
                  break-words
                  ${
                    msg.sender === myRole
                      ? 'bg-[#ff6a00] text-white rounded-br-xs font-medium'
                      : 'bg-white text-[#0b1c30] rounded-bl-xs border border-slate-100'
                  }
                `}
              >
                {msg.type === 'video' && msg.videoUrl ? (
                  <video
                    src={msg.videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={
                      msg.sender === myRole
                        ? 'Video you sent'
                        : `Video from ${partnerName}`
                    }
                    className="block w-56 max-w-full max-h-72 rounded-xl bg-black"
                  />
                ) : (
                  <p className="leading-relaxed whitespace-pre-wrap" data-no-translate>
                    {msg.text}
                  </p>
                )}
              </div>

              <span
                className="
                  text-[10px]
                  text-slate-400
                  mt-1 px-1
                "
              >
                {msg.time}
              </span>
            </div>
          ))}

          {/* The clip on its way */}
          {videoUpload && (
            <div className="flex flex-col items-end">
              <div className="w-56 max-w-[80%] rounded-2xl rounded-br-xs bg-[#ff6a00] text-white p-3 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className="material-symbols-outlined text-[18px] animate-pulse">
                    videocam
                  </span>
                  Sending video… {Math.round(videoUpload.progress * 100)}%
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/30 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white transition-all"
                    style={{ width: `${Math.max(4, Math.round(videoUpload.progress * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Suggestion Chips */}
        <div
          className="
            relative z-10 shrink-0
            px-3 py-2
            bg-white/95
            border-t border-slate-100
            flex gap-2
            overflow-x-auto
            overscroll-x-contain
          "
        >
          {quickReplies.map((reply, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleQuickReply(reply)}
              className="
                px-3 py-1
                rounded-full
                bg-[#eff4ff]
                hover:bg-[#dce9ff]
                text-[#404e83]
                text-xs font-medium
                shrink-0
                transition-colors
                active:scale-95
              "
            >
              {reply}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <form
          onSubmit={handleSend}
          className="
            relative z-10 shrink-0
            p-3
            bg-white
            border-t border-slate-100
            flex items-center gap-2
          "
        >
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setVideoMenuOpen((open) => !open)}
              disabled={Boolean(videoUpload)}
              aria-label="Send a video"
              aria-expanded={videoMenuOpen}
              className="
                w-11 h-11
                rounded-full
                bg-[#eff4ff]
                text-[#a14000]
                hover:bg-[#ffdbcc]
                disabled:opacity-50
                flex items-center justify-center
                transition-colors
                active:scale-95
              "
            >
              <span className="material-symbols-outlined text-[21px]">
                videocam
              </span>
            </button>

            {videoMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 p-1.5 z-20">
                <button
                  type="button"
                  onClick={() => {
                    setVideoMenuOpen(false);
                    recordVideoRef.current?.click();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[#eff4ff] text-sm font-semibold text-[#0b1c30] text-left"
                >
                  <span className="material-symbols-outlined text-[20px] text-[#ff6a00]">
                    videocam
                  </span>
                  Record a video
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setVideoMenuOpen(false);
                    pickVideoRef.current?.click();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[#eff4ff] text-sm font-semibold text-[#0b1c30] text-left"
                >
                  <span className="material-symbols-outlined text-[20px] text-[#4e5c92]">
                    video_library
                  </span>
                  Choose a video
                </button>

                <p className="px-3 pt-1 pb-1.5 text-[10px] text-slate-400">
                  Up to {MAX_CHAT_VIDEO_MB} MB, about 30 seconds
                </p>
              </div>
            )}

            {/* capture opens the camera straight in video mode */}
            <input
              ref={recordVideoRef}
              type="file"
              accept="video/*"
              capture="environment"
              onChange={chooseVideo}
              className="hidden"
            />
            <input
              ref={pickVideoRef}
              type="file"
              accept="video/*"
              onChange={chooseVideo}
              className="hidden"
            />
          </div>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Message ${partnerName}...`}
            aria-label={`Message ${partnerName}`}
            className="
              flex-1 min-w-0
              h-11 px-4
              rounded-full
              bg-[#eff4ff]
              text-sm
              text-[#0b1c30]
              placeholder:text-slate-400
              focus:outline-none
              focus:ring-2
              focus:ring-[#ff6a00]/30
            "
          />

          <button
            type="submit"
            disabled={!inputText.trim()}
            aria-label="Send message"
            className="
              w-11 h-11
              rounded-full
              bg-[#ff6a00]
              hover:bg-[#a14000]
              disabled:opacity-50
              disabled:cursor-not-allowed
              text-white
              flex items-center justify-center
              shadow-md
              active:scale-95
              transition-all
              shrink-0
            "
          >
            <span
              className="
                material-symbols-outlined
                text-[19px]
              "
            >
              send
            </span>
          </button>
        </form>
        </>
        )}
      </div>
    </div>
  );
};