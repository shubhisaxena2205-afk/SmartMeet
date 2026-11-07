
require("dotenv").config();
console.log(
  "BREVO_FROM_EMAIL loaded:",
  Boolean(process.env.BREVO_FROM_EMAIL)
);

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { randomUUID } = require("crypto");
const mongoose = require("mongoose");

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");

// --------------------------------------------------
// 1. EXPRESS SERVER SETUP
// --------------------------------------------------

const app = express();
const httpServer = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

const allowedOrigins =
  CLIENT_ORIGIN === "*"
    ? "*"
    : CLIENT_ORIGIN.split(",").map((origin) => origin.trim());

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: CLIENT_ORIGIN !== "*",
  })
);

app.use(express.json({ limit: "1mb" }));
app.use("/api/assistant", require("./routes/assistantRoutes"));

// --------------------------------------------------
// 2. AUTHENTICATION ROUTES
// --------------------------------------------------

app.use("/api/auth", authRoutes);

// --------------------------------------------------
// 3. MONGODB MEETING MODEL
// --------------------------------------------------

const transcriptEntrySchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    speakerId: { type: String, default: "unknown" },
    speakerName: { type: String, default: "Participant" },
    text: { type: String, required: true, maxlength: 5000 },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const actionItemSchema = new mongoose.Schema(
  {
    task: { type: String, required: true },
    assignee: { type: String, default: "Unassigned" },
    dueDate: { type: String, default: "" },
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const meetingSchema = new mongoose.Schema(
  {
    meetingId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      default: "SmartMeet Meeting",
    },
    transcript: {
      type: [transcriptEntrySchema],
      default: [],
    },
    summary: {
      type: String,
      default: "",
    },
    keyPoints: {
      type: [String],
      default: [],
    },
    decisions: {
      type: [String],
      default: [],
    },
    actionItems: {
      type: [actionItemSchema],
      default: [],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
    collection: "meetings",
  }
);

const Meeting =
  mongoose.models.SmartMeetMeeting ||
  mongoose.model("SmartMeetMeeting", meetingSchema);

// --------------------------------------------------
// 4. SOCKET.IO SETUP
// --------------------------------------------------

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: CLIENT_ORIGIN !== "*",
  },
  transports: ["websocket", "polling"],
});

// Chat messages are stored in memory.
const messagesByMeeting = new Map();

// --------------------------------------------------
// 5. HELPER FUNCTIONS
// --------------------------------------------------

function getMeetingId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const meetingId = value.trim();

  if (!meetingId || meetingId.length > 200) {
    return null;
  }

  return meetingId;
}

function getMessageList(meetingId) {
  if (!messagesByMeeting.has(meetingId)) {
    messagesByMeeting.set(meetingId, []);
  }

  return messagesByMeeting.get(meetingId);
}

function isSocketInMeeting(socket, meetingId) {
  return socket.rooms.has(meetingId);
}

function cleanParticipantName(value) {
  if (typeof value !== "string") {
    return "Participant";
  }

  const name = value.trim().slice(0, 100);

  return name || "Participant";
}

function relayToTarget(socket, eventName, payload, dataKey) {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const meetingId = getMeetingId(payload.meetingId);
  const targetId = payload.targetId;

  if (
    !meetingId ||
    typeof targetId !== "string" ||
    !isSocketInMeeting(socket, meetingId)
  ) {
    return;
  }

  const targetSocket = io.sockets.sockets.get(targetId);

  if (!targetSocket || !isSocketInMeeting(targetSocket, meetingId)) {
    return;
  }

  targetSocket.emit(eventName, {
    fromId: socket.id,
    [dataKey]: payload[dataKey],
  });
}

async function getOrCreateMeeting(meetingId) {
  let meeting = await Meeting.findOne({ meetingId });

  if (!meeting) {
    try {
      meeting = await Meeting.create({ meetingId });
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }

      meeting = await Meeting.findOne({ meetingId });
    }
  }

  if (!meeting) {
    throw new Error("Unable to create or retrieve meeting.");
  }

  return meeting;
}

// --------------------------------------------------
// 6. HEALTH CHECK ROUTES
// --------------------------------------------------

app.get("/", (_req, res) => {
  res.status(200).json({
    message: "SmartMeet server is running",
  });
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected",
  });
});

// --------------------------------------------------
// 7. MEETING HISTORY API
// --------------------------------------------------

app.get("/api/meetings/:meetingId", async (req, res) => {
  try {
    const meetingId = getMeetingId(req.params.meetingId);

    if (!meetingId) {
      return res.status(400).json({
        message: "Invalid meeting ID.",
      });
    }

    const meeting = await Meeting.findOne({ meetingId }).lean();

    if (!meeting) {
      return res.status(404).json({
        message: "No saved history exists for this meeting yet.",
      });
    }

    return res.json({ meeting });
  } catch (error) {
    console.error("Get meeting history error:", error);

    return res.status(500).json({
      message: "Unable to retrieve meeting history.",
    });
  }
});

