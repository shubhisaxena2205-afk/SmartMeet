import React, { useState } from "react";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";

function ResetPassword({ onBackToLogin }) {
  const token = new URLSearchParams(window.location.search).get("resetToken") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    if (!token) {
      setMessage("This reset link is invalid. Please request a new one.");
      return;
    }
    const strongPassword = password.length >= 6 && /[a-z]/.test(password) &&
      /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
    if (!strongPassword) {
      setMessage("Password must contain 6+ characters, uppercase, lowercase, number and symbol.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${SERVER_URL}/api/auth/reset-password/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.message || "Could not reset password.");
        return;
      }
      setSuccess(true);
      setMessage(data.message || "Password reset successfully.");
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      console.error("Reset password error:", error);
      setMessage("Could not connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="logo-section">
          <div className="logo-icon">🎥</div>
          <h1>SmartMeet</h1>
          <p>Secure account recovery</p>
        </div>
        <h2>Set a New Password</h2>
        <p className="auth-subtitle">Choose a new password for your account.</p>
        {!success ? (
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>New Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={6} placeholder="At least 6 characters" />
            </div>
            <div className="input-group">
              <label>Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required minLength={6} placeholder="Enter password again" />
            </div>
            {message && <div className="message error" role="alert">{message}</div>}
            <button type="submit" className="auth-button" disabled={loading || !token}>
              {loading ? "Updating..." : "Reset Password"}
            </button>
          </form>
        ) : (
          <div className="message success" role="status">{message}</div>
        )}
        {!token && !message && <div className="message error">Reset token is missing. Please request a new link.</div>}
        <div className="switch-auth">
          <button type="button" onClick={onBackToLogin}>Back to Login</button>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
