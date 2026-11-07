
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Resend } = require("resend");

const normalizeEmail = (email) =>
    String(email || "").trim().toLowerCase();

// REGISTER
const registerUser = async (req, res) => {
    try {
        const { name, password } = req.body;
        const email = normalizeEmail(req.body.email);

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "All fields are required"
            });
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({
                message: "User already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            name,
            email,
            password: hashedPassword
        });

        return res.status(201).json({
            message: "Registration successful",
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error("Registration Error:", error);
        return res.status(500).json({
            message: "Server error"
        });
    }
};

// LOGIN
const loginUser = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const { password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        const user = await User.findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        return res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).json({
            message: "Server error"
        });
    }
};

// FORGOT PASSWORD USING RESEND API
const forgotPassword = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);

        if (!email) {
            return res.status(400).json({
                message: "Please enter your email address."
            });
        }

        const user = await User.findOne({ email });

        if (user) {
            const apiKey = process.env.RESEND_API_KEY;

            if (!apiKey) {
                throw new Error("RESEND_API_KEY is not configured.");
            }

            const resend = new Resend(apiKey);

            const rawToken = crypto.randomBytes(32).toString("hex");

            const tokenHash = crypto
                .createHash("sha256")
                .update(rawToken)
                .digest("hex");

            user.resetPasswordToken = tokenHash;
            user.resetPasswordExpires = new Date(
                Date.now() + 15 * 60 * 1000
            );

            await user.save();

            const frontendUrl = (
                process.env.CLIENT_URL ||
                process.env.FRONTEND_URL ||
                "http://localhost:5173"
            ).replace(/\/$/, "");

            const resetUrl = `${frontendUrl}/?resetToken=${rawToken}`;

            const sender =
                process.env.RESEND_FROM ||
                "SmartMeet <onboarding@resend.dev>";

            const { data, error } = await resend.emails.send({
                from: sender,
                to: [user.email],
                subject: "Reset your SmartMeet password",

                text: `Hello ${user.name},

We received a request to reset your SmartMeet password.

Open this link within 15 minutes to choose a new password:

${resetUrl}

If you did not request this, you can ignore this email.

SmartMeet`,

                html: `
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#202124;max-width:560px;margin:auto">
                    <h2>Reset your SmartMeet password</h2>
                    <p>Hello ${escapeHtml(user.name)},</p>
                    <p>
                        We received a request to reset your SmartMeet password.
                        This secure link expires in <strong>15 minutes</strong>
                        and can only be used once.
                    </p>
                    <p>
                        <a href="${resetUrl}"
                        style="display:inline-block;padding:12px 20px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px">
                        Reset password
                        </a>
                    </p>
                    <p>If the button does not work, copy this link:</p>
                    <p><a href="${resetUrl}">${resetUrl}</a></p>
                    <p>If you did not request this, you can safely ignore this email.</p>
                    <p>SmartMeet</p>
                </div>
                `
            });

            if (error) {
                console.error("Resend Email Error:", error);
                throw new Error(error.message || "Email delivery failed.");
            }

            console.log("Password reset email accepted by Resend:", data?.id);
        }

        return res.status(200).json({
            message: "If an account with that email exists, a password reset link has been sent. Please check your inbox."
        });

    } catch (error) {
        console.error("Forgot Password Error:", error);
        return res.status(503).json({
            message: "We could not send the reset email right now. Please try again later."
        });
    }
};

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

// RESET PASSWORD
const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        const strongPassword =
            password &&
            password.length >= 6 &&
            /[a-z]/.test(password) &&
            /[A-Z]/.test(password) &&
            /[0-9]/.test(password) &&
            /[^A-Za-z0-9]/.test(password);

        if (!strongPassword) {
            return res.status(400).json({
                message: "Password must contain 6+ characters, uppercase, lowercase, number and symbol."
            });
        }

        const tokenHash = crypto
            .createHash("sha256")
            .update(String(token || ""))
            .digest("hex");

        const user = await User.findOne({
            resetPasswordToken: tokenHash,
            resetPasswordExpires: { $gt: new Date() }
        }).select("+resetPasswordToken +resetPasswordExpires");

        if (!user) {
            return res.status(400).json({
                message: "This reset link is invalid or has expired. Please request a new one."
            });
        }

        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();

        return res.status(200).json({
            message: "Your password has been reset successfully. You can now log in."
        });

    } catch (error) {
        console.error("Reset Password Error:", error);
        return res.status(500).json({
            message: "Could not reset password. Please try again."
        });
    }
};

module.exports = {
    registerUser,
    loginUser,
    forgotPassword,
    resetPassword
};

