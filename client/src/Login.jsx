import React, { useState } from "react";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";

function Login({ onLogin, onSwitchToRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage("");
    if (!email.trim() || !password) {
      setMessage("Please enter email and password.");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.message || "Login failed.");
        return;
      }
      if (data.token) localStorage.setItem("token", data.token);
      if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
      setMessage("Login successful!");
      onLogin?.(data.user);
    } catch (error) {
      console.error("Login error:", error);
      setMessage("Cannot connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setMessage("");
    if (!email.trim()) {
      setMessage("Please enter your registered email address first.");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${SERVER_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      setMessage(data.message || "If the account exists, a reset link has been sent.");
    } catch (error) {
      console.error("Forgot password error:", error);
      setMessage("Could not connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const linkStyle = {
    border: 0, background: "transparent", color: "#a855f7", cursor: "pointer",
    padding: "8px 0", fontWeight: 600
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="logo-section">
          <div className="logo-icon">🎥</div>
          <h1>SmartMeet</h1>
          <p>Connect. Collaborate. Meet.</p>
        </div>

        {showForgotPassword ? (
          <>
            <h2>Forgot Password?</h2>
            <p className="auth-subtitle">Enter your registered email and we’ll send you a secure reset link.</p>
            <form onSubmit={handleForgotPassword}>
              <div className="input-group">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="Enter your registered email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              {message && <div className="message" role="status">{message}</div>}
              <button type="submit" className="auth-button" disabled={loading}>
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
            <div className="switch-auth">
              <button type="button" style={linkStyle} onClick={() => { setShowForgotPassword(false); setMessage(""); }}>
                Back to Login
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Welcome Back</h2>
            <p className="auth-subtitle">Login to your SmartMeet account</p>
            <form onSubmit={handleLogin}>
              <div className="input-group">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="input-group">
                <label>Password</label>
                <div className="password-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div style={{ textAlign: "right", marginTop: "-8px", marginBottom: "12px" }}>
                <button type="button" style={linkStyle} onClick={() => { setShowForgotPassword(true); setMessage(""); }}>
                  Forgot Password?
                </button>
              </div>
              {message && (
                <div className={message === "Login successful!" ? "message success" : "message error"} role="status">
                  {message}
                </div>
              )}
              <button type="submit" className="auth-button" disabled={loading}>
                {loading ? "Logging in..." : "Login"}
              </button>
            </form>
            <div className="switch-auth">
              <span>Don't have an account?</span>
              <button type="button" onClick={onSwitchToRegister}>Create Account</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Login;

