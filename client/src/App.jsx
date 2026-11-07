import { useState } from "react";

import Login from "./Login";
import Register from "./Register";
import Dashboard from "./Dashboard";
import MeetingSetup from "./MeetingSetup";
import MeetingRoom from "./MeetingRoom";
import SmartMeetAssistant from "./SmartMeetAssistant";

import "./App.css";

function App() {
  const [showLogin, setShowLogin] = useState(true);

  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem("user");

    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch {
        return null;
      }
    }

    return null;
  });

  const [page, setPage] = useState("dashboard");
  const [meetingMode, setMeetingMode] = useState(null);
  const [meetingId, setMeetingId] = useState("");

  const handleLogin = (loggedInUser) => {
    setUser(loggedInUser);
    localStorage.setItem("user", JSON.stringify(loggedInUser));
    setPage("dashboard");
  };

  const handleRegister = () => {
    setShowLogin(true);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("currentMeetingId");

    setUser(null);
    setPage("dashboard");
    setShowLogin(true);
  };

  const openCreateMeeting = () => {
    setMeetingMode("create");
    setPage("meetingSetup");
  };

  const openJoinMeeting = () => {
    setMeetingMode("join");
    setPage("meetingSetup");
  };

  const enterMeeting = (id) => {
    setMeetingId(id);
    setPage("meetingRoom");
  };

  const leaveMeeting = () => {
    setMeetingId("");
    setPage("dashboard");
  };

  if (!user) {
    return (
      <div className="app">
        {showLogin ? (
          <Login
            onLogin={handleLogin}
            onSwitchToRegister={() => setShowLogin(false)}
          />
        ) : (
          <Register
            onRegister={handleRegister}
            onSwitchToLogin={() => setShowLogin(true)}
          />
        )}
      </div>
    );
  }

  if (page === "meetingRoom") {
    return (
      <>
        <MeetingRoom
          meetingId={meetingId}
          user={user}
          onLeave={leaveMeeting}
        />
        <SmartMeetAssistant />
      </>
    );
  }

  if (page === "meetingSetup") {
    return (
      <>
        <MeetingSetup
          mode={meetingMode}
          onBack={() => setPage("dashboard")}
          onJoin={enterMeeting}
        />
        <SmartMeetAssistant />
      </>
    );
  }

  return (
    <>
      <Dashboard
        user={user}
        onLogout={handleLogout}
        onCreateMeeting={openCreateMeeting}
        onJoinMeeting={openJoinMeeting}
      />
      <SmartMeetAssistant />
    </>
  );
}

export default App;