// --------------------------------------------------
// 8. SOCKET.IO CONNECTION
// --------------------------------------------------

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // ------------------------------------------------
  // JOIN MEETING ROOM
  // ------------------------------------------------

  socket.on("join-room", async (payload = {}) => {
    try {
      const meetingId = getMeetingId(payload.meetingId);

      if (!meetingId) {
        socket.emit("meeting-error", {
          message: "A valid meeting ID is required.",
        });

        return;
      }

      // Receive the participant's account display name.
      socket.data.participantName = cleanParticipantName(
        payload.participantName
      );

      const previousMeetingId = socket.data.meetingId;

      if (previousMeetingId && previousMeetingId !== meetingId) {
        socket.to(previousMeetingId).emit("user-left", {
          socketId: socket.id,
        });

        await socket.leave(previousMeetingId);
      }

      // Get participants already present in this meeting.
      const existingSocketIds = Array.from(
        io.sockets.adapter.rooms.get(meetingId) || []
      ).filter((id) => id !== socket.id);

      await socket.join(meetingId);

      socket.data.meetingId = meetingId;

      // Keep this event for existing WebRTC signaling logic.
      socket.emit("existing-users", existingSocketIds);

      // Send the existing participant names to the new participant.
      const existingParticipants = existingSocketIds.map((socketId) => {
        const participantSocket = io.sockets.sockets.get(socketId);

        return {
          socketId,
          name:
            participantSocket?.data?.participantName || "Participant",
        };
      });

      socket.emit("participant-list", {
        meetingId,
        participants: existingParticipants,
      });

      // Notify existing participants about the new participant.
      socket.to(meetingId).emit("user-joined", {
        socketId: socket.id,
        name: socket.data.participantName,
      });

      // Load saved transcript history.
      try {
        const meeting = await Meeting.findOne({ meetingId }).lean();

        socket.emit("transcript-history", {
          meetingId,
          entries: meeting?.transcript || [],
        });
      } catch (error) {
        console.error("Load transcript history error:", error);
      }

      console.log(
        `${socket.data.participantName} (${socket.id}) joined meeting ${meetingId}`
      );
    } catch (error) {
      console.error("Join meeting error:", error);

      socket.emit("meeting-error", {
        message: "Unable to join the meeting.",
      });
    }
  });

  // ------------------------------------------------
  // WEBRTC OFFER
  // ------------------------------------------------

  socket.on("offer", (payload) => {
    relayToTarget(socket, "offer", payload, "offer");
  });

  // ------------------------------------------------
  // WEBRTC ANSWER
  // ------------------------------------------------

  socket.on("answer", (payload) => {
    relayToTarget(socket, "answer", payload, "answer");
  });

  // ------------------------------------------------
  // WEBRTC ICE CANDIDATE
  // ------------------------------------------------

  socket.on("ice-candidate", (payload) => {
    relayToTarget(socket, "ice-candidate", payload, "candidate");
  });

  // ------------------------------------------------
  // MICROPHONE, CAMERA AND SCREEN-SHARING STATE
  // ------------------------------------------------

  socket.on("media-state", (payload = {}) => {
    const meetingId = getMeetingId(payload.meetingId);

    if (!meetingId || !isSocketInMeeting(socket, meetingId)) {
      return;
    }

    socket.to(meetingId).emit("media-state", {
      fromId: socket.id,
      muted: Boolean(payload.muted),
      cameraOff: Boolean(payload.cameraOff),
      screenSharing: Boolean(payload.screenSharing),
    });
  });

  // ------------------------------------------------
  // LIVE TRANSCRIPTION
  // ------------------------------------------------

  socket.on("transcript-entry", async (payload = {}) => {
    const meetingId = getMeetingId(payload.meetingId);

    const text =
      typeof payload.text === "string"
        ? payload.text.trim().slice(0, 5000)
        : "";

    if (!meetingId || !text || !isSocketInMeeting(socket, meetingId)) {
      return;
    }

    const entry = {
      id:
        typeof payload.id === "string" && payload.id.length <= 100
          ? payload.id
          : randomUUID(),

      speakerId: socket.id,

      speakerName: cleanParticipantName(
        socket.data.participantName || payload.speakerName
      ),

      text,
      timestamp: new Date().toISOString(),
    };

    // Broadcast transcript to every participant.
    io.to(meetingId).emit("transcript-entry", {
      meetingId,
      entry,
      persisted: false,
    });

    // Save transcript in MongoDB.
    try {
      const meeting = await getOrCreateMeeting(meetingId);

      const alreadySaved = meeting.transcript.some(
        (item) => item.id === entry.id
      );

      if (!alreadySaved) {
        meeting.transcript.push({
          ...entry,
          timestamp: new Date(entry.timestamp),
        });

        meeting.updatedAt = new Date();

        await meeting.save();
      }

      socket.emit("transcript-saved", {
        id: entry.id,
      });
    } catch (error) {
      console.error("Save shared transcript error:", error);

      socket.emit("transcript-error", {
        id: entry.id,
        message:
          "Live transcript was shared, but it could not be saved to meeting history. Check the database connection.",
      });
    }
  });

  // ------------------------------------------------
  // SEND CHAT MESSAGE
  // ------------------------------------------------

  socket.on("send-message", (payload = {}) => {
    const meetingId = getMeetingId(payload.meetingId);

    const message =
      typeof payload.message === "string"
        ? payload.message.trim()
        : "";

    if (!meetingId || !message || !isSocketInMeeting(socket, meetingId)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const messageText = message.slice(0, 1000);

    const chatMessage = {
      id: randomUUID(),
      senderId: socket.id,
      socketId: socket.id,
      text: messageText,
      message: messageText,
      timestamp,
      edited: false,
      deleted: false,
    };

    getMessageList(meetingId).push(chatMessage);

    io.to(meetingId).emit("receive-message", chatMessage);
  });

  // ------------------------------------------------
  // EDIT CHAT MESSAGE
  // ------------------------------------------------

  socket.on("edit-message", (payload = {}) => {
    const meetingId = getMeetingId(payload.meetingId);
    const messageId = payload.messageId;

    const newText =
      typeof payload.message === "string"
        ? payload.message.trim()
        : "";

    if (
      !meetingId ||
      typeof messageId !== "string" ||
      !newText ||
      !isSocketInMeeting(socket, meetingId)
    ) {
      return;
    }

    const chatMessage = getMessageList(meetingId).find(
      (item) => item.id === messageId
    );

    if (
      !chatMessage ||
      chatMessage.senderId !== socket.id ||
      chatMessage.deleted
    ) {
      return;
    }

    chatMessage.text = newText.slice(0, 1000);
    chatMessage.message = chatMessage.text;
    chatMessage.edited = true;
    chatMessage.editedAt = new Date().toISOString();

    io.to(meetingId).emit("message-edited", {
      id: chatMessage.id,
      senderId: chatMessage.senderId,
      text: chatMessage.text,
      edited: true,
      editedAt: chatMessage.editedAt,
    });
  });

  // ------------------------------------------------
  // DELETE CHAT MESSAGE
  // ------------------------------------------------

  socket.on("delete-message", (payload = {}) => {
    const meetingId = getMeetingId(payload.meetingId);
    const messageId = payload.messageId;

    if (
      !meetingId ||
      typeof messageId !== "string" ||
      !isSocketInMeeting(socket, meetingId)
    ) {
      return;
    }

    const chatMessage = getMessageList(meetingId).find(
      (item) => item.id === messageId
    );

    if (
      !chatMessage ||
      chatMessage.senderId !== socket.id ||
      chatMessage.deleted
    ) {
      return;
    }

    chatMessage.deleted = true;
    chatMessage.text = "This message was deleted";
    chatMessage.message = chatMessage.text;
    chatMessage.deletedAt = new Date().toISOString();

    io.to(meetingId).emit("message-deleted", {
      id: chatMessage.id,
      senderId: socket.id,
      deleted: true,
      deletedAt: chatMessage.deletedAt,
    });
  });

  // ------------------------------------------------
  // LEAVE MEETING
  // ------------------------------------------------

  socket.on("leave-room", async (payload = {}) => {
    const meetingId = getMeetingId(payload.meetingId);

    if (!meetingId || !isSocketInMeeting(socket, meetingId)) {
      return;
    }

    socket.to(meetingId).emit("user-left", {
      socketId: socket.id,
    });

    await socket.leave(meetingId);

    if (socket.data.meetingId === meetingId) {
      socket.data.meetingId = null;
    }

    console.log(`${socket.id} left meeting ${meetingId}`);
  });

  // ------------------------------------------------
  // DISCONNECTING PARTICIPANTS
  // ------------------------------------------------

  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        socket.to(room).emit("user-left", {
          socketId: socket.id,
        });
      }
    }
  });

  // ------------------------------------------------
  // DISCONNECT
  // ------------------------------------------------

  socket.on("disconnect", (reason) => {
    console.log(`Socket disconnected: ${socket.id} (${reason})`);
  });
});

// --------------------------------------------------
// 9. START SERVER AND CONNECT DATABASE
// --------------------------------------------------

async function startServer() {
  let databaseConnected = false;

  try {
    await connectDB();

    databaseConnected = true;

    console.log("MongoDB Connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);

    console.warn(
      "Starting SmartMeet without database. Live signaling can run, but transcript history requires MongoDB."
    );
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`SmartMeet server running on port ${PORT}`);
    console.log("Remote signaling server is ready");

    console.log(
      `Database status: ${
        databaseConnected ? "Connected" : "Disconnected"
      }`
    );

    console.log("Live transcription relay: enabled");
    console.log("Participant names: enabled");
    console.log("AI Summary and AI Meeting Assistant APIs are disabled");
  });
}

// --------------------------------------------------
// 10. START SERVER
// --------------------------------------------------

if (require.main === module) {
  startServer();
}

// --------------------------------------------------
// 11. EXPORTS
// --------------------------------------------------

module.exports = {
  app,
  httpServer,
  io,
  Meeting,
};

