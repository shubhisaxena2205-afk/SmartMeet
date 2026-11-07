import { useState } from "react";

function MeetingSetup({ mode, onBack, onJoin }) {
  const [meetingId, setMeetingId] = useState("");
  const [createdMeetingId, setCreatedMeetingId] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  // Generate a unique meeting ID
  const generateMeetingId = () => {
    const part1 = Math.random().toString(36).substring(2, 6);
    const part2 = Math.random().toString(36).substring(2, 6);
    const part3 = Math.random().toString(36).substring(2, 6);

    return `${part1}-${part2}-${part3}`.toUpperCase();
  };

  // Create meeting
  const handleCreateMeeting = () => {
    const newMeetingId = generateMeetingId();

    setCreatedMeetingId(newMeetingId);
    setCopied(false);
    setError("");

    // Store locally for now
    localStorage.setItem("currentMeetingId", newMeetingId);
  };

  // Copy meeting ID
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(createdMeetingId);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  // Join meeting
  const handleJoinMeeting = () => {
    const cleanId = meetingId.trim().toUpperCase();

    if (!cleanId) {
      setError("Please enter a meeting ID.");
      return;
    }

    setError("");

    localStorage.setItem("currentMeetingId", cleanId);

    if (onJoin) {
      onJoin(cleanId);
    }
  };

  return (
    <div className="meeting-setup">

      <div className="meeting-setup-card">

        {/* BACK */}
        <button
          className="back-button"
          onClick={onBack}
        >
          ← Back to Dashboard
        </button>

        {mode === "create" ? (
          <>
            <div className="meeting-icon">
              +
            </div>

            <h1>Create New Meeting</h1>

            <p className="meeting-description">
              Create a meeting and share the meeting ID
              with other participants.
            </p>

            {!createdMeetingId ? (
              <button
                className="primary-meeting-button"
                onClick={handleCreateMeeting}
              >
                Generate Meeting ID
              </button>
            ) : (
              <div className="created-meeting">

                <p className="meeting-label">
                  Your Meeting ID
                </p>

                <div className="meeting-id-box">
                  <span>{createdMeetingId}</span>

                  <button
                    onClick={handleCopy}
                    className="copy-button"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>

                <p className="share-text">
                  Share this ID with the people you want
                  to invite to the meeting.
                </p>

                <button
                  className="primary-meeting-button"
                  onClick={() => onJoin(createdMeetingId)}
                >
                  Start Meeting
                </button>

              </div>
            )}
          </>
        ) : (
          <>
            <div className="meeting-icon">
              ↗
            </div>

            <h1>Join Meeting</h1>

            <p className="meeting-description">
              Enter the meeting ID shared by the host.
            </p>

            <div className="meeting-input-group">

              <label>Meeting ID</label>

              <input
                type="text"
                placeholder="Example: ABCD-1234-EFGH"
                value={meetingId}
                onChange={(e) =>
                  setMeetingId(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleJoinMeeting();
                  }
                }}
              />

            </div>

            {error && (
              <div className="meeting-error">
                {error}
              </div>
            )}

            <button
              className="primary-meeting-button"
              onClick={handleJoinMeeting}
            >
              Join Meeting
            </button>
          </>
        )}

      </div>

    </div>
  );
}

export default MeetingSetup;