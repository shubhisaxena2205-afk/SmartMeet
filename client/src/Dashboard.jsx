

function Dashboard({
  user,
  onLogout,
  onCreateMeeting,
  onJoinMeeting,
}) {

  const displayName = user?.name || "User";

  return (
    <div className="dashboard">

      {/* NAVBAR */}

      <nav className="dashboard-navbar">

        <div className="brand">

          <div className="brand-icon">
            ðŸŽ¥
          </div>

          <span>
            SmartMeet
          </span>

        </div>

        <div className="navbar-right">

          <div className="user-info">

            <div className="user-avatar">
              {displayName
                .charAt(0)
                .toUpperCase()}
            </div>

            <div className="user-details">

              <span className="user-name">
                {displayName}
              </span>

              <span className="user-email">
                {user?.email || ""}
              </span>

            </div>

          </div>

          <button
            className="logout-button"
            onClick={onLogout}
          >
            Logout
          </button>

        </div>

      </nav>

      {/* MAIN */}

      <main className="dashboard-main">

        {/* WELCOME */}

        <section className="welcome-section">

          <div>

            <h1>
              Welcome back, {displayName}! ðŸ‘‹
            </h1>

            <p>
              Ready to connect with your team?
            </p>

          </div>

        </section>

        {/* QUICK START */}

        <section className="actions-section">

          <h2>
            Quick Start
          </h2>

          <div className="action-cards">

            {/* CREATE */}

            <button
              className="action-card new-meeting"
              onClick={onCreateMeeting}
            >

              <div className="action-icon">
                +
              </div>

              <div className="action-content">

                <h3>
                  New Meeting
                </h3>

                <p>
                  Start an instant meeting
                </p>

              </div>

            </button>

            {/* JOIN */}

            <button
              className="action-card join-meeting"
              onClick={onJoinMeeting}
            >

              <div className="action-icon">
                â†—
              </div>

              <div className="action-content">

                <h3>
                  Join Meeting
                </h3>

                <p>
                  Enter a meeting ID to join
                </p>

              </div>

            </button>

          </div>

        </section>

        {/* RECENT MEETINGS */}

        <section className="recent-section">

          <div className="section-header">

            <div>

              <h2>
                Recent Meetings
              </h2>

              <p>
                Your recent SmartMeet sessions
              </p>

            </div>

          </div>

          <div className="empty-meetings">

            <div className="empty-icon">
              ðŸ“…
            </div>

            <h3>
              No meetings yet
            </h3>

            <p>
              Your recent meetings will appear here.
            </p>

          </div>

        </section>

      </main>

    </div>
  );
}

export default Dashboard;
