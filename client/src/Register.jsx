import { useState } from "react";

function Register({ onRegister, onSwitchToLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // SmartMeet backend URL
  const SERVER_URL =
    import.meta.env.VITE_SERVER_URL ||
    
     "http://localhost:5000";

  // Password requirements
  const hasMinLength = password.length >= 6;
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  const strongPassword =
    hasMinLength &&
    hasLowercase &&
    hasUppercase &&
    hasNumber &&
    hasSymbol;

  const passwordsMatch =
    password.length > 0 &&
    confirmPassword.length > 0 &&
    password === confirmPassword;

  const handleRegister = async (e) => {
    e.preventDefault();

    setMessage("");

    if (!name || !email || !password || !confirmPassword) {
      setMessage("Please fill all fields.");
      return;
    }

    if (!strongPassword) {
      setMessage(
        "Password must contain 6+ characters, uppercase, lowercase, number and symbol."
      );
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${SERVER_URL}/api/auth/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            email,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Registration failed.");
        return;
      }

      setMessage("Registration successful! You can now login.");

      if (onRegister) {
        onRegister(data.user);
      }

      // Clear fields
      setName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");

    } catch (error) {
      console.error("Registration error:", error);

      setMessage(
        "Cannot connect to SmartMeet server. Please check that the backend is running."
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

        <h2>Create Account</h2>

        <p className="auth-subtitle">
          Join SmartMeet today
        </p>

        <form onSubmit={handleRegister}>

          {/* NAME */}

          <div className="input-group">
            <label>Name</label>

            <input
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* EMAIL */}

          <div className="input-group">
            <label>Email</label>

            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* PASSWORD */}

          <div className="input-group">
            <label>Password</label>

            <div className="password-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={
                  password.length === 0
                    ? ""
                    : strongPassword
                    ? "valid-input"
                    : "invalid-input"
                }
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setShowPassword(!showPassword)
                }
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {password.length > 0 && (
              <div className="password-requirements">

                <p className={hasMinLength ? "valid" : "invalid"}>
                  {hasMinLength ? "✓" : "✗"} At least 6 characters
                </p>

                <p className={hasLowercase ? "valid" : "invalid"}>
                  {hasLowercase ? "✓" : "✗"} Lowercase letter
                </p>

                <p className={hasUppercase ? "valid" : "invalid"}>
                  {hasUppercase ? "✓" : "✗"} Uppercase letter
                </p>

                <p className={hasNumber ? "valid" : "invalid"}>
                  {hasNumber ? "✓" : "✗"} Number
                </p>

                <p className={hasSymbol ? "valid" : "invalid"}>
                  {hasSymbol ? "✓" : "✗"} Special character
                </p>

              </div>
            )}
          </div>

          {/* CONFIRM PASSWORD */}

          <div className="input-group">
            <label>Confirm Password</label>

            <div className="password-wrapper">

              <input
                type={
                  showConfirmPassword
                    ? "text"
                    : "password"
                }
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value)
                }
                className={
                  confirmPassword.length === 0
                    ? ""
                    : passwordsMatch
                    ? "valid-input"
                    : "invalid-input"
                }
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setShowConfirmPassword(
                    !showConfirmPassword
                  )
                }
              >
                {showConfirmPassword ? "Hide" : "Show"}
              </button>

            </div>
          </div>

          {/* MESSAGE */}

          {message && (
            <div
              className={
                message.includes("successful")
                  ? "message success"
                  : "message error"
              }
            >
              {message}
            </div>
          )}

          {/* REGISTER BUTTON */}

          <button
            type="submit"
            className="auth-button"
            disabled={loading}
          >
            {loading
              ? "Creating Account..."
              : "Create Account"}
          </button>

        </form>

        {/* LOGIN LINK */}

        <div className="switch-auth">

          <span>Already have an account?</span>

          <button
            type="button"
            onClick={onSwitchToLogin}
          >
            Login
          </button>

        </div>

      </div>
    </div>
  );
}

export default Register;
