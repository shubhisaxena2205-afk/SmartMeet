
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

// ======================================================
// SMARTMEET - DAY 7
// MULTI-PARTICIPANT WEBRTC
// ======================================================

const SOCKET_URL =
  import.meta.env.VITE_SERVER_URL;

// ======================================================
// WEBRTC ICE SERVERS
// STUN works for many networks.
// TURN should be added in .env for difficult NAT/firewall cases.
// ======================================================

const stunUrls = (
  import.meta.env.VITE_STUN_URLS ||
  "stun:stun.l.google.com:19302"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const turnUrls = (
  import.meta.env.VITE_TURN_URLS ||
  ""
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const iceServers = [
  ...stunUrls.map((url) => ({ urls: url })),
  ...(turnUrls.length > 0
    ? [
        {
          urls: turnUrls,
          username: import.meta.env.VITE_TURN_USERNAME || "",
          credential: import.meta.env.VITE_TURN_CREDENTIAL || "",
        },
      ]
    : []),
];

const rtcConfiguration = {
  iceServers,
};

function getStoredParticipantName() {
  try {
    const storedUser = JSON.parse(window.localStorage.getItem("user") || "null");
    return typeof storedUser?.name === "string" ? storedUser.name.trim() : "";
  } catch {
    return "";
  }
}

function MeetingRoom({ meetingId, onLeave, participantName, user }) {
  const displayName =
    (typeof participantName === "string" && participantName.trim()) ||
    (typeof user?.name === "string" && user.name.trim()) ||
    getStoredParticipantName() ||
    "Participant";
  // ====================================================
  // LOCAL MEDIA
  // ====================================================

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);

  // ====================================================
  // SOCKET
  // ====================================================

  const socketRef = useRef(null);

  // ====================================================
  // PEER CONNECTIONS
  // participantId -> RTCPeerConnection
  // ====================================================

  const peerConnectionsRef = useRef(new Map());

  // ====================================================
  // REMOTE STREAMS
  // participantId -> MediaStream
  // ====================================================

  const remoteStreamsRef = useRef(new Map());

  // ====================================================
  // ICE QUEUES
  // ====================================================

  const pendingIceCandidatesRef = useRef(new Map());

  // ====================================================
  // PARTICIPANT MEDIA STATES
  // participantId -> { muted, cameraOff, screenSharing }
  // ====================================================

  const mediaStatesRef = useRef(new Map());

  // ====================================================
  // STATES
  // ====================================================

  const [participants, setParticipants] = useState([]);
  const participantNamesRef = useRef(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenStreamRef = useRef(null);
  const originalVideoTrackRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState("Starting...");
  const [socketId, setSocketId] = useState("");
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  // ====================================================
  // CHAT
  // ====================================================

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const chatMessagesEndRef = useRef(null);

  // ====================================================
  // AI MEETING TRANSCRIPTION - PHASE 9A
  // Browser-based Web Speech API MVP.
  // This does not change the existing WebRTC microphone stream.
  // ====================================================

  const speechRecognitionRef = useRef(null);
  const shouldRestartRecognitionRef = useRef(false);
  const recognitionRestartTimerRef = useRef(null);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [transcriptCopied, setTranscriptCopied] = useState(false);
  const [transcriptionSupported, setTranscriptionSupported] = useState(() =>
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const [sharedTranscriptEntries, setSharedTranscriptEntries] = useState([]);

  // ====================================================
  // UPDATE PARTICIPANT
  // ====================================================

  const updateParticipantName = (participantId, name) => {
    if (!participantId) return;

    const safeName =
      typeof name === "string" && name.trim()
        ? name.trim().slice(0, 100)
        : "Participant";

    participantNamesRef.current.set(participantId, safeName);

    setParticipants((current) =>
      current.map((participant) =>
        participant.id === participantId
          ? { ...participant, name: safeName }
          : participant
      )
    );
  };

  const updateParticipant = (participantId, stream) => {
    setParticipants((current) => {
      const found = current.some(
        (participant) => participant.id === participantId
      );

      const mediaState =
        mediaStatesRef.current.get(participantId) || {
          muted: false,
          cameraOff: false,
          screenSharing: false,
        };

      if (found) {
        return current.map((participant) =>
          participant.id === participantId
            ? {
                ...participant,
                stream,
                name: participantNamesRef.current.get(participantId) || participant.name || "Participant",
                muted: mediaState.muted,
                cameraOff: mediaState.cameraOff,
                screenSharing: mediaState.screenSharing,
              }
            : participant
        );
      }

      return [
        ...current,
        {
          id: participantId,
          stream,
          name: participantNamesRef.current.get(participantId) || "Participant",
          muted: mediaState.muted,
          cameraOff: mediaState.cameraOff,
          screenSharing: mediaState.screenSharing,
        },
      ];
    });
  };

  // ====================================================
  // UPDATE REMOTE MEDIA STATE
  // ====================================================

  const updateParticipantMediaState = (participantId, mediaState) => {
    const normalizedState = {
      muted: Boolean(mediaState?.muted),
      cameraOff: Boolean(mediaState?.cameraOff),
      screenSharing: Boolean(mediaState?.screenSharing),
    };

    mediaStatesRef.current.set(participantId, normalizedState);

    setParticipants((current) =>
      current.map((participant) =>
        participant.id === participantId
          ? {
              ...participant,
              ...normalizedState,
            }
          : participant
      )
    );
  };

  // ====================================================
  // REMOVE PARTICIPANT
  // ====================================================

  const removeParticipant = (participantId) => {
    mediaStatesRef.current.delete(participantId);
    participantNamesRef.current.delete(participantId);

    setParticipants((current) =>
      current.filter((participant) => participant.id !== participantId)
    );
  };

  // ====================================================
  // CREATE PEER CONNECTION
  // ====================================================

  const createPeerConnection = (participantId) => {
    const existing = peerConnectionsRef.current.get(participantId);

    if (existing) {
      return existing;
    }

    console.log("Creating WebRTC connection:", participantId);

    const peerConnection = new window.RTCPeerConnection(
      rtcConfiguration
    );

    peerConnectionsRef.current.set(participantId, peerConnection);

    // ----------------------------------------------------
    // REMOTE TRACK
    // ----------------------------------------------------

    peerConnection.ontrack = (event) => {
      console.log(
        "Remote track received:",
        participantId,
        event.track.kind
      );

      let remoteStream =
        remoteStreamsRef.current.get(participantId);

      if (!remoteStream) {
        remoteStream = new MediaStream();
        remoteStreamsRef.current.set(
          participantId,
          remoteStream
        );
      }

      const alreadyExists = remoteStream
        .getTracks()
        .some((track) => track.id === event.track.id);

      if (!alreadyExists) {
        remoteStream.addTrack(event.track);
      }

      updateParticipant(participantId, remoteStream);

      // If the remote browser ends a track, keep the peer
      // connection alive. The other track can still continue.
      event.track.onended = () => {
        console.log(
          "Remote track ended:",
          participantId,
          event.track.kind
        );
      };
    };

    // ----------------------------------------------------
    // ICE CANDIDATES
    // ----------------------------------------------------

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate || !socketRef.current) {
        return;
      }

      socketRef.current.emit("ice-candidate", {
        meetingId,
        targetId: participantId,
        candidate: event.candidate,
      });
    };

    // ----------------------------------------------------
    // CONNECTION STATE
    // ----------------------------------------------------

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;

      console.log(`Peer ${participantId}:`, state);

      if (state === "connected") {
        setConnectionStatus("Connected");
      }

      if (state === "failed") {
        console.warn(
          "WebRTC connection failed:",
          participantId
        );

        // Do not immediately delete the participant here.
        // ICE restart may be possible and user-left is handled
        // separately by the signaling server.
      }

      if (state === "disconnected") {
        console.warn(
          "WebRTC peer temporarily disconnected:",
          participantId
        );
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log(
        `ICE ${participantId}:`,
        peerConnection.iceConnectionState
      );
    };

    return peerConnection;
  };

  // ====================================================
  // ADD LOCAL TRACKS
  // ====================================================

  const addLocalTracks = (peerConnection) => {
    if (!localStreamRef.current) {
      return;
    }

    const currentSenders = peerConnection.getSenders();

    localStreamRef.current.getTracks().forEach((track) => {
      const alreadyAdded = currentSenders.some(
        (sender) =>
          sender.track && sender.track.id === track.id
      );

      if (!alreadyAdded) {
        peerConnection.addTrack(
          track,
          localStreamRef.current
        );
      }
    });
  };

  // ====================================================
  // CREATE OFFER
  // ====================================================

  const createOffer = async (participantId) => {
    try {
      const peerConnection =
        createPeerConnection(participantId);

      addLocalTracks(peerConnection);

      const offer = await peerConnection.createOffer();

      await peerConnection.setLocalDescription(offer);

      socketRef.current?.emit("offer", {
        meetingId,
        targetId: participantId,
        offer: peerConnection.localDescription,
      });

      console.log("Offer sent to:", participantId);
    } catch (error) {
      console.error("Offer error:", error);
    }
  };

  // ====================================================
  // HANDLE OFFER
  // ====================================================

  const handleOffer = async (participantId, offer) => {
    try {
      const peerConnection =
        createPeerConnection(participantId);

      addLocalTracks(peerConnection);

      await peerConnection.setRemoteDescription(
        new window.RTCSessionDescription(offer)
      );

      await flushPendingIceCandidates(participantId);

      const answer = await peerConnection.createAnswer();

      await peerConnection.setLocalDescription(answer);

      socketRef.current?.emit("answer", {
        meetingId,
        targetId: participantId,
        answer: peerConnection.localDescription,
      });

      console.log("Answer sent to:", participantId);
    } catch (error) {
      console.error("Handle offer error:", error);
    }
  };

  // ====================================================
  // HANDLE ANSWER
  // ====================================================

  const handleAnswer = async (participantId, answer) => {
    try {
      const peerConnection =
        peerConnectionsRef.current.get(participantId);

      if (!peerConnection) {
        console.warn(
          "Answer received but peer does not exist:",
          participantId
        );
        return;
      }

      await peerConnection.setRemoteDescription(
        new window.RTCSessionDescription(answer)
      );

      await flushPendingIceCandidates(participantId);

      console.log("Answer applied:", participantId);
    } catch (error) {
      console.error("Handle answer error:", error);
    }
  };

  // ====================================================
  // HANDLE ICE CANDIDATE
  // ====================================================

  const handleIceCandidate = async (
    participantId,
    candidate
  ) => {
    try {
      const peerConnection =
        peerConnectionsRef.current.get(participantId);

      if (!peerConnection) {
        // The offer/answer may not have arrived yet.
        // Save the candidate so it can be applied later.
        if (!pendingIceCandidatesRef.current.has(participantId)) {
          pendingIceCandidatesRef.current.set(
            participantId,
            []
          );
        }

        pendingIceCandidatesRef.current
          .get(participantId)
          .push(candidate);

        return;
      }

      if (!peerConnection.remoteDescription) {
        if (!pendingIceCandidatesRef.current.has(participantId)) {
          pendingIceCandidatesRef.current.set(
            participantId,
            []
          );
        }

        pendingIceCandidatesRef.current
          .get(participantId)
          .push(candidate);

        return;
      }

      await peerConnection.addIceCandidate(
        new window.RTCIceCandidate(candidate)
      );
    } catch (error) {
      console.error("ICE candidate error:", error);
    }
  };

  // ====================================================
  // FLUSH QUEUED ICE CANDIDATES
  // ====================================================

  const flushPendingIceCandidates = async (
    participantId
  ) => {
    const peerConnection =
      peerConnectionsRef.current.get(participantId);

    if (
      !peerConnection ||
      !peerConnection.remoteDescription
    ) {
      return;
    }

    const candidates =
      pendingIceCandidatesRef.current.get(participantId);

    if (!candidates || candidates.length === 0) {
      return;
    }

    for (const candidate of candidates) {
      try {
        await peerConnection.addIceCandidate(
          new window.RTCIceCandidate(candidate)
        );
      } catch (error) {
        console.error("Queued ICE error:", error);
      }
    }

    pendingIceCandidatesRef.current.delete(participantId);
  };

  // ====================================================
  // REMOVE PEER
  // ====================================================

  const removePeerConnection = (participantId) => {
    const peerConnection =
      peerConnectionsRef.current.get(participantId);

    if (peerConnection) {
      peerConnection.ontrack = null;
      peerConnection.onicecandidate = null;
      peerConnection.close();
    }

    peerConnectionsRef.current.delete(participantId);

    const stream =
      remoteStreamsRef.current.get(participantId);

    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
    }

    remoteStreamsRef.current.delete(participantId);

    pendingIceCandidatesRef.current.delete(participantId);

    removeParticipant(participantId);
  };

  // ====================================================
  // START LOCAL MEDIA
  // ====================================================

  const startLocalMedia = async () => {
    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      console.log(
        "Camera tracks:",
        stream.getVideoTracks().length
      );

      console.log(
        "Microphone tracks:",
        stream.getAudioTracks().length
      );

      return stream;
    } catch (error) {
      console.error("getUserMedia error:", error);

      if (error.name === "NotAllowedError") {
        alert(
          "Camera/microphone permission was denied. Please allow permission in the browser."
        );
      } else {
        alert(
          "Could not access camera and microphone."
        );
      }

      throw error;
    }
  };

  // ====================================================
  // SEND MEDIA STATE
  // ====================================================

  const sendMediaState = (
    nextMuted,
    nextCameraOff,
    nextScreenSharing = isScreenSharing
  ) => {
    if (!socketRef.current) {
      return;
    }

    socketRef.current.emit("media-state", {
      meetingId,
      muted: nextMuted,
      cameraOff: nextCameraOff,
      screenSharing: nextScreenSharing,
    });
  };

  // ====================================================
  // SCREEN SHARING
  // Replace the camera video track on every peer connection.
  // The shared screen uses the SAME participant tile.
  // No extra participant/tile is created.
  // ====================================================

 
  const replaceVideoTrackForPeers = async (newTrack) => {
  if (!newTrack) return;

  const updates = [];

  peerConnectionsRef.current.forEach((peerConnection) => {
    const videoTransceiver = peerConnection
      .getTransceivers()
      .find(
        (transceiver) =>
          transceiver.receiver?.track?.kind === "video"
      );

    const videoSender =
      videoTransceiver?.sender ||
      peerConnection.getSenders().find(
        (sender) => sender.track?.kind === "video"
      );

    if (videoSender) {
      updates.push(videoSender.replaceTrack(newTrack));
    } else {
      console.warn(
        "Video sender not found for peer:",
        peerConnection
      );
    }
  });

  await Promise.all(updates);
};

  const startScreenShare = async () => {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        alert("Screen sharing is not supported by this browser.");
        return;
      }

      if (isScreenSharing) {
        return;
      }

      // The browser will show its own secure screen/window/tab picker.
      // A normal website cannot bypass that security picker.
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
        },
        audio: false,
      });

      const screenTrack = screenStream.getVideoTracks()[0];

      if (!screenTrack || !localStreamRef.current) {
        screenStream.getTracks().forEach((track) => track.stop());
        return;
      }

      const cameraTrack = localStreamRef.current.getVideoTracks()[0];

      originalVideoTrackRef.current = cameraTrack || null;
      screenStreamRef.current = screenStream;

      // IMPORTANT: Replace only the video track.
      // This keeps the same peer/participant and therefore the same tile.
      await replaceVideoTrackForPeers(screenTrack);

      // Show the shared screen in YOUR existing "You" tile.
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }

      setIsScreenSharing(true);

      // Tell remote participants that this video track is now a screen.
      sendMediaState(isMuted, false, true);

      // If the user clicks Chrome's "Stop sharing", restore the camera.
      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error("Screen sharing error:", error);

      if (error?.name !== "AbortError" && error?.name !== "NotAllowedError") {
        alert("Could not start screen sharing.");
      }
    }
  };

  const stopScreenShare = async () => {
    const cameraTrack = originalVideoTrackRef.current;

    try {
      if (cameraTrack) {
        // Restore the original camera track to every peer.
        await replaceVideoTrackForPeers(cameraTrack);

        if (localVideoRef.current && localStreamRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      }
    } catch (error) {
      console.error("Stopping screen share error:", error);
    } finally {
      if (screenStreamRef.current) {
        screenStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());
      }

      screenStreamRef.current = null;
      originalVideoTrackRef.current = null;
      setIsScreenSharing(false);

      // Restore the actual camera state. If the user had camera OFF,
      // keep it OFF after screen sharing ends.
      const cameraEnabled = !isCameraOff;
      if (cameraTrack) {
        cameraTrack.enabled = cameraEnabled;
      }

      sendMediaState(isMuted, isCameraOff, false);
    }
  };

  // ====================================================
  // MUTE
  // ====================================================

  const toggleMute = () => {
    if (!localStreamRef.current) {
      return;
    }

    const tracks =
      localStreamRef.current.getAudioTracks();

    const nextMuted = !isMuted;

    tracks.forEach((track) => {
      track.enabled = !nextMuted;
    });

    setIsMuted(nextMuted);

    sendMediaState(nextMuted, isCameraOff);
  };

  // ====================================================
  // CAMERA
  // ====================================================

  
  const toggleCamera = async () => {
  try {
    const nextCameraOff = !isCameraOff;

    let cameraTrack = localStreamRef.current?.getVideoTracks()[0];

    // Agar camera track available nahi hai, naya camera track lo
    if (!cameraTrack || cameraTrack.readyState === "ended") {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      cameraTrack = cameraStream.getVideoTracks()[0];

      if (!localStreamRef.current) {
        localStreamRef.current = new MediaStream();
      }

      localStreamRef.current
        .getVideoTracks()
        .forEach((track) => {
          localStreamRef.current.removeTrack(track);
        });

      localStreamRef.current.addTrack(cameraTrack);
    }

    cameraTrack.enabled = !nextCameraOff;

    // Existing peer connections mein camera track restore karo
    if (!isScreenSharing) {
      await replaceVideoTrackForPeers(cameraTrack);
    }

    setIsCameraOff(nextCameraOff);

    sendMediaState(isMuted, nextCameraOff, isScreenSharing);

    // Local preview update
    if (localVideoRef.current && !isScreenSharing) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(() => {});
    }
  } catch (error) {
    console.error("Camera toggle error:", error);
    alert("Unable to switch camera. Please check camera permissions.");
  }
};
  // ====================================================
  // SEND CHAT MESSAGE
  // ====================================================

  const sendChatMessage = () => {
    const trimmedMessage = chatInput.trim();

    if (!trimmedMessage || !socketRef.current) {
      return;
    }

    socketRef.current.emit("send-message", {
      meetingId,
      message: trimmedMessage.slice(0, 1000),
    });

    setChatInput("");
  };

  // ====================================================
  // START EDITING MESSAGE
  // ====================================================

  const startEditingMessage = (message) => {
    if (!message.isOwn || message.deleted) {
      return;
    }

    setEditingMessageId(message.id);
    setEditingMessageText(message.message || "");
  };

  // ====================================================
  // CANCEL EDITING MESSAGE
  // ====================================================

  const cancelEditingMessage = () => {
    setEditingMessageId(null);
    setEditingMessageText("");
  };

  // ====================================================
  // SAVE EDITED MESSAGE
  // ====================================================

  const saveEditedMessage = () => {
    const trimmedMessage = editingMessageText.trim();

    if (
      !trimmedMessage ||
      !editingMessageId ||
      !socketRef.current
    ) {
      return;
    }

    socketRef.current.emit("edit-message", {
      meetingId,
      messageId: editingMessageId,
      message: trimmedMessage.slice(0, 1000),
    });

    cancelEditingMessage();
  };

  // ====================================================
  // DELETE CHAT MESSAGE
  // ====================================================

  const deleteChatMessage = (message) => {
    if (
      !message.isOwn ||
      message.deleted ||
      !socketRef.current
    ) {
      return;
    }

    const shouldDelete = window.confirm(
      "Are you sure you want to delete this message?"
    );

    if (!shouldDelete) {
      return;
    }

    socketRef.current.emit("delete-message", {
      meetingId,
      messageId: message.id,
    });

    if (editingMessageId === message.id) {
      cancelEditingMessage();
    }
  };

  // ====================================================
  // EDIT INPUT KEY HANDLER
  // ====================================================

  const handleEditKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      saveEditedMessage();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditingMessage();
    }
  };

  // ====================================================
  // CHAT INPUT KEY HANDLER
  // ====================================================

  const handleChatKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendChatMessage();
    }
  };

  // ====================================================
  // AI MEETING TRANSCRIPTION
  // ====================================================

  const createSpeechRecognition = () => {
    if (speechRecognitionRef.current) {
      return speechRecognitionRef.current;
    }

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setTranscriptionSupported(false);
      return null;
    }

    const recognition = new SpeechRecognitionAPI();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("Speech recognition started");
      setIsTranscribing(true);
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let currentInterimText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const recognizedText = result[0]?.transcript || "";

        if (result.isFinal) {
          finalText += `${finalText ? " " : ""}${recognizedText.trim()}`;
        } else {
          currentInterimText += `${currentInterimText ? " " : ""}${recognizedText.trim()}`;
        }
      }

      const cleanText = finalText.trim();
      if (cleanText) {
        if (socketRef.current?.connected) {
          const entryId =
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `transcript-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

          socketRef.current.emit("transcript-entry", {
            id: entryId,
            meetingId,
            text: cleanText,
            speakerName: displayName,
            language: recognition.lang || "en-IN",
          });
        } else {
          setTranscript((current) =>
            `${current}${current ? "\n" : ""}${cleanText}`.trim()
          );
          console.warn(
            "Transcript is local only because the meeting server is disconnected."
          );
        }
      }

      setInterimTranscript(currentInterimText.trim());
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);

      // These errors mean the browser stopped listening and should not
      // keep retrying in the background.
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed" ||
        event.error === "audio-capture" ||
        event.error === "language-not-supported"
      ) {
        shouldRestartRecognitionRef.current = false;
        setIsTranscribing(false);
        setInterimTranscript("");
      }
    };

    recognition.onend = () => {
      console.log("Speech recognition ended");

      if (recognitionRestartTimerRef.current) {
        window.clearTimeout(recognitionRestartTimerRef.current);
        recognitionRestartTimerRef.current = null;
      }

      if (shouldRestartRecognitionRef.current) {
        recognitionRestartTimerRef.current = window.setTimeout(() => {
          recognitionRestartTimerRef.current = null;
          if (!shouldRestartRecognitionRef.current) return;

          try {
            recognition.start();
          } catch (error) {
            // InvalidStateError means the browser is already starting.
            if (error?.name !== "InvalidStateError") {
              console.warn("Speech recognition restart failed:", error);
              shouldRestartRecognitionRef.current = false;
              setIsTranscribing(false);
            }
          }
        }, 400);
      } else {
        setIsTranscribing(false);
        setInterimTranscript("");
      }
    };

    speechRecognitionRef.current = recognition;
    return recognition;
  };

  const startTranscription = () => {
    if (!transcriptionSupported) {
      alert(
        "Live transcription is not supported in this browser. Please use the latest Google Chrome or Microsoft Edge."
      );
      return;
    }

    const recognition = createSpeechRecognition();

    if (!recognition) {
      alert(
        "Live transcription is not supported in this browser. Please use the latest Google Chrome or Microsoft Edge."
      );
      return;
    }

    shouldRestartRecognitionRef.current = true;
    setIsTranscriptOpen(true);

    try {
      recognition.start();
    } catch (error) {
      // Calling start twice throws InvalidStateError. If it is already
      // running, keep the current recognition session.
      if (error?.name === "InvalidStateError") {
        setIsTranscribing(true);
        return;
      }

      console.error("Could not start transcription:", error);
      shouldRestartRecognitionRef.current = false;
      setIsTranscribing(false);
      alert(
        "Could not start transcription. Please allow microphone/speech permission and try again."
      );
    }
  };

  const stopTranscription = () => {
    shouldRestartRecognitionRef.current = false;
    if (recognitionRestartTimerRef.current) {
      window.clearTimeout(recognitionRestartTimerRef.current);
      recognitionRestartTimerRef.current = null;
    }
    setInterimTranscript("");

    const recognition = speechRecognitionRef.current;

    if (recognition) {
      try {
        recognition.stop();
      } catch (error) {
        console.warn("Speech recognition stop error:", error);
      }
    }

    setIsTranscribing(false);
  };

  const clearTranscript = () => {
    setTranscript("");
    setInterimTranscript("");
    setTranscriptCopied(false);
  };

  const copyTranscript = async () => {
    const sharedText = sharedTranscriptEntries
      .map((entry) => {
        const time = entry.timestamp
          ? new Date(entry.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";
        const speaker =
          entry.speakerId === socketId
            ? "You"
            : entry.speakerName || "Participant";
        return `[${time}] ${speaker}: ${entry.text}`;
      })
      .join("\n");

    const localText = `${transcript}${interimTranscript ? `${transcript ? " " : ""}${interimTranscript}` : ""}`.trim();
    const textToCopy = [sharedText, localText].filter(Boolean).join("\n").trim();

    if (!textToCopy) {
      return;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      setTranscriptCopied(true);

      window.setTimeout(() => {
        setTranscriptCopied(false);
      }, 1500);
    } catch (error) {
      console.error("Transcript copy error:", error);

      try {
        const textarea = document.createElement("textarea");
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();

        setTranscriptCopied(true);

        window.setTimeout(() => {
          setTranscriptCopied(false);
        }, 1500);
      } catch (fallbackError) {
        console.error(
          "Transcript clipboard fallback error:",
          fallbackError
        );
      }
    }
  };

  // ====================================================
  // CLEAN UP SPEECH RECOGNITION ON UNMOUNT
  // ====================================================

  useEffect(() => {
    return () => {
      shouldRestartRecognitionRef.current = false;
      if (recognitionRestartTimerRef.current) {
        window.clearTimeout(recognitionRestartTimerRef.current);
        recognitionRestartTimerRef.current = null;
      }

      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (error) {
          console.warn("Speech recognition cleanup error:", error);
        }

        speechRecognitionRef.current = null;
      }
    };
  }, []);

  // ====================================================
  // AUTO-SCROLL CHAT
  // ====================================================

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  // ====================================================
  // COPY MEETING ID
  // ====================================================

  const copyMeetingId = async () => {
    try {
      await navigator.clipboard.writeText(meetingId);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch (error) {
      console.error("Copy error:", error);

      // Fallback for browsers where clipboard API is blocked.
      try {
        const textarea =
          document.createElement("textarea");

        textarea.value = meetingId;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();

        setCopied(true);

        setTimeout(() => {
          setCopied(false);
        }, 1500);
      } catch (fallbackError) {
        console.error(
          "Clipboard fallback error:",
          fallbackError
        );
      }
    }
  };

  // ====================================================
  // CLEANUP
  // ====================================================

  const cleanup = () => {
    console.log("Cleaning up meeting...");

    // Stop browser speech recognition before leaving the meeting.
    shouldRestartRecognitionRef.current = false;

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (error) {
        console.warn("Speech recognition cleanup error:", error);
      }

      speechRecognitionRef.current = null;
    }

    setIsTranscribing(false);
    setInterimTranscript("");

    // Tell other participants that we are leaving.
    if (socketRef.current?.connected) {
      socketRef.current.emit("leave-room", {
        meetingId,
      });
    }

    // Stop local media.
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current
        .getTracks()
        .forEach((track) => track.stop());

      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    // Close all peer connections.
    peerConnectionsRef.current.forEach(
      (peerConnection) => {
        peerConnection.close();
      }
    );

    peerConnectionsRef.current.clear();

    // Stop remote tracks.
    remoteStreamsRef.current.forEach((stream) => {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
    });

    remoteStreamsRef.current.clear();

    // Clear ICE queues, media states and participant names.
    pendingIceCandidatesRef.current.clear();
    mediaStatesRef.current.clear();
    participantNamesRef.current.clear();

    // Disconnect socket.
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setParticipants([]);
  };

  // ====================================================
  // LEAVE
  // ====================================================

  const handleLeave = () => {
    cleanup();

    if (onLeave) {
      onLeave();
    }
  };

  // ====================================================
  // INITIALIZE MEETING
  // ====================================================

  useEffect(() => {
    let mounted = true;
    let socket = null;

    // Capture ref values for this effect's cleanup.
    const localVideoElement = localVideoRef.current;
    const peerConnections = peerConnectionsRef.current;
    const remoteStreams = remoteStreamsRef.current;
    const pendingIceCandidates = pendingIceCandidatesRef.current;
    const mediaStates = mediaStatesRef.current;

    const initialize = async () => {
      try {
        await startLocalMedia();

        if (!mounted) {
          return;
        }

        console.log(
          "Connecting to SmartMeet server:",
          SOCKET_URL
        );

        socket = io(SOCKET_URL, {
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          timeout: 10000,
        });

        socketRef.current = socket;

        // ------------------------------------------------
        // CONNECT
        // ------------------------------------------------

        socket.on("connect", () => {
          console.log(
            "Socket connected:",
            socket.id
          );

          setSocketId(socket.id);
          setIsSocketConnected(true);
          setConnectionStatus("Joining meeting...");

          socket.emit("join-room", {
            meetingId,
            participantName: displayName,
          });
        });

        // ------------------------------------------------
        // EXISTING PARTICIPANTS
        //
        // New participant creates offers to everyone
        // already inside the meeting.
        // ------------------------------------------------

        socket.on("participant-list", (payload = {}) => {
          if (payload.meetingId && payload.meetingId !== meetingId) return;
          if (!Array.isArray(payload.participants)) return;

          payload.participants.forEach((participant) => {
            if (participant?.socketId) {
              updateParticipantName(participant.socketId, participant.name);
            }
          });
        });

        socket.on(
          "existing-users",
          async (userIds) => {
            console.log(
              "Existing participants:",
              userIds
            );

            if (!Array.isArray(userIds)) {
              return;
            }

            if (userIds.length === 0) {
              setConnectionStatus(
                "Waiting for participants..."
              );
              return;
            }

            setConnectionStatus(
              "Connecting to participants..."
            );

            for (const userId of userIds) {
              if (!mounted) {
                return;
              }

              await createOffer(userId);
            }
          }
        );

        // ------------------------------------------------
        // NEW PARTICIPANT
        //
        // Existing users do not create a second offer.
        // The newcomer handles negotiation.
        // ------------------------------------------------

        socket.on("transcript-entry", (payload) => {
          if (payload?.meetingId && payload.meetingId !== meetingId) return;

          // Current backend wraps the entry in payload.entry. Accept a direct
          // entry as well for compatibility with older server versions.
          const entry = payload?.entry || payload;
          if (!entry?.id || !entry?.text) return;

          setSharedTranscriptEntries((current) => {
            if (current.some((item) => item.id === entry.id)) return current;
            return [...current, entry].sort(
              (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
            );
          });
        });

        socket.on("transcript-history", (payload) => {
          if (payload?.meetingId === meetingId && Array.isArray(payload.entries)) {
            setSharedTranscriptEntries((current) => {
              const entriesById = new Map();
              [...payload.entries, ...current].forEach((entry) => {
                if (entry?.id && entry?.text) entriesById.set(entry.id, entry);
              });
              return [...entriesById.values()].sort(
                (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
              );
            });
          }
        });

        socket.on("transcript-error", (payload) => {
          console.warn("Transcript could not be shared:", payload?.message || "Unknown error");
        });

        socket.on(
          "user-joined",
          ({ socketId, name }) => {
            console.log(
              "New user joined:",
              socketId,
              name
            );

            updateParticipantName(socketId, name);

            setConnectionStatus(
              "Participant joined"
            );
          }
        );

        // ------------------------------------------------
        // OFFER
        // ------------------------------------------------

        socket.on(
          "offer",
          async ({ fromId, offer }) => {
            await handleOffer(fromId, offer);
          }
        );

        // ------------------------------------------------
        // ANSWER
        // ------------------------------------------------

        socket.on(
          "answer",
          async ({ fromId, answer }) => {
            await handleAnswer(fromId, answer);
          }
        );

        // ------------------------------------------------
        // ICE
        // ------------------------------------------------

        socket.on(
          "ice-candidate",
          async ({ fromId, candidate }) => {
            await handleIceCandidate(
              fromId,
              candidate
            );
          }
        );

        // ------------------------------------------------
        // MEDIA STATE
        //
        // Requires the server to relay:
        // "media-state" -> other participants.
        // ------------------------------------------------

        socket.on(
          "media-state",
          ({
            fromId,
            muted,
            cameraOff,
            screenSharing,
          }) => {
            console.log(
              "Remote media state:",
              fromId,
              { muted, cameraOff }
            );

            updateParticipantMediaState(
              fromId,
              {
                muted: Boolean(muted),
                cameraOff: Boolean(cameraOff),
                screenSharing: Boolean(screenSharing),
              }
            );
          }
        );

        // ------------------------------------------------
        // CHAT MESSAGE
        // ------------------------------------------------

        socket.on(
          "receive-message",
          (chatMessage) => {
            console.log(
              "Chat message received:",
              chatMessage
            );

            const senderId =
              chatMessage.senderId ||
              chatMessage.socketId;

            const messageText =
              chatMessage.text ??
              chatMessage.message ??
              "";

            setMessages((current) => [
              ...current,
              {
                id: chatMessage.id,
                socketId: senderId,
                senderId,
                message: messageText,
                timestamp:
                  chatMessage.timestamp ||
                  new Date().toISOString(),
                isOwn: senderId === socket.id,
                edited: Boolean(chatMessage.edited),
                deleted: Boolean(chatMessage.deleted),
              },
            ]);
          }
        );

        // ------------------------------------------------
        // EDITED CHAT MESSAGE
        // ------------------------------------------------

        socket.on(
          "message-edited",
          ({
            id,
            senderId,
            text,
            edited,
            editedAt,
          }) => {
            console.log(
              "Chat message edited:",
              id
            );

            setMessages((current) =>
              current.map((message) => {
                // Only the original sender is allowed
                // to update this message in the UI.
                if (
                  message.id !== id ||
                  message.socketId !== senderId
                ) {
                  return message;
                }

                return {
                  ...message,
                  message: text,
                  edited: Boolean(edited),
                  editedAt,
                };
              })
            );
          }
        );

        // ------------------------------------------------
        // DELETED CHAT MESSAGE
        // ------------------------------------------------

        socket.on(
          "message-deleted",
          ({
            id,
            senderId,
            deleted,
            deletedAt,
          }) => {
            console.log(
              "Chat message deleted:",
              id
            );

            setMessages((current) =>
              current.map((message) => {
                // Only the original sender is allowed
                // to delete this message in the UI.
                if (
                  message.id !== id ||
                  message.socketId !== senderId
                ) {
                  return message;
                }

                return {
                  ...message,
                  message: "This message was deleted",
                  deleted: Boolean(deleted),
                  deletedAt,
                };
              })
            );

            setEditingMessageId((currentId) =>
              currentId === id ? null : currentId
            );

            setEditingMessageText((currentText) =>
              currentText && editingMessageId === id
                ? ""
                : currentText
            );
          }
        );

        // ------------------------------------------------
        // USER LEFT
        // ------------------------------------------------

        socket.on(
          "user-left",
          ({ socketId }) => {
            console.log(
              "User left:",
              socketId
            );

            removePeerConnection(socketId);
          }
        );

        // ------------------------------------------------
        // CONNECTION ERROR
        // ------------------------------------------------

        socket.on(
          "connect_error",
          (error) => {
            console.error(
              "Socket connection error:",
              error
            );

            setConnectionStatus(
              "Server connection failed"
            );
          }
        );

        // ------------------------------------------------
        // DISCONNECT
        // ------------------------------------------------

        socket.on(
          "disconnect",
          (reason) => {
            console.log(
              "Socket disconnected:",
              reason
            );

            if (mounted) {
              setIsSocketConnected(false);
              setConnectionStatus(
                "Disconnected from server"
              );
            }
          }
        );

        // ------------------------------------------------
        // RECONNECT
        // ------------------------------------------------

        socket.io.on(
          "reconnect",
          () => {
            if (!mounted) {
              return;
            }

            console.log(
              "Socket reconnected"
            );

            setConnectionStatus(
              "Reconnected. Joining meeting..."
            );

            socket.emit("join-room", {
              meetingId,
            });
          }
        );
      } catch (error) {
        console.error(
          "Initialization error:",
          error
        );

        if (mounted) {
          setConnectionStatus(
            "Could not start meeting"
          );
        }
      }
    };

    initialize();

    return () => {
      mounted = false;

      // Stop browser speech recognition on component unmount.
      shouldRestartRecognitionRef.current = false;

      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (error) {
          console.warn("Speech recognition unmount error:", error);
        }

        speechRecognitionRef.current = null;
      }

      // Use the same cleanup logic, but do not call onLeave
      // when React simply unmounts this component.
      if (socket?.connected) {
        socket.emit("leave-room", {
          meetingId,
        });
      }

      if (localStreamRef.current) {
        localStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());

        localStreamRef.current = null;
      }

      if (localVideoElement) {
        localVideoElement.srcObject = null;
      }

      peerConnections.forEach(
        (peerConnection) => {
          peerConnection.close();
        }
      );

      peerConnections.clear();

      remoteStreams.forEach((stream) => {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
      });

      remoteStreams.clear();
      pendingIceCandidates.clear();
      mediaStates.clear();

      if (socket) {
        socket.disconnect();
      }

      socketRef.current = null;
    };

    // meetingId is intentionally the only dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);
  // ======================================================
  // UI - PROFESSIONAL SMARTMEET LAYOUT
  // ======================================================

  return (
    <div className="sm-meeting-shell">
      {/* HEADER */}
      <header className="sm-meeting-header">
        <div className="sm-brand">
          <div className="sm-brand-icon">S</div>
          <div>
            <h2>SmartMeet</h2>
            <span className="sm-meeting-subtitle">Video conference</span>
          </div>
        </div>

        <div className="sm-header-center">
          <span className="sm-live-dot" />
          <span>{connectionStatus}</span>
        </div>

        <div className="sm-meeting-id">
          <div>
            <small>MEETING ID</small>
            <strong title={meetingId}>{meetingId}</strong>
          </div>
          <button className="sm-copy-btn" onClick={copyMeetingId}>
            {copied ? "✓ Copied" : "Copy ID"}
          </button>
        </div>
      </header>

      {/* MEETING CONTENT */}
      <main className="sm-meeting-main">
        <div className="sm-stage-heading">
          <div>
            <h3>Meeting room</h3>
            <p>Your conversation, all in one place</p>
          </div>
          <div className="sm-participant-count">
            <span>●</span> {participants.length + 1} participant
            {participants.length === 0 ? "" : "s"}
          </div>
        </div>

        {/* VIDEO GRID */}
        <section className="sm-video-grid">
          {/* LOCAL PARTICIPANT */}
          <div className="sm-video-tile sm-local-tile">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="sm-video-element"
              style={{
                display:
                  isCameraOff && !isScreenSharing ? "none" : "block",
              }}
            />

            {isCameraOff && !isScreenSharing && (
              <div className="sm-camera-placeholder">
                <div className="sm-avatar">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <span>Camera is off</span>
              </div>
            )}

            <div className="sm-tile-top">
              <span className="sm-you-tag">YOU</span>
              {isScreenSharing && (
                <span className="sm-sharing-tag">▣ Sharing screen</span>
              )}
            </div>

            <div className="sm-tile-footer">
              <span className="sm-tile-name">{displayName}</span>
              <div className="sm-tile-status">
                {isMuted && <span title="Muted">🎤</span>}
                {isCameraOff && !isScreenSharing && (
                  <span title="Camera off">📷</span>
                )}
              </div>
            </div>
          </div>

          {/* REMOTE PARTICIPANTS */}
          {participants.map((participant) => (
            <RemoteParticipant
              key={participant.id}
              participant={participant}
            />
          ))}
        </section>
      </main>

      {/* CHAT PANEL */}
      {isChatOpen && (
        <aside className="sm-floating-panel sm-chat-panel">
          <div className="sm-panel-header">
            <div>
              <h3>Meeting chat</h3>
              <span>{messages.length} messages</span>
            </div>
            <button
              className="sm-panel-close"
              onClick={() => setIsChatOpen(false)}
              title="Close chat"
            >
              ✕
            </button>
          </div>

          <div className="sm-chat-messages">
            {messages.length === 0 ? (
              <div className="sm-empty-state">
                <div>💬</div>
                <strong>No messages yet</strong>
                <span>Start the conversation with your team.</span>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`sm-message-row ${
                    message.isOwn ? "sm-message-own" : ""
                  }`}
                >
                  {editingMessageId === message.id ? (
                    <div className="sm-edit-box">
                      <textarea
                        value={editingMessageText}
                        onChange={(event) =>
                          setEditingMessageText(
                            event.target.value.slice(0, 1000)
                          )
                        }
                        onKeyDown={handleEditKeyDown}
                        rows={3}
                        maxLength={1000}
                        autoFocus
                      />
                      <div className="sm-message-actions">
                        <button onClick={cancelEditingMessage}>
                          Cancel
                        </button>
                        <button
                          onClick={saveEditedMessage}
                          disabled={!editingMessageText.trim()}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="sm-message-content">
                      <div className="sm-message-sender">
                        {message.isOwn ? "You" : "Participant"}
                      </div>
                      <div
                        className={`sm-message-bubble ${
                          message.deleted ? "sm-deleted-message" : ""
                        }`}
                      >
                        {message.message}
                      </div>
                      <div className="sm-message-meta">
                        {message.timestamp
                          ? new Date(message.timestamp).toLocaleTimeString(
                              [],
                              { hour: "2-digit", minute: "2-digit" }
                            )
                          : ""}
                        {message.edited && !message.deleted && " · edited"}
                        {message.deleted && " · deleted"}
                      </div>

                      {message.isOwn && !message.deleted && (
                        <div className="sm-message-actions">
                          <button
                            onClick={() => startEditingMessage(message)}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteChatMessage(message)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={chatMessagesEndRef} />
          </div>

          <div className="sm-chat-composer">
            <textarea
              value={chatInput}
              onChange={(event) =>
                setChatInput(event.target.value.slice(0, 1000))
              }
              onKeyDown={handleChatKeyDown}
              placeholder="Write a message..."
              rows={1}
              maxLength={1000}
            />
            <button
              onClick={sendChatMessage}
              disabled={!chatInput.trim() || !isSocketConnected}
              title="Send message"
            >
              ➤
            </button>
          </div>
        </aside>
      )}

      {/* AI TRANSCRIPTION PANEL */}
      {isTranscriptOpen && (
        <aside className="sm-floating-panel sm-transcript-panel">
          <div className="sm-panel-header">
            <div>
              <h3>✦ AI Meeting Transcript</h3>
              <span className={isTranscribing ? "sm-listening" : ""}>
                {isTranscribing ? "● Listening now" : "Transcription paused"}
              </span>
            </div>
            <button
              className="sm-panel-close"
              onClick={() => setIsTranscriptOpen(false)}
              title="Close transcript"
            >
              ✕
            </button>
          </div>

          {!transcriptionSupported ? (
            <div className="sm-transcript-content">
              Live transcription is not supported in this browser.
              Please use the latest Google Chrome or Microsoft Edge.
            </div>
          ) : (
            <>
              <div className="sm-transcript-content">
                {sharedTranscriptEntries.length > 0 ||
                transcript ||
                interimTranscript ? (
                  <>
                    {sharedTranscriptEntries.length > 0 ? (
                      sharedTranscriptEntries.map((entry) => (
                        <div className="sm-transcript-entry" key={entry.id}>
                          <div className="sm-transcript-speaker">
                            <strong>
                              {entry.speakerId === socketId
                                ? "You"
                                : entry.speakerName || "Participant"}
                            </strong>
                            <span>
                              {entry.timestamp
                                ? new Date(entry.timestamp).toLocaleTimeString(
                                    [],
                                    { hour: "2-digit", minute: "2-digit" }
                                  )
                                : ""}
                            </span>
                          </div>
                          <p>{entry.text}</p>
                        </div>
                      ))
                    ) : (
                      <p>{transcript}</p>
                    )}

                    {sharedTranscriptEntries.length > 0 && transcript && (
                      <div className="sm-local-transcript">
                        <small>Local-only text</small>
                        <p>{transcript}</p>
                      </div>
                    )}

                    {interimTranscript && (
                      <p className="sm-interim-transcript">
                        {interimTranscript}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="sm-empty-state">
                    <div>🎙️</div>
                    <strong>
                      {isTranscribing ? "Listening..." : "Ready to transcribe"}
                    </strong>
                    <span>
                      {isTranscribing
                        ? "Your conversation will appear here."
                        : "Start transcription to capture the conversation."}
                    </span>
                  </div>
                )}
              </div>

              <div className="sm-transcript-actions">
                <button
                  className={isTranscribing ? "sm-stop-btn" : "sm-start-btn"}
                  onClick={
                    isTranscribing ? stopTranscription : startTranscription
                  }
                >
                  {isTranscribing ? "■ Stop" : "🎙 Start"}
                </button>

                <button onClick={copyTranscript}>
                  {transcriptCopied ? "✓ Copied" : "Copy"}
                </button>

                <button
                  onClick={clearTranscript}
                  disabled={!transcript && !interimTranscript}
                >
                  Clear
                </button>
              </div>
            </>
          )}
        </aside>
      )}

      {/* BOTTOM TOOLBAR */}
      <footer className="sm-meeting-controls">
        <div className="sm-toolbar-group">
          <button
            className={`sm-control-btn ${isMuted ? "sm-control-active" : ""}`}
            onClick={toggleMute}
          >
            <span>{isMuted ? "🔇" : "🎤"}</span>
            <small>{isMuted ? "Unmute" : "Mute"}</small>
          </button>

          <button
            className={`sm-control-btn ${
              isCameraOff ? "sm-control-active" : ""
            }`}
            onClick={toggleCamera}
          >
            <span>{isCameraOff ? "📷" : "📹"}</span>
            <small>{isCameraOff ? "Camera on" : "Camera"}</small>
          </button>

          <button
            className={`sm-control-btn ${
              isScreenSharing ? "sm-control-selected" : ""
            }`}
            onClick={isScreenSharing ? stopScreenShare : startScreenShare}
          >
            <span>▣</span>
            <small>{isScreenSharing ? "Stop share" : "Share screen"}</small>
          </button>

          <button
            className={`sm-control-btn ${
              isTranscriptOpen ? "sm-control-selected" : ""
            }`}
            onClick={() => setIsTranscriptOpen((current) => !current)}
          >
            <span>✦</span>
            <small>Transcript</small>
          </button>

          <button
            className={`sm-control-btn ${
              isChatOpen ? "sm-control-selected" : ""
            }`}
            onClick={() => setIsChatOpen((current) => !current)}
          >
            <span>💬</span>
            <small>Chat</small>
          </button>
        </div>

        <button className="sm-leave-btn" onClick={handleLeave}>
          <span>↗</span>
          <small>Leave</small>
        </button>
      </footer>
    </div>
  );
}

// ======================================================
// REMOTE PARTICIPANT
// ======================================================
function RemoteParticipant({ participant }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !participant.stream) return;

    video.srcObject = participant.stream;

    video.play().catch((error) => {
      console.log("Remote video playback waiting:", error);
    });

    return () => {
      video.srcObject = null;
    };
  }, [
    participant.stream,
    participant.cameraOff,
    participant.screenSharing,
  ]);

  return (
    <div className="sm-video-tile sm-participant-tile">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="sm-video-element"
        style={{
          display:
            participant.cameraOff && !participant.screenSharing
              ? "none"
              : "block",
        }}
      />

      {participant.cameraOff && !participant.screenSharing && (
        <div className="sm-camera-placeholder">
          <div className="sm-avatar">
            {(participant.name || "P").charAt(0).toUpperCase()}
          </div>
          <span>Camera is off</span>
        </div>
      )}

      <div className="sm-tile-top">
        {participant.screenSharing && (
          <span className="sm-sharing-tag">
            ▣ Sharing screen
          </span>
        )}
      </div>

      <div className="sm-tile-footer">
        <span className="sm-tile-name">
          {participant.name || "Participant"}
        </span>

        <div className="sm-tile-status">
          {participant.muted && <span title="Muted">🎤</span>}

          {participant.cameraOff && (
            <span title="Camera off">📷</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default MeetingRoom;
  
  
