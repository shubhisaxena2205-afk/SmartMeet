
import { useState } from "react";

function Login({ onLogin, onSwitchToRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // SmartMeet backend URL
  const SERVER_URL =
    import.meta.env.VITE_SERVER_URL ||
    "https://proof-assumption-rico-garmin.trycloudflare.com";

  const handleLogin = async (e) => {
    e.preventDefault();

    setMessage("");

    if (!email || !password) {
      setMessage("Please enter email and password.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Login failed.");
        return;
      }

      // Save JWT token
      if (data.token) {
        localStorage.setItem("token", data.token);
      }

      // Save user information
      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
      }

      setMessage("Login successful!");

      if (onLogin) {
        onLogin(data.user);
      }
    } catch (error) {
      console.error("Login error:", error);

      setMessage(
        "Cannot connect to server. Please check that the SmartMeet backend is running."
      );
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
          <p>Connect. Collaborate. Meet.</p>
        </div>

        <h2>Welcome Back</h2>
        <p className="auth-subtitle">
          Login to your SmartMeet account
        </p>

        <form onSubmit={handleLogin}>

          <div className="input-group">
            <label>Email</label>

            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {message && (
            <div
              className={
                message === "Login successful!"
                  ? "message success"
                  : "message error"
              }
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            className="auth-button"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>

        </form>

        <div className="switch-auth">
          <span>Don't have an account?</span>

          <button
            type="button"
            onClick={onSwitchToRegister}
          >
            Create Account
          </button>
        </div>

      </div>
    </div>
  );
}

export default Login;
